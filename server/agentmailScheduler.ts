import { db } from "./db";
import { processedOutlookEmails, agentmailSyncStatus, orderFiles } from "@shared/schema";
import { eq, like } from "drizzle-orm";
import { listAgentMailMessages, getAgentMailAttachment, downloadAgentMailAttachment } from "./agentmail";
import { ObjectStorageService } from "./replit_integrations/object_storage";
import { log } from "./index";

const POLL_INTERVAL_MS = 30 * 60 * 1000;
const AGENTMAIL_ID_PREFIX = 'agentmail:';

let isPolling = false;
let pollIntervalId: NodeJS.Timeout | null = null;

const objectStorageService = new ObjectStorageService();

const PDF_TYPES = {
  cutToFile: {
    patterns: ['Cut To File', 'Cut to File', 'Cut To Size', 'Cut to Size'],
    dbColumn: 'cutToFilePdfPath',
    suffix: 'Cut To File'
  },
  eliasDovetail: {
    patterns: ['Elias PF Dovetail Drawers', 'Elias Dovetail', 'Dovetail Drawers'],
    dbColumn: 'eliasDovetailPdfPath',
    suffix: 'Elias PF Dovetail Drawers'
  },
  netley5Piece: {
    patterns: ['Netley 5 Piece Shaker Door', '5 Piece Shaker Door', 'Netley 5 Piece'],
    dbColumn: 'netley5PiecePdfPath',
    suffix: 'Netley 5 Piece Shaker Door'
  },
  netleyPackingSlip: {
    patterns: ['Netley Packing Slip', 'Netley_Packing_Slip'],
    dbColumn: 'netleyPackingSlipPdfPath',
    suffix: 'Netley Packing Slip'
  }
} as const;

type PdfType = keyof typeof PDF_TYPES;

function identifyPdfType(attachmentName: string): PdfType | null {
  const lowerName = attachmentName.toLowerCase();
  for (const [type, config] of Object.entries(PDF_TYPES)) {
    if (config.patterns.some(pattern => lowerName.includes(pattern.toLowerCase()))) {
      return type as PdfType;
    }
  }
  return null;
}

function makeKey(messageId: string, attachmentId: string): string {
  return `${AGENTMAIL_ID_PREFIX}${messageId}:${attachmentId}`;
}

async function isMessageProcessed(key: string): Promise<boolean> {
  const existing = await db
    .select()
    .from(processedOutlookEmails)
    .where(eq(processedOutlookEmails.messageId, key))
    .limit(1);
  return existing.length > 0;
}

