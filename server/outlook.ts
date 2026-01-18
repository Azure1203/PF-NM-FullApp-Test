import { Client } from '@microsoft/microsoft-graph-client';

let connectionSettings: any;

const TARGET_FOLDER_NAME = 'Perfect Fit Allmoxy Emails';

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
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=outlook',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  const accessToken = connectionSettings?.settings?.access_token || connectionSettings.settings?.oauth?.credentials?.access_token;

  if (!connectionSettings || !accessToken) {
    throw new Error('Outlook not connected');
  }
  return accessToken;
}

async function getUncachableOutlookClient() {
  const accessToken = await getAccessToken();

  return Client.initWithMiddleware({
    authProvider: {
      getAccessToken: async () => accessToken
    }
  });
}

export interface MailFolder {
  id: string;
  displayName: string;
  parentFolderId: string | null;
  childFolderCount: number;
  unreadItemCount: number;
  totalItemCount: number;
}

export interface NetleyEmail {
  id: string;
  subject: string;
  receivedDateTime: string;
  from: string;
  attachments: Array<{
    id: string;
    name: string;
    contentType: string;
    size: number;
  }>;
}

async function fetchFoldersRecursively(client: Client, parentFolderId: string | null, depth: number = 0): Promise<MailFolder[]> {
  if (depth > 5) return [];
  
  const folders: MailFolder[] = [];
  
  try {
    const apiPath = parentFolderId 
      ? `/me/mailFolders/${parentFolderId}/childFolders`
      : '/me/mailFolders';
    
    const response = await client
      .api(apiPath)
      .select('id,displayName,parentFolderId,childFolderCount,unreadItemCount,totalItemCount')
      .top(100)
      .get();
    
    for (const folder of response.value || []) {
      folders.push({
        id: folder.id,
        displayName: folder.displayName,
        parentFolderId: folder.parentFolderId || parentFolderId,
        childFolderCount: folder.childFolderCount || 0,
        unreadItemCount: folder.unreadItemCount || 0,
        totalItemCount: folder.totalItemCount || 0
      });
      
      if (folder.childFolderCount > 0) {
        const childFolders = await fetchFoldersRecursively(client, folder.id, depth + 1);
        folders.push(...childFolders);
      }
    }
  } catch (e: any) {
    console.log(`[Outlook] Could not fetch folders at depth ${depth}: ${e.message}`);
  }
  
  return folders;
}

export async function listMailFolders(): Promise<MailFolder[]> {
  const client = await getUncachableOutlookClient();
  return await fetchFoldersRecursively(client, null, 0);
}

async function findFolderByName(folderName: string): Promise<string | null> {
  const folders = await listMailFolders();
  const folder = folders.find(f => f.displayName.toLowerCase() === folderName.toLowerCase());
  return folder?.id || null;
}

export interface SearchResult {
  emails: NetleyEmail[];
  folderFound: boolean;
  folderName: string;
  error?: string;
}

export async function searchNetleyEmails(): Promise<SearchResult> {
  const client = await getUncachableOutlookClient();
  
  const folderId = await findFolderByName(TARGET_FOLDER_NAME);
  
  if (!folderId) {
    console.log(`[Outlook] Folder "${TARGET_FOLDER_NAME}" not found`);
    return {
      emails: [],
      folderFound: false,
      folderName: TARGET_FOLDER_NAME,
      error: `Folder "${TARGET_FOLDER_NAME}" not found in your mailbox. Please create this folder and move Netley emails there.`
    };
  }
  
  console.log(`[Outlook] Searching in folder "${TARGET_FOLDER_NAME}" (${folderId})`);
  
  const messages = await client
    .api(`/me/mailFolders/${folderId}/messages`)
    .select('id,subject,receivedDateTime,from,hasAttachments')
    .orderby('receivedDateTime desc')
    .top(100)
    .get();
  
  const allMessages = messages.value || [];
  console.log(`[Outlook DEBUG] Total messages in folder: ${allMessages.length}`);
  
  // Log details of each message for debugging
  for (const msg of allMessages) {
    console.log(`[Outlook DEBUG] Message: "${msg.subject}" | hasAttachments: ${msg.hasAttachments} | from: ${msg.from?.emailAddress?.address || 'Unknown'} | received: ${msg.receivedDateTime}`);
  }
  
  const emails = await processMessages(client, allMessages);
  
  console.log(`[Outlook DEBUG] Messages with PDF attachments: ${emails.length}`);
  
  return {
    emails,
    folderFound: true,
    folderName: TARGET_FOLDER_NAME
  };
}

