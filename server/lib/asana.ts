import * as Asana from 'asana';

// Always fetch a fresh token from Replit connector on each request
// The connector handles OAuth token refresh automatically
async function getAccessToken() {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    console.error('[Asana] X_REPLIT_TOKEN not found for repl/depl');
    throw new Error('Asana authentication not available - please reconnect Asana in the integrations panel');
  }

  if (!hostname) {
    console.error('[Asana] REPLIT_CONNECTORS_HOSTNAME not set');
    throw new Error('Asana connector not configured');
  }

  try {
    console.log('[Asana] Fetching fresh access token from connector...');
    const response = await fetch(
      'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=asana',
      {
        headers: {
          'Accept': 'application/json',
          'X_REPLIT_TOKEN': xReplitToken
        }
      }
    );
    
    if (!response.ok) {
      console.error('[Asana] Connector response not OK:', response.status, response.statusText);
      throw new Error(`Asana connector returned ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    const connectionSettings = data.items?.[0];
    
    if (!connectionSettings) {
      console.error('[Asana] No connection settings returned from connector');
      throw new Error('Asana not connected - please connect Asana in the integrations panel');
    }
    
    const accessToken = connectionSettings.settings?.access_token || connectionSettings.settings?.oauth?.credentials?.access_token;
    
    if (!accessToken) {
      console.error('[Asana] No access token in connection settings');
      throw new Error('Asana token not found - please reconnect Asana in the integrations panel');
    }
    
    console.log('[Asana] Successfully obtained fresh access token');
    return accessToken;
  } catch (e: any) {
    console.error("[Asana] Failed to fetch connection settings:", e.message);
    throw new Error('Failed to connect to Asana: ' + e.message);
  }
}

// WARNING: Never cache these API instances.
// Access tokens expire, so new instances must be created each time.
// Always call this function again to get fresh API instances.
export async function getAsanaApiInstances() {
  const accessToken = await getAccessToken();
  
  // Configure API client instance
  const client = Asana.ApiClient.instance;
  const token = client.authentications['token'];
  token.accessToken = accessToken;

  return {
    client,
    tasksApi: new Asana.TasksApi(),
    projectsApi: new Asana.ProjectsApi(),
    usersApi: new Asana.UsersApi(),
    workspacesApi: new Asana.WorkspacesApi(),
    jobsApi: new Asana.JobsApi(),
    sectionsApi: new Asana.SectionsApi(),
    attachmentsApi: new Asana.AttachmentsApi()
  };
}