async function markMessageProcessed(
  key: string,
  subject: string,
  status: 'processed' | 'failed' | 'skipped',
  matchedFileId?: number
): Promise<void> {
  await db.insert(processedOutlookEmails).values({
    messageId: key,
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
  const existing = await db.select().from(agentmailSyncStatus).limit(1);
  const now = new Date();

  if (existing.length === 0) {
    await db.insert(agentmailSyncStatus).values({
      lastSyncAt: now,
      lastSuccessAt: success ? now : null,
      lastError: error || null,
      emailsProcessed,
      emailsMatched
    });
  } else {
    await db.update(agentmailSyncStatus)
      .set({
        lastSyncAt: now,
        lastSuccessAt: success ? now : existing[0].lastSuccessAt,
        lastError: error || null,
        emailsProcessed,
        emailsMatched
      })
      .where(eq(agentmailSyncStatus.id, existing[0].id));
  }
}

export async function getAgentMailSyncStatus(): Promise<{
  lastSyncAt: Date | null;
  lastSuccessAt: Date | null;
  lastError: string | null;
  emailsProcessed: number;
  emailsMatched: number;
} | null> {
  const status = await db.select().from(agentmailSyncStatus).limit(1);
  if (status.length === 0) return null;
  return {
    lastSyncAt: status[0].lastSyncAt,
    lastSuccessAt: status[0].lastSuccessAt,
    lastError: status[0].lastError,
    emailsProcessed: status[0].emailsProcessed || 0,
    emailsMatched: status[0].emailsMatched || 0
  };
}

async function processAgentMailEmails(): Promise<{ processed: number; matched: number }> {
  log('Starting scheduled AgentMail email fetch...', 'agentmail-scheduler');

  let processed = 0;
  let matched = 0;

  try {
    const messages = await listAgentMailMessages();
    log(`Found ${messages.length} messages in AgentMail inbox`, 'agentmail-scheduler');

    if (messages.length === 0) {
      await updateSyncStatus(true, 0, 0);
      return { processed: 0, matched: 0 };
    }

    const allFilesResult = await db.select().from(orderFiles);

    const normalizeOrderNumber = (num: string): string =>
      num.trim().replace(/^0+/, '').toLowerCase();

    const allFiles = allFilesResult.map(file => ({
      projectId: file.projectId,
      fileId: file.id,
      filename: file.originalFilename || '',
      allmoxyJobNumber: file.allmoxyJobNumber || '',
      allmoxyJobNumberNormalized: file.allmoxyJobNumber
        ? normalizeOrderNumber(file.allmoxyJobNumber)
        : '',
      hasPdfs: {
        cutToFile: !!file.cutToFilePdfPath,
        eliasDovetail: !!file.eliasDovetailPdfPath,
        netley5Piece: !!file.netley5PiecePdfPath,
        netleyPackingSlip: !!file.netleyPackingSlipPdfPath
      }
    }));

    log(`Total files in system: ${allFiles.length}`, 'agentmail-scheduler');

    for (const message of messages) {
      const subject = message.subject || '(no subject)';

      if (!message.attachments || message.attachments.length === 0) {
        log(`Skipping message with no attachments: "${subject}"`, 'agentmail-scheduler');
        continue;
      }

      for (const attachment of message.attachments) {
        const filename = attachment.filename || '';
        const contentType = attachment.content_type || '';

        const isPdf = contentType === 'application/pdf' || filename.toLowerCase().endsWith('.pdf');
        const isCsv = filename.toLowerCase().endsWith('.csv') ||
          contentType === 'text/csv' ||
          contentType === 'application/csv' ||
          (contentType === 'application/octet-stream' && filename.toLowerCase().endsWith('.csv'));

        if (!isPdf && !isCsv) {
          log(`Skipping non-PDF/CSV attachment: "${filename}" (${contentType})`, 'agentmail-scheduler');
          continue;
        }

        const key = makeKey(message.id, attachment.attachment_id);

        if (await isMessageProcessed(key)) {
          log(`Skipping already processed: "${subject}" / "${filename}"`, 'agentmail-scheduler');
          continue;
        }

        processed++;

        try {
          const pdfType = identifyPdfType(filename);
          if (!pdfType) {
            log(`Unknown attachment type: "${filename}"`, 'agentmail-scheduler');
            await markMessageProcessed(key, subject, 'skipped');
            continue;
          }

          const pdfConfig = PDF_TYPES[pdfType];
          log(`Identified PDF type: ${pdfType} for "${filename}"`, 'agentmail-scheduler');

          const subjectMatch = subject.match(/(\d{3,6})/);
          const filenameMatch = filename.match(/(\d{3,6})/);
          const orderNumber = subjectMatch?.[1] || filenameMatch?.[1];

          if (!orderNumber) {
            log(`No order number found in: "${subject}" / "${filename}"`, 'agentmail-scheduler');
            await markMessageProcessed(key, subject, 'skipped');
            continue;
          }

          const normalizedOrderNumber = normalizeOrderNumber(orderNumber);
          log(`Looking for order number: "${orderNumber}" (normalized: "${normalizedOrderNumber}") for ${pdfType}`, 'agentmail-scheduler');

          const matchingFile = allFiles.find(f => {
            const jobMatch = f.allmoxyJobNumberNormalized === normalizedOrderNumber;
            const fileNameMatch = f.filename.includes(orderNumber);
            const alreadyHasPdf = f.hasPdfs[pdfType];
            if (jobMatch || fileNameMatch) {
              log(`  Potential match: File ${f.fileId} | jobMatch: ${jobMatch} | filenameMatch: ${fileNameMatch} | has${pdfType}: ${alreadyHasPdf}`, 'agentmail-scheduler');
            }
            return !alreadyHasPdf && (jobMatch || fileNameMatch);
          });

          if (matchingFile) {
            const attachmentDetail = await getAgentMailAttachment(message.id, attachment.attachment_id);
            const pdfBuffer = await downloadAgentMailAttachment(attachmentDetail.download_url);

            const baseFilename = matchingFile.filename.replace(/\.csv$/i, '');
            const jobNumber = matchingFile.allmoxyJobNumber || orderNumber;
            const sanitizedFilename = `${baseFilename} ${jobNumber} - ${pdfConfig.suffix}.pdf`
              .replace(/[^a-zA-Z0-9\s\-_().]/g, '')
              .replace(/\s+/g, ' ')
              .trim();
            const storagePath = `.private/packing-slips/${sanitizedFilename}`;

            await objectStorageService.uploadBuffer(pdfBuffer, storagePath, 'application/pdf');

            const updateData: Record<string, string> = {};
            updateData[pdfConfig.dbColumn] = storagePath;

            await db.update(orderFiles)
              .set(updateData)
              .where(eq(orderFiles.id, matchingFile.fileId));

            await markMessageProcessed(key, subject, 'processed', matchingFile.fileId);

            const fileInCache = allFiles.find(f => f.fileId === matchingFile.fileId);
            if (fileInCache) {
              fileInCache.hasPdfs[pdfType] = true;
            }

            log(`Matched ${pdfType}: "${subject}" -> "${matchingFile.filename}"`, 'agentmail-scheduler');
            matched++;
          } else {
            log(`No match yet for order ${orderNumber} (${pdfType}): "${subject}" - will retry later`, 'agentmail-scheduler');
          }
        } catch (attachErr: any) {
          log(`Error processing attachment "${filename}": ${attachErr.message}`, 'agentmail-scheduler');
          await markMessageProcessed(key, subject, 'failed');
        }
      }
    }

    await updateSyncStatus(true, processed, matched);
    log(`AgentMail completed: processed ${processed}, matched ${matched}`, 'agentmail-scheduler');

  } catch (err: any) {
    log(`AgentMail scheduler error: ${err.message}`, 'agentmail-scheduler');
    await updateSyncStatus(false, processed, matched, err.message);
  }

  return { processed, matched };
}

export function startAgentMailScheduler(): void {
  if (isPolling) {
    log('AgentMail scheduler already running', 'agentmail-scheduler');
    return;
  }

  isPolling = true;
  log(`Starting AgentMail email scheduler (every ${POLL_INTERVAL_MS / 60000} minutes)`, 'agentmail-scheduler');

  setTimeout(() => {
    processAgentMailEmails().catch(err => {
      log(`AgentMail initial fetch error: ${err.message}`, 'agentmail-scheduler');
    });
  }, 15000);

  pollIntervalId = setInterval(() => {
    processAgentMailEmails().catch(err => {
      log(`AgentMail scheduled fetch error: ${err.message}`, 'agentmail-scheduler');
    });
  }, POLL_INTERVAL_MS);
}

export function stopAgentMailScheduler(): void {
  if (pollIntervalId) {
    clearInterval(pollIntervalId);
    pollIntervalId = null;
  }
  isPolling = false;
  log('AgentMail scheduler stopped', 'agentmail-scheduler');
}

export async function triggerManualAgentMailFetch(): Promise<{ processed: number; matched: number }> {
  log('AgentMail manual fetch triggered', 'agentmail-scheduler');
  return await processAgentMailEmails();
}

export async function clearAgentMailProcessedEmails(): Promise<number> {
  const result = await db
    .delete(processedOutlookEmails)
    .where(like(processedOutlookEmails.messageId, `${AGENTMAIL_ID_PREFIX}%`));
  return (result as any).rowCount ?? 0;
}
