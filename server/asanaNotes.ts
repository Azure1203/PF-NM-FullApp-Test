import { storage } from "./storage";
import { getAsanaApiInstances } from "./lib/asana";

const ASANA_PERFECT_FIT_PROJECT_GID = '1208263802564738';

export async function buildAsanaTaskNotes(projectId: number): Promise<string> {
  const project = await storage.getProject(projectId);
  if (!project) return '';

  const customDomain = process.env.CUSTOM_APP_DOMAIN;
  const publishedDomain = process.env.REPLIT_DOMAINS?.split(',')[0];
  const devDomain = process.env.REPLIT_DEV_DOMAIN;
  const appDomain = customDomain || publishedDomain || devDomain || '';
  const projectAppUrl = appDomain ? `https://${appDomain}/orders/${project.id}` : '';

  let notes = '';
  if (projectAppUrl) {
    notes += `Packaging Link: ${projectAppUrl}\n\n`;
  }

  const projectFiles = await storage.getProjectFiles(project.id);
  const fileMap = new Map(projectFiles.map(f => [f.id, f]));

  for (const file of projectFiles) {
    let fileName = file.originalFilename || 'Unknown File';
    if (fileName.toLowerCase().endsWith('.csv')) {
      fileName = fileName.slice(0, -4);
    }
    const jobNumber = file.allmoxyJobNumber || 'N/A';
    notes += `${fileName} - ${jobNumber}\n`;
  }

  const pallets = await storage.getPalletsForProject(project.id);
  const palletsWithAssignments = pallets
    .sort((a, b) => a.palletNumber - b.palletNumber);

  const palletsWithFiles: { pallet: typeof pallets[0]; fileNames: string[] }[] = [];
  for (const pallet of palletsWithAssignments) {
    const assignments = await storage.getAssignmentsForPallet(pallet.id);
    const fileNames = assignments.map(a => {
      const file = fileMap.get(a.fileId);
      if (!file) return 'Unknown';
      let name = file.originalFilename || 'Unknown File';
      if (name.toLowerCase().endsWith('.csv')) name = name.slice(0, -4);
      const jobNumber = file.allmoxyJobNumber;
      return jobNumber ? `${name} - #${jobNumber}` : name;
    });
    if (assignments.length > 0) {
      palletsWithFiles.push({ pallet, fileNames });
    }
  }

  if (palletsWithFiles.length > 0) {
    notes += '\nPALLETS:\n';
    for (const { pallet, fileNames } of palletsWithFiles) {
      const sizeLabel = pallet.finalSize || pallet.customSize || pallet.size;
      notes += `Pallet ${pallet.palletNumber} (${sizeLabel}):\n`;
      if (pallet.notes) {
        notes += `  Notes: ${pallet.notes}\n`;
      }
      for (const name of fileNames) {
        notes += `  - ${name}\n`;
      }
    }
  }

  return notes;
}

export async function syncAsanaTaskNotes(projectId: number, context: string): Promise<void> {
  const project = await storage.getProject(projectId);
  if (!project?.asanaTaskId) return;

  try {
    const { tasksApi } = await getAsanaApiInstances();
    const taskNotes = await buildAsanaTaskNotes(projectId);
    if (taskNotes) {
      await tasksApi.updateTask({ data: { notes: taskNotes } }, project.asanaTaskId, {});
      console.log(`[Asana] Updated task notes for ${project.asanaTaskId} after ${context}`);
    }
  } catch (err: any) {
    console.error(`[Asana] Failed to update task notes after ${context}:`, err.message);
  }
}

export async function syncAsanaOrderType(projectId: number): Promise<void> {
  const project = await storage.getProject(projectId);
  if (!project?.asanaTaskId) return;

  const pallets = await storage.getPalletsForProject(projectId);
  if (pallets.length === 0) return;

  const allCourier = pallets.every(p => {
    const size = (p.finalSize || p.customSize || p.size || '').trim();
    return size === 'Courier Package';
  });
  const orderType = allCourier ? 'COURIER PACKAGE' : 'PALLET';

  try {
    const { tasksApi, projectsApi } = await getAsanaApiInstances();
    const projectDetails = await projectsApi.getProject(ASANA_PERFECT_FIT_PROJECT_GID, {
      opt_fields: 'custom_field_settings.custom_field.name,custom_field_settings.custom_field.gid,custom_field_settings.custom_field.type,custom_field_settings.custom_field.enum_options'
    });

    const customFieldSettings = projectDetails.data.custom_field_settings || [];
    let customFields: Record<string, any> = {};

    for (const setting of customFieldSettings) {
      const field = setting.custom_field;
      const fieldName = (field.name || '').trim().toUpperCase();
      if (fieldName === 'PF ORDER TYPE' && field.type === 'enum' && field.enum_options) {
        const match = field.enum_options.find((o: any) =>
          (o.name || '').trim().toUpperCase() === orderType
        );
        if (match) {
          customFields[field.gid] = match.gid;
          console.log(`[Asana] Setting PF ORDER TYPE to "${orderType}" (option gid: ${match.gid}) for task ${project.asanaTaskId}`);
        }
      }
    }

    if (Object.keys(customFields).length > 0) {
      await tasksApi.updateTask({ data: { custom_fields: customFields } }, project.asanaTaskId, {});
      console.log(`[Asana] Updated PF ORDER TYPE to "${orderType}" for task ${project.asanaTaskId}`);
    } else {
      console.log(`[Asana] PF ORDER TYPE field not found or option "${orderType}" not matched for task ${project.asanaTaskId}`);
    }
  } catch (err: any) {
    console.error(`[Asana] Failed to update PF ORDER TYPE for project ${projectId}:`, err.message);
  }
}
