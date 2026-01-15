// Gmail integration for processing Allmoxy order emails
// Uses Replit Gmail connector for authentication

import { google } from 'googleapis';

let connectionSettings: any;

async function getAccessToken() {
  if (connectionSettings && connectionSettings.settings.expires_at && new Date(connectionSettings.settings.expires_at).getTime() > Date.now()) {
    return connectionSettings.settings.access_token;
  }
  
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=google-mail',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  const accessToken = connectionSettings?.settings?.access_token || connectionSettings.settings?.oauth?.credentials?.access_token;

  if (!connectionSettings || !accessToken) {
    throw new Error('Gmail not connected');
  }
  return accessToken;
}

// WARNING: Never cache this client.
// Access tokens expire, so a new client must be created each time.
export async function getGmailClient() {
  const accessToken = await getAccessToken();

  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({
    access_token: accessToken
  });

  return google.gmail({ version: 'v1', auth: oauth2Client });
}

export interface ParsedOrderEmail {
  messageId: string;
  allmoxyOrderName: string;
  allmoxyOrderNumber: string;
  subject: string;
  from: string;
  date: string;
}

export interface NetleyPackingSlipEmail {
  messageId: string;
  allmoxyOrderName: string;
  allmoxyOrderNumber: string;
  subject: string;
  from: string;
  date: string;
  pdfAttachment: {
    filename: string;
    data: Buffer;
    mimeType: string;
  } | null;
}

// Parse email body to extract Allmoxy Order Name and Order Number
export function parseAllmoxyEmailBody(body: string): { orderName: string | null; orderNumber: string | null } {
  let orderName: string | null = null;
  let orderNumber: string | null = null;

  // Match "Allmoxy Order Name: {value}"
  const orderNameMatch = body.match(/Allmoxy Order Name:\s*(.+?)(?:\n|$)/i);
  if (orderNameMatch) {
    orderName = orderNameMatch[1].trim();
  }

  // Match "Allmoxy Order Number: {value}"
  const orderNumberMatch = body.match(/Allmoxy Order Number:\s*(.+?)(?:\n|$)/i);
  if (orderNumberMatch) {
    orderNumber = orderNumberMatch[1].trim();
  }

  return { orderName, orderNumber };
}

// Decode base64url encoded content
function decodeBase64Url(data: string): string {
  const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(base64, 'base64').toString('utf-8');
}

// Extract plain text body from email message
function extractEmailBody(payload: any): string {
  if (!payload) return '';

  // If the payload itself has body data
  if (payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }

  // If the payload has parts, search through them
  if (payload.parts) {
    for (const part of payload.parts) {
      // Prefer text/plain
      if (part.mimeType === 'text/plain' && part.body?.data) {
        return decodeBase64Url(part.body.data);
      }
      // Recursively check nested parts
      if (part.parts) {
        const nested = extractEmailBody(part);
        if (nested) return nested;
      }
    }
    // Fall back to text/html if no plain text
    for (const part of payload.parts) {
      if (part.mimeType === 'text/html' && part.body?.data) {
        const html = decodeBase64Url(part.body.data);
        // Strip HTML tags for basic text extraction
        return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      }
    }
  }

  return '';
}

// Get header value from message headers
function getHeader(headers: any[], name: string): string {
  const header = headers?.find((h: any) => h.name.toLowerCase() === name.toLowerCase());
  return header?.value || '';
}

// Fetch and parse unread emails from Gmail
export async function fetchUnreadAllmoxyEmails(): Promise<ParsedOrderEmail[]> {
  const gmail = await getGmailClient();
  const parsedEmails: ParsedOrderEmail[] = [];

  try {
    // List unread messages
    const response = await gmail.users.messages.list({
      userId: 'me',
      q: 'is:unread',
      maxResults: 50
    });

    const messages = response.data.messages || [];
    console.log(`[Gmail] Found ${messages.length} unread messages`);

    for (const msg of messages) {
      if (!msg.id) continue;

      // Get full message details
      const fullMessage = await gmail.users.messages.get({
        userId: 'me',
        id: msg.id,
        format: 'full'
      });

      const headers = fullMessage.data.payload?.headers || [];
      const subject = getHeader(headers, 'Subject');
      const from = getHeader(headers, 'From');
      const date = getHeader(headers, 'Date');

      // Extract email body
      const body = extractEmailBody(fullMessage.data.payload);
      
      // Parse for Allmoxy order info
      const { orderName, orderNumber } = parseAllmoxyEmailBody(body);

      if (orderName && orderNumber) {
        parsedEmails.push({
          messageId: msg.id,
          allmoxyOrderName: orderName,
          allmoxyOrderNumber: orderNumber,
          subject,
          from,
          date
        });
        console.log(`[Gmail] Found Allmoxy order email: ${orderName} - #${orderNumber}`);
      }
    }

    return parsedEmails;
  } catch (error: any) {
    console.error('[Gmail] Error fetching emails:', error.message);
    throw error;
  }
}

