import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import multer from 'multer';
import { parse } from 'csv-parse';
import { getAsanaApiInstances } from "./lib/asana";

const upload = multer({ storage: multer.memoryStorage() });

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  app.get(api.orders.list.path, async (req, res) => {
    const orders = await storage.getOrders();
    res.json(orders);
  });

  app.get(api.orders.get.path, async (req, res) => {
    const order = await storage.getOrder(Number(req.params.id));
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }
    res.json(order);
  });

  app.post(api.orders.upload.path, upload.single('file'), async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    try {
      const fileContent = req.file.buffer.toString('utf-8');
      
      // Parse CSV
      parse(fileContent, {
        relax_column_count: true,
        skip_empty_lines: true,
        trim: true
      }, async (err, records: string[][]) => {
        if (err) {
          return res.status(400).json({ message: 'Failed to parse CSV: ' + err.message });
        }

        // Extract Data
        const extractedData: any = {
          originalFilename: req.file!.originalname,
          rawContent: fileContent,
          powerTailgate: false,
          phoneAppointment: false,
        };

        // Helper to find value by key
        const findValue = (keyStart: string): string | undefined => {
          for (const row of records) {
            if (row[0] && row[0].toLowerCase().startsWith(keyStart.toLowerCase())) {
              // Return the next non-empty cell? Or the second cell?
              // Based on example: "Date (dd/mm/yyyy),31/12/2025" -> Row[0] is key, Row[1] is value
              return row[1];
            }
          }
          return undefined;
        };

        extractedData.date = findValue('Date');
        extractedData.dealer = findValue('Dealer');
        extractedData.shippingAddress = findValue('Shipping Address');
        extractedData.phone = findValue('Phone');
        extractedData.taxId = findValue('Tax ID');
        extractedData.orderId = findValue('Order ID');
        extractedData.poNumber = findValue('PO:'); // "PO:/Design Name..."

        const powerTailgateVal = findValue('Power Tail Gate');
        if (powerTailgateVal && powerTailgateVal.toLowerCase() === 'yes') {
          extractedData.powerTailgate = true;
        }

        const phoneApptVal = findValue('Phone Appointment');
        if (phoneApptVal && phoneApptVal.toLowerCase() === 'yes') {
          extractedData.phoneAppointment = true;
        }

        // Create Order
        const order = await storage.createOrder(extractedData);
        res.status(201).json(order);
      });

    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.put(api.orders.update.path, async (req, res) => {
    try {
      const input = api.orders.update.input.parse(req.body);
      const order = await storage.updateOrder(Number(req.params.id), input);
      if (!order) {
        return res.status(404).json({ message: 'Order not found' });
      }
      res.json(order);
    } catch (err) {
       if (err instanceof z.ZodError) {
          return res.status(400).json({
            message: err.errors[0].message,
            field: err.errors[0].path.join('.'),
          });
        }
        throw err;
    }
  });

  app.post(api.orders.sync.path, async (req, res) => {
    const order = await storage.getOrder(Number(req.params.id));
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    try {
      const { tasksApi, projectsApi } = await getAsanaApiInstances();
      
      // 1. Find the project "Perfect Fit Production"
      // In a real app we might cache this or ask user to select, but for now let's search or use a known ID if user provided (they didn't).
      // We'll search for it.
      
      // List projects in workspace? We need workspace ID first.
      // Often default workspace is fine.
      
      const me = await (await getAsanaApiInstances()).usersApi.getUser('me');
      const workspaceId = me.workspaces[0].gid; // Use first workspace

      // Search for project
      // Note: projectsApi.getProjectsForWorkspace(workspaceId)
      // This might be slow if many projects.
      // For MVP, we'll just create a task in the first workspace and try to add it to a project if found.
      
      // Better: Create task and let user move it, or try to find project by name.
      // Let's try to find the project.
      let projectGid: string | undefined;
      
      try {
        const projects = await projectsApi.getProjectsForWorkspace(workspaceId, { archived: false });
        const project = projects.data?.find((p: any) => p.name.trim() === 'Perfect Fit Production');
        if (project) {
          projectGid = project.gid;
        }
      } catch (e) {
        console.error("Error finding project:", e);
      }

      // 2. Create Task
      const taskData: any = {
        name: `${order.dealer || 'Order'} - ${order.poNumber || order.originalFilename}`,
        notes: `
Dealer: ${order.dealer}
Date: ${order.date}
Shipping Address: ${order.shippingAddress}
Phone: ${order.phone}
Tax ID: ${order.taxId}
Power Tailgate: ${order.powerTailgate ? 'YES' : 'NO'}
Phone Appointment: ${order.phoneAppointment ? 'YES' : 'NO'}
Order ID: ${order.orderId}
PO: ${order.poNumber}

Original File: ${order.originalFilename}
        `,
        workspace: workspaceId,
      };

      if (projectGid) {
        taskData.projects = [projectGid];
      }

      // Add Custom Fields logic if we had the GIDs. 
      // Since we don't have the GIDs of the custom fields, we'll put the data in the description (notes) for now.
      // To use custom fields, we'd need to fetch the project's custom field definitions and map them.
      // That's a bit complex for this step without user input on field IDs. 
      // putting in notes is a safe fallback.

      const task = await tasksApi.createTask({ data: taskData });

      // Update Order Status
      const updatedOrder = await storage.updateOrder(order.id, {
        status: 'synced',
        asanaTaskId: task.data.gid
      });

      res.json(updatedOrder);

    } catch (e: any) {
      console.error("Asana Sync Error:", e.response?.body || e);
      res.status(400).json({ message: 'Failed to sync to Asana: ' + (e.response?.body?.errors?.[0]?.message || e.message) });
    }
  });

  return httpServer;
}
