import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import multer from 'multer';
import { parse } from 'csv-parse';
import { getAsanaApiInstances } from "./lib/asana";

const upload = multer({ storage: multer.memoryStorage() });

// Helper to parse CSV file
function parseCSV(fileContent: string): Promise<string[][]> {
  return new Promise((resolve, reject) => {
    parse(fileContent, {
      relax_column_count: true,
      skip_empty_lines: true,
      trim: true
    }, (err, records: string[][]) => {
      if (err) reject(err);
      else resolve(records);
    });
  });
}

// Helper to find value in CSV records
function findValue(records: string[][], keyStart: string): string | undefined {
  for (let i = 0; i < Math.min(records.length, 20); i++) {
    const row = records[i];
    if (row[0] && row[0].toLowerCase().trim().includes(keyStart.toLowerCase().trim())) {
      return row[1]?.trim();
    }
  }
  return undefined;
}

// Format phone number to xxx-xxx-xxxx
function formatPhoneNumber(phone: string | undefined): string | undefined {
  if (!phone) return undefined;
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits.startsWith('1')) {
    return `${digits.slice(1, 4)}-${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return phone;
}

// Format PO number - remove # and - but keep ( and )
function formatPONumber(po: string | undefined): string | undefined {
  if (!po) return undefined;
  return po.replace(/[#\-]/g, '').replace(/\s+/g, ' ').trim();
}

// Count parts from actual CSV data rows
function countPartsFromCSV(records: string[][]): { coreParts: number; dovetails: number; assembledDrawers: number; fivePiece: number } {
  let coreParts = 0;
  let dovetails = 0;
  let assembledDrawers = 0;
  let fivePiece = 0;

  // Find the data section (starts after "Manuf code" header row)
  let dataStartIndex = -1;
  for (let i = 0; i < records.length; i++) {
    if (records[i][0]?.toLowerCase().includes('manuf')) {
      dataStartIndex = i + 1;
      break;
    }
  }

  if (dataStartIndex === -1) return { coreParts, dovetails, assembledDrawers, fivePiece };

  // Process each data row
  for (let i = dataStartIndex; i < records.length; i++) {
    const row = records[i];
    const sku = (row[0] || '').trim().toUpperCase();
    const quantity = parseInt(row[2] || '0') || 0;

    if (!sku || quantity === 0) continue;

    // Skip hardware (starts with H., M., R-)
    if (sku.startsWith('H.') || sku.startsWith('M.') || sku.startsWith('M-') || 
        sku.startsWith('R-') || sku.startsWith('R.')) {
      continue;
    }

    // MDRW parts (drawer parts)
    if (sku.includes('MDRW')) {
      if (sku.endsWith('ASS')) {
        // Assembled drawers - counted separately
        assembledDrawers += quantity;
      } else {
        // Regular drawer parts - multiply by 5
        coreParts += quantity * 5;
      }
      continue;
    }

    // Dovetail drawers (starts with DBX or SDBX)
    if (sku.startsWith('DBX') || sku.startsWith('SDBX')) {
      dovetails += quantity;
      continue;
    }

    // TODO: Add rules for 5-piece shaker doors
    // For now, count other 34* parts as core parts
    if (sku.startsWith('34') || sku.startsWith('DRWEURO') || sku.startsWith('JDRWEURO') ||
        sku.startsWith('TK') || sku.startsWith('FILL')) {
      coreParts += quantity;
    }
  }

  return { coreParts, dovetails, assembledDrawers, fivePiece };
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // List all projects
  app.get(api.orders.list.path, async (req, res) => {
    const projects = await storage.getProjects();
    res.json(projects);
  });

  // Get a single project with its files
  app.get(api.orders.get.path, async (req, res) => {
    const project = await storage.getProject(Number(req.params.id));
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }
    const files = await storage.getProjectFiles(project.id);
    res.json({ ...project, files });
  });

  // Delete a project
  app.delete(api.orders.delete.path, async (req, res) => {
    const success = await storage.deleteProject(Number(req.params.id));
    if (!success) {
      return res.status(404).json({ message: 'Project not found' });
    }
    res.status(204).send();
  });

  // Upload multiple files as a single project
  app.post(api.orders.upload.path, upload.array('files'), async (req, res) => {
    if (!req.files || (req.files as Express.Multer.File[]).length === 0) {
      return res.status(400).json({ message: 'No files uploaded' });
    }

    try {
      const files = req.files as Express.Multer.File[];
      
      // Parse all files to extract metadata
      const parsedFiles: { filename: string; content: string; records: string[][]; poNumber?: string }[] = [];
      
      for (const file of files) {
        const fileContent = file.buffer.toString('utf-8');
        const records = await parseCSV(fileContent);
        const poNumber = formatPONumber(findValue(records, 'PO:'));
        parsedFiles.push({
          filename: file.originalname,
          content: fileContent,
          records,
          poNumber
        });
      }

      // Use first file for project-level metadata
      const firstRecords = parsedFiles[0].records;
      
      // Extract project name from the base PO (without the room/design suffix)
      // e.g., "Anderson PO25-391065 (GUEST CLOSETS V5)" -> "Anderson PO25-391065"
      const firstPO = parsedFiles[0].poNumber || parsedFiles[0].filename;
      const projectName = firstPO.replace(/\s*\([^)]*\)\s*$/, '').trim() || firstPO;

      // Create the project
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

      // Create order files linked to the project
      for (const pf of parsedFiles) {
        await storage.createOrderFile({
          projectId: project.id,
          originalFilename: pf.filename,
          poNumber: pf.poNumber,
          rawContent: pf.content,
        });
      }

      res.status(201).json(project);

    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // Update project data
  app.put(api.orders.update.path, async (req, res) => {
    try {
      const input = api.orders.update.input.parse(req.body);
      const project = await storage.updateProject(Number(req.params.id), input);
      if (!project) {
        return res.status(404).json({ message: 'Project not found' });
      }
      res.json(project);
    } catch (err: any) {
       if (err instanceof z.ZodError) {
          return res.status(400).json({
            message: err.errors[0].message,
            field: err.errors[0].path.join('.'),
          });
        }
        res.status(500).json({ message: err.message });
    }
  });

  // Sync project to Asana (duplicates template task and updates it)
  app.post(api.orders.sync.path, async (req, res) => {
    const project = await storage.getProject(Number(req.params.id));
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    const projectFiles = await storage.getProjectFiles(project.id);

    try {
      const { tasksApi, projectsApi, jobsApi, usersApi } = await getAsanaApiInstances();
      
      const me = await usersApi.getUser('me');
      const workspaceId = me.data.workspaces[0].gid;

      // Use configured Asana project GID, or search for it
      let asanaProjectGid = process.env.ASANA_PROJECT_GID;
      let templateTaskGid: string | undefined;
      
      try {
        // If no project GID configured, try to find it
        if (!asanaProjectGid) {
          const asanaProjects = await projectsApi.getProjectsForWorkspace(workspaceId, { archived: false, opt_fields: 'name,gid' });
          console.log("Available Asana projects:", asanaProjects.data?.map((p: any) => ({ name: p.name, gid: p.gid })));
          
          const asanaProject = asanaProjects.data?.find((p: any) => 
            p.name.trim().toLowerCase().includes('perfect fit')
          );
          
          if (asanaProject) {
            console.log("Found project:", asanaProject.name, "GID:", asanaProject.gid);
            console.log("TIP: Set ASANA_PROJECT_GID=" + asanaProject.gid + " to skip this search");
            asanaProjectGid = asanaProject.gid;
          }
        }
        
        if (asanaProjectGid) {
          // Find template task in the project
          const projectTasks = await tasksApi.getTasksForProject(asanaProjectGid, { opt_fields: 'name,gid' });
          
          const templateTask = projectTasks.data?.find((t: any) => 
            t.name.includes('ORDER TEMPLATE')
          );
          if (templateTask) {
            console.log("Found template task:", templateTask.name);
            templateTaskGid = templateTask.gid;
          }
        }
      } catch (e: any) {
        console.error("Error finding project/template:", e.response?.body || e);
      }

      if (!asanaProjectGid) {
        return res.status(400).json({ message: 'Asana project not found. Please set the ASANA_PROJECT_GID environment variable with your Perfect Fit Production project ID.' });
      }

      let totalCoreParts = 0;
      let totalDovetails = 0;
      let totalAssembledDrawers = 0;
      let totalFivePiece = 0;

      interface FileData {
        name: string;
        coreParts: number;
        dovetails: number;
        assembledDrawers: number;
        fivePiece: number;
      }
      const fileDataList: FileData[] = [];

      for (const file of projectFiles) {
        if (file.rawContent) {
          const records = await parseCSV(file.rawContent);
          const counts = countPartsFromCSV(records);
          
          totalCoreParts += counts.coreParts;
          totalDovetails += counts.dovetails;
          totalAssembledDrawers += counts.assembledDrawers;
          totalFivePiece += counts.fivePiece;

          // Extract room/design name from PO (text in parentheses)
          const match = (file.poNumber || file.originalFilename).match(/\(([^)]+)\)/);
          const roomName = match ? match[1] : (file.poNumber || file.originalFilename);
          
          fileDataList.push({
            name: roomName,
            coreParts: counts.coreParts,
            dovetails: counts.dovetails,
            assembledDrawers: counts.assembledDrawers,
            fivePiece: counts.fivePiece
          });
        }
      }

      // Build per-file breakdown
      const fileBreakdown = fileDataList.map(f => 
        `${f.name}:
  Parts: ${f.coreParts}
  Dovetails: ${f.dovetails}
  Assembled Netley Drawers: ${f.assembledDrawers}
  5 Piece Shaker Doors: ${f.fivePiece}`
      ).join('\n\n');

      const taskName = `(PERFECT FIT) ${project.name}`;
      const taskNotes = `# OF ORDERS ON PALLET: ${projectFiles.length}
PALLET SIZE: 
WAS THERE BUYOUT HARDWARE: 
ARE THERE PARTS AT CUSTOM: 

--- ORDER BREAKDOWN ---

${fileBreakdown}

--- TOTALS ---
TOTAL PARTS: ${totalCoreParts}
TOTAL DOVETAIL DRAWERS: ${totalDovetails}
TOTAL ASSEMBLED NETLEY DRAWERS: ${totalAssembledDrawers}
TOTAL 5 PIECE SHAKER DOORS: ${totalFivePiece}
      `.trim();

      let newTaskGid: string;

      if (templateTaskGid) {
        // Duplicate the template task
        const duplicateResult = await tasksApi.duplicateTask(
          { data: { name: taskName, include: ['notes', 'subtasks', 'projects', 'tags'] } },
          templateTaskGid,
          {}
        );

        // Wait for duplication job to complete (up to 30 seconds)
        const jobGid = duplicateResult.data.gid;
        let jobComplete = false;
        let attempts = 0;
        let newTask: any;

        while (!jobComplete && attempts < 30) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          const jobStatus = await jobsApi.getJob(jobGid, {});
          if (jobStatus.data.status === 'succeeded') {
            jobComplete = true;
            newTask = jobStatus.data.new_task;
          } else if (jobStatus.data.status === 'failed') {
            throw new Error('Task duplication failed');
          }
          attempts++;
        }

        if (!newTask) {
          throw new Error('Task duplication timed out');
        }

        newTaskGid = newTask.gid;

        // Update the duplicated task with project-specific notes
        await tasksApi.updateTask({ data: { notes: taskNotes } }, newTaskGid, {});

      } else {
        // Fallback: create task from scratch if template not found
        console.log('Template task not found, creating task from scratch');
        
        const taskData: any = {
          name: taskName,
          notes: taskNotes,
          projects: [asanaProjectGid],
        };

        const task = await tasksApi.createTask({ data: taskData });
        newTaskGid = task.data.gid;
      }

      // Update custom fields if available
      try {
        const asanaProjectDetails = await projectsApi.getProject(asanaProjectGid, { opt_fields: 'custom_field_settings.custom_field.name,custom_field_settings.custom_field.gid,custom_field_settings.custom_field.type,custom_field_settings.custom_field.enum_options' });
        const customFieldSettings = asanaProjectDetails.data.custom_field_settings || [];
        
        console.log("Available custom fields:", customFieldSettings.map((s: any) => ({ name: s.custom_field.name, type: s.custom_field.type })));
        
        const customFields: Record<string, any> = {};
        
        for (const setting of customFieldSettings) {
          const field = setting.custom_field;
          const name = field.name.toUpperCase().trim();
          
          // Match exact Asana custom field names
          if (name === 'PERFECT FIT DEALER' && field.type === 'text') {
            if (project.dealer) customFields[field.gid] = project.dealer;
          } else if (name === 'ORDER DATE' && field.type === 'text') {
            if (project.date) customFields[field.gid] = project.date;
          } else if (name === 'ORDER DATE' && field.type === 'date') {
            if (project.date) customFields[field.gid] = { date: project.date };
          } else if (name === 'PF ADDRESS' && field.type === 'text') {
            if (project.shippingAddress) customFields[field.gid] = project.shippingAddress;
          } else if (name === 'PF PHONE NUMBER' && field.type === 'text') {
            if (project.phone) customFields[field.gid] = project.phone;
          } else if ((name === 'PF TAX ID' || name === 'PF TAX ID:') && field.type === 'text') {
            if (project.taxId) customFields[field.gid] = project.taxId;
          } else if (name === 'ORDER ID' && field.type === 'text') {
            if (project.orderId) customFields[field.gid] = project.orderId;
          } else if (name === 'ORDER ID' && field.type === 'number') {
            if (project.orderId) customFields[field.gid] = parseInt(project.orderId) || 0;
          } else if ((name === 'PF POWER TAILGATE NEEDED' || name === 'PF POWER TAILGATE NEEDED?') && field.type === 'enum' && field.enum_options) {
            const option = field.enum_options.find((o: any) => 
              o.name.toLowerCase() === (project.powerTailgate ? 'yes' : 'no')
            );
            if (option) customFields[field.gid] = option.gid;
          } else if ((name === 'PF PHONE APPT NEEDED' || name === 'PF PHONE APPT NEEDED?') && field.type === 'enum' && field.enum_options) {
            const option = field.enum_options.find((o: any) => 
              o.name.toLowerCase() === (project.phoneAppointment ? 'yes' : 'no')
            );
            if (option) customFields[field.gid] = option.gid;
          } else if ((name === 'PF PO' || name === 'PF PO:') && field.type === 'text') {
            if (projectFiles.length === 1) {
              customFields[field.gid] = projectFiles[0].poNumber || project.name;
            } else if (projectFiles.length > 1) {
              customFields[field.gid] = `${projectFiles.length} Orders, See below`;
            }
          }
        }
        
        console.log("Setting custom fields:", customFields);
        
        if (Object.keys(customFields).length > 0) {
          await tasksApi.updateTask({ data: { custom_fields: customFields } }, newTaskGid, {});
        }
      } catch (e) {
        console.error("Error updating custom fields:", e);
      }

      // Update project status in our database
      const updatedProject = await storage.updateProject(project.id, {
        asanaTaskId: newTaskGid
      });

      res.json(updatedProject);

    } catch (e: any) {
      console.error("Asana Sync Error:", e.response?.body || e);
      res.status(400).json({ message: 'Failed to sync to Asana: ' + (e.response?.body?.errors?.[0]?.message || e.message) });
    }
  });

  return httpServer;
}
