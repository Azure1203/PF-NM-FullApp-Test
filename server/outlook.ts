import { Client } from '@microsoft/microsoft-graph-client';

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

export async function searchNetleyEmails(searchQuery?: string): Promise<NetleyEmail[]> {
  const client = await getUncachableOutlookClient();
  
  const query = searchQuery || 'from:netley OR subject:netley OR subject:packing slip';
  
  const messages = await client
    .api('/me/messages')
    .filter(`contains(subject,'netley') or contains(subject,'packing slip')`)
    .select('id,subject,receivedDateTime,from,hasAttachments')
    .orderby('receivedDateTime desc')
    .top(50)
    .get();
  
  const emailsWithAttachments: NetleyEmail[] = [];
  
  for (const message of messages.value || []) {
    if (message.hasAttachments) {
      const attachments = await client
        .api(`/me/messages/${message.id}/attachments`)
        .select('id,name,contentType,size')
        .get();
      
      const pdfAttachments = (attachments.value || []).filter(
        (att: any) => att.contentType === 'application/pdf' || att.name?.toLowerCase().endsWith('.pdf')
      );
      
      if (pdfAttachments.length > 0) {
        emailsWithAttachments.push({
          id: message.id,
          subject: message.subject,
          receivedDateTime: message.receivedDateTime,
          from: message.from?.emailAddress?.address || 'Unknown',
          attachments: pdfAttachments.map((att: any) => ({
            id: att.id,
            name: att.name,
            contentType: att.contentType,
            size: att.size
          }))
        });
      }
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

export async function testOutlookConnection(): Promise<{ success: boolean; email?: string; error?: string }> {
  try {
    const client = await getUncachableOutlookClient();
    const user = await client.api('/me').select('mail,displayName').get();
    return { success: true, email: user.mail || user.displayName };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