// Mark an email as read after processing
export async function markEmailAsRead(messageId: string): Promise<void> {
  const gmail = await getGmailClient();
  
  await gmail.users.messages.modify({
    userId: 'me',
    id: messageId,
    requestBody: {
      removeLabelIds: ['UNREAD']
    }
  });
  
  console.log(`[Gmail] Marked message ${messageId} as read`);
}

// Extract PDF attachment from email parts
function extractPdfAttachment(parts: any[], gmail: any, messageId: string): Promise<{ filename: string; data: Buffer; mimeType: string } | null> {
  return new Promise(async (resolve) => {
    for (const part of parts) {
      // Check if this part is a PDF attachment
      if (part.mimeType === 'application/pdf' && part.filename && part.body?.attachmentId) {
        try {
          // Download the attachment
          const attachment = await gmail.users.messages.attachments.get({
            userId: 'me',
            messageId: messageId,
            id: part.body.attachmentId
          });
          
          if (attachment.data?.data) {
            // Decode base64url data
            const base64Data = attachment.data.data.replace(/-/g, '+').replace(/_/g, '/');
            const buffer = Buffer.from(base64Data, 'base64');
            
            resolve({
              filename: part.filename,
              data: buffer,
              mimeType: part.mimeType
            });
            return;
          }
        } catch (err: any) {
          console.error(`[Gmail] Error downloading attachment: ${err.message}`);
        }
      }
      
      // Recursively check nested parts
      if (part.parts) {
        const nested = await extractPdfAttachment(part.parts, gmail, messageId);
        if (nested) {
          resolve(nested);
          return;
        }
      }
    }
    resolve(null);
  });
}

// Fetch Netley Packing Slip emails with PDF attachments
// These emails contain "Allmoxy Order Name" and "Allmoxy Order Number" in the body
// and have a PDF attachment named like "1870 - Netley Packing Slip.pdf"
export async function fetchNetleyPackingSlipEmails(): Promise<NetleyPackingSlipEmail[]> {
  const gmail = await getGmailClient();
  const parsedEmails: NetleyPackingSlipEmail[] = [];

  try {
    // Search for unread emails with "Netley Packing Slip" in subject or attachment name
    const response = await gmail.users.messages.list({
      userId: 'me',
      q: 'is:unread (subject:"Netley Packing Slip" OR filename:"Netley Packing Slip")',
      maxResults: 50
    });

    const messages = response.data.messages || [];
    console.log(`[Gmail] Found ${messages.length} unread Netley Packing Slip messages`);

    for (const msg of messages) {
      if (!msg.id) continue;

      // Get full message details with attachments
      const fullMessage = await gmail.users.messages.get({
        userId: 'me',
        id: msg.id,
        format: 'full'
      });

      const headers = fullMessage.data.payload?.headers || [];
      const subject = getHeader(headers, 'Subject');
      const from = getHeader(headers, 'From');
      const date = getHeader(headers, 'Date');

      // Extract email body to get Allmoxy Order Name and Number
      const body = extractEmailBody(fullMessage.data.payload);
      const { orderName, orderNumber } = parseAllmoxyEmailBody(body);

      if (!orderName || !orderNumber) {
        console.log(`[Gmail] Skipping message ${msg.id} - no Allmoxy order info found`);
        continue;
      }

      // Extract PDF attachment
      let pdfAttachment = null;
      if (fullMessage.data.payload?.parts) {
        pdfAttachment = await extractPdfAttachment(fullMessage.data.payload.parts, gmail, msg.id);
      } else if (fullMessage.data.payload?.body?.attachmentId) {
        // Single-part message with attachment
        try {
          const attachment = await gmail.users.messages.attachments.get({
            userId: 'me',
            messageId: msg.id,
            id: fullMessage.data.payload.body.attachmentId
          });
          
          if (attachment.data?.data && fullMessage.data.payload.filename) {
            const base64Data = attachment.data.data.replace(/-/g, '+').replace(/_/g, '/');
            const buffer = Buffer.from(base64Data, 'base64');
            pdfAttachment = {
              filename: fullMessage.data.payload.filename,
              data: buffer,
              mimeType: fullMessage.data.payload.mimeType || 'application/pdf'
            };
          }
        } catch (err: any) {
          console.error(`[Gmail] Error downloading single-part attachment: ${err.message}`);
        }
      }

      parsedEmails.push({
        messageId: msg.id,
        allmoxyOrderName: orderName,
        allmoxyOrderNumber: orderNumber,
        subject,
        from,
        date,
        pdfAttachment
      });
      
      console.log(`[Gmail] Found Netley Packing Slip: ${orderName} - #${orderNumber}, PDF: ${pdfAttachment ? pdfAttachment.filename : 'none'}`);
    }

    return parsedEmails;
  } catch (error: any) {
    console.error('[Gmail] Error fetching Netley Packing Slip emails:', error.message);
    throw error;
  }
}
