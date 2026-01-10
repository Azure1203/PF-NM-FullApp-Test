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
        const poNumber = findValue(records, 'PO:');
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

  // Sync project to Asana (creates ONE task for the entire project)
  app.post(api.orders.sync.path, async (req, res) => {
    const project = await storage.getProject(Number(req.params.id));
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    // Get all files in this project
    const projectFiles = await storage.getProjectFiles(project.id);

    try {
      const { tasksApi, projectsApi } = await getAsanaApiInstances();
      
      const me = await (await getAsanaApiInstances()).usersApi.getUser('me');
      const workspaceId = me.workspaces[0].gid;

      // Find Asana project
      let asanaProjectGid: string | undefined;
      
      try {
        const asanaProjects = await projectsApi.getProjectsForWorkspace(workspaceId, { archived: false });
        const asanaProject = asanaProjects.data?.find((p: any) => p.name.trim() === 'Perfect Fit Production');
        if (asanaProject) {
          asanaProjectGid = asanaProject.gid;
        }
      } catch (e) {
        console.error("Error finding project:", e);
      }

      // Build file list for task notes
      const fileList = projectFiles.map(f => `  - ${f.poNumber || f.originalFilename}`).join('\n');

      // Create Task
      const taskData: any = {
        name: `${project.dealer || 'Project'} - ${project.name}`,
        notes: `
Dealer: ${project.dealer}
Date: ${project.date}
Shipping Address: ${project.shippingAddress}
Phone: ${project.phone}
Tax ID: ${project.taxId}
Power Tailgate: ${project.powerTailgate ? 'YES' : 'NO'}
Phone Appointment: ${project.phoneAppointment ? 'YES' : 'NO'}
Order ID: ${project.orderId}

Files in this project (${projectFiles.length}):
${fileList}
        `,
        workspace: workspaceId,
      };

      // Try to handle custom fields
      if (asanaProjectGid) {
        try {
          const asanaProjectDetails = await projectsApi.getProject(asanaProjectGid);
          const customFieldSettings = asanaProjectDetails.data.custom_field_settings || [];
          
          const customFields: Record<string, any> = {};
          
          for (const setting of customFieldSettings) {
            const field = setting.custom_field;
            const name = field.name.toLowerCase();
            
            if (name.includes('power tailgate')) {
              if (field.type === 'enum') {
                const option = field.enum_options.find((o: any) => 
                  o.name.toLowerCase() === (project.powerTailgate ? 'yes' : 'no')
                );
                if (option) customFields[field.gid] = option.gid;
              } else {
                customFields[field.gid] = project.powerTailgate ? 'Yes' : 'No';
              }
            } else if (name.includes('phone appointment')) {
              if (field.type === 'enum') {
                const option = field.enum_options.find((o: any) => 
                  o.name.toLowerCase() === (project.phoneAppointment ? 'yes' : 'no')
                );
                if (option) customFields[field.gid] = option.gid;
              } else {
                customFields[field.gid] = project.phoneAppointment ? 'Yes' : 'No';
              }
            }
          }
          
          if (Object.keys(customFields).length > 0) {
            taskData.custom_fields = customFields;
          }
        } catch (e) {
          console.error("Error mapping custom fields:", e);
        }
        
        taskData.projects = [asanaProjectGid];
      }

      const task = await tasksApi.createTask({ data: taskData });

      // Update Project Status
      const updatedProject = await storage.updateProject(project.id, {
        status: 'synced',
        asanaTaskId: task.data.gid
      });

      res.json(updatedProject);

    } catch (e: any) {
      console.error("Asana Sync Error:", e.response?.body || e);
      res.status(400).json({ message: 'Failed to sync to Asana: ' + (e.response?.body?.errors?.[0]?.message || e.message) });
    }
  });

  return httpServer;
}
