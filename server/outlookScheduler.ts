import { db } from "./db";
import { processedOutlookEmails, outlookSyncStatus, orderFiles, projects } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { searchNetleyEmails, downloadEmailAttachment } from "./outlook";
import { ObjectStorageService } from "./replit_integrations/object_storage";
import { log } from "./index";

const POLL_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
let isPolling = false;
let pollIntervalId: NodeJS.Timeout | null = null;

const objectStorageService = new ObjectStorageService();

async function isMessageProcessed(messageId: string): Promise<boolean> {
  const existing = await db
    .select()
    .from(processedOutlookEmails)
    .where(eq(processedOutlookEmails.messageId, messageId))
    .limit(1);
  return existing.length > 0;
}

async function markMessageProcessed(
  messageId: string, 
  subject: string, 
  status: 'processed' | 'failed' | 'skipped',
  matchedFileId?: number
): Promise<void> {
  await db.insert(processedOutlookEmails).values({
    messageId,
    subject,
    status,
    matchedFileId: matchedFileId || null
  }).onConflictDoNothing();
}

async function updateSyncStatus(
  success: boolean,
  emailsProcessed: number,
  emailsMatched: number,
  error?: string
): Promise<void> {
  const existing = await db.select().from(outlookSyncStatus).limit(1);
  
  const now = new Date();
  
  if (existing.length === 0) {
    await db.insert(outlookSyncStatus).values({
      lastSyncAt: now,
      lastSuccessAt: success ? now : null,
      lastError: error || null,
      emailsProcessed,
      emailsMatched
    });
  } else {
    await db.update(outlookSyncStatus)
      .set({
        lastSyncAt: now,
        lastSuccessAt: success ? now : existing[0].lastSuccessAt,
        lastError: error || null,
        emailsProcessed,
        emailsMatched
      })
      .where(eq(outlookSyncStatus.id, existing[0].id));
  }
}

export async function getSyncStatus(): Promise<{
  lastSyncAt: Date | null;
  lastSuccessAt: Date | null;
  lastError: string | null;
  emailsProcessed: number;
  emailsMatched: number;
} | null> {
  const status = await db.select().from(outlookSyncStatus).limit(1);
  if (status.length === 0) return null;
  return {
    lastSyncAt: status[0].lastSyncAt,
    lastSuccessAt: status[0].lastSuccessAt,
    lastError: status[0].lastError,
    emailsProcessed: status[0].emailsProcessed || 0,
    emailsMatched: status[0].emailsMatched || 0
  };
}

