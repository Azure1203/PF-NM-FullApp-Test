import { getAsanaApiInstances } from './lib/asana';
import { storage } from './storage';
import { db } from './db';
import { processedAsanaTasks, asanaImportSyncStatus } from '@shared/schema';
import type { AsanaImportSyncStatus } from '@shared/schema';
import { eq } from 'drizzle-orm';
import {
  parseCSV,
  findValue,
  formatPONumber,
  formatPhoneNumber,
  countPartsFromCSV,
  extractCTSParts,
  computeAutoProductionStatuses,
  generateHardwareChecklistForFile,
  generatePackingSlipChecklistForFile,
  updateProjectBoProductionStatus
} from './csvHelpers';

const ASANA_READY_TO_IMPORT_SECTION_GID = '1213318854211307';
const POLL_INTERVAL = 10 * 60 * 1000;

let intervalId: ReturnType<typeof setInterval> | null = null;
let isProcessing = false;

async function processAsanaImportTasks(): Promise<{ processed: number; imported: number }> {
  if (isProcessing) {
    console.log('[Asana Import] Already processing, skipping...');
    return { processed: 0, imported: 0 };
  }

  isProcessing = true;
  let processed = 0;
  let imported = 0;

  try {
    console.log('[Asana Import] Starting import cycle...');
    const { tasksApi, attachmentsApi } = await getAsanaApiInstances();

    const tasksResponse = await tasksApi.getTasksForSection(ASANA_READY_TO_IMPORT_SECTION_GID, {
      opt_fields: 'name,gid,completed'
    });

    const tasks = tasksResponse.data || [];
    console.log(`[Asana Import] Found ${tasks.length} tasks in READY TO IMPORT section`);

    for (const task of tasks) {
      if (task.completed) continue;

      const taskGid = task.gid;
      const taskName = task.name || 'Untitled Task';

      try {
        const existing = await db.select().from(processedAsanaTasks).where(eq(processedAsanaTasks.taskGid, taskGid)).limit(1);
        if (existing.length > 0) {
          console.log(`[Asana Import] Task ${taskGid} already processed, skipping`);
          continue;
        }

        const attachmentsResponse = await attachmentsApi.getAttachmentsForObject(taskGid, {
          opt_fields: 'name,download_url,resource_type'
        });

        const allAttachments = attachmentsResponse.data || [];
        const csvAttachments = allAttachments.filter((a: any) =>
          a.name && a.name.toLowerCase().endsWith('.csv')
        );

        if (csvAttachments.length === 0) {
          console.log(`[Asana Import] Task ${taskGid} "${taskName}" has no CSV attachments, skipping (will retry later)`);
          continue;
        }

        console.log(`[Asana Import] Task ${taskGid} "${taskName}" has ${csvAttachments.length} CSV attachments`);

        const parsedFiles: { filename: string; content: string; records: string[][]; poNumber?: string }[] = [];

        for (const csvAtt of csvAttachments) {
          try {
            const attachmentDetail = await attachmentsApi.getAttachment(csvAtt.gid, {
              opt_fields: 'name,download_url'
            });

            const downloadUrl = attachmentDetail.data.download_url;
            if (!downloadUrl) {
              console.log(`[Asana Import] No download URL for attachment ${csvAtt.gid}`);
              continue;
            }

            const response = await fetch(downloadUrl);
            if (!response.ok) {
              console.error(`[Asana Import] Failed to download attachment ${csvAtt.gid}: ${response.status}`);
              continue;
            }

            const content = await response.text();
            const records = await parseCSV(content);
            const poNumber = formatPONumber(findValue(records, 'PO:'));

            parsedFiles.push({
              filename: csvAtt.name,
              content,
              records,
              poNumber
            });
          } catch (attErr: any) {
            console.error(`[Asana Import] Error processing attachment ${csvAtt.gid}:`, attErr.message);
          }
        }

        if (parsedFiles.length === 0) {
          console.log(`[Asana Import] No valid CSV files could be parsed from task ${taskGid}`);
          await db.insert(processedAsanaTasks).values({
            taskGid,
            taskName,
            status: 'failed',
            error: 'No valid CSV files could be parsed'
          });
          processed++;
          continue;
        }

        let projectName = taskName;
        if (projectName.startsWith('(PERFECT FIT) ')) {
          projectName = projectName.replace('(PERFECT FIT) ', '');
        }

        const firstRecords = parsedFiles[0].records;

        const projectData = {
          name: projectName,
          date: new Date().toISOString().split('T')[0],
          dealer: findValue(firstRecords, 'Dealer'),
          shippingAddress: findValue(firstRecords, 'Shipping Address'),
          phone: formatPhoneNumber(findValue(firstRecords, 'Phone')),
          taxId: findValue(firstRecords, 'Tax ID'),
          orderId: findValue(firstRecords, 'Order ID'),
          powerTailgate: findValue(firstRecords, 'Power Tail Gate')?.toLowerCase().includes('yes') || false,
          phoneAppointment: findValue(firstRecords, 'Phone Appointment')?.toLowerCase().includes('yes') || false,
        };

        const project = await storage.createProject(projectData);

        await storage.updateProject(project.id, {
          asanaTaskId: taskGid,
          status: 'synced',
          autoImported: true
        });

        let totalDovetails = 0;
        let totalFivePiece = 0;
        let totalAssembledDrawers = 0;
        let hasDoubleThick = false;
        let hasGlassParts = false;
        let hasGlassShelves = false;
        let hasCTSParts = false;

        for (const pf of parsedFiles) {
          const partCounts = await countPartsFromCSV(pf.records);

          totalDovetails += partCounts.dovetails;
          totalFivePiece += partCounts.fivePiece;
          totalAssembledDrawers += partCounts.assembledDrawers;
          if (partCounts.hasDoubleThick) hasDoubleThick = true;
          if (partCounts.hasGlassParts) hasGlassParts = true;
          if (partCounts.glassShelves > 0) hasGlassShelves = true;

          const orderFile = await storage.createOrderFile({
            projectId: project.id,
            originalFilename: pf.filename,
            poNumber: pf.poNumber,
            rawContent: pf.content,
            coreParts: partCounts.coreParts,
            dovetails: partCounts.dovetails,
            assembledDrawers: partCounts.assembledDrawers,
            fivePieceDoors: partCounts.fivePiece,
            weightLbs: Math.round(partCounts.weightLbs),
            maxLength: Math.round(partCounts.maxLength),
            maxWidth: Math.round(partCounts.maxWidth),
            hasGlassParts: partCounts.hasGlassParts,
            glassInserts: partCounts.glassInserts,
            glassShelves: partCounts.glassShelves,
            hasMJDoors: partCounts.hasMJDoors,
            hasRichelieuDoors: partCounts.hasRichelieuDoors,
            hasDoubleThick: partCounts.hasDoubleThick,
            hasShakerDoors: partCounts.hasShakerDoors,
            mjDoorsCount: partCounts.mjDoorsCount,
            richelieuDoorsCount: partCounts.richelieuDoorsCount,
            doubleThickCount: partCounts.doubleThickCount,
            wallRailPieces: partCounts.wallRailPieces,
          });

          const ctsParts = extractCTSParts(pf.records);
          if (ctsParts.length > 0) hasCTSParts = true;
          for (const ctsPart of ctsParts) {
            await storage.createCtsPart({
              fileId: orderFile.id,
              partNumber: ctsPart.partNumber,
              description: ctsPart.description,
              cutLength: ctsPart.cutLength,
              quantity: ctsPart.quantity,
            });
          }

          const checklistResult = await generateHardwareChecklistForFile(orderFile.id, pf.content);
          console.log(`[Asana Import] Order ${orderFile.id}: Hardware checklist - ${checklistResult.itemCount} items`);

          const packingSlipResult = await generatePackingSlipChecklistForFile(orderFile.id, pf.content);
          console.log(`[Asana Import] Order ${orderFile.id}: Packing slip checklist - ${packingSlipResult.itemCount} items`);
        }

        const autoStatuses = computeAutoProductionStatuses({
          hasCTSParts,
          hasFivePiece: totalFivePiece > 0,
          hasDoubleThick,
          hasDovetails: totalDovetails > 0,
          hasAssembledDrawers: totalAssembledDrawers > 0,
          hasGlassParts,
          hasGlassShelves
        });

        if (autoStatuses.length > 0) {
          await storage.updateProject(project.id, { pfProductionStatus: autoStatuses });
          console.log(`[Asana Import] Set pfProductionStatus for project ${project.id}:`, autoStatuses);
        }

        await updateProjectBoProductionStatus(project.id);

        await db.insert(processedAsanaTasks).values({
          taskGid,
          taskName,
          projectId: project.id,
          status: 'processed'
        });

        console.log(`[Asana Import] Successfully imported task ${taskGid} "${taskName}" as project ${project.id}`);
        processed++;
        imported++;

      } catch (taskErr: any) {
        console.error(`[Asana Import] Error processing task ${taskGid}:`, taskErr.message);
        try {
          await db.insert(processedAsanaTasks).values({
            taskGid,
            taskName,
            status: 'failed',
            error: taskErr.message
          }).onConflictDoNothing();
        } catch (dbErr) {
          console.error('[Asana Import] Failed to record error:', dbErr);
        }
        processed++;
      }
    }

    await updateSyncStatus(null, processed, imported);
    console.log(`[Asana Import] Cycle complete: ${processed} processed, ${imported} imported`);

  } catch (err: any) {
    console.error('[Asana Import] Fatal error:', err.message);
    await updateSyncStatus(err.message, processed, imported);
  } finally {
    isProcessing = false;
  }

  return { processed, imported };
}

