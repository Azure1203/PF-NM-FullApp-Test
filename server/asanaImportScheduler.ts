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
const ASANA_PERFECT_FIT_PROJECT_GID = '1208263802564738';
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
    const { tasksApi, attachmentsApi, projectsApi } = await getAsanaApiInstances();

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

        // --- Update Asana task with notes and custom fields (matching manual sync) ---
        try {
          const projectFiles = await storage.getProjectFiles(project.id);
          const updatedProject = await storage.getProject(project.id);

          const customDomain = process.env.CUSTOM_APP_DOMAIN;
          const publishedDomain = process.env.REPLIT_DOMAINS?.split(',')[0];
          const devDomain = process.env.REPLIT_DEV_DOMAIN;
          const appDomain = customDomain || publishedDomain || devDomain || '';
          const projectAppUrl = appDomain ? `https://${appDomain}/orders/${project.id}` : '';

          let taskNotes = '';
          if (projectAppUrl) {
            taskNotes += `Packaging Link: ${projectAppUrl}\n\n`;
          }
          for (const file of projectFiles) {
            let fileName = file.originalFilename || 'Unknown File';
            if (fileName.toLowerCase().endsWith('.csv')) {
              fileName = fileName.slice(0, -4);
            }
            const jobNumber = file.allmoxyJobNumber || 'N/A';
            taskNotes += `${fileName} - ${jobNumber}\n`;
          }

          if (taskNotes) {
            await tasksApi.updateTask({ data: { notes: taskNotes } }, taskGid, {});
            console.log(`[Asana Import] Updated task notes for ${taskGid}`);
          }

          const projectPallets = await storage.getPalletsForProject(project.id);
          const palletCount = projectPallets.length;
          const packagingCost = palletCount * 150;

          const asanaProjectDetails = await projectsApi.getProject(ASANA_PERFECT_FIT_PROJECT_GID, {
            opt_fields: 'custom_field_settings.custom_field.name,custom_field_settings.custom_field.gid,custom_field_settings.custom_field.type,custom_field_settings.custom_field.enum_options'
          });
          const customFieldSettings = asanaProjectDetails.data.custom_field_settings || [];
          const customFields: Record<string, any> = {};

          for (const setting of customFieldSettings) {
            const field = setting.custom_field;
            const name = field.name.toUpperCase().trim();

            if ((name === 'PERFECT FIT DEALER' || name === 'PF DEALER') && field.type === 'text') {
              if (updatedProject?.dealer) customFields[field.gid] = updatedProject.dealer;
            } else if (name === 'ORDER DATE' && field.type === 'text') {
              if (updatedProject?.date) customFields[field.gid] = updatedProject.date;
            } else if (name === 'ORDER DATE' && field.type === 'date') {
              if (updatedProject?.date) customFields[field.gid] = { date: updatedProject.date };
            } else if (name === 'PF ADDRESS' && field.type === 'text') {
              if (updatedProject?.shippingAddress) customFields[field.gid] = updatedProject.shippingAddress;
            } else if (name === 'PF PHONE NUMBER' && field.type === 'text') {
              if (updatedProject?.phone) customFields[field.gid] = updatedProject.phone;
            } else if ((name === 'PF TAX ID' || name === 'PF TAX ID:') && field.type === 'text') {
              if (updatedProject?.taxId) customFields[field.gid] = updatedProject.taxId;
            } else if ((name === 'ORDER ID' || name === 'PF ORDER ID') && field.type === 'text') {
              if (updatedProject?.orderId) customFields[field.gid] = updatedProject.orderId;
            } else if ((name === 'ORDER ID' || name === 'PF ORDER ID') && field.type === 'number') {
              if (updatedProject?.orderId) customFields[field.gid] = parseInt(updatedProject.orderId) || 0;
            } else if ((name === 'PF POWER TAILGATE NEEDED' || name === 'PF POWER TAILGATE NEEDED?') && field.type === 'enum' && field.enum_options) {
              const option = field.enum_options.find((o: any) =>
                o.name.toLowerCase() === (updatedProject?.powerTailgate ? 'yes' : 'no')
              );
              if (option) customFields[field.gid] = option.gid;
            } else if ((name === 'PF PHONE APPT NEEDED' || name === 'PF PHONE APPT NEEDED?') && field.type === 'enum' && field.enum_options) {
              const option = field.enum_options.find((o: any) =>
                o.name.toLowerCase() === (updatedProject?.phoneAppointment ? 'yes' : 'no')
              );
              if (option) customFields[field.gid] = option.gid;
            } else if ((name === 'PF PO' || name === 'PF PO:') && field.type === 'text') {
              const fileNames = projectFiles.map(f => {
                let n = f.originalFilename || 'Unknown File';
                if (n.toLowerCase().endsWith('.csv')) {
                  n = n.slice(0, -4);
                }
                return n;
              });
              if (fileNames.length > 0) {
                customFields[field.gid] = fileNames.join('\n');
              }
            } else if ((name === 'PF 5016 FORM NEEDED' || name === 'PF 5016 FORM NEEDED?' || name === 'PF 5106 FORM NEEDED' || name === 'PF 5106 FORM NEEDED?') && field.type === 'enum' && field.enum_options) {
              const canadianPostalCodePattern = /[A-Z]\d[A-Z]\s?\d[A-Z]\d/i;
              const canadianProvinces = ['AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'NT', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT'];
              let isCanadian = false;
              if (updatedProject?.shippingAddress) {
                const addr = updatedProject.shippingAddress.toUpperCase();
                if (canadianPostalCodePattern.test(addr)) isCanadian = true;
                for (const prov of canadianProvinces) {
                  if (new RegExp(`\\b${prov}\\b`).test(addr)) { isCanadian = true; break; }
                }
                if (addr.includes('CANADA')) isCanadian = true;
              }
              const option = field.enum_options.find((o: any) =>
                o.name.toLowerCase() === (isCanadian ? 'no' : 'yes')
              );
              if (option) customFields[field.gid] = option.gid;
            } else if (name === 'PACKAGING COST' && field.type === 'number') {
              customFields[field.gid] = packagingCost;
            } else if (name === 'PACKAGING COST' && field.type === 'text') {
              customFields[field.gid] = `$${packagingCost}`;
            } else if (name === 'CIENAPPS JOB NUMBER' && field.type === 'text') {
              if (updatedProject?.cienappsJobNumber) customFields[field.gid] = updatedProject.cienappsJobNumber;
            }
          }

          const statusesToSync = updatedProject?.pfProductionStatus || [];
          if (statusesToSync.length > 0) {
            for (const setting of customFieldSettings) {
              const field = setting.custom_field;
              const cfName = field.name?.toUpperCase().trim();
              if (cfName === 'PF PRODUCTION STATUS' && field.type === 'multi_enum' && field.enum_options) {
                const selectedGids = statusesToSync
                  .map((statusName: string) => {
                    const option = field.enum_options.find((o: any) =>
                      o.name?.toUpperCase().trim() === statusName.toUpperCase().trim()
                    );
                    return option?.gid;
                  })
                  .filter((gid: string | undefined) => gid);
                if (selectedGids.length > 0) {
                  customFields[field.gid] = selectedGids;
                }
                break;
              }
            }
          }

          if (Object.keys(customFields).length > 0) {
            await tasksApi.updateTask({ data: { custom_fields: customFields } }, taskGid, {});
            console.log(`[Asana Import] Updated custom fields for task ${taskGid}:`, Object.keys(customFields).length, 'fields');
          }
        } catch (updateErr: any) {
          console.error(`[Asana Import] Failed to update Asana task ${taskGid} with notes/custom fields:`, updateErr.message);
        }

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
