import { storage } from "./storage";
import { getAsanaApiInstances } from "./lib/asana";

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
      return name;
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
