const AGENTMAIL_BASE_URL = 'https://api.agentmail.to/v0';
const AGENTMAIL_INBOX_ID = 'allmoxyreplit@agentmail.to';
const AGENTMAIL_INBOX_ENCODED = encodeURIComponent(AGENTMAIL_INBOX_ID);

function getApiKey(): string {
  const key = process.env.AGENTMAIL_API_KEY;
  if (!key) throw new Error('AGENTMAIL_API_KEY environment variable not set');
  return key;
}

function agentMailHeaders(): Record<string, string> {
  return {
    'Authorization': `Bearer ${getApiKey()}`,
    'Content-Type': 'application/json'
  };
}

export interface AgentMailAttachmentMeta {
  attachment_id: string;
  filename: string | null;
  content_type: string | null;
  size: number;
}

export interface AgentMailMessage {
  id: string;
  subject: string | null;
  timestamp: string;
  from: string | null;
  attachments: AgentMailAttachmentMeta[];
}

export interface AgentMailAttachment {
  attachment_id: string;
  filename: string | null;
  content_type: string | null;
  size: number;
  download_url: string;
  expires_at: string;
  content_disposition: string | null;
  content_id: string | null;
}

export async function listAgentMailMessages(): Promise<AgentMailMessage[]> {
  const url = `${AGENTMAIL_BASE_URL}/inboxes/${AGENTMAIL_INBOX_ENCODED}/messages?limit=100`;
  const res = await fetch(url, { headers: agentMailHeaders() });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`AgentMail listMessages failed (${res.status}): ${body}`);
  }

  const data = await res.json();
  const raw: any[] = data.messages || [];

  return raw.map((msg: any) => ({
    id: msg.id,
    subject: msg.subject || null,
    timestamp: msg.timestamp,
    from: msg.from?.address || msg.from || null,
    attachments: (msg.attachments || []).map((att: any) => ({
      attachment_id: att.attachment_id || att.id,
      filename: att.filename || null,
      content_type: att.content_type || null,
      size: att.size || 0
    }))
  }));
}

export async function getAgentMailAttachment(
  messageId: string,
  attachmentId: string
): Promise<AgentMailAttachment> {
  const url = `${AGENTMAIL_BASE_URL}/inboxes/${AGENTMAIL_INBOX_ENCODED}/messages/${messageId}/attachments/${attachmentId}`;
  const res = await fetch(url, { headers: agentMailHeaders() });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`AgentMail getAttachment failed (${res.status}): ${body}`);
  }

  return await res.json();
}

export async function downloadAgentMailAttachment(downloadUrl: string): Promise<Buffer> {
  const res = await fetch(downloadUrl);
  if (!res.ok) {
    throw new Error(`AgentMail download failed (${res.status})`);
  }
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export async function testAgentMailConnection(): Promise<{
  success: boolean;
  inbox?: string;
  messageCount?: number;
  error?: string;
}> {
  try {
    const url = `${AGENTMAIL_BASE_URL}/inboxes/${AGENTMAIL_INBOX_ENCODED}/messages?limit=1`;
    const res = await fetch(url, { headers: agentMailHeaders() });

    if (!res.ok) {
      const body = await res.text();
      return { success: false, error: `HTTP ${res.status}: ${body}` };
    }

    const data = await res.json();
    return {
      success: true,
      inbox: AGENTMAIL_INBOX_ID,
      messageCount: data.count ?? 0
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