async function updateSyncStatus(error: string | null, tasksProcessed: number, tasksImported: number) {
  try {
    const existing = await db.select().from(asanaImportSyncStatus).limit(1);

    if (existing.length > 0) {
      await db.update(asanaImportSyncStatus)
        .set({
          lastSyncAt: new Date(),
          lastSuccessAt: error ? existing[0].lastSuccessAt : new Date(),
          lastError: error,
          tasksProcessed: (existing[0].tasksProcessed || 0) + tasksProcessed,
          tasksImported: (existing[0].tasksImported || 0) + tasksImported
        })
        .where(eq(asanaImportSyncStatus.id, existing[0].id));
    } else {
      await db.insert(asanaImportSyncStatus).values({
        lastSyncAt: new Date(),
        lastSuccessAt: error ? null : new Date(),
        lastError: error,
        tasksProcessed,
        tasksImported
      });
    }
  } catch (err) {
    console.error('[Asana Import] Failed to update sync status:', err);
  }
}

export function startAsanaImportScheduler(): void {
  if (intervalId) {
    console.log('[Asana Import] Scheduler already running');
    return;
  }

  console.log('[Asana Import] Starting scheduler (polling every 10 minutes)');
  processAsanaImportTasks().catch(err => {
    console.error('[Asana Import] Initial run failed:', err);
  });

  intervalId = setInterval(() => {
    processAsanaImportTasks().catch(err => {
      console.error('[Asana Import] Scheduled run failed:', err);
    });
  }, POLL_INTERVAL);
}

export function stopAsanaImportScheduler(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log('[Asana Import] Scheduler stopped');
  }
}

export async function triggerManualAsanaImport(): Promise<{ processed: number; imported: number }> {
  return processAsanaImportTasks();
}

export async function getAsanaImportStatus(): Promise<AsanaImportSyncStatus | null> {
  const rows = await db.select().from(asanaImportSyncStatus).limit(1);
  return rows.length > 0 ? rows[0] : null;
}