async function processMessages(client: Client, messages: any[]): Promise<NetleyEmail[]> {
  const emailsWithAttachments: NetleyEmail[] = [];
  
  for (const message of messages) {
    if (message.hasAttachments) {
      console.log(`[Outlook DEBUG] Fetching attachments for: "${message.subject}"`);
      
      const attachments = await client
        .api(`/me/messages/${message.id}/attachments`)
        .select('id,name,contentType,size')
        .get();
      
      const allAttachments = attachments.value || [];
      console.log(`[Outlook DEBUG] Found ${allAttachments.length} attachments:`);
      for (const att of allAttachments) {
        console.log(`[Outlook DEBUG]   - "${att.name}" (type: ${att.contentType}, size: ${att.size})`);
      }
      
      // Filter for PDFs and CSVs
      const pdfAttachments = allAttachments.filter(
        (att: any) => att.contentType === 'application/pdf' || att.name?.toLowerCase().endsWith('.pdf')
      );
      
      // CSV detection: check content type OR filename extension
      // Note: CSVs often come as application/octet-stream, so we prioritize filename check
      const csvAttachments = allAttachments.filter((att: any) => {
        const name = att.name?.toLowerCase() || '';
        const contentType = att.contentType?.toLowerCase() || '';
        const isCsvByName = name.endsWith('.csv');
        const isCsvByType = contentType === 'text/csv' || 
                           contentType === 'application/csv' ||
                           contentType === 'application/vnd.ms-excel' ||
                           (contentType === 'application/octet-stream' && isCsvByName);
        
        if (isCsvByName) {
          console.log(`[Outlook DEBUG] CSV detected by filename: "${att.name}" (contentType: ${att.contentType})`);
        }
        
        return isCsvByName || isCsvByType;
      });
      
      const relevantAttachments = [...pdfAttachments, ...csvAttachments];
      
      console.log(`[Outlook DEBUG] PDF attachments: ${pdfAttachments.length}, CSV attachments: ${csvAttachments.length}`);
      
      if (relevantAttachments.length > 0) {
        emailsWithAttachments.push({
          id: message.id,
          subject: message.subject,
          receivedDateTime: message.receivedDateTime,
          from: message.from?.emailAddress?.address || 'Unknown',
          attachments: relevantAttachments.map((att: any) => ({
            id: att.id,
            name: att.name,
            contentType: att.contentType,
            size: att.size
          }))
        });
      }
    } else {
      console.log(`[Outlook DEBUG] Skipping "${message.subject}" - hasAttachments is false`);
    }
  }
  
  return emailsWithAttachments;
}

export async function downloadEmailAttachment(messageId: string, attachmentId: string): Promise<Buffer> {
  const client = await getUncachableOutlookClient();
  
  const attachment = await client
    .api(`/me/messages/${messageId}/attachments/${attachmentId}`)
    .get();
  
  if (!attachment.contentBytes) {
    throw new Error('Attachment has no content');
  }
  
  return Buffer.from(attachment.contentBytes, 'base64');
}

export async function testOutlookConnection(): Promise<{ success: boolean; email?: string; targetFolder?: string; folderFound?: boolean; error?: string }> {
  try {
    const client = await getUncachableOutlookClient();
    const user = await client.api('/me').select('mail,displayName').get();
    
    const folderId = await findFolderByName(TARGET_FOLDER_NAME);
    
    return { 
      success: true, 
      email: user.mail || user.displayName,
      targetFolder: TARGET_FOLDER_NAME,
      folderFound: !!folderId
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