async function processOutlookEmails(): Promise<{ processed: number; matched: number }> {
  log('Starting scheduled Outlook email fetch...', 'outlook-scheduler');
  
  let processed = 0;
  let matched = 0;
  
  try {
    const searchResult = await searchNetleyEmails();
    
    if (!searchResult.folderFound) {
      log(`Folder not found: ${searchResult.folderName}`, 'outlook-scheduler');
      await updateSyncStatus(false, 0, 0, searchResult.error);
      return { processed: 0, matched: 0 };
    }
    
    const emails = searchResult.emails;
    log(`Found ${emails.length} emails in folder "${searchResult.folderName}"`, 'outlook-scheduler');
    
    if (emails.length === 0) {
      await updateSyncStatus(true, 0, 0);
      return { processed: 0, matched: 0 };
    }
    
    const allProjects = await db.select().from(projects);
    const allFilesResult = await db.select().from(orderFiles);
    
    // Helper to normalize order numbers for comparison (trim, remove leading zeros)
    const normalizeOrderNumber = (num: string): string => {
      return num.trim().replace(/^0+/, '').toLowerCase();
    };
    
    const allFiles = allFilesResult.map(file => ({
      projectId: file.projectId,
      fileId: file.id,
      filename: file.originalFilename || '',
      allmoxyJobNumber: file.allmoxyJobNumber || '',
      allmoxyJobNumberNormalized: file.allmoxyJobNumber ? normalizeOrderNumber(file.allmoxyJobNumber) : '',
      hasPackingSlip: !!file.packingSlipPdfPath
    }));
    
    // Debug: Log all files and their Allmoxy Job Numbers
    log(`Total files in system: ${allFiles.length}`, 'outlook-scheduler');
    for (const f of allFiles) {
      log(`  File ${f.fileId}: "${f.filename}" | Allmoxy Job #: "${f.allmoxyJobNumber}" | Has Packing Slip: ${f.hasPackingSlip}`, 'outlook-scheduler');
    }
    
    for (const email of emails) {
      for (const attachment of email.attachments) {
        const messageAttachmentKey = `${email.id}:${attachment.id}`;
        
        if (await isMessageProcessed(messageAttachmentKey)) {
          log(`Skipping already processed: ${email.subject}`, 'outlook-scheduler');
          continue;
        }
        
        processed++;
        
        try {
          const subjectMatch = email.subject.match(/(\d{3,6})/);
          const attachmentMatch = attachment.name.match(/(\d{3,6})/);
          const orderNumber = subjectMatch?.[1] || attachmentMatch?.[1];
          
          if (!orderNumber) {
            log(`No order number found in: ${email.subject}`, 'outlook-scheduler');
            await markMessageProcessed(messageAttachmentKey, email.subject, 'skipped');
            continue;
          }
          
          // Match by Allmoxy Job # first (using normalized comparison), then fall back to filename matching
          const normalizedOrderNumber = normalizeOrderNumber(orderNumber);
          log(`Looking for order number: "${orderNumber}" (normalized: "${normalizedOrderNumber}")`, 'outlook-scheduler');
          
          const matchingFile = allFiles.find(f => {
            // Normalized comparison for job numbers (handles leading zeros, whitespace, case)
            const jobMatch = f.allmoxyJobNumberNormalized === normalizedOrderNumber;
            const filenameMatch = f.filename.includes(orderNumber);
            if (jobMatch || filenameMatch) {
              log(`  Potential match: File ${f.fileId} | jobMatch: ${jobMatch} (db: "${f.allmoxyJobNumber}" -> "${f.allmoxyJobNumberNormalized}") | filenameMatch: ${filenameMatch} | hasPackingSlip: ${f.hasPackingSlip}`, 'outlook-scheduler');
            }
            return !f.hasPackingSlip && (jobMatch || filenameMatch);
          });
          
          if (matchingFile) {
            const pdfBuffer = await downloadEmailAttachment(email.id, attachment.id);
            
            // Build filename: {Original CSV Filename} {Allmoxy Job #} - Netley Packing Slip.pdf
            const baseFilename = matchingFile.filename.replace(/\.csv$/i, '');
            const jobNumber = matchingFile.allmoxyJobNumber || orderNumber;
            const sanitizedFilename = `${baseFilename} ${jobNumber} - Netley Packing Slip.pdf`.replace(/[^a-zA-Z0-9\s\-_().]/g, '').replace(/\s+/g, ' ').trim();
            const storagePath = `.private/packing-slips/${sanitizedFilename}`;
            
            await objectStorageService.uploadBuffer(pdfBuffer, storagePath, 'application/pdf');
            
            await db.update(orderFiles)
              .set({ packingSlipPdfPath: storagePath })
              .where(eq(orderFiles.id, matchingFile.fileId));
            
            await markMessageProcessed(messageAttachmentKey, email.subject, 'processed', matchingFile.fileId);
            
            allFiles.find(f => f.fileId === matchingFile.fileId)!.hasPackingSlip = true;
            
            log(`Matched: ${email.subject} -> ${matchingFile.filename}`, 'outlook-scheduler');
            matched++;
          } else {
            log(`No match for order ${orderNumber}: ${email.subject}`, 'outlook-scheduler');
            await markMessageProcessed(messageAttachmentKey, email.subject, 'skipped');
          }
        } catch (attachErr: any) {
          log(`Error processing attachment: ${attachErr.message}`, 'outlook-scheduler');
          await markMessageProcessed(messageAttachmentKey, email.subject, 'failed');
        }
      }
    }
    
    await updateSyncStatus(true, processed, matched);
    log(`Completed: processed ${processed}, matched ${matched}`, 'outlook-scheduler');
    
  } catch (err: any) {
    log(`Error during scheduled fetch: ${err.message}`, 'outlook-scheduler');
    await updateSyncStatus(false, processed, matched, err.message);
  }
  
  return { processed, matched };
}

export function startOutlookScheduler(): void {
  if (isPolling) {
    log('Scheduler already running', 'outlook-scheduler');
    return;
  }
  
  isPolling = true;
  log(`Starting Outlook email scheduler (every ${POLL_INTERVAL_MS / 60000} minutes)`, 'outlook-scheduler');
  
  setTimeout(() => {
    processOutlookEmails().catch(err => {
      log(`Initial fetch error: ${err.message}`, 'outlook-scheduler');
    });
  }, 10000);
  
  pollIntervalId = setInterval(() => {
    processOutlookEmails().catch(err => {
      log(`Scheduled fetch error: ${err.message}`, 'outlook-scheduler');
    });
  }, POLL_INTERVAL_MS);
}

export function stopOutlookScheduler(): void {
  if (pollIntervalId) {
    clearInterval(pollIntervalId);
    pollIntervalId = null;
  }
  isPolling = false;
  log('Outlook scheduler stopped', 'outlook-scheduler');
}

export async function triggerManualFetch(): Promise<{ processed: number; matched: number }> {
  log('Manual fetch triggered', 'outlook-scheduler');
  return await processOutlookEmails();
}
