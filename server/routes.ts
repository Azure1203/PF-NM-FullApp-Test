import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import multer from 'multer';
import { parse } from 'csv-parse';
import { parse as parseSync } from 'csv-parse/sync';
import { evaluatePrice } from "./services/pricingEngine";
import { generateOrdItemBlock, generateOrdHeader } from "./services/ordExporter";
import { generateInvoicePdf } from "./services/pdfGenerator";
import { getAsanaApiInstances } from "./lib/asana";
import { setupAuth, registerAuthRoutes, isAuthenticated } from "./replit_integrations/auth";
import path from 'path';
import fs from 'fs';
import express from 'express';
import crypto from 'crypto';
import { registerObjectStorageRoutes, ObjectStorageService } from "./replit_integrations/object_storage";
import { testOutlookConnection, searchNetleyEmails, downloadEmailAttachment, listMailFolders, type NetleyEmail, type MailFolder, type SearchResult } from "./outlook";
import { getGoogleSheetsClient, getGoogleDriveClient } from "./googleSheets";
import { getBackupSchedulerStatus } from "./backupScheduler";
import { getSyncStatus, triggerManualFetch } from "./outlookScheduler";
import { getAgentMailSyncStatus, triggerManualAgentMailFetch, clearAgentMailProcessedEmails } from "./agentmailScheduler";
import { testAgentMailConnection } from "./agentmail";
import { getAsanaImportStatus, triggerManualAsanaImport } from "./asanaImportScheduler";
import { buildAsanaTaskNotes, syncAsanaTaskNotes, syncAsanaOrderType } from "./asanaNotes";
import { triggerManualAsanaNoteSync } from "./asanaNotesScheduler";
import { db } from "./db";
import { packingSlipItems, insertProductSchema, BuyoutHardwareOption, processedAsanaTasks, productGridBindings, orderItems, allmoxyProducts, attributeGridRows, attributeGrids } from "@shared/schema";
import type { AllmoxyProduct, ProductGridBinding } from "@shared/schema";
import { EXPORT_TYPE_OPTIONS, SUPPLY_TYPE_OPTIONS } from "@shared/schema";
import { eq } from "drizzle-orm";
import {
  parseCSV,
  findValue,
  formatPONumber,
  formatPhoneNumber,
  countPartsFromCSV,
  extractCTSParts,
  computeAutoProductionStatuses,
  generateHardwareChecklistForFile,
  generatePackingSlipChecklistForFile,
  updateProjectBoProductionStatus,
  getRecommendedPalletSize
} from "./csvHelpers";

const upload = multer({ storage: multer.memoryStorage() });

// Match a raw SKU string to the best-fitting active product by longest-prefix
function matchProductToSku(sku: string, activeProducts: AllmoxyProduct[]): AllmoxyProduct | null {
  if (!sku) return null;
  const upperSku = sku.toUpperCase().trim();
  let bestMatch: AllmoxyProduct | null = null;
  let bestLength = 0;
  for (const product of activeProducts) {
    const prefix = (product.skuPrefix || '').toUpperCase().trim();
    if (prefix && upperSku.startsWith(prefix) && prefix.length > bestLength) {
      bestMatch = product;
      bestLength = prefix.length;
    }
  }
  return bestMatch;
}


// Asana Perfect Fit Production Project GID - use this for all Asana operations
const ASANA_PERFECT_FIT_PROJECT_GID = '1208263802564738';
const ASANA_NEW_JOBS_PROJECT_GID = '1209262874404235';
const ASANA_READY_TO_IMPORT_SECTION_GID = '1213318854211307';







const DEFAULT_ORD_HEADER_TEMPLATE = `[Header]
Version=4
Unit=1
Name={{design_name}}
Description=
PurchaseOrder={{po_number}}
Comment=
Customer=
Address1=`;

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // Seed default ORD header template if not already present
  const existingHeader = await storage.getSetting('ord_header_template');
  if (!existingHeader) {
    await storage.setSetting(
      'ord_header_template',
      DEFAULT_ORD_HEADER_TEMPLATE,
      'Template for the [Header] block prepended to each file in .ORD exports. Supports {{design_name}} and {{po_number}} placeholders.'
    );
    console.log('[Seed] Default ORD header template created');
  }

  // Setup authentication (must be before other routes)
  await setupAuth(app);
  registerAuthRoutes(app);
  
  // Register object storage routes
  registerObjectStorageRoutes(app);
  
  // Create object storage service instance
  const objectStorageService = new ObjectStorageService();

  app.get('/api/qz/certificate', (_req, res) => {
    const certPath = path.join(process.cwd(), 'client', 'public', 'qz-certificate.txt');
    res.download(certPath, 'override.crt', (err) => {
      if (err) {
        console.error('[QZ Certificate] Download error:', err);
        res.status(500).send('Certificate file not found');
      }
    });
  });

  app.post('/api/qz/sign', async (req, res) => {
    const { toSign } = req.body;
    if (!toSign || typeof toSign !== 'string') {
      return res.status(400).send('Missing or invalid toSign parameter');
    }
    
    let privateKey = process.env.QZ_PRIVATE_KEY;
    if (!privateKey) {
      console.error('[QZ Sign] QZ_PRIVATE_KEY environment variable not set');
      return res.status(500).send('QZ signing not configured');
    }
    
    privateKey = privateKey.replace(/\\n/g, '\n');
    
    if (!privateKey.includes('\n')) {
      const pemHeader = '-----BEGIN PRIVATE KEY-----';
      const pemFooter = '-----END PRIVATE KEY-----';
      let keyBody = privateKey
        .replace(pemHeader, '')
        .replace(pemFooter, '')
        .replace(/\s+/g, '');
      const lines = keyBody.match(/.{1,64}/g) || [];
      privateKey = [pemHeader, ...lines, pemFooter].join('\n');
    }
    
    try {
      const sign = crypto.createSign('SHA512');
      sign.update(toSign);
      const signature = sign.sign(privateKey, 'base64');
      res.send(signature);
    } catch (error) {
      console.error('[QZ Sign] Signing error:', error);
      res.status(500).send('Signing failed');
    }
  });

  // List all projects with status summaries (protected)
  app.get(api.orders.list.path, isAuthenticated, async (req, res) => {
    const allProjects = await storage.getProjects();
    
    // Enrich each project with status summary
    const projectsWithStatus = await Promise.all(
      allProjects.map(async (project) => {
        // Get CTS parts status across all files
        const files = await storage.getProjectFiles(project.id);
        let hasCTSParts = false;
        let allCtsCut = true;
        
        for (const file of files) {
          const ctsStatus = await storage.getCtsPartsCutStatus(file.id);
          if (ctsStatus.total > 0) {
            hasCTSParts = true;
            if (!ctsStatus.allCut) {
              allCtsCut = false;
            }
          }
        }
        
        // Get hardware packed status from pallets
        const pallets = await storage.getPalletsForProject(project.id);
        const hardwarePackaged = pallets.some(p => p.hardwarePackaged === true);
        
        // Extract file names for display
        const fileNames = files.map(f => f.originalFilename);
        
        return {
          ...project,
          ctsStatus: { hasCTSParts, allCtsCut },
          hardwarePackaged,
          fileNames
        };
      })
    );
    
    res.json(projectsWithStatus);
  });

  // Get a single project with its files (protected)
  app.get(api.orders.get.path, isAuthenticated, async (req, res) => {
    const project = await storage.getProject(Number(req.params.id));
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }
    const files = await storage.getProjectFiles(project.id);
    res.json({ ...project, files });
  });

  // Delete a project (admin only)
  app.delete(api.orders.delete.path, isAuthenticated, async (req, res) => {
    const replitUser = (req as any).user;
    const username = replitUser?.claims?.username || replitUser?.name;
    const email = replitUser?.claims?.email;
    if (!username && !email) {
      return res.status(401).json({ message: 'Not authenticated' });
    }
    const isAdmin = await storage.isUserAdmin(username, email);
    if (!isAdmin) {
      return res.status(403).json({ message: 'Only admins can delete orders' });
    }
    const success = await storage.deleteProject(Number(req.params.id));
    if (!success) {
      return res.status(404).json({ message: 'Project not found' });
    }
    res.status(204).send();
  });

  // Dynamic Grid Routes
  app.get('/api/admin/attribute-grids', isAuthenticated, async (_req, res) => {
    try {
      const grids = await storage.getAttributeGrids();
      res.json(grids);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get('/api/admin/attribute-grids/:id/rows', isAuthenticated, async (req, res) => {
    try {
      const gridId = Number(req.params.id);
      const rows = await storage.getAttributeGridRows(gridId);
      res.json(rows);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.put('/api/admin/attribute-grids/rows/:rowId', isAuthenticated, async (req, res) => {
    try {
      const { rowData } = req.body;
      if (!rowData || typeof rowData !== 'object') {
        return res.status(400).json({ message: 'rowData is required' });
      }
      const updated = await storage.updateAttributeGridRow(Number(req.params.rowId), rowData);
      res.json(updated);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.delete('/api/admin/attribute-grids/rows/:rowId', isAuthenticated, async (req, res) => {
    try {
      await storage.deleteAttributeGridRow(Number(req.params.rowId));
      res.status(204).send();
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post('/api/admin/attribute-grids/:id/rows', isAuthenticated, async (req, res) => {
    try {
      const gridId = Number(req.params.id);
      const { rowData } = req.body;
      if (!rowData || typeof rowData !== 'object') {
        return res.status(400).json({ message: 'rowData is required' });
      }
      const grids = await storage.getAttributeGrids();
      const grid = grids.find(g => g.id === gridId);
      if (!grid) return res.status(404).json({ message: 'Grid not found' });
      const lookupKey = String(rowData[grid.keyColumn] || '');
      const created = await storage.addAttributeGridRow(gridId, lookupKey, rowData);
      res.status(201).json(created);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.delete('/api/admin/attribute-grids/bulk', isAuthenticated, async (req, res) => {
    try {
      const { ids } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: 'ids array is required' });
      }
      let deleted = 0;
      for (const id of ids) {
        const result = await storage.deleteAttributeGrid(Number(id));
        if (result) deleted++;
      }
      res.json({ deleted, requested: ids.length });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.delete('/api/admin/attribute-grids/:id', isAuthenticated, async (req, res) => {
    try {
      const deleted = await storage.deleteAttributeGrid(Number(req.params.id));
      if (!deleted) return res.status(404).json({ message: 'Grid not found' });
      res.status(204).send();
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.patch('/api/admin/attribute-grids/:id', isAuthenticated, async (req, res) => {
    try {
      const { name, keyColumn } = req.body;
      const updated = await storage.updateAttributeGrid(Number(req.params.id), { name, keyColumn });
      res.json(updated);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get('/api/admin/attribute-grids/:id/export', isAuthenticated, async (req, res) => {
    try {
      const gridId = Number(req.params.id);
      const grids = await storage.getAttributeGrids();
      const grid = grids.find(g => g.id === gridId);
      if (!grid) return res.status(404).json({ message: 'Grid not found' });
      const rows = await storage.getAttributeGridRows(gridId);
      const headers = grid.columns;
      const csvLines = [
        headers.join(','),
        ...rows.map(r =>
          headers.map(h => {
            const val = String((r.rowData as any)[h] ?? '');
            return val.includes(',') || val.includes('"') ? `"${val.replace(/"/g, '""')}"` : val;
          }).join(',')
        ),
      ];
      const safeName = grid.name.replace(/[^a-z0-9_-]/gi, '_');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${safeName}.csv"`);
      res.send(csvLines.join('\n'));
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post('/api/admin/upload-dynamic-grid', isAuthenticated, upload.single('file'), async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ message: 'Grid name is required' });
    }
    try {
      const fileContent = req.file.buffer.toString('utf-8');
      const records: any[] = parseSync(fileContent, { columns: true, skip_empty_lines: true });
      if (records.length === 0) {
        return res.status(400).json({ message: 'CSV file is empty or has no data rows' });
      }
      const headers = Object.keys(records[0]);
      let keyColumn = 'NAME';
      if (headers.includes('EXISTING OPTION ID')) {
        keyColumn = 'EXISTING OPTION ID';
      } else if (headers.includes('MANU_CODE')) {
        keyColumn = 'MANU_CODE';
      }
      let grid = await storage.getAttributeGridByName(name);
      if (!grid) {
        grid = await storage.createAttributeGrid({ name, columns: headers, keyColumn });
      }
      const rowsToInsert = records.map(record => ({
        gridId: grid!.id,
        lookupKey: String(record[keyColumn] || record[headers[0]] || ''),
        rowData: record,
      }));
      await storage.replaceAttributeGridRows(grid.id, rowsToInsert);
      res.status(201).json({ message: 'Grid uploaded successfully', gridId: grid.id, rowCount: rowsToInsert.length });
    } catch (e: any) {
      console.error('[DynamicGrid] Upload error:', e);
      res.status(500).json({ message: e.message });
    }
  });

  app.post('/api/admin/upload-dynamic-grids-bulk', isAuthenticated, upload.array('files', 50), async (req, res) => {
    const files = req.files as Express.Multer.File[] | undefined;
    if (!files || files.length === 0) {
      return res.status(400).json({ message: 'No files uploaded' });
    }
    const results: { filename: string; gridName: string; gridId?: number; rowCount?: number; error?: string }[] = [];
    for (const file of files) {
      const gridName = file.originalname.replace(/\.csv$/i, '').trim();
      try {
        const records: any[] = parseSync(file.buffer.toString('utf-8'), { columns: true, skip_empty_lines: true });
        if (records.length === 0) {
          results.push({ filename: file.originalname, gridName, error: 'File is empty or has no data rows' });
          continue;
        }
        const headers = Object.keys(records[0]);
        let keyColumn = 'NAME';
        if (headers.includes('EXISTING OPTION ID')) keyColumn = 'EXISTING OPTION ID';
        else if (headers.includes('MANU_CODE')) keyColumn = 'MANU_CODE';
        let grid = await storage.getAttributeGridByName(gridName);
        if (!grid) {
          grid = await storage.createAttributeGrid({ name: gridName, columns: headers, keyColumn });
        }
        const rowsToInsert = records.map(record => ({
          gridId: grid!.id,
          lookupKey: String(record[keyColumn] || record[headers[0]] || ''),
          rowData: record,
        }));
        await storage.replaceAttributeGridRows(grid.id, rowsToInsert);
        results.push({ filename: file.originalname, gridName, gridId: grid.id, rowCount: rowsToInsert.length });
      } catch (e: any) {
        results.push({ filename: file.originalname, gridName, error: e.message });
      }
    }
    res.status(201).json({ results, totalFiles: files.length });
  });

  // Proxy Variable Routes
  app.get('/api/admin/proxy-variables', isAuthenticated, async (_req, res) => {
    try {
      const vars = await storage.getProxyVariables();
      res.json(vars);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // Allmoxy Product Routes
  app.get('/api/admin/allmoxy-products', isAuthenticated, async (_req, res) => {
    try {
      const products = await storage.getAllmoxyProducts();
      res.json(products);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post('/api/admin/allmoxy-products', isAuthenticated, async (req, res) => {
    try {
      const { name, status, pricingProxyId, exportProxyId, skuPrefix, description, notes, exportType, supplyType } = req.body;
      if (!name) {
        return res.status(400).json({ message: 'name is required' });
      }
      const validExportType = exportType && (EXPORT_TYPE_OPTIONS as readonly string[]).includes(exportType) ? exportType : 'ORD';
      const validSupplyType = supplyType && (SUPPLY_TYPE_OPTIONS as readonly string[]).includes(supplyType) ? supplyType : 'STOCK';
      const product = await storage.upsertAllmoxyProduct({
        name,
        status: status ?? 'active',
        pricingProxyId: pricingProxyId ?? null,
        exportProxyId: exportProxyId ?? null,
        skuPrefix: skuPrefix ?? null,
        description: description ?? null,
        notes: notes ?? null,
        exportType: validExportType,
        supplyType: validSupplyType,
      });
      res.json(product);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.delete('/api/admin/allmoxy-products/:id', isAuthenticated, async (req, res) => {
    try {
      const success = await storage.deleteAllmoxyProduct(Number(req.params.id));
      if (!success) {
        return res.status(404).json({ message: 'Product not found' });
      }
      res.status(204).send();
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post('/api/admin/products/auto-classify-export-types', isAuthenticated, async (_req, res) => {
    try {
      const allProducts = await storage.getAllmoxyProducts();
      const active = allProducts.filter(p => p.status === 'active');
      const classified: Record<string, number> = { CTS: 0, ELIAS: 0, MJ: 0, GLASS: 0, HARDWARE: 0, ORD: 0 };

      for (const product of active) {
        const prefix = (product.skuPrefix || '').toUpperCase().trim();
        let exportType = 'ORD';

        if (prefix.startsWith('H.')) {
          exportType = 'CTS';
        } else if (['DOVETAIL', 'DTL', 'DVT'].some(k => prefix.includes(k))) {
          exportType = 'ELIAS';
        } else if (['5PIECE', '5-PIECE', 'SHAKER', 'MJ'].some(k => prefix.includes(k))) {
          exportType = 'MJ';
        } else if (prefix.includes('GLASS')) {
          exportType = 'GLASS';
        } else if (['HARDWARE', 'HINGE', 'SLIDE', 'HANDLE', 'KNOB', 'PULL', 'SCREW', 'BRACKET'].some(k => prefix.includes(k))) {
          exportType = 'HARDWARE';
        }

        classified[exportType]++;
        await storage.upsertAllmoxyProduct({ ...product, exportType });
      }

      res.json({ total: active.length, classified });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get('/api/admin/allmoxy-products/:id/grid-bindings', isAuthenticated, async (req, res) => {
    try {
      const bindings = await storage.getProductGridBindings(Number(req.params.id));
      res.json(bindings);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post('/api/admin/allmoxy-products/:id/grid-bindings', isAuthenticated, async (req, res) => {
    try {
      const productId = Number(req.params.id);
      const { bindings } = req.body as { bindings: Array<{ gridId: number; alias: string; lookupColumn: string }> };
      if (!Array.isArray(bindings)) {
        return res.status(400).json({ message: 'bindings must be an array' });
      }
      const mapped = bindings.map(b => ({ productId, gridId: b.gridId, alias: b.alias, lookupColumn: b.lookupColumn }));
      const result = await storage.replaceProductGridBindings(productId, mapped);
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // Formula tester / pricing sandbox
  app.post('/api/admin/formula-test', isAuthenticated, async (req, res) => {
    try {
      const { productId, inputs } = req.body as {
        productId: number;
        inputs: Record<string, any>;
      };
      console.log('[formula-test] productId:', productId, 'inputs:', JSON.stringify(inputs));

      const allProducts = await storage.getAllmoxyProducts();
      const product = allProducts.find(p => p.id === productId);
      if (!product) return res.status(404).json({ message: 'Product not found' });

      const bindings = await storage.getProductGridBindings(productId);
      const allGrids = await storage.getAttributeGrids();
      const gridMap = new Map(allGrids.map(g => [g.id, g]));
      const allProxyVars = await storage.getProxyVariables();
      const proxyVarMap = new Map(allProxyVars.map(v => [v.id, v]));

      // Resolve grid bindings into contextScope
      const contextScope: Record<string, any> = {};
      const gridLookupResults: Array<{
        alias: string;
        gridName: string;
        lookupColumn: string;
        lookupValue: string;
        matched: boolean;
        rowData: any | null;
      }> = [];

      for (const binding of bindings) {
        const grid = gridMap.get(binding.gridId);
        if (!grid) continue;
        const lookupValue = String(
          (req.body.inputs || {})[binding.lookupColumn] ||
          (req.body.gridLookups || {})[binding.alias] ||
          (req.body.gridLookups || {})[binding.lookupColumn] ||
          product.name ||
          ''
        );
        const row = lookupValue ? await storage.getAttributeGridRowByKey(binding.gridId, lookupValue, binding.lookupColumn) : undefined;
        if (row) {
          const rawData = row.rowData as Record<string, any>;
          contextScope[binding.alias] = Object.fromEntries(
            Object.entries(rawData).map(([k, v]) => [k.toLowerCase(), v])
          );
        } else {
          contextScope[binding.alias] = null;
        }
        gridLookupResults.push({
          alias: binding.alias,
          gridName: grid.name,
          lookupColumn: binding.lookupColumn,
          lookupValue,
          matched: !!row,
          rowData: row ? row.rowData : null,
        });
      }

      const finalScope = {
        width:    inputs.width ?? 0,
        height:   inputs.height ?? 0,
        length:   inputs.length ?? inputs.depth ?? 0,
        depth:    inputs.depth ?? inputs.length ?? 0,
        quantity: inputs.quantity ?? 1,
        ...contextScope,
      };

      // Pricing evaluation
      let unitPrice = 0;
      let pricingError: string | null = null;
      const pricingProxy = product.pricingProxyId ? proxyVarMap.get(product.pricingProxyId) : null;
      if (pricingProxy) {
        try {
          unitPrice = evaluatePrice(pricingProxy.formula, finalScope, contextScope);
        } catch (e: any) {
          pricingError = e.message;
        }
      }

      // Export evaluation
      let exportText: string | null = null;
      let exportError: string | null = null;
      const exportProxy = product.exportProxyId ? proxyVarMap.get(product.exportProxyId) : null;
      if (exportProxy) {
        try {
          exportText = generateOrdItemBlock(finalScope, contextScope, exportProxy.formula);
        } catch (e: any) {
          exportError = e.message;
        }
      }

      const quantity = inputs.quantity ?? 1;

      res.json({
        productName: product.name,
        skuPrefix: product.skuPrefix,
        pricingFormulaName: pricingProxy?.name ?? null,
        exportFormulaName: exportProxy?.name ?? null,
        finalScope,
        gridLookupResults,
        unitPrice,
        totalPrice: unitPrice * quantity,
        pricingError,
        exportText,
        exportError,
      });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post('/api/admin/upload-allmoxy-products', isAuthenticated, upload.single('file'), async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }
    try {
      const fileContent = req.file.buffer.toString('utf-8');
      const records: any[] = parseSync(fileContent, { columns: true, skip_empty_lines: true });
      if (records.length === 0) {
        return res.status(400).json({ message: 'CSV file is empty' });
      }

      const productsToInsert = records.map(record => ({
        name: record['PRODUCT NAME'] || record.NAME || record.name || record['Product Name'] || '',
        status: 'active' as const,
        pricingProxyId: null,
        exportProxyId: null,
        skuPrefix: null,
        description: null,
        notes: null,
      })).filter(p => p.name);

      await storage.replaceAllmoxyProducts(productsToInsert);
      res.json({ message: 'Products imported successfully', count: productsToInsert.length });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post('/api/admin/allmoxy-products/import-csv', isAuthenticated, upload.single('file'), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

      const { pricingProxyId, exportProxyId, gridId, alias, lookupColumn } = req.body;

      const records: any[] = parseSync(req.file.buffer.toString('utf-8'), {
        columns: true,
        skip_empty_lines: true,
      });

      if (!records.length) {
        return res.status(400).json({ message: 'File is empty' });
      }

      if (!records[0]['PRODUCT NAME'] && !records[0]['ID']) {
        return res.status(400).json({ message: 'This does not look like a PF Products file. Expected columns: ID, PRODUCT NAME' });
      }

      const filename = req.file.originalname;
      const categoryName = filename
        .replace(/\.csv$/i, '')
        .replace(/_\d{8}$/, '')
        .replace(/^PF_/, '')
        .replace(/_Products$/, '')
        .replace(/_/g, ' ')
        .trim();

      const productsToInsert = records
        .filter(r => r['PRODUCT NAME']?.trim())
        .map(r => ({
          name: r['PRODUCT NAME'].trim(),
          skuPrefix: r['PRODUCT NAME'].trim(),
          status: 'active' as const,
          pricingProxyId: pricingProxyId ? Number(pricingProxyId) : null,
          exportProxyId: exportProxyId ? Number(exportProxyId) : null,
          description: categoryName,
          notes: null,
          supplyType: 'STOCK' as const,
        }));

      if (!productsToInsert.length) {
        return res.status(400).json({ message: 'No valid product rows found in file' });
      }

      await storage.deleteAllmoxyProductsByCategory(categoryName);
      const inserted = await storage.bulkInsertAllmoxyProducts(productsToInsert);

      let bindingsCreated = 0;
      if (gridId) {
        const bindingAlias = alias?.trim() || categoryName.toLowerCase().replace(/[^a-z0-9]/g, '_');
        const bindingLookupColumn = lookupColumn?.trim() || 'MANU_CODE';
        for (const product of inserted) {
          await storage.replaceProductGridBindings(product.id, [{
            productId: product.id,
            gridId: Number(gridId),
            alias: bindingAlias,
            lookupColumn: bindingLookupColumn,
          }]);
          bindingsCreated++;
        }
      }

      res.json({
        categoryName,
        productsInserted: inserted.length,
        bindingsCreated,
        gridId: gridId ? Number(gridId) : null,
        pricingProxyId: pricingProxyId ? Number(pricingProxyId) : null,
        exportProxyId: exportProxyId ? Number(exportProxyId) : null,
      });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });


  app.post('/api/admin/proxy-variables', isAuthenticated, async (req, res) => {
    try {
      const { name, type, formula } = req.body;
      if (!name || !type || !formula) {
        return res.status(400).json({ message: 'name, type, and formula are required' });
      }
      const saved = await storage.upsertProxyVariable({ name, type, formula });
      res.json(saved);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.delete('/api/admin/proxy-variables/:id', isAuthenticated, async (req, res) => {
    try {
      const success = await storage.deleteProxyVariable(Number(req.params.id));
      if (!success) {
        return res.status(404).json({ message: 'Variable not found' });
      }
      res.status(204).send();
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // Get sync preview data (protected) - calculates all totals before syncing
  // GET order items for a project (with product name join)
  app.get('/api/orders/:id/items', isAuthenticated, async (req, res) => {
    try {
      const projectId = parseInt(req.params.id);
      const items = await storage.getOrderItemsByProject(projectId);
      const allProducts = await storage.getAllmoxyProducts();
      const productNameMap = new Map(allProducts.map(p => [p.id, p.name]));
      res.json(items.map(item => ({
        id: item.id,
        fileId: item.fileId,
        productId: item.productId,
        productName: item.productId ? (productNameMap.get(item.productId) ?? null) : null,
        sku: item.sku,
        description: item.description,
        width: item.width,
        height: item.height,
        depth: item.depth,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice: item.totalPrice,
        exportText: item.exportText,
        pricingError: item.pricingError,
        exportType: item.exportType,
        supplyType: item.supplyType,
      })));
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // GET Elias CSV export
  app.get('/api/orders/:id/export/elias', isAuthenticated, async (req, res) => {
    try {
      const projectId = parseInt(req.params.id);
      const items = await storage.getOrderItemsByProject(projectId);
      const eliasItems = items.filter(i => i.exportType === 'ELIAS' && i.exportText);
      if (eliasItems.length === 0) {
        return res.status(404).json({ message: 'No Elias items in this order' });
      }
      const csv = eliasItems.map(i => i.exportText!).join('\n');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="Elias_Job_${projectId}.csv"`);
      res.send(csv);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // GET M&J CSV export
  app.get('/api/orders/:id/export/mj', isAuthenticated, async (req, res) => {
    try {
      const projectId = parseInt(req.params.id);
      const items = await storage.getOrderItemsByProject(projectId);
      const mjItems = items.filter(i => i.exportType === 'MJ' && i.exportText);
      if (mjItems.length === 0) {
        return res.status(404).json({ message: 'No M&J items in this order' });
      }
      const csv = mjItems.map(i => i.exportText!).join('\n');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="MJ_Job_${projectId}.csv"`);
      res.send(csv);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // GET ERP import CSV export
  app.get('/api/orders/:id/export/erp', isAuthenticated, async (req, res) => {
    try {
      const projectId = parseInt(req.params.id);
      const items = await storage.getOrderItemsByProject(projectId);
      const lines: string[] = [];
      for (const item of items) {
        const qty = item.quantity ?? 1;
        const sku = item.sku ?? '';
        const w = item.width ?? '';
        const h = item.height ?? '';
        const d = item.depth ?? '';
        const t = item.exportType;
        if (t === 'GLASS') continue;
        if (t === 'ORD') {
          lines.push(`${qty},${sku},${w},${h},${d},COMPONENT,,,,,,,,,,,,,,`);
        } else if (t === 'ELIAS') {
          lines.push(`${qty},${sku},${w},${h},${d},COMPONENT,,,,,,,,,,,,,,`);
        } else if (t === 'HARDWARE' || t === 'CTS' || t === 'MJ') {
          lines.push(`${qty},${sku},,,,HARDWARE,,,,,,,,,,,,,,`);
        } else {
          lines.push(`${qty},${sku},${w},${h},${d},COMPONENT,,,,,,,,,,,,,,`);
        }
      }
      const csv = lines.join('\n');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="ERP_Import_${projectId}.csv"`);
      res.send(csv);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // GET CTS part list export (JSON)
  app.get('/api/orders/:id/export/cts', isAuthenticated, async (req, res) => {
    try {
      const projectId = parseInt(req.params.id);
      const items = await storage.getOrderItemsByProject(projectId);
      const ctsItems = items.filter(i => i.exportType === 'CTS');
      if (ctsItems.length === 0) {
        return res.status(404).json({ message: 'No CTS items in this order' });
      }
      const ROD_LENGTH_MM = 2438.4; // 96 inches standard rod
      let totalLengthMm = 0;
      const result = ctsItems.map(item => {
        const lengthMm = (item.depth ?? 0);
        const lengthIn = lengthMm / 25.4;
        totalLengthMm += lengthMm * (item.quantity ?? 1);
        return {
          sku: item.sku ?? '',
          quantity: item.quantity ?? 1,
          length: Math.round(lengthIn * 1000) / 1000,
          supplyType: item.supplyType ?? 'STOCK',
          rackLocation: null,
        };
      });
      const totalLengthInches = totalLengthMm / 25.4;
      const totalRodsNeeded = Math.round((totalLengthMm / ROD_LENGTH_MM) * 100) / 100;
      res.json({ items: result, totalLengthMm, totalLengthInches, totalRodsNeeded });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // GET Invoice PDF
  app.get('/api/orders/:id/pdf/invoice', isAuthenticated, async (req, res) => {
    try {
      const projectId = parseInt(req.params.id);
      const project = await storage.getProject(projectId);
      if (!project) return res.status(404).json({ message: 'Project not found' });

      const items = await storage.getOrderItemsByProject(projectId);
      const allProducts = await storage.getAllmoxyProducts();
      const productMap = new Map(allProducts.map(p => [p.id, p]));

      const columnsForType = (exportType: string | null): string[] => {
        switch (exportType) {
          case 'ELIAS':    return ['ID', 'Qty', 'Height', 'Width', 'Length', 'type', 'Price', 'Total'];
          case 'MJ':       return ['ID', 'Qty', 'Height', 'Width', 'Thickness', 'type', 'Price', 'Total'];
          case 'CTS':      return ['ID', 'Qty', 'Length', 'Buyout Or Stock?', 'Price', 'Total'];
          case 'HARDWARE': return ['ID', 'Qty', 'Buyout Or Stock?', 'Price', 'Total'];
          case 'GLASS':    return ['ID', 'Qty', 'Height', 'Width', 'Thickness', 'Price', 'Total'];
          case 'ORD':      return ['ID', 'Qty', 'Height', 'Width', 'Thickness', 'Edge Left', 'Edge Right', 'Edge Top', 'Edge Bottom', 'type', 'Price', 'Total'];
          default:         return ['ID', 'Qty', 'Height', 'Width', 'Price', 'Total'];
        }
      };

      const groupedMap = new Map<string, typeof items>();
      const groupOrder: string[] = [];
      for (const item of items) {
        const key = item.productId != null ? `p:${item.productId}` : `s:${item.sku ?? item.description ?? 'unknown'}`;
        if (!groupedMap.has(key)) {
          groupedMap.set(key, []);
          groupOrder.push(key);
        }
        groupedMap.get(key)!.push(item);
      }

      let sectionIndex = 0;
      const sections = groupOrder.map(key => {
        const groupItems = groupedMap.get(key)!;
        const firstItem = groupItems[0];
        const product = firstItem.productId != null ? productMap.get(firstItem.productId) : null;
        const exportType = firstItem.exportType ?? null;
        const columns = columnsForType(exportType);

        const raw0 = (firstItem.rawRowData ?? {}) as Record<string, any>;
        const color: string | null = raw0['Material'] ?? raw0['Color'] ?? raw0['Colour'] ?? raw0['color'] ?? null;

        const invoiceItems = groupItems.map((item, idx) => {
          const raw = (item.rawRowData ?? {}) as Record<string, any>;
          const edgeLeft  = (raw['Left']   === '1' || raw['Left']   === 1) ? 'E' : 'N';
          const edgeRight = (raw['Right']  === '1' || raw['Right']  === 1) ? 'E' : 'N';
          const edgeTop   = (raw['Top']    === '1' || raw['Top']    === 1) ? 'E' : 'N';
          const edgeBottom= (raw['Bottom'] === '1' || raw['Bottom'] === 1) ? 'E' : 'N';
          return {
            id: `${sectionIndex + 1} ${String(idx + 1).padStart(2, '0')}`,
            qty: item.quantity ?? 1,
            height: item.height ?? null,
            width: item.width ?? null,
            length: item.depth ?? null,
            thickness: item.depth ?? null,
            edgeLeft, edgeRight, edgeTop, edgeBottom,
            type: product?.name ?? item.description ?? '',
            supplyType: item.supplyType ?? 'STOCK',
            unitPrice: item.unitPrice ?? 0,
            totalPrice: item.totalPrice ?? 0,
          };
        });

        const totalItems = groupItems.reduce((s, i) => s + (i.quantity ?? 1), 0);
        const subtotal = groupItems.reduce((s, i) => s + (i.totalPrice ?? 0), 0);

        sectionIndex++;
        return {
          sku: firstItem.sku ?? product?.skuPrefix ?? `Item ${sectionIndex}`,
          color,
          categoryLabel: product?.description ?? exportType ?? '',
          productDescription: product?.name ?? firstItem.description ?? '',
          columns,
          items: invoiceItems,
          totalItems,
          subtotal: Math.round(subtotal * 100) / 100,
        };
      });

      const grandTotal = sections.reduce((s, sec) => s + sec.subtotal, 0);
      const now = new Date();
      const fmt = (d: Date) => `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`;

      const invoiceData = {
        orderId: projectId,
        orderName: project.name ?? `Order ${projectId}`,
        orderStatus: project.status ?? 'Bid',
        dateOrdered: fmt(now),
        paymentDueBy: fmt(new Date(now.getTime() + 7 * 86400000)),
        projectedShipDate: fmt(new Date(now.getTime() + 14 * 86400000)),
        shippingMethod: 'Will Call',
        shipTo: 'Will Call',
        sections,
        originalTotal: Math.round(grandTotal * 100) / 100,
        discountAmount: 0,
        finalTotal: Math.round(grandTotal * 100) / 100,
        outputPath: `/tmp/invoice_${projectId}_${Date.now()}.pdf`,
      };

      const pdfBuf = await generateInvoicePdf(invoiceData);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="Invoice_${projectId}.pdf"`);
      res.send(pdfBuf);
    } catch (e: any) {
      console.error('[Invoice PDF]', e.message);
      res.status(500).json({ message: e.message });
    }
  });

  // POST re-run pricing pipeline for an already-saved project
  app.post('/api/orders/:id/reprice', isAuthenticated, async (req, res) => {
    try {
      const projectId = parseInt(req.params.id);
      const project = await storage.getProject(projectId);
      if (!project) return res.status(404).json({ message: 'Project not found' });

      // Pre-load the same pipeline data as the upload handler
      const allProxyVars = await storage.getProxyVariables();
      const proxyVarMap = new Map(allProxyVars.map(v => [v.id, v]));
      const allProducts = await storage.getAllmoxyProducts();
      const activeProducts = allProducts.filter(
        (p): p is AllmoxyProduct => p.status === 'active' && !!p.skuPrefix
      );
      const productBindingsMap = new Map<number, ProductGridBinding[]>();
      for (const product of activeProducts) {
        const bindings = await storage.getProductGridBindings(product.id);
        productBindingsMap.set(product.id, bindings);
      }
      const allGrids = await storage.getAttributeGrids();
      const gridMap = new Map(allGrids.map(g => [g.id, g]));

      const files = await storage.getProjectFiles(projectId);
      let totalProjectPrice = 0;

      for (const file of files) {
        if (!file.rawContent) continue;
        await storage.deleteOrderItemsByFile(file.id);

        const itemObjects: any[] = parseSync(file.rawContent, { columns: true, skip_empty_lines: true });
        for (const item of itemObjects) {
          const sku: string = (item.MANU_CODE || item.SKU || item['Manuf Code'] || '').toString().trim();
          if (!sku) continue;

          const product = matchProductToSku(sku, activeProducts);
          console.log(`[Reprice] SKU: ${sku} → ${product ? `matched: ${product.name}` : 'NO MATCH'}`);

          const contextScope: any = {};
          if (product) {
            const bindings = productBindingsMap.get(product.id) ?? [];
            for (const binding of bindings) {
              const grid = gridMap.get(binding.gridId);
              if (!grid) continue;
              const lookupValue = (item[binding.lookupColumn] || '').toString().trim();
              if (!lookupValue) continue;
              const row = await storage.getAttributeGridRowByKey(binding.gridId, lookupValue, binding.lookupColumn);
              if (row) {
                const rawData = row.rowData as Record<string, any>;
                contextScope[binding.alias] = Object.fromEntries(
                  Object.entries(rawData).map(([k, v]) => [k.toLowerCase(), v])
                );
              }
            }
          }

          const pricingItem = {
            ...item,
            width:    Number(item.Width    || item.width    || 0),
            height:   Number(item.Height   || item.height   || 0),
            length:   Number(item.Length   || item.length   || 0),
            depth:    Number(item.Length   || item.length   || 0),
            quantity: Number(item.Qty      || item.quantity || item.QUANTITY || 1),
          };

          let unitPrice = 0;
          let pricingError: string | null = null;
          if (product && product.pricingProxyId != null) {
            const proxy = proxyVarMap.get(product.pricingProxyId);
            if (proxy) {
              try { unitPrice = evaluatePrice(proxy.formula, pricingItem, contextScope); }
              catch (e: any) { pricingError = e.message; unitPrice = 0; }
            }
          } else if (!product) {
            pricingError = `No product matched SKU prefix for: ${sku}`;
          }

          let exportText: string | null = null;
          if (product && product.exportProxyId != null) {
            const proxy = proxyVarMap.get(product.exportProxyId);
            if (proxy) {
              try { exportText = generateOrdItemBlock(pricingItem, contextScope, proxy.formula); }
              catch { exportText = null; }
            }
          }

          const qty = pricingItem.quantity;
          const totalPrice = unitPrice * qty;

          await storage.createOrderItem({
            projectId,
            fileId: file.id,
            productId: product?.id ?? null,
            sku,
            description: item.NAME || item['Part Name'] || item.Description || '',
            width:    pricingItem.width    || null,
            height:   pricingItem.height   || null,
            depth:    pricingItem.length   || null,
            quantity: qty,
            unitPrice,
            totalPrice,
            exportText,
            pricingError,
            rawRowData: item,
            exportType: product?.exportType || null,
            supplyType: product?.supplyType || null,
          });
          totalProjectPrice += totalPrice;
        }

        if (file.rawContent) {
          const hwResult = await generateHardwareChecklistForFile(file.id, file.rawContent);
          console.log(`[Reprice] File ${file.id}: Hardware checklist regenerated - ${hwResult.itemCount} items`);
          const psResult = await generatePackingSlipChecklistForFile(file.id, file.rawContent);
          console.log(`[Reprice] File ${file.id}: Packing slip checklist regenerated - ${psResult.itemCount} items`);
        }
      }

      const savedItems = await storage.getOrderItemsByProject(projectId);
      const allProductsFull = await storage.getAllmoxyProducts();
      const productNameMap = new Map(allProductsFull.map(p => [p.id, p.name]));

      res.json({
        repriced: true,
        totalPrice: totalProjectPrice,
        items: savedItems.map(item => ({
          id: item.id,
          fileId: item.fileId,
          productId: item.productId,
          productName: item.productId ? (productNameMap.get(item.productId) ?? null) : null,
          sku: item.sku,
          description: item.description,
          width: item.width,
          height: item.height,
          depth: item.depth,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          totalPrice: item.totalPrice,
          exportText: item.exportText,
          pricingError: item.pricingError,
        })),
      });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get('/api/orders/:id/files', isAuthenticated, async (req, res) => {
    try {
      const projectId = parseInt(req.params.id);
      const project = await storage.getProject(projectId);
      if (!project) return res.status(404).json({ message: 'Project not found' });
      const files = await storage.getProjectFiles(projectId);
      res.json(files);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post('/api/orders/:id/regenerate-checklists', isAuthenticated, async (req, res) => {
    try {
      const projectId = parseInt(req.params.id);
      const project = await storage.getProject(projectId);
      if (!project) return res.status(404).json({ message: 'Project not found' });

      const files = await storage.getProjectFiles(projectId);
      let totalHardwareItems = 0;
      let totalPackingItems = 0;
      const errors: string[] = [];

      for (const file of files) {
        if (!file.rawContent) continue;
        try {
          const hwResult = await generateHardwareChecklistForFile(file.id, file.rawContent);
          totalHardwareItems += hwResult.itemCount;
          if (!hwResult.success && hwResult.error) {
            errors.push(`File ${file.originalFilename}: hardware - ${hwResult.error}`);
          }
        } catch (e: any) {
          errors.push(`File ${file.originalFilename}: hardware - ${e.message}`);
        }
        try {
          const psResult = await generatePackingSlipChecklistForFile(file.id, file.rawContent);
          totalPackingItems += psResult.itemCount;
          if (!psResult.success && psResult.error) {
            errors.push(`File ${file.originalFilename}: packing - ${psResult.error}`);
          }
        } catch (e: any) {
          errors.push(`File ${file.originalFilename}: packing - ${e.message}`);
        }
      }

      console.log(`[Regenerate Checklists] Project ${projectId}: ${totalHardwareItems} hardware items, ${totalPackingItems} packing items`);
      res.json({ success: errors.length === 0, totalHardwareItems, totalPackingItems, errors });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get('/api/orders/:id/preview', isAuthenticated, async (req, res) => {
    const project = await storage.getProject(Number(req.params.id));
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    const projectFiles = await storage.getProjectFiles(project.id);

    let totalCoreParts = 0;
    let totalDovetails = 0;
    let totalAssembledDrawers = 0;
    let totalFivePiece = 0;
    let totalGlassInserts = 0;
    let totalGlassShelves = 0;
    let totalMJDoors = 0;
    let totalRichelieuDoors = 0;
    let totalDoubleThick = 0;
    let totalWeight = 0;
    let totalWallRailPieces = 0;
    let hasDoubleThick = false;
    let hasShakerDoors = false;
    let hasGlassParts = false;
    let hasMJDoors = false;
    let hasRichelieuDoors = false;
    let overallMaxLength = 0;
    let overallMaxWidth = 0;
    let overallLargestPartWidth = 0;
    let overallWidestPartLength = 0;

    interface FileBreakdown {
      name: string;
      coreParts: number;
      dovetails: number;
      assembledDrawers: number;
      fivePieceDoors: number;
      weightLbs: number;
      maxLength: number;
      maxWidth: number;
      largestPartWidth: number;
      widestPartLength: number;
      hasGlassParts: boolean;
      glassInserts: number;
      glassShelves: number;
      hasMJDoors: boolean;
      hasRichelieuDoors: boolean;
      mjDoorsCount: number;
      richelieuDoorsCount: number;
      hasDoubleThick: boolean;
      doubleThickCount: number;
      customParts: string[];
      ctsPartsCount: number;
      fileId: number;
      ctsAllCut: boolean;
      wallRailPieces: number;
    }
    const fileBreakdowns: FileBreakdown[] = [];
    let totalCtsPartsCount = 0;

    for (const file of projectFiles) {
      // Backfill largestPartWidth/widestPartLength for files that don't have them yet
      if ((file.maxLength || 0) > 0 && (!file.largestPartWidth || !file.widestPartLength) && file.rawContent) {
        try {
          const records = parseSync(file.rawContent, { relax_column_count: true, skip_empty_lines: true });
          let longestHeight = 0;
          let widthOfLongest = 0;
          let newMaxWidth = 0;
          let newWidestPartLength = 0;
          let dataStart = -1;
          for (let i = 0; i < records.length; i++) {
            if (records[i][0]?.toLowerCase().includes('manuf')) { dataStart = i + 1; break; }
          }
          if (dataStart >= 0) {
            for (let i = dataStart; i < records.length; i++) {
              const h = parseFloat(records[i][3] || '0') || 0;
              const w = parseFloat(records[i][4] || '0') || 0;
              if (h > longestHeight) { longestHeight = h; widthOfLongest = w; }
              if (h > 600 && w > newMaxWidth) { newMaxWidth = w; newWidestPartLength = h; }
            }
          }
          file.largestPartWidth = Math.round(widthOfLongest);
          file.maxWidth = Math.round(newMaxWidth);
          file.widestPartLength = Math.round(newWidestPartLength);
          await storage.updateOrderFile(file.id, { largestPartWidth: file.largestPartWidth, maxWidth: file.maxWidth, widestPartLength: file.widestPartLength });
        } catch (e) {
          console.error(`Backfill error for file ${file.id}:`, e);
        }
      }

      // Use stored values from database instead of re-parsing CSV
      totalCoreParts += file.coreParts || 0;
      totalDovetails += file.dovetails || 0;
      totalAssembledDrawers += file.assembledDrawers || 0;
      totalFivePiece += file.fivePieceDoors || 0;
      totalGlassInserts += file.glassInserts || 0;
      totalGlassShelves += file.glassShelves || 0;
      totalMJDoors += file.mjDoorsCount || 0;
      totalRichelieuDoors += file.richelieuDoorsCount || 0;
      totalDoubleThick += file.doubleThickCount || 0;
      totalWeight += file.weightLbs || 0;
      totalWallRailPieces += file.wallRailPieces || 0;
      if (file.hasDoubleThick) hasDoubleThick = true;
      if (file.hasShakerDoors) hasShakerDoors = true;
      if (file.hasGlassParts) hasGlassParts = true;
      if (file.hasMJDoors) hasMJDoors = true;
      if (file.hasRichelieuDoors) hasRichelieuDoors = true;
      if ((file.maxLength || 0) >= overallMaxLength) {
        if ((file.maxLength || 0) > overallMaxLength || (file.largestPartWidth || 0) > overallLargestPartWidth) {
          overallMaxLength = file.maxLength || 0;
          overallLargestPartWidth = file.largestPartWidth || 0;
        }
      }
      if ((file.maxWidth || 0) > overallMaxWidth) {
        overallMaxWidth = file.maxWidth || 0;
        overallWidestPartLength = file.widestPartLength || 0;
      }

      // Get CTS parts count and cut status for this file
      const fileCtsPartsCount = await storage.getCtsPartsCountForFile(file.id);
      const fileCtsStatus = await storage.getCtsPartsCutStatus(file.id);
      totalCtsPartsCount += fileCtsPartsCount;

      // Build customParts list from boolean flags
      const fileCustomParts: string[] = [];
      if (file.hasDoubleThick) fileCustomParts.push('DOUBLE THICK PARTS');
      if (file.hasShakerDoors) fileCustomParts.push('SHAKER DOORS');

      fileBreakdowns.push({
        name: file.poNumber || file.originalFilename,
        coreParts: file.coreParts || 0,
        dovetails: file.dovetails || 0,
        assembledDrawers: file.assembledDrawers || 0,
        fivePieceDoors: file.fivePieceDoors || 0,
        weightLbs: file.weightLbs || 0,
        maxLength: file.maxLength || 0,
        maxWidth: file.maxWidth || 0,
        largestPartWidth: file.largestPartWidth || 0,
        widestPartLength: file.widestPartLength || 0,
        hasGlassParts: file.hasGlassParts || false,
        glassInserts: file.glassInserts || 0,
        glassShelves: file.glassShelves || 0,
        hasMJDoors: file.hasMJDoors || false,
        hasRichelieuDoors: file.hasRichelieuDoors || false,
        mjDoorsCount: file.mjDoorsCount || 0,
        richelieuDoorsCount: file.richelieuDoorsCount || 0,
        hasDoubleThick: file.hasDoubleThick || false,
        doubleThickCount: file.doubleThickCount || 0,
        customParts: fileCustomParts,
        ctsPartsCount: fileCtsPartsCount,
        fileId: file.id,
        ctsAllCut: fileCtsStatus.allCut,
        wallRailPieces: file.wallRailPieces || 0
      });
    }

    // Determine recommended pallet size based on part dimensions
    const palletSize = getRecommendedPalletSize(overallMaxLength, overallMaxWidth);

    // Build custom parts list
    const customParts: string[] = [];
    if (hasDoubleThick) customParts.push('DOUBLE THICK PARTS');
    if (hasShakerDoors) customParts.push('SHAKER DOORS');

    res.json({
      totals: {
        parts: totalCoreParts,
        dovetails: totalDovetails,
        assembledDrawers: totalAssembledDrawers,
        fivePieceDoors: totalFivePiece,
        glassInserts: totalGlassInserts,
        glassShelves: totalGlassShelves,
        mjDoors: totalMJDoors,
        richelieuDoors: totalRichelieuDoors,
        doubleThick: totalDoubleThick,
        ctsPartsCount: totalCtsPartsCount,
        weightLbs: Math.round(totalWeight),
        maxLength: overallMaxLength,
        maxWidth: overallMaxWidth,
        largestPartWidth: overallLargestPartWidth,
        widestPartLength: overallWidestPartLength,
        fileCount: projectFiles.length,
        wallRailPieces: totalWallRailPieces
      },
      palletSize,
      customParts,
      flags: {
        hasGlassParts,
        hasMJDoors,
        hasRichelieuDoors,
        hasDoubleThick,
        hasShakerDoors
      },
      fileBreakdowns
    });
  });

  // Upload multiple files as a single project (protected)
  app.post(api.orders.upload.path, isAuthenticated, upload.array('files'), async (req, res) => {
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
      
      // Use custom project name if provided, otherwise extract from PO
      const customProjectName = req.body?.projectName?.trim();
      let projectName: string;
      
      if (customProjectName) {
        projectName = customProjectName;
      } else {
        // Extract project name from the base PO (without the room/design suffix)
        // e.g., "Anderson PO25-391065 (GUEST CLOSETS V5)" -> "Anderson PO25-391065"
        const firstPO = parsedFiles[0].poNumber || parsedFiles[0].filename;
        projectName = firstPO.replace(/\s*\([^)]*\)\s*$/, '').trim() || firstPO;
      }

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

      let totalProjectPrice = 0;
      let combinedOrdText = "";

      // Load ORD header template once
      const headerSetting = await storage.getSetting('ord_header_template');
      const headerTemplate = headerSetting?.value ?? DEFAULT_ORD_HEADER_TEMPLATE;

      // ── Product-driven pipeline pre-load ──────────────────────────────
      const allProxyVars = await storage.getProxyVariables();
      const proxyVarMap = new Map(allProxyVars.map(v => [v.id, v]));

      const allProducts = await storage.getAllmoxyProducts();
      const activeProducts = allProducts.filter(
        (p): p is AllmoxyProduct => p.status === 'active' && !!p.skuPrefix
      );

      const productBindingsMap = new Map<number, ProductGridBinding[]>();
      for (const product of activeProducts) {
        const bindings = await storage.getProductGridBindings(product.id);
        productBindingsMap.set(product.id, bindings);
      }

      const allGrids = await storage.getAttributeGrids();
      const gridMap = new Map(allGrids.map(g => [g.id, g]));

      // Build products map for countPartsFromCSV (MJ/Richelieu door detection)
      const allProductsForCounting = await storage.getProducts();
      const productsMapForCounting = new Map(
        allProductsForCounting.map(p => [
          p.code.toUpperCase(),
          { category: p.category, supplier: p.supplier }
        ])
      );

      // Aggregate counts for auto-derived production statuses
      let totalDovetails = 0;
      let totalFivePiece = 0;
      let totalAssembledDrawers = 0;
      let hasDoubleThick = false;
      let hasGlassParts = false;
      let hasGlassShelves = false;
      let hasCTSParts = false;
      
      // Create order files linked to the project with calculated values
      for (const pf of parsedFiles) {
        // Generate ORD header for this file
        const designName = pf.poNumber || pf.filename.replace(/\.[^.]+$/, '');
        const poNumber = pf.poNumber || '';
        const fileHeader = generateOrdHeader(headerTemplate, { designName, poNumber });
        let fileOrdText = fileHeader + "\n";

        // Calculate part counts from CSV data (async to cross-reference products DB)
        const partCounts = await countPartsFromCSV(pf.records, productsMapForCounting);
        
        // Aggregate for auto-derived statuses (reuse already-computed counts)
        totalDovetails += partCounts.dovetails;
        totalFivePiece += partCounts.fivePiece;
        totalAssembledDrawers += partCounts.assembledDrawers;
        if (partCounts.hasDoubleThick) hasDoubleThick = true;
        if (partCounts.hasGlassParts) hasGlassParts = true;
        if (partCounts.glassShelves > 0) hasGlassShelves = true;
        
        const orderFile = await storage.createOrderFile({
          projectId: project.id,
          originalFilename: pf.filename,
          poNumber: pf.poNumber,
          rawContent: pf.content,
          coreParts: partCounts.coreParts,
          dovetails: partCounts.dovetails,
          assembledDrawers: partCounts.assembledDrawers,
          fivePieceDoors: partCounts.fivePiece,
          weightLbs: Math.round(partCounts.weightLbs),
          maxLength: Math.round(partCounts.maxLength),
          maxWidth: Math.round(partCounts.maxWidth),
          largestPartWidth: Math.round(partCounts.largestPartWidth),
          widestPartLength: Math.round(partCounts.widestPartLength),
          hasGlassParts: partCounts.hasGlassParts,
          glassInserts: partCounts.glassInserts,
          glassShelves: partCounts.glassShelves,
          hasMJDoors: partCounts.hasMJDoors,
          hasRichelieuDoors: partCounts.hasRichelieuDoors,
          hasDoubleThick: partCounts.hasDoubleThick,
          hasShakerDoors: partCounts.hasShakerDoors,
          mjDoorsCount: partCounts.mjDoorsCount,
          richelieuDoorsCount: partCounts.richelieuDoorsCount,
          doubleThickCount: partCounts.doubleThickCount,
          wallRailPieces: partCounts.wallRailPieces,
        });

        // ── Product-driven per-item pricing ──────────────────────────────
        // Delete any stale order_items for this file (safe for re-uploads)
        await storage.deleteOrderItemsByFile(orderFile.id);

        const itemObjects: any[] = parseSync(pf.content, { columns: true, skip_empty_lines: true });
        for (const item of itemObjects) {
          // Resolve SKU from common column name variants
          const sku: string = (
            item.MANU_CODE || item.SKU || item['Manuf Code'] || ''
          ).toString().trim();

          if (!sku) continue; // skip blank rows

          const product = matchProductToSku(sku, activeProducts);

          if (product) {
            console.log(`[Pipeline] SKU: ${sku} → matched product: ${product.name} (id=${product.id})`);
          } else {
            console.log(`[Pipeline] SKU: ${sku} → NO MATCH`);
          }

          // Build contextScope from this product's grid bindings
          const contextScope: any = {};
          if (product) {
            const bindings = productBindingsMap.get(product.id) ?? [];
            for (const binding of bindings) {
              const grid = gridMap.get(binding.gridId);
              if (!grid) continue;
              const lookupValue = (item[binding.lookupColumn] || '').toString().trim();
              if (!lookupValue) continue;
              const row = await storage.getAttributeGridRowByKey(binding.gridId, lookupValue, binding.lookupColumn);
              if (row) {
                const rawData = row.rowData as Record<string, any>;
                contextScope[binding.alias] = Object.fromEntries(
                  Object.entries(rawData).map(([k, v]) => [k.toLowerCase(), v])
                );
              }
            }
          }

          // Normalize item dimensions so formulas can use lowercase property names.
          // CSV columns are title-case (Width, Height, Length); "depth" aliases "length"
          // for backward-compatibility with formulas written before the rename.
          const pricingItem = {
            ...item,
            width:    Number(item.Width    || item.width    || 0),
            height:   Number(item.Height   || item.height   || 0),
            length:   Number(item.Length   || item.length   || 0),
            depth:    Number(item.Length   || item.length   || 0),
            quantity: Number(item.Qty      || item.quantity || item.QUANTITY || 1),
          };

          // Calculate unit price
          let unitPrice = 0;
          let pricingError: string | null = null;
          if (product && product.pricingProxyId != null) {
            const pricingProxy = proxyVarMap.get(product.pricingProxyId);
            if (pricingProxy) {
              try {
                unitPrice = evaluatePrice(pricingProxy.formula, pricingItem, contextScope);
              } catch (e: any) {
                pricingError = e.message;
                unitPrice = 0;
              }
            }
          } else if (!product) {
            pricingError = `No product matched SKU prefix for: ${sku}`;
          }

          // Generate export block
          let exportText: string | null = null;
          if (product && product.exportProxyId != null) {
            const exportProxy = proxyVarMap.get(product.exportProxyId);
            if (exportProxy) {
              try {
                exportText = generateOrdItemBlock(pricingItem, contextScope, exportProxy.formula);
              } catch {
                exportText = null;
              }
            }
          }

          const qty = pricingItem.quantity;
          const totalPrice = unitPrice * qty;

          await storage.createOrderItem({
            projectId: project.id,
            fileId: orderFile.id,
            productId: product?.id ?? null,
            sku,
            description: item.NAME || item['Part Name'] || item.Description || '',
            width:    pricingItem.width    || null,
            height:   pricingItem.height   || null,
            depth:    pricingItem.length   || null,
            quantity: qty,
            unitPrice,
            totalPrice,
            exportText,
            pricingError,
            rawRowData: item,
            exportType: product?.exportType || null,
            supplyType: product?.supplyType || null,
          });

          totalProjectPrice += totalPrice;
          if (exportText) fileOrdText += exportText + "\n";
        }

        combinedOrdText += fileOrdText;
        
        // Extract and save CTS parts for this file
        const ctsParts = extractCTSParts(pf.records);
        if (ctsParts.length > 0) hasCTSParts = true;
        for (const ctsPart of ctsParts) {
          await storage.createCtsPart({
            fileId: orderFile.id,
            partNumber: ctsPart.partNumber,
            description: ctsPart.description,
            cutLength: ctsPart.cutLength,
            quantity: ctsPart.quantity,
          });
        }
        
        // Auto-generate hardware checklist from order CSV
        const checklistResult = await generateHardwareChecklistForFile(orderFile.id, pf.content);
        console.log(`[Upload] Order ${orderFile.id}: Hardware checklist auto-generated - ${checklistResult.itemCount} items`);
        
        // Auto-generate packing slip checklist from order CSV (all items, not just hardware)
        const packingSlipResult = await generatePackingSlipChecklistForFile(orderFile.id, pf.content);
        console.log(`[Upload] Order ${orderFile.id}: Packing slip checklist auto-generated - ${packingSlipResult.itemCount} items`);
      }
      
      // Compute auto-enabled production statuses based on order content
      const autoStatuses = computeAutoProductionStatuses({
        hasCTSParts,
        hasFivePiece: totalFivePiece > 0,
        hasDoubleThick,
        hasDovetails: totalDovetails > 0,
        hasAssembledDrawers: totalAssembledDrawers > 0,
        hasGlassParts,
        hasGlassShelves
      });
      
      console.log(`[Upload] Auto-derived production statuses for project ${project.id}:`, autoStatuses);
      
      // Set the auto-derived statuses on the project
      if (autoStatuses.length > 0) {
        await storage.updateProject(project.id, { pfProductionStatus: autoStatuses });
        console.log(`[Upload] Set pfProductionStatus for project ${project.id}:`, autoStatuses);
      }
      
      // After setting auto statuses, update project's aggregated BO status
      // This will merge BO status with the auto-derived statuses
      console.log(`[Upload] Updating project ${project.id} aggregated BO status after all files processed`);
      await updateProjectBoProductionStatus(project.id);
      
      // Return the updated project with all statuses and detailed item info for preview
      const updatedProject = await storage.getProject(project.id);
      
      // Fetch persisted order items and map to the shape the frontend expects
      const savedItems = await storage.getOrderItemsByProject(project.id);

      res.status(201).json({
        ...(updatedProject || project),
        totalPrice: totalProjectPrice,
        ordExport: combinedOrdText,
        items: savedItems.map(item => ({
          SKU: item.sku,
          NAME: item.description,
          Qty: item.quantity,
          Width: item.width,
          Height: item.height,
          price: item.totalPrice,
          error: item.pricingError,
          productMatched: item.productId !== null,
        })),
      });

    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // Update project data (protected)
  app.put(api.orders.update.path, isAuthenticated, async (req, res) => {
    try {
      console.log(`[Project Update] Received update request:`, JSON.stringify(req.body));
      const input = api.orders.update.input.parse(req.body);
      const projectId = Number(req.params.id);
      console.log(`[Project Update] Parsed input for project ${projectId}:`, JSON.stringify(input));
      
      // Get current project to check if it's synced to Asana
      const existingProject = await storage.getProject(projectId);
      if (!existingProject) {
        return res.status(404).json({ message: 'Project not found' });
      }
      
      const project = await storage.updateProject(projectId, input);
      if (!project) {
        return res.status(404).json({ message: 'Project not found' });
      }
      console.log(`[Project Update] Successfully updated project ${projectId} in database`);
      
      // Track Asana sync status
      let asanaSyncStatus: { synced: boolean; error?: string; fieldNotFound?: boolean } = { synced: false };
      
      // If CIENAPPS JOB NUMBER was updated and project is synced to Asana, sync it to the task
      if ('cienappsJobNumber' in input && existingProject.asanaTaskId) {
        console.log(`[Asana] Syncing CIENAPPS JOB NUMBER to Asana task ${existingProject.asanaTaskId}`);
        try {
          const { tasksApi, projectsApi } = await getAsanaApiInstances();
          const asanaProjectGid = ASANA_PERFECT_FIT_PROJECT_GID;
          
          // Get custom field settings to find CIENAPPS JOB NUMBER field
          const projectDetails = await projectsApi.getProject(asanaProjectGid, { 
            opt_fields: 'custom_field_settings.custom_field.name,custom_field_settings.custom_field.gid,custom_field_settings.custom_field.type'
          });
          
          const customFieldSettings = projectDetails.data.custom_field_settings || [];
          console.log(`[Asana] Found ${customFieldSettings.length} custom fields in project. Fields:`, customFieldSettings.map((s: any) => ({
            name: s.custom_field.name,
            type: s.custom_field.type,
            gid: s.custom_field.gid
          })));
          
          let customFields: Record<string, any> = {};
          
          for (const setting of customFieldSettings) {
            const field = setting.custom_field;
            const name = field.name?.trim();
            
            // Match exact field name "CIENAPPS JOB NUMBER" (case-sensitive)
            if (name === 'CIENAPPS JOB NUMBER' && field.type === 'text') {
              customFields[field.gid] = input.cienappsJobNumber || '';
              console.log(`[Asana] Found CIENAPPS JOB NUMBER field (gid: ${field.gid}), setting to: "${input.cienappsJobNumber}"`);
            }
          }
          
          if (Object.keys(customFields).length > 0) {
            // Update the task's custom fields
            // Note: Asana SDK updateTask signature is (body, taskGid, opts)
            console.log(`[Asana] Calling updateTask for task ${existingProject.asanaTaskId} with custom_fields:`, customFields);
            await tasksApi.updateTask(
              { data: { custom_fields: customFields } },
              existingProject.asanaTaskId,
              {}
            );
            console.log(`[Asana] Successfully updated CIENAPPS JOB NUMBER on task ${existingProject.asanaTaskId}`);
            asanaSyncStatus = { synced: true };
          } else {
            console.log(`[Asana] CIENAPPS JOB NUMBER field not found in Asana project custom fields (or not a text field)`);
            asanaSyncStatus = { synced: false, fieldNotFound: true };
          }
        } catch (asanaError: any) {
          console.error('[Asana] Failed to update CIENAPPS JOB NUMBER:', asanaError.message);
          if (asanaError.response?.body) {
            console.error('[Asana] Error response body:', JSON.stringify(asanaError.response.body));
          }
          asanaSyncStatus = { synced: false, error: asanaError.message };
        }
      } else if ('cienappsJobNumber' in input && !existingProject.asanaTaskId) {
        console.log(`[Asana] Project not synced to Asana yet, skipping CIENAPPS JOB NUMBER sync`);
      }
      
      res.json({ ...project, asanaSyncStatus });
    } catch (err: any) {
      console.error('[Project Update] Error:', err.message, err.stack);
       if (err instanceof z.ZodError) {
          return res.status(400).json({
            message: err.errors[0].message,
            field: err.errors[0].path.join('.'),
          });
        }
        res.status(500).json({ message: err.message });
    }
  });

  // Get file info with project name
  app.get('/api/files/:fileId', isAuthenticated, async (req, res) => {
    try {
      const fileId = Number(req.params.fileId);
      const file = await storage.getFileWithProject(fileId);
      if (!file) {
        return res.status(404).json({ message: 'File not found' });
      }
      res.json(file);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Get CTS parts for a file
  app.get('/api/files/:fileId/cts-parts', isAuthenticated, async (req, res) => {
    try {
      const fileId = Number(req.params.fileId);
      const ctsParts = await storage.getCtsPartsForFile(fileId);
      
      // Get configurations for each part
      const configs = await storage.getAllCtsPartConfigs();
      const configMap = new Map(configs.map(c => [c.partNumber, c]));
      
      // Combine parts with their configs
      const partsWithConfigs = ctsParts.map(part => ({
        ...part,
        config: configMap.get(part.partNumber) || null
      }));
      
      res.json(partsWithConfigs);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Get all CTS part configs
  app.get('/api/cts-configs', isAuthenticated, async (req, res) => {
    try {
      const configs = await storage.getAllCtsPartConfigs();
      res.json(configs);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Upload image for CTS part config (server-side upload to object storage)
  app.post('/api/cts-configs/:partNumber/image', isAuthenticated, upload.single('image'), async (req, res) => {
    try {
      const partNumber = decodeURIComponent(req.params.partNumber);
      const file = req.file;
      
      if (!file) {
        return res.status(400).json({ message: 'No image file provided' });
      }
      
      // Validate file type
      const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
      if (!allowedTypes.includes(file.mimetype)) {
        return res.status(400).json({ message: 'Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed.' });
      }
      
      // Get upload URL and upload to object storage
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      
      // Upload file buffer to the presigned URL
      const uploadResponse = await fetch(uploadURL, {
        method: 'PUT',
        body: file.buffer,
        headers: { 'Content-Type': file.mimetype },
      });
      
      if (!uploadResponse.ok) {
        throw new Error('Failed to upload to object storage');
      }
      
      // Normalize path and set public ACL
      const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);
      const normalizedPath = await objectStorageService.trySetObjectEntityAclPolicy(objectPath, {
        owner: 'system',
        visibility: 'public',
      });
      
      // Get existing config to preserve rack location
      const existingConfigs = await storage.getAllCtsPartConfigs();
      const existingConfig = existingConfigs.find(c => c.partNumber === partNumber);
      
      const config = await storage.upsertCtsPartConfig({
        partNumber,
        imageUrl: normalizedPath,
        rackLocation: existingConfig?.rackLocation || null,
      });
      
      res.json(config);
    } catch (err: any) {
      console.error('CTS image upload error:', err);
      res.status(500).json({ message: err.message });
    }
  });

  // Update CTS part config (rack location only now, image is uploaded separately)
  const ctsConfigUpdateSchema = z.object({
    rackLocation: z.string().nullable().optional(),
  });
  
  app.put('/api/cts-configs/:partNumber', isAuthenticated, async (req, res) => {
    try {
      const partNumber = decodeURIComponent(req.params.partNumber);
      const input = ctsConfigUpdateSchema.parse(req.body);
      
      // Get existing config to preserve image URL
      const existingConfigs = await storage.getAllCtsPartConfigs();
      const existingConfig = existingConfigs.find(c => c.partNumber === partNumber);
      
      const config = await storage.upsertCtsPartConfig({
        partNumber,
        imageUrl: existingConfig?.imageUrl || null,
        rackLocation: input.rackLocation || null,
      });
      
      res.json(config);
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

  // Toggle CTS part cut status
  app.patch('/api/cts-parts/:partId/cut', isAuthenticated, async (req, res) => {
    try {
      const partId = Number(req.params.partId);
      const { isCut } = req.body;
      
      if (typeof isCut !== 'boolean') {
        return res.status(400).json({ message: 'isCut must be a boolean' });
      }
      
      const updated = await storage.updateCtsPartCutStatus(partId, isCut);
      if (!updated) {
        return res.status(404).json({ message: 'CTS part not found' });
      }
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Get CTS parts cut status for a file
  app.get('/api/files/:fileId/cts-status', isAuthenticated, async (req, res) => {
    try {
      const fileId = Number(req.params.fileId);
      const status = await storage.getCtsPartsCutStatus(fileId);
      res.json(status);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Update file notes (protected)
  app.patch('/api/files/:fileId/notes', isAuthenticated, async (req, res) => {
    try {
      const fileId = Number(req.params.fileId);
      const { notes } = req.body;
      
      if (typeof notes !== 'string') {
        return res.status(400).json({ message: 'Notes must be a string' });
      }
      
      const updated = await storage.updateOrderFile(fileId, { notes });
      if (!updated) {
        return res.status(404).json({ message: 'File not found' });
      }
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Update file Allmoxy Job # (protected)
  app.patch('/api/files/:fileId/allmoxy-job', isAuthenticated, async (req, res) => {
    try {
      const fileId = Number(req.params.fileId);
      const { allmoxyJobNumber } = req.body;
      
      if (typeof allmoxyJobNumber !== 'string') {
        return res.status(400).json({ message: 'allmoxyJobNumber must be a string' });
      }
      
      const updated = await storage.updateOrderFile(fileId, { allmoxyJobNumber });
      if (!updated) {
        return res.status(404).json({ message: 'File not found' });
      }

      res.json(updated);

      syncAsanaTaskNotes(updated.projectId, 'Allmoxy Job # change');
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Spec-required path alias for allmoxy job number
  app.patch('/api/files/:fileId/allmoxy-job-number', isAuthenticated, async (req, res) => {
    try {
      const fileId = Number(req.params.fileId);
      const { allmoxyJobNumber } = req.body;
      if (typeof allmoxyJobNumber !== 'string') return res.status(400).json({ message: 'allmoxyJobNumber must be a string' });
      const updated = await storage.updateOrderFile(fileId, { allmoxyJobNumber });
      if (!updated) return res.status(404).json({ message: 'File not found' });
      res.json(updated);
      syncAsanaTaskNotes(updated.projectId, 'Allmoxy Job # change');
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // Update file Packaging Link (protected)
  app.patch('/api/files/:fileId/packaging-link', isAuthenticated, async (req, res) => {
    try {
      const fileId = Number(req.params.fileId);
      const { packagingLink } = req.body;
      
      if (typeof packagingLink !== 'string') {
        return res.status(400).json({ message: 'packagingLink must be a string' });
      }
      
      const updated = await storage.updateOrderFile(fileId, { packagingLink });
      if (!updated) {
        return res.status(404).json({ message: 'File not found' });
      }
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ==================== PALLET MANAGEMENT ENDPOINTS ====================
  
  // Get all pallets for a project with their file assignments (protected)
  app.get('/api/orders/:id/pallets', isAuthenticated, async (req, res) => {
    try {
      const projectId = Number(req.params.id);
      const projectPallets = await storage.getPalletsForProject(projectId);
      
      // Get file assignments for each pallet with full assignment details
      const palletsWithAssignments = await Promise.all(
        projectPallets.map(async (pallet) => {
          const assignments = await storage.getAssignmentsForPallet(pallet.id);
          return {
            ...pallet,
            fileIds: assignments.map(a => a.fileId),
            assignments: assignments.map(a => ({
              id: a.id,
              fileId: a.fileId,
              hardwarePackaged: a.hardwarePackaged ?? false,
              hardwarePackedBy: a.hardwarePackedBy ?? null,
              buyoutHardwareStatuses: a.buyoutHardwareStatuses ?? []
            }))
          };
        })
      );
      
      res.json(palletsWithAssignments);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Create a new pallet with file assignments (protected)
  app.post('/api/orders/:id/pallets', isAuthenticated, async (req, res) => {
    try {
      const projectId = Number(req.params.id);
      const { size, customSize, notes, fileIds } = req.body;
      
      if (!size || typeof size !== 'string') {
        return res.status(400).json({ message: 'size is required' });
      }
      
      // Get next pallet number for this project
      const palletNumber = await storage.getNextPalletNumber(projectId);
      
      // Create the pallet
      const pallet = await storage.createPallet({
        projectId,
        palletNumber,
        size,
        customSize: customSize || null,
        notes: notes || null
      });
      
      // Create file assignments if provided
      let assignedFileIds: number[] = [];
      if (fileIds && Array.isArray(fileIds) && fileIds.length > 0) {
        const assignments = await storage.setAssignmentsForPallet(pallet.id, fileIds);
        assignedFileIds = assignments.map(a => a.fileId);
      }
      
      res.json({
        ...pallet,
        fileIds: assignedFileIds
      });

      if (assignedFileIds.length > 0) {
        syncAsanaTaskNotes(projectId, 'pallet creation with file assignments');
        syncAsanaOrderType(projectId).catch(err => console.error('[Asana] PF ORDER TYPE sync failed after pallet creation:', err.message));
      }
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Update a pallet (protected)
  app.patch('/api/pallets/:palletId', isAuthenticated, async (req, res) => {
    try {
      const palletId = Number(req.params.palletId);
      const { size, customSize, notes, fileIds } = req.body;
      
      // Update pallet fields
      const updates: any = {};
      if (size !== undefined) updates.size = size;
      if (customSize !== undefined) updates.customSize = customSize;
      if (notes !== undefined) updates.notes = notes;
      
      const pallet = await storage.updatePallet(palletId, updates);
      if (!pallet) {
        return res.status(404).json({ message: 'Pallet not found' });
      }
      
      // Update file assignments if provided
      let assignedFileIds: number[] = [];
      let fileAssignmentsChanged = false;
      if (fileIds !== undefined && Array.isArray(fileIds)) {
        const assignments = await storage.setAssignmentsForPallet(palletId, fileIds);
        assignedFileIds = assignments.map(a => a.fileId);
        fileAssignmentsChanged = true;
      } else {
        const assignments = await storage.getAssignmentsForPallet(palletId);
        assignedFileIds = assignments.map(a => a.fileId);
      }
      
      res.json({
        ...pallet,
        fileIds: assignedFileIds
      });

      if (fileAssignmentsChanged || size !== undefined || customSize !== undefined) {
        syncAsanaTaskNotes(pallet.projectId, 'pallet update');
        syncAsanaOrderType(pallet.projectId).catch(err => console.error('[Asana] PF ORDER TYPE sync failed after pallet update:', err.message));
      }
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Delete a pallet (protected)
  app.delete('/api/pallets/:palletId', isAuthenticated, async (req, res) => {
    try {
      const palletId = Number(req.params.palletId);
      const deleted = await storage.deletePallet(palletId);
      if (!deleted) {
        return res.status(404).json({ message: 'Pallet not found' });
      }
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Update pallet final size and sync to Asana PALLET SIZE custom field (protected)
  app.patch('/api/pallets/:palletId/final-size', isAuthenticated, async (req, res) => {
    try {
      const palletId = Number(req.params.palletId);
      const { finalSize } = req.body;
      
      if (typeof finalSize !== 'string') {
        return res.status(400).json({ message: 'finalSize string is required' });
      }
      
      // Get the pallet to find its project
      const existingPallet = await storage.getPallet(palletId);
      if (!existingPallet) {
        return res.status(404).json({ message: 'Pallet not found' });
      }
      
      // Update the pallet's final size
      const pallet = await storage.updatePallet(palletId, { finalSize: finalSize || null });
      if (!pallet) {
        return res.status(404).json({ message: 'Failed to update pallet' });
      }
      
      // Get the project for Asana sync
      const project = await storage.getProject(existingPallet.projectId);
      
      // Get all pallets for this project to build the combined PALLET SIZE string
      const allPallets = await storage.getPalletsForProject(existingPallet.projectId);
      
      // Build newline-separated pallet sizes string
      const palletSizeLines = allPallets
        .sort((a, b) => a.palletNumber - b.palletNumber)
        .filter(p => p.finalSize && p.finalSize.trim())
        .map(p => `PALLET ${p.palletNumber} SIZE: ${p.finalSize}`)
        .join('\n');
      
      // Track Asana sync status
      let asanaSyncStatus: { synced: boolean; error?: string; fieldNotFound?: boolean; notLinked?: boolean } = { synced: false };
      
      // Sync to Asana if project is synced
      console.log(`[Pallet Size] Checking Asana sync for project ${existingPallet.projectId}, asanaTaskId: ${project?.asanaTaskId || 'none'}`);
      console.log(`[Pallet Size] Size lines to sync: ${palletSizeLines}`);
      
      if (project?.asanaTaskId) {
        try {
          const { tasksApi, projectsApi } = await getAsanaApiInstances();
          const asanaProjectGid = ASANA_PERFECT_FIT_PROJECT_GID;
          
          // Get custom field settings to find PALLET SIZE field
          const projectDetails = await projectsApi.getProject(asanaProjectGid, { 
            opt_fields: 'custom_field_settings.custom_field.name,custom_field_settings.custom_field.gid,custom_field_settings.custom_field.type'
          });
          
          const customFieldSettings = projectDetails.data.custom_field_settings || [];
          console.log(`[Pallet Size] Found ${customFieldSettings.length} custom fields`);
          
          // Log all available fields for debugging
          console.log(`[Pallet Size] Available custom fields:`, customFieldSettings.map((s: any) => ({
            name: s.custom_field.name,
            type: s.custom_field.type,
            gid: s.custom_field.gid
          })));
          
          let customFields: Record<string, any> = {};
          
          for (const setting of customFieldSettings) {
            const field = setting.custom_field;
            const fieldName = field.name?.trim();
            
            // Match exact field name "PALLET SIZE"
            if (fieldName === 'PALLET SIZE' && field.type === 'text') {
              customFields[field.gid] = palletSizeLines;
              console.log(`[Pallet Size] Found PALLET SIZE field (gid: ${field.gid}), setting to: ${palletSizeLines}`);
            }
          }
          
          if (Object.keys(customFields).length > 0) {
            // Note: Asana SDK updateTask signature is (body, taskGid, opts)
            await tasksApi.updateTask(
              { data: { custom_fields: customFields } },
              project.asanaTaskId,
              {}
            );
            console.log(`[Asana] Updated PALLET SIZE for task ${project.asanaTaskId}: ${palletSizeLines}`);
            asanaSyncStatus = { synced: true };
          } else {
            console.log(`[Pallet Size] No matching custom fields to update (field may not be type 'text')`);
            asanaSyncStatus = { synced: false, fieldNotFound: true };
          }
        } catch (asanaError: any) {
          console.error('[Asana] Failed to update PALLET SIZE:', asanaError.message);
          asanaSyncStatus = { synced: false, error: asanaError.message };
        }
      } else {
        console.log(`[Pallet Size] Project not synced to Asana, skipping sync`);
        asanaSyncStatus = { synced: false, notLinked: true };
      }
      
      // Return pallet with file assignments and sync status
      const assignments = await storage.getAssignmentsForPallet(palletId);
      res.json({
        ...pallet,
        fileIds: assignments.map(a => a.fileId),
        assignments: assignments.map(a => ({
          id: a.id,
          fileId: a.fileId,
          hardwarePackaged: a.hardwarePackaged ?? false,
          hardwarePackedBy: a.hardwarePackedBy ?? null,
          buyoutHardwareStatuses: a.buyoutHardwareStatuses ?? []
        })),
        asanaSyncStatus
      });

      syncAsanaTaskNotes(existingPallet.projectId, 'pallet final size change');
      syncAsanaOrderType(existingPallet.projectId).catch(err => console.error('[Asana] PF ORDER TYPE sync failed after pallet final size change:', err.message));
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Update pallet packaging status (protected)
  app.patch('/api/pallets/:palletId/packaging-status', isAuthenticated, async (req, res) => {
    try {
      const palletId = Number(req.params.palletId);
      const { packagingStatus } = req.body;
      
      if (!packagingStatus || typeof packagingStatus !== 'object') {
        return res.status(400).json({ message: 'packagingStatus object is required' });
      }
      
      const pallet = await storage.updatePallet(palletId, { packagingStatus });
      if (!pallet) {
        return res.status(404).json({ message: 'Pallet not found' });
      }
      
      // Return pallet with file assignments
      const assignments = await storage.getAssignmentsForPallet(palletId);
      res.json({
        ...pallet,
        fileIds: assignments.map(a => a.fileId)
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Toggle hardware packaged status and update Asana HARDWARE PACKED custom field
  app.patch('/api/pallets/:palletId/hardware-packaged', isAuthenticated, async (req, res) => {
    try {
      const palletId = Number(req.params.palletId);
      const { hardwarePackaged } = req.body;
      
      if (typeof hardwarePackaged !== 'boolean') {
        return res.status(400).json({ message: 'hardwarePackaged boolean is required' });
      }
      
      // Get the pallet to find its project
      const existingPallet = await storage.getPallet(palletId);
      if (!existingPallet) {
        return res.status(404).json({ message: 'Pallet not found' });
      }
      
      // Update the pallet
      const pallet = await storage.updatePallet(palletId, { hardwarePackaged });
      if (!pallet) {
        return res.status(404).json({ message: 'Pallet not found' });
      }
      
      // Get the project to find Asana task
      const project = await storage.getProject(existingPallet.projectId);
      
      // Check ALL pallets for this project to determine HARDWARE PACKED status
      // Only add HARDWARE PACKED if ALL pallets have hardwarePackaged = true
      const allPallets = await storage.getPalletsForProject(existingPallet.projectId);
      const allHardwarePackaged = allPallets.length > 0 && allPallets.every(p => p.hardwarePackaged === true);
      
      // Update local pfProductionStatus based on whether ALL pallets are hardware packed
      const currentStatuses = project?.pfProductionStatus || [];
      let newStatuses: string[];
      
      if (allHardwarePackaged) {
        // Add HARDWARE PACKED if not already present (all pallets are packed)
        if (!currentStatuses.includes('HARDWARE PACKED')) {
          newStatuses = [...currentStatuses, 'HARDWARE PACKED'];
        } else {
          newStatuses = currentStatuses;
        }
      } else {
        // Remove HARDWARE PACKED (not all pallets are packed)
        newStatuses = currentStatuses.filter(s => s !== 'HARDWARE PACKED');
      }
      
      // Update local database
      if (project) {
        await storage.updateProject(project.id, { pfProductionStatus: newStatuses });
      }
      
      // Update Asana HARDWARE PACKED custom field and PF PRODUCTION STATUS if project is synced
      if (project?.asanaTaskId) {
        try {
          const { tasksApi, projectsApi } = await getAsanaApiInstances();
          const asanaProjectGid = ASANA_PERFECT_FIT_PROJECT_GID;
          
          // Get custom field settings to find HARDWARE PACKED field and PF PRODUCTION STATUS
          const projectDetails = await projectsApi.getProject(asanaProjectGid, { 
            opt_fields: 'custom_field_settings.custom_field.name,custom_field_settings.custom_field.gid,custom_field_settings.custom_field.type,custom_field_settings.custom_field.enum_options'
          });
          
          const customFieldSettings = projectDetails.data.custom_field_settings || [];
          let customFields: Record<string, any> = {};
          
          for (const setting of customFieldSettings) {
            const field = setting.custom_field;
            const name = field.name?.toUpperCase().trim();
            
            if (name === 'HARDWARE PACKED') {
              // Handle different field types - use allHardwarePackaged (all pallets packed)
              if (field.type === 'enum' && field.enum_options) {
                // Find the enum option that matches "Yes" or "No" 
                const yesOption = field.enum_options.find((o: any) => 
                  o.name?.toLowerCase() === 'yes' || o.name?.toLowerCase() === 'true'
                );
                const noOption = field.enum_options.find((o: any) => 
                  o.name?.toLowerCase() === 'no' || o.name?.toLowerCase() === 'false'
                );
                
                if (allHardwarePackaged && yesOption) {
                  customFields[field.gid] = yesOption.gid;
                } else if (!allHardwarePackaged && noOption) {
                  customFields[field.gid] = noOption.gid;
                }
              } else if (field.type === 'text') {
                customFields[field.gid] = allHardwarePackaged ? 'Yes' : 'No';
              }
            } else if (name === 'PF PRODUCTION STATUS' && field.type === 'multi_enum' && field.enum_options) {
              // Update PF PRODUCTION STATUS multi-select
              const selectedGids = newStatuses.map((statusName: string) => {
                const opt = field.enum_options.find((o: any) => 
                  o.name?.toUpperCase().trim() === statusName.toUpperCase().trim()
                );
                return opt?.gid;
              }).filter(Boolean);
              
              customFields[field.gid] = selectedGids;
            }
          }
          
          if (Object.keys(customFields).length > 0) {
            // Note: Asana SDK updateTask signature is (body, taskGid, opts)
            await tasksApi.updateTask(
              { data: { custom_fields: customFields } },
              project.asanaTaskId,
              {}
            );
            console.log(`[Asana] Updated HARDWARE PACKED to ${allHardwarePackaged} (all pallets packed: ${allHardwarePackaged}) and PF PRODUCTION STATUS for task ${project.asanaTaskId}`);
          }
        } catch (asanaError: any) {
          console.error('[Asana] Failed to update HARDWARE PACKED:', asanaError.message);
          // Don't fail the request if Asana update fails
        }
      }
      
      // Return pallet with file assignments
      const assignments = await storage.getAssignmentsForPallet(palletId);
      res.json({
        ...pallet,
        fileIds: assignments.map(a => a.fileId),
        assignments: assignments.map(a => ({
          id: a.id,
          fileId: a.fileId,
          hardwarePackaged: a.hardwarePackaged ?? false,
          hardwarePackedBy: a.hardwarePackedBy ?? null,
          buyoutHardwareStatuses: a.buyoutHardwareStatuses ?? []
        }))
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Toggle per-order (assignment) hardware packaged status
  app.patch('/api/assignments/:assignmentId/hardware-packaged', isAuthenticated, async (req, res) => {
    try {
      const assignmentId = Number(req.params.assignmentId);
      const { hardwarePackaged, hardwarePackedBy } = req.body;
      
      if (typeof hardwarePackaged !== 'boolean') {
        return res.status(400).json({ message: 'hardwarePackaged boolean is required' });
      }
      
      // If marking as packed, require the packer's name
      if (hardwarePackaged && (!hardwarePackedBy || typeof hardwarePackedBy !== 'string' || hardwarePackedBy.trim() === '')) {
        return res.status(400).json({ message: 'hardwarePackedBy is required when marking hardware as packed' });
      }
      
      // Get the assignment to find its pallet
      const assignment = await storage.getAssignment(assignmentId);
      if (!assignment) {
        return res.status(404).json({ message: 'Assignment not found' });
      }
      
      // Update the assignment's hardware status
      const updated = await storage.updateAssignmentHardwareStatus(assignmentId, hardwarePackaged, hardwarePackedBy?.trim());
      if (!updated) {
        return res.status(404).json({ message: 'Failed to update assignment' });
      }
      
      // Get the pallet to find the project
      const pallet = await storage.getPallet(assignment.palletId);
      if (!pallet) {
        return res.status(404).json({ message: 'Pallet not found' });
      }
      
      // Check if all assignments in this pallet are hardware packaged
      const palletAssignments = await storage.getAssignmentsForPallet(pallet.id);
      const allAssignmentsPackaged = palletAssignments.length > 0 && 
        palletAssignments.every(a => a.hardwarePackaged === true);
      
      // Update the pallet-level hardwarePackaged status (derived aggregate)
      await storage.updatePallet(pallet.id, { hardwarePackaged: allAssignmentsPackaged });
      
      // Get the project to check/update Asana
      const project = await storage.getProject(pallet.projectId);
      
      // Check ALL pallets for this project to determine project-level HARDWARE PACKED status
      const allPallets = await storage.getPalletsForProject(pallet.projectId);
      
      // For each pallet, check if all its assignments are hardware packed
      let allProjectAssignmentsPacked = true;
      for (const p of allPallets) {
        const pAssignments = await storage.getAssignmentsForPallet(p.id);
        if (pAssignments.length > 0 && !pAssignments.every(a => a.hardwarePackaged === true)) {
          allProjectAssignmentsPacked = false;
          break;
        }
      }
      
      // Update local pfProductionStatus based on whether ALL assignments in ALL pallets are packed
      const currentStatuses = project?.pfProductionStatus || [];
      let newStatuses: string[];
      
      if (allProjectAssignmentsPacked && allPallets.length > 0) {
        // Add HARDWARE PACKED if not already present
        if (!currentStatuses.includes('HARDWARE PACKED')) {
          newStatuses = [...currentStatuses, 'HARDWARE PACKED'];
        } else {
          newStatuses = currentStatuses;
        }
      } else {
        // Remove HARDWARE PACKED
        newStatuses = currentStatuses.filter(s => s !== 'HARDWARE PACKED');
      }
      
      // Update local database
      if (project) {
        await storage.updateProject(project.id, { pfProductionStatus: newStatuses });
      }
      
      // Update Asana if project is synced
      if (project?.asanaTaskId) {
        try {
          const { tasksApi, projectsApi } = await getAsanaApiInstances();
          const asanaProjectGid = ASANA_PERFECT_FIT_PROJECT_GID;
          
          const projectDetails = await projectsApi.getProject(asanaProjectGid, { 
            opt_fields: 'custom_field_settings.custom_field.name,custom_field_settings.custom_field.gid,custom_field_settings.custom_field.type,custom_field_settings.custom_field.enum_options'
          });
          
          const customFieldSettings = projectDetails.data.custom_field_settings || [];
          let customFields: Record<string, any> = {};
          
          for (const setting of customFieldSettings) {
            const field = setting.custom_field;
            const name = field.name?.toUpperCase().trim();
            
            if (name === 'HARDWARE PACKED') {
              if (field.type === 'enum' && field.enum_options) {
                const yesOption = field.enum_options.find((o: any) => 
                  o.name?.toLowerCase() === 'yes' || o.name?.toLowerCase() === 'true'
                );
                const noOption = field.enum_options.find((o: any) => 
                  o.name?.toLowerCase() === 'no' || o.name?.toLowerCase() === 'false'
                );
                
                if (allProjectAssignmentsPacked && yesOption) {
                  customFields[field.gid] = yesOption.gid;
                } else if (!allProjectAssignmentsPacked && noOption) {
                  customFields[field.gid] = noOption.gid;
                }
              } else if (field.type === 'text') {
                customFields[field.gid] = allProjectAssignmentsPacked ? 'Yes' : 'No';
              }
            } else if (name === 'PF PRODUCTION STATUS' && field.type === 'multi_enum' && field.enum_options) {
              const selectedGids = newStatuses.map((statusName: string) => {
                const opt = field.enum_options.find((o: any) => 
                  o.name?.toUpperCase().trim() === statusName.toUpperCase().trim()
                );
                return opt?.gid;
              }).filter(Boolean);
              
              customFields[field.gid] = selectedGids;
            }
          }
          
          if (Object.keys(customFields).length > 0) {
            // Note: Asana SDK updateTask signature is (body, taskGid, opts)
            await tasksApi.updateTask(
              { data: { custom_fields: customFields } },
              project.asanaTaskId,
              {}
            );
            console.log(`[Asana] Updated HARDWARE PACKED via assignment toggle for task ${project.asanaTaskId}`);
          }
        } catch (asanaError: any) {
          console.error('[Asana] Failed to update HARDWARE PACKED:', asanaError.message);
        }
      }
      
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Update buyout hardware statuses for an assignment (multi-select)
  app.patch('/api/assignments/:assignmentId/buyout-statuses', isAuthenticated, async (req, res) => {
    try {
      const assignmentId = Number(req.params.assignmentId);
      const { buyoutHardwareStatuses } = req.body;
      
      // Valid status options
      const validOptions = ['WAITING FOR BO HARDWARE', 'BO HARDWARE ARRIVED', 'NO BUYOUT HARDWARE'];
      
      // Validate the statuses array
      if (!Array.isArray(buyoutHardwareStatuses)) {
        return res.status(400).json({ message: 'buyoutHardwareStatuses must be an array' });
      }
      
      for (const status of buyoutHardwareStatuses) {
        if (!validOptions.includes(status)) {
          return res.status(400).json({ message: `Invalid status: ${status}. Must be one of: ${validOptions.join(', ')}` });
        }
      }
      
      // Get the assignment to verify it exists
      const assignment = await storage.getAssignment(assignmentId);
      if (!assignment) {
        return res.status(404).json({ message: 'Assignment not found' });
      }
      
      // Update the assignment's buyout statuses
      const updated = await storage.updateAssignmentBuyoutStatuses(assignmentId, buyoutHardwareStatuses);
      if (!updated) {
        return res.status(404).json({ message: 'Failed to update assignment' });
      }
      
      // Update the project's PF PRODUCTION STATUS based on buyout statuses across ALL pallets
      let updatedPfProductionStatus: string[] | null = null;
      const fileWithProject = await storage.getFileWithProject(assignment.fileId);
      if (fileWithProject) {
        const project = await storage.getProject(fileWithProject.file.projectId);
        if (project) {
          let currentStatuses = project.pfProductionStatus || [];
          
          // Define the buyout-related PF statuses
          const BO_ARRIVED = 'BO HARDWARE ARRIVED';
          const BO_MISSING = 'WAITING FOR BO HARDWARE';
          
          // Get all pallets for this project and aggregate buyout statuses across all assignments
          const allPallets = await storage.getPalletsForProject(project.id);
          let anyHasWaiting = false;
          let countWithBuyoutHardware = 0; // Assignments that have buyout hardware (not "NO BUYOUT" only)
          let countWithArrived = 0; // Assignments that have ARRIVED selected
          
          for (const pallet of allPallets) {
            const palletAssignments = await storage.getAssignmentsForPallet(pallet.id);
            for (const a of palletAssignments) {
              const statuses = a.buyoutHardwareStatuses || [];
              
              // Check if this assignment has buyout hardware (WAITING or ARRIVED, not just NO BUYOUT)
              const hasBuyoutHardware = statuses.includes('WAITING FOR BO HARDWARE') || statuses.includes('BO HARDWARE ARRIVED');
              
              if (hasBuyoutHardware) {
                countWithBuyoutHardware++;
                
                // Check if this assignment has WAITING
                if (statuses.includes('WAITING FOR BO HARDWARE')) {
                  anyHasWaiting = true;
                }
                
                // Check if this assignment has ARRIVED
                if (statuses.includes('BO HARDWARE ARRIVED')) {
                  countWithArrived++;
                }
              }
              // Assignments with only "NO BUYOUT HARDWARE" or empty are not counted
            }
          }
          
          // Remove both buyout-related statuses first
          currentStatuses = currentStatuses.filter(s => s !== BO_ARRIVED && s !== BO_MISSING);
          
          // Apply priority logic:
          // - If ANY assignment has WAITING → add WAITING FOR BO HARDWARE (takes precedence)
          // - Only if ALL assignments with buyout hardware have ARRIVED (and none have WAITING) → add BO HARDWARE ARRIVED
          if (anyHasWaiting) {
            currentStatuses.push(BO_MISSING);
          } else if (countWithBuyoutHardware > 0 && countWithArrived === countWithBuyoutHardware) {
            // All assignments with buyout hardware have ARRIVED selected
            currentStatuses.push(BO_ARRIVED);
          }
          // If no assignments have buyout hardware, neither status is added
          
          await storage.updateProject(project.id, { pfProductionStatus: currentStatuses });
          updatedPfProductionStatus = currentStatuses;
          
          // Sync to Asana if the project is linked
          if (project.asanaTaskId) {
            try {
              const { tasksApi, projectsApi } = await getAsanaApiInstances();
              const asanaProjectGid = ASANA_PERFECT_FIT_PROJECT_GID;
              
              // Get custom field settings to find PF PRODUCTION STATUS field
              const projectDetails = await projectsApi.getProject(asanaProjectGid, { 
                opt_fields: 'custom_field_settings.custom_field.name,custom_field_settings.custom_field.gid,custom_field_settings.custom_field.type,custom_field_settings.custom_field.enum_options'
              });
              
              const customFieldSettings = projectDetails.data.custom_field_settings || [];
              const customFields: Record<string, any> = {};
              
              for (const setting of customFieldSettings) {
                const field = setting.custom_field;
                const name = field?.name?.toUpperCase().trim();
                
                if (name === 'PF PRODUCTION STATUS' && field.type === 'multi_enum' && field.enum_options) {
                  // Map selected status names to their GIDs (empty array if no statuses)
                  const selectedGids = currentStatuses.map((statusName: string) => {
                    const opt = field.enum_options.find((o: any) => 
                      o.name?.toUpperCase().trim() === statusName.toUpperCase().trim()
                    );
                    return opt?.gid;
                  }).filter(Boolean);
                  
                  // Always set the field, even if empty (to clear previous selections)
                  customFields[field.gid] = selectedGids;
                  break; // Found the field, no need to continue
                }
              }
              
              // Always update Asana when we found the PF PRODUCTION STATUS field
              if (Object.keys(customFields).length > 0) {
                await tasksApi.updateTask(
                  { data: { custom_fields: customFields } },
                  project.asanaTaskId,
                  {}
                );
                console.log(`[Asana] Updated PF PRODUCTION STATUS via buyout hardware statuses for task ${project.asanaTaskId} with ${currentStatuses.length} statuses`);
              }
            } catch (asanaError: any) {
              console.error('[Asana] Failed to update PF PRODUCTION STATUS:', asanaError.message);
              // Don't fail the request if Asana update fails
            }
          }
        }
      }
      
      // Return both the assignment and the updated PF production status
      res.json({ ...updated, pfProductionStatus: updatedPfProductionStatus });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Get file assignments info for all files in a project (to show which files are on which pallets)
  app.get('/api/orders/:id/file-pallet-info', isAuthenticated, async (req, res) => {
    try {
      const projectId = Number(req.params.id);
      const files = await storage.getProjectFiles(projectId);
      
      // Get pallet assignments for each file
      const fileInfo = await Promise.all(
        files.map(async (file) => {
          const assignments = await storage.getAssignmentsForFile(file.id);
          return {
            fileId: file.id,
            filename: file.originalFilename,
            palletIds: assignments.map(a => a.palletId),
            palletCount: assignments.length
          };
        })
      );
      
      res.json(fileInfo);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Sync project to Asana (duplicates template task and updates it) (protected)
  app.post(api.orders.sync.path, isAuthenticated, async (req, res) => {
    const project = await storage.getProject(Number(req.params.id));
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    const projectFiles = await storage.getProjectFiles(project.id);

    try {
      const { tasksApi, projectsApi, jobsApi, usersApi } = await getAsanaApiInstances();
      
      const me = await usersApi.getUser('me');
      const workspaceId = me.data.workspaces[0].gid;

      // Use the configured Perfect Fit Production project GID
      const asanaProjectGid = ASANA_PERFECT_FIT_PROJECT_GID;
      let templateTaskGid: string | undefined;
      
      try {
        // Find template task in the project
        const projectTasks = await tasksApi.getTasksForProject(asanaProjectGid, { opt_fields: 'name,gid' });
        
        const templateTask = projectTasks.data?.find((t: any) => 
          t.name.includes('ORDER TEMPLATE')
        );
        if (templateTask) {
          console.log("Found template task:", templateTask.name);
          templateTaskGid = templateTask.gid;
        }
      } catch (e: any) {
        console.error("Error finding template task:", e.response?.body || e);
      }

      let totalCoreParts = 0;
      let totalDovetails = 0;
      let totalAssembledDrawers = 0;
      let totalFivePiece = 0;
      let hasDoubleThick = false;
      let hasShakerDoors = false;
      let hasGlassParts = false;
      let hasGlassShelves = false;
      let hasMJDoors = false;
      let hasRichelieuDoors = false;
      let overallMaxLength = 0;
      let overallMaxWidth = 0;
      let hasCTSParts = false;

      // Use stored values from database instead of re-parsing CSV
      for (const file of projectFiles) {
        totalCoreParts += file.coreParts || 0;
        totalDovetails += file.dovetails || 0;
        totalAssembledDrawers += file.assembledDrawers || 0;
        totalFivePiece += file.fivePieceDoors || 0;
        if (file.hasDoubleThick) hasDoubleThick = true;
        if (file.hasShakerDoors) hasShakerDoors = true;
        if (file.hasGlassParts) hasGlassParts = true;
        if ((file.glassShelves || 0) > 0) hasGlassShelves = true;
        if (file.hasMJDoors) hasMJDoors = true;
        if (file.hasRichelieuDoors) hasRichelieuDoors = true;
        if ((file.maxLength || 0) > overallMaxLength) overallMaxLength = file.maxLength || 0;
        if ((file.maxWidth || 0) > overallMaxWidth) overallMaxWidth = file.maxWidth || 0;
        
        // Check for CTS parts using stored data
        const ctsCount = await storage.getCtsPartsCountForFile(file.id);
        if (ctsCount > 0) hasCTSParts = true;
      }

      const taskName = `(PERFECT FIT) ${project.name}`;
      
      // Build project app link for Asana description
      // Priority: Custom domain > published domain > dev domain
      const customDomain = process.env.CUSTOM_APP_DOMAIN;
      const publishedDomain = process.env.REPLIT_DOMAINS?.split(',')[0];
      const devDomain = process.env.REPLIT_DEV_DOMAIN;
      const appDomain = customDomain || publishedDomain || devDomain || '';
      const projectAppUrl = appDomain ? `https://${appDomain}/orders/${project.id}` : '';
      
      // Build task description with file names and Allmoxy Job numbers (plain text)
      let taskNotes = '';
      
      // Add packaging link first
      if (projectAppUrl) {
        taskNotes += `Packaging Link: ${projectAppUrl}\n\n`;
      }
      
      // Add each file name with its Allmoxy Job # (remove .csv extension)
      for (const file of projectFiles) {
        let fileName = file.originalFilename || 'Unknown File';
        // Remove .csv extension if present
        if (fileName.toLowerCase().endsWith('.csv')) {
          fileName = fileName.slice(0, -4);
        }
        const jobNumber = file.allmoxyJobNumber || 'N/A';
        taskNotes += `${fileName} - ${jobNumber}\n`;
      }

      let newTaskGid: string;

      if (project.asanaTaskId && project.status === 'synced') {
        newTaskGid = project.asanaTaskId;
        console.log('[Asana] Updating existing task:', newTaskGid);
        
        try {
          await tasksApi.updateTask({ data: { name: taskName, ...(taskNotes && { notes: taskNotes }) } }, newTaskGid, {});
        } catch (updateErr: any) {
          console.error('[Asana] Failed to update existing task:', updateErr.message);
          throw new Error('Failed to update existing Asana task: ' + updateErr.message);
        }
      } else if (templateTaskGid) {
        const duplicateResult = await tasksApi.duplicateTask(
          { data: { name: taskName, include: ['notes', 'subtasks', 'projects', 'tags'] } },
          templateTaskGid,
          {}
        );

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
        
        if (taskNotes) {
          try {
            console.log('[Asana] Updating task notes:', taskNotes);
            await tasksApi.updateTask({ data: { notes: taskNotes } }, newTaskGid, {});
            console.log('[Asana] Successfully updated notes');
          } catch (notesError: any) {
            console.error('[Asana] Failed to update notes:', notesError.message);
          }
        }

      } else {
        console.log('Template task not found, creating task from scratch');
        
        const taskData: any = {
          name: taskName,
          projects: [asanaProjectGid],
          ...(taskNotes && { notes: taskNotes }),
        };

        const task = await tasksApi.createTask({ data: taskData });
        newTaskGid = task.data.gid;
      }

      // Get pallets for packaging cost calculation
      const projectPallets = await storage.getPalletsForProject(project.id);
      const palletCount = projectPallets.length;
      const packagingCost = palletCount * 150; // $150 per pallet
      
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
          if ((name === 'PERFECT FIT DEALER' || name === 'PF DEALER') && field.type === 'text') {
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
          } else if ((name === 'ORDER ID' || name === 'PF ORDER ID') && field.type === 'text') {
            if (project.orderId) customFields[field.gid] = project.orderId;
          } else if ((name === 'ORDER ID' || name === 'PF ORDER ID') && field.type === 'number') {
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
            const fileNames = projectFiles.map(f => {
              let name = f.originalFilename || 'Unknown File';
              if (name.toLowerCase().endsWith('.csv')) {
                name = name.slice(0, -4);
              }
              return name;
            });
            if (fileNames.length > 0) {
              customFields[field.gid] = fileNames.join('\n');
            }
          } else if ((name === 'PF 5016 FORM NEEDED' || name === 'PF 5016 FORM NEEDED?' || name === 'PF 5106 FORM NEEDED' || name === 'PF 5106 FORM NEEDED?') && field.type === 'enum' && field.enum_options) {
            // Detect if address is Canadian or US
            // Canadian postal codes: A1A 1A1 pattern (letter-number-letter space number-letter-number)
            // Canadian provinces: AB, BC, MB, NB, NL, NS, NT, NU, ON, PE, QC, SK, YT
            const canadianPostalCodePattern = /[A-Z]\d[A-Z]\s?\d[A-Z]\d/i;
            const canadianProvinces = ['AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'NT', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT'];
            
            let isCanadian = false;
            if (project.shippingAddress) {
              const addr = project.shippingAddress.toUpperCase();
              // Check for Canadian postal code pattern
              if (canadianPostalCodePattern.test(addr)) {
                isCanadian = true;
              }
              // Check for Canadian province codes (with word boundaries)
              for (const prov of canadianProvinces) {
                if (new RegExp(`\\b${prov}\\b`).test(addr)) {
                  isCanadian = true;
                  break;
                }
              }
              // Check for "CANADA" in address
              if (addr.includes('CANADA')) {
                isCanadian = true;
              }
            }
            
            // US = YES, Canada = NO
            const option = field.enum_options.find((o: any) => 
              o.name.toLowerCase() === (isCanadian ? 'no' : 'yes')
            );
            if (option) customFields[field.gid] = option.gid;
          } else if (name === 'PACKAGING COST' && field.type === 'number') {
            // Calculate packaging cost: number of pallets × $150
            customFields[field.gid] = packagingCost;
          } else if (name === 'PACKAGING COST' && field.type === 'text') {
            // Fallback for text field type
            customFields[field.gid] = `$${packagingCost}`;
          } else if (name === 'CIENAPPS JOB NUMBER' && field.type === 'text') {
            // Sync CIENAPPS JOB NUMBER to Asana if we have a local value
            if (project.cienappsJobNumber) {
              customFields[field.gid] = project.cienappsJobNumber;
            }
          }
        }
        
        // Use already-saved pfProductionStatus from project (set during import)
        // This includes auto-derived statuses AND BO statuses from hardware checklist
        const statusesToSync = project.pfProductionStatus || [];
        
        // Set PF PRODUCTION STATUS using existing project statuses
        if (statusesToSync.length > 0) {
          for (const setting of customFieldSettings) {
            const field = setting.custom_field;
            const name = field.name?.toUpperCase().trim();
            
            if (name === 'PF PRODUCTION STATUS' && field.type === 'multi_enum' && field.enum_options) {
              // Map status names to their GIDs
              const selectedGids = statusesToSync
                .map((statusName: string) => {
                  const option = field.enum_options.find((o: any) => 
                    o.name?.toUpperCase().trim() === statusName.toUpperCase().trim()
                  );
                  return option?.gid;
                })
                .filter((gid: string | undefined) => gid);
              
              if (selectedGids.length > 0) {
                customFields[field.gid] = selectedGids;
                console.log('[Asana] Syncing production statuses from project:', statusesToSync);
              }
              break;
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

      // Update project status in our database (keep existing pfProductionStatus, just mark as synced)
      const updatedProject = await storage.updateProject(project.id, {
        asanaTaskId: newTaskGid,
        status: 'synced'
      });

      res.json(updatedProject);

    } catch (e: any) {
      console.error("Asana Sync Error:", e.response?.body || e);
      res.status(400).json({ message: 'Failed to sync to Asana: ' + (e.response?.body?.errors?.[0]?.message || e.message) });
    }
  });

  // Sync PF ORDER STATUS and PF PRODUCTION STATUS from Asana (protected)
  app.post('/api/orders/:id/sync-asana-status', isAuthenticated, async (req, res) => {
    try {
      const project = await storage.getProject(Number(req.params.id));
      if (!project) {
        return res.status(404).json({ message: 'Project not found' });
      }
      
      if (!project.asanaTaskId) {
        return res.status(400).json({ message: 'Project not synced to Asana yet' });
      }
      
      const { tasksApi } = await getAsanaApiInstances();
      
      // Get the task with memberships to directly get section info (more efficient than iterating sections)
      const taskResponse = await tasksApi.getTask(project.asanaTaskId, { 
        opt_fields: 'name,projects.name,projects.gid,memberships.section.name,memberships.project.gid,custom_fields.name,custom_fields.display_value,custom_fields.multi_enum_values.name' 
      });
      
      const customFields = taskResponse.data.custom_fields || [];
      const taskProjects = taskResponse.data.projects || [];
      const memberships = taskResponse.data.memberships || [];
      
      let pfOrderStatus: string | null = null;
      let pfProductionStatus: string[] = [];
      let asanaSection: string | null = null;
      let cienappsJobNumber: string | null = null;
      
      console.log('[Asana Sync] Task ID:', project.asanaTaskId);
      console.log('[Asana Sync] Task projects:', taskProjects.map((p: any) => ({ gid: p.gid, name: p.name })));
      console.log('[Asana Sync] Task memberships:', JSON.stringify(memberships, null, 2));
      
      // Find the section from memberships for PERFECT FIT PRODUCTION project
      // First try matching by configured GID
      let perfectFitMembership = memberships.find((m: any) => m.project?.gid === ASANA_PERFECT_FIT_PROJECT_GID);
      
      // If not found by GID, try name matching
      if (!perfectFitMembership) {
        const perfectFitProject = taskProjects.find((p: any) => 
          p.name?.toUpperCase().includes('PERFECT FIT PRODUCTION')
        );
        if (perfectFitProject) {
          perfectFitMembership = memberships.find((m: any) => m.project?.gid === perfectFitProject.gid);
        }
      }
      
      if (perfectFitMembership && perfectFitMembership.section) {
        asanaSection = perfectFitMembership.section.name;
        console.log('[Asana Sync] Found section from membership:', asanaSection);
      } else {
        console.log('[Asana Sync] No section found. Looking for project GID:', ASANA_PERFECT_FIT_PROJECT_GID);
        console.log('[Asana Sync] Available project GIDs:', taskProjects.map((p: any) => p.gid));
      }
      
      for (const field of customFields) {
        const name = field.name?.toUpperCase().trim();
        
        if (name === 'PF ORDER STATUS') {
          pfOrderStatus = field.display_value || null;
        } else if (name === 'PF PRODUCTION STATUS') {
          // Multi-select field - get all selected values
          if (field.multi_enum_values && Array.isArray(field.multi_enum_values)) {
            pfProductionStatus = field.multi_enum_values.map((v: any) => v.name);
          }
        } else if (name === 'CIENAPPS JOB NUMBER') {
          // Text field - use display_value
          cienappsJobNumber = field.display_value || null;
        }
      }
      
      // Update project with fetched values
      const updated = await storage.updateProject(project.id, {
        pfOrderStatus,
        pfProductionStatus,
        asanaSection,
        cienappsJobNumber,
        lastAsanaSyncAt: new Date()
      });
      
      res.json(updated);
    } catch (e: any) {
      console.error("Asana Status Sync Error:", e.response?.body || e);
      res.status(400).json({ message: 'Failed to sync status from Asana: ' + (e.response?.body?.errors?.[0]?.message || e.message) });
    }
  });

  // Update PF PRODUCTION STATUS in both app and Asana (two-way sync) (protected)
  app.patch('/api/orders/:id/production-status', isAuthenticated, async (req, res) => {
    try {
      const project = await storage.getProject(Number(req.params.id));
      if (!project) {
        return res.status(404).json({ message: 'Project not found' });
      }
      
      const { pfProductionStatus } = req.body;
      
      if (!Array.isArray(pfProductionStatus)) {
        return res.status(400).json({ message: 'pfProductionStatus must be an array' });
      }
      
      // Update locally first
      const updated = await storage.updateProject(project.id, { pfProductionStatus });
      
      // If synced to Asana, update Asana too
      if (project.asanaTaskId) {
        try {
          const { tasksApi, projectsApi } = await getAsanaApiInstances();
          
          // Use the configured Perfect Fit Production project GID
          const asanaProjectGid = ASANA_PERFECT_FIT_PROJECT_GID;
          
          {
            // Get custom field settings to find PF PRODUCTION STATUS field
            const projectDetails = await projectsApi.getProject(asanaProjectGid, { 
              opt_fields: 'custom_field_settings.custom_field.name,custom_field_settings.custom_field.gid,custom_field_settings.custom_field.type,custom_field_settings.custom_field.enum_options'
            });
            
            const customFieldSettings = projectDetails.data.custom_field_settings || [];
            
            for (const setting of customFieldSettings) {
              const field = setting.custom_field;
              const name = field.name?.toUpperCase().trim();
              
              if (name === 'PF PRODUCTION STATUS' && field.type === 'multi_enum' && field.enum_options) {
                // Map selected status names to their GIDs
                const selectedGids = pfProductionStatus.map((statusName: string) => {
                  const option = field.enum_options.find((o: any) => o.name === statusName);
                  return option?.gid;
                }).filter(Boolean);
                
                // Update the task's custom field
                await tasksApi.updateTask({ 
                  data: { 
                    custom_fields: { [field.gid]: selectedGids }
                  } 
                }, project.asanaTaskId, {});
                
                break;
              }
            }
          }
        } catch (asanaErr: any) {
          console.error("Failed to update Asana production status:", asanaErr.response?.body || asanaErr);
          // Don't fail the request - local update succeeded
        }
      }
      
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Update/Re-link Asana task ID for an order (protected)
  app.patch('/api/orders/:id/asana-task', isAuthenticated, async (req, res) => {
    try {
      const project = await storage.getProject(Number(req.params.id));
      if (!project) {
        return res.status(404).json({ message: 'Project not found' });
      }
      
      const { asanaTaskId } = req.body;
      
      if (asanaTaskId !== null && typeof asanaTaskId !== 'string') {
        return res.status(400).json({ message: 'asanaTaskId must be a string or null' });
      }
      
      // Validate non-empty string if provided
      if (typeof asanaTaskId === 'string' && asanaTaskId.trim() === '') {
        return res.status(400).json({ message: 'asanaTaskId cannot be empty' });
      }
      
      // Update the project with the new Asana task ID
      const updated = await storage.updateProject(project.id, { 
        asanaTaskId: asanaTaskId || null,
        status: asanaTaskId ? 'synced' : 'pending'
      });
      
      console.log(`[Asana] Updated task ID for project ${project.id}: ${asanaTaskId}`);
      res.json(updated);
    } catch (err: any) {
      console.error('[Asana] Error updating task ID:', err);
      res.status(500).json({ message: err.message });
    }
  });

  // Background sync all synced projects from Asana (called by cron job)
  app.post('/api/sync-all-asana-status', async (req, res) => {
    try {
      // Get all synced projects
      const projects = await storage.getProjects();
      const syncedProjects = projects.filter(p => p.status === 'synced' && p.asanaTaskId);
      
      if (syncedProjects.length === 0) {
        return res.json({ message: 'No synced projects to update', updated: 0 });
      }
      
      const { tasksApi } = await getAsanaApiInstances();
      let updatedCount = 0;
      
      for (const proj of syncedProjects) {
        try {
          // Use memberships to get section directly - much more efficient
          const taskResponse = await tasksApi.getTask(proj.asanaTaskId!, { 
            opt_fields: 'projects.name,projects.gid,memberships.section.name,memberships.project.gid,custom_fields.name,custom_fields.display_value,custom_fields.multi_enum_values.name' 
          });
          
          const customFields = taskResponse.data.custom_fields || [];
          const taskProjects = taskResponse.data.projects || [];
          const memberships = taskResponse.data.memberships || [];
          
          let pfOrderStatus: string | null = null;
          let pfProductionStatus: string[] = [];
          let asanaSection: string | null = null;
          
          // Find the section from memberships for PERFECT FIT PRODUCTION project
          let perfectFitMembership = memberships.find((m: any) => m.project?.gid === ASANA_PERFECT_FIT_PROJECT_GID);
          
          if (!perfectFitMembership) {
            const perfectFitProject = taskProjects.find((p: any) => 
              p.name?.toUpperCase().includes('PERFECT FIT PRODUCTION')
            );
            if (perfectFitProject) {
              perfectFitMembership = memberships.find((m: any) => m.project?.gid === perfectFitProject.gid);
            }
          }
          
          if (perfectFitMembership && perfectFitMembership.section) {
            asanaSection = perfectFitMembership.section.name;
          }
          
          let cienappsJobNumber: string | null = null;
          
          for (const field of customFields) {
            const name = field.name?.toUpperCase().trim();
            
            if (name === 'PF ORDER STATUS') {
              pfOrderStatus = field.display_value || null;
            } else if (name === 'PF PRODUCTION STATUS') {
              if (field.multi_enum_values && Array.isArray(field.multi_enum_values)) {
                pfProductionStatus = field.multi_enum_values.map((v: any) => v.name);
              }
            } else if (name === 'CIENAPPS JOB NUMBER') {
              cienappsJobNumber = field.display_value || null;
            }
          }
          
          await storage.updateProject(proj.id, {
            pfOrderStatus,
            pfProductionStatus,
            asanaSection,
            cienappsJobNumber,
            lastAsanaSyncAt: new Date()
          });
          
          updatedCount++;
        } catch (projErr) {
          console.error(`Failed to sync project ${proj.id}:`, projErr);
        }
      }
      
      res.json({ message: `Synced ${updatedCount} projects`, updated: updatedCount });
    } catch (e: any) {
      console.error("Batch Asana Sync Error:", e);
      res.status(500).json({ message: 'Failed to sync from Asana' });
    }
  });


  // Regenerate packing slip checklist from stored CSV content
  app.post('/api/files/:fileId/reparse-packing-slip', isAuthenticated, async (req, res) => {
    try {
      const fileId = Number(req.params.fileId);
      const orderFile = await storage.getOrderFile(fileId);
      
      if (!orderFile) {
        return res.status(404).json({ message: 'Order file not found' });
      }
      
      if (!orderFile.rawContent) {
        return res.status(400).json({ message: 'No CSV content stored for this order' });
      }
      
      // Regenerate packing slip checklist from stored CSV
      const result = await generatePackingSlipChecklistForFile(fileId, orderFile.rawContent);
      
      if (!result.success) {
        return res.status(400).json({ 
          message: result.error || 'Failed to regenerate checklist',
          itemsCreated: 0
        });
      }
      
      console.log(`[API] Regenerated packing slip checklist for file ${fileId}: ${result.itemCount} items created from CSV`);
      
      res.json({ 
        message: 'Packing slip checklist regenerated from CSV successfully',
        itemsCreated: result.itemCount
      });
      
    } catch (err: any) {
      console.error('[API] Error re-parsing packing slip:', err.message);
      res.status(500).json({ message: 'Failed to re-parse PDF', error: err.message });
    }
  });

  // ==================== CUT TO FILE PDF ENDPOINTS ====================
  
  // Download Cut To File PDF for a file
  app.get('/api/files/:fileId/cut-to-file-pdf', isAuthenticated, async (req, res) => {
    try {
      const fileId = Number(req.params.fileId);
      const fileData = await storage.getFileWithProject(fileId);
      
      if (!fileData) {
        return res.status(404).json({ message: 'File not found' });
      }
      
      if (!fileData.file.cutToFilePdfPath) {
        return res.status(404).json({ message: 'No Cut To File PDF found for this file' });
      }
      
      const pdfBuffer = await objectStorageService.downloadBuffer(fileData.file.cutToFilePdfPath);
      
      if (!pdfBuffer) {
        return res.status(404).json({ message: 'PDF file not found in storage' });
      }
      
      const filename = fileData.file.cutToFilePdfPath.split('/').pop() || 'cut-to-file.pdf';
      
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(pdfBuffer);
      
    } catch (err: any) {
      console.error('[API] Error downloading Cut To File PDF:', err.message);
      res.status(500).json({ message: 'Failed to download PDF', error: err.message });
    }
  });

  // Delete Cut To File PDF for a file
  app.delete('/api/files/:fileId/cut-to-file-pdf', isAuthenticated, async (req, res) => {
    try {
      const fileId = Number(req.params.fileId);
      const fileData = await storage.getFileWithProject(fileId);
      
      if (!fileData) {
        return res.status(404).json({ message: 'File not found' });
      }
      
      if (!fileData.file.cutToFilePdfPath) {
        return res.status(404).json({ message: 'No Cut To File PDF found for this file' });
      }
      
      const deleted = await objectStorageService.deleteObject(fileData.file.cutToFilePdfPath);
      if (!deleted) {
        console.log(`[API] Object storage file not found for ${fileId}, clearing database reference anyway`);
      }
      
      await storage.updateOrderFile(fileId, {
        cutToFilePdfPath: null
      });
      
      console.log(`[API] Deleted Cut To File PDF for file ${fileId}`);
      
      res.json({ message: 'Cut To File PDF deleted successfully' });
      
    } catch (err: any) {
      console.error('[API] Error deleting Cut To File PDF:', err.message);
      res.status(500).json({ message: 'Failed to delete PDF', error: err.message });
    }
  });

  // ==================== ELIAS DOVETAIL PDF ENDPOINTS ====================
  
  // Download Elias PF Dovetail Drawers PDF for a file
  app.get('/api/files/:fileId/elias-dovetail-pdf', isAuthenticated, async (req, res) => {
    try {
      const fileId = Number(req.params.fileId);
      const fileData = await storage.getFileWithProject(fileId);
      
      if (!fileData) {
        return res.status(404).json({ message: 'File not found' });
      }
      
      if (!fileData.file.eliasDovetailPdfPath) {
        return res.status(404).json({ message: 'No Elias Dovetail PDF found for this file' });
      }
      
      const pdfBuffer = await objectStorageService.downloadBuffer(fileData.file.eliasDovetailPdfPath);
      
      if (!pdfBuffer) {
        return res.status(404).json({ message: 'PDF file not found in storage' });
      }
      
      const filename = fileData.file.eliasDovetailPdfPath.split('/').pop() || 'elias-dovetail.pdf';
      
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(pdfBuffer);
      
    } catch (err: any) {
      console.error('[API] Error downloading Elias Dovetail PDF:', err.message);
      res.status(500).json({ message: 'Failed to download PDF', error: err.message });
    }
  });

  // Delete Elias PF Dovetail Drawers PDF for a file
  app.delete('/api/files/:fileId/elias-dovetail-pdf', isAuthenticated, async (req, res) => {
    try {
      const fileId = Number(req.params.fileId);
      const fileData = await storage.getFileWithProject(fileId);
      
      if (!fileData) {
        return res.status(404).json({ message: 'File not found' });
      }
      
      if (!fileData.file.eliasDovetailPdfPath) {
        return res.status(404).json({ message: 'No Elias Dovetail PDF found for this file' });
      }
      
      const deleted = await objectStorageService.deleteObject(fileData.file.eliasDovetailPdfPath);
      if (!deleted) {
        console.log(`[API] Object storage file not found for ${fileId}, clearing database reference anyway`);
      }
      
      await storage.updateOrderFile(fileId, {
        eliasDovetailPdfPath: null
      });
      
      console.log(`[API] Deleted Elias Dovetail PDF for file ${fileId}`);
      
      res.json({ message: 'Elias Dovetail PDF deleted successfully' });
      
    } catch (err: any) {
      console.error('[API] Error deleting Elias Dovetail PDF:', err.message);
      res.status(500).json({ message: 'Failed to delete PDF', error: err.message });
    }
  });

  // ==================== NETLEY 5 PIECE SHAKER DOOR PDF ENDPOINTS ====================
  
  // Download Netley 5 Piece Shaker Door PDF for a file
  app.get('/api/files/:fileId/netley-5-piece-pdf', isAuthenticated, async (req, res) => {
    try {
      const fileId = Number(req.params.fileId);
      const fileData = await storage.getFileWithProject(fileId);
      
      if (!fileData) {
        return res.status(404).json({ message: 'File not found' });
      }
      
      if (!fileData.file.netley5PiecePdfPath) {
        return res.status(404).json({ message: 'No Netley 5 Piece PDF found for this file' });
      }
      
      const pdfBuffer = await objectStorageService.downloadBuffer(fileData.file.netley5PiecePdfPath);
      
      if (!pdfBuffer) {
        return res.status(404).json({ message: 'PDF file not found in storage' });
      }
      
      const filename = fileData.file.netley5PiecePdfPath.split('/').pop() || 'netley-5-piece.pdf';
      
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(pdfBuffer);
      
    } catch (err: any) {
      console.error('[API] Error downloading Netley 5 Piece PDF:', err.message);
      res.status(500).json({ message: 'Failed to download PDF', error: err.message });
    }
  });

  // Delete Netley 5 Piece Shaker Door PDF for a file
  app.delete('/api/files/:fileId/netley-5-piece-pdf', isAuthenticated, async (req, res) => {
    try {
      const fileId = Number(req.params.fileId);
      const fileData = await storage.getFileWithProject(fileId);
      
      if (!fileData) {
        return res.status(404).json({ message: 'File not found' });
      }
      
      if (!fileData.file.netley5PiecePdfPath) {
        return res.status(404).json({ message: 'No Netley 5 Piece PDF found for this file' });
      }
      
      const deleted = await objectStorageService.deleteObject(fileData.file.netley5PiecePdfPath);
      if (!deleted) {
        console.log(`[API] Object storage file not found for ${fileId}, clearing database reference anyway`);
      }
      
      await storage.updateOrderFile(fileId, {
        netley5PiecePdfPath: null
      });
      
      console.log(`[API] Deleted Netley 5 Piece PDF for file ${fileId}`);
      
      res.json({ message: 'Netley 5 Piece PDF deleted successfully' });
      
    } catch (err: any) {
      console.error('[API] Error deleting Netley 5 Piece PDF:', err.message);
      res.status(500).json({ message: 'Failed to delete PDF', error: err.message });
    }
  });

  // Download Netley Packing Slip PDF for a file
  app.get('/api/files/:fileId/netley-packing-slip-pdf', isAuthenticated, async (req, res) => {
    try {
      const fileId = Number(req.params.fileId);
      const fileData = await storage.getFileWithProject(fileId);
      
      if (!fileData) {
        return res.status(404).json({ message: 'File not found' });
      }
      
      if (!fileData.file.netleyPackingSlipPdfPath) {
        return res.status(404).json({ message: 'No Netley Packing Slip PDF found for this file' });
      }
      
      const pdfBuffer = await objectStorageService.downloadBuffer(fileData.file.netleyPackingSlipPdfPath);
      if (!pdfBuffer) {
        return res.status(404).json({ message: 'PDF file not found in storage' });
      }
      
      const filename = fileData.file.netleyPackingSlipPdfPath.split('/').pop() || 'netley-packing-slip.pdf';
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(pdfBuffer);
      
    } catch (err: any) {
      console.error('[API] Error downloading Netley Packing Slip PDF:', err.message);
      res.status(500).json({ message: 'Failed to download PDF', error: err.message });
    }
  });

  // Delete Netley Packing Slip PDF for a file
  app.delete('/api/files/:fileId/netley-packing-slip-pdf', isAuthenticated, async (req, res) => {
    try {
      const fileId = Number(req.params.fileId);
      const fileData = await storage.getFileWithProject(fileId);
      
      if (!fileData) {
        return res.status(404).json({ message: 'File not found' });
      }
      
      if (!fileData.file.netleyPackingSlipPdfPath) {
        return res.status(404).json({ message: 'No Netley Packing Slip PDF found for this file' });
      }
      
      const deleted = await objectStorageService.deleteObject(fileData.file.netleyPackingSlipPdfPath);
      if (!deleted) {
        console.log(`[API] Object storage file not found for ${fileId}, clearing database reference anyway`);
      }
      
      await storage.updateOrderFile(fileId, {
        netleyPackingSlipPdfPath: null
      });
      
      console.log(`[API] Deleted Netley Packing Slip PDF for file ${fileId}`);
      
      res.json({ message: 'Netley Packing Slip PDF deleted successfully' });
      
    } catch (err: any) {
      console.error('[API] Error deleting Netley Packing Slip PDF:', err.message);
      res.status(500).json({ message: 'Failed to delete PDF', error: err.message });
    }
  });

  // Serve packing slip images from object storage
  // Security: Only allow images matching the expected pattern to prevent path traversal
  app.get('/api/packing-slip-images/:imagePath', isAuthenticated, async (req, res) => {
    try {
      const imagePath = req.params.imagePath;
      
      // Validate image path format to prevent path traversal
      // Expected format: file-{fileId}-item-{sortOrder}.png
      const validPattern = /^file-\d+-item-\d+\.png$/;
      if (!validPattern.test(imagePath)) {
        return res.status(400).json({ message: 'Invalid image path format' });
      }
      
      const fullPath = `.private/packing-slip-images/${imagePath}`;
      
      const { ObjectStorageService } = await import('./replit_integrations/object_storage');
      const objectStorage = new ObjectStorageService();
      const imageBuffer = await objectStorage.downloadBuffer(fullPath);
      
      if (!imageBuffer) {
        return res.status(404).json({ message: 'Image not found' });
      }
      
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.send(imageBuffer);
    } catch (err: any) {
      console.error('[API] Error serving packing slip image:', err.message);
      res.status(500).json({ message: 'Failed to serve image', error: err.message });
    }
  });

  // Get packing slip checklist items for a file, enriched with product database info
  app.get('/api/files/:fileId/checklist', isAuthenticated, async (req, res) => {
    try {
      const fileId = Number(req.params.fileId);
      const items = await storage.getPackingSlipItems(fileId);
      const progress = await storage.getPackingSlipProgress(fileId);
      
      // Get unique part codes and look up matching products
      const partCodes = Array.from(new Set(items.map(item => item.partCode)));
      const matchingProducts = await storage.getProductsByCode(partCodes);
      
      // Create a map for quick lookup
      const productMap: Record<string, typeof matchingProducts[0]> = {};
      for (const product of matchingProducts) {
        productMap[product.code] = product;
      }
      
      // Enrich items with product info (image from product db takes precedence if available)
      // CTS cut length is now stored directly on the item.length field from CSV import
      const enrichedItems = items.map(item => {
        const product = productMap[item.partCode];
        const isCts = item.partCode.includes('.CTS');
        // Use stored length for CTS parts - this is populated from CSV import
        const ctsCutLength = isCts && item.length ? item.length : undefined;
        
        return {
          ...item,
          ctsCutLength,
          productInfo: product ? {
            id: product.id,
            name: product.name,
            imagePath: product.imagePath,
            notes: product.notes
          } : null
        };
      });
      
      res.json({ items: enrichedItems, progress, productMatchCount: matchingProducts.length });
    } catch (err: any) {
      console.error('[API] Error getting checklist items:', err.message);
      res.status(500).json({ message: 'Failed to get checklist items', error: err.message });
    }
  });

  // Toggle packing slip checklist item
  app.patch('/api/checklist/:itemId/toggle', isAuthenticated, async (req, res) => {
    try {
      const itemId = Number(req.params.itemId);
      const { isChecked, checkedBy } = req.body;
      
      const updated = await storage.togglePackingSlipItem(itemId, isChecked, checkedBy);
      if (!updated) {
        return res.status(404).json({ message: 'Checklist item not found' });
      }
      res.json(updated);
    } catch (err: any) {
      console.error('[API] Error toggling checklist item:', err.message);
      res.status(500).json({ message: 'Failed to toggle checklist item', error: err.message });
    }
  });

  // Get packing slip checklist progress for a file
  app.get('/api/files/:fileId/checklist/progress', isAuthenticated, async (req, res) => {
    try {
      const fileId = Number(req.params.fileId);
      const progress = await storage.getPackingSlipProgress(fileId);
      res.json(progress);
    } catch (err: any) {
      console.error('[API] Error getting checklist progress:', err.message);
      res.status(500).json({ message: 'Failed to get checklist progress', error: err.message });
    }
  });

  // Test Outlook connection
  app.get('/api/outlook/test', isAuthenticated, async (req, res) => {
    try {
      const result = await testOutlookConnection();
      res.json(result);
    } catch (err: any) {
      console.error('[Outlook] Connection test failed:', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Get Outlook sync status
  app.get('/api/outlook/sync-status', isAuthenticated, async (req, res) => {
    try {
      const status = await getSyncStatus();
      res.json({ status });
    } catch (err: any) {
      console.error('[Outlook] Error getting sync status:', err.message);
      res.status(500).json({ message: 'Failed to get sync status', error: err.message });
    }
  });

  // List all mail folders
  app.get('/api/outlook/folders', isAuthenticated, async (req, res) => {
    try {
      console.log('[Outlook] Listing mail folders...');
      const folders = await listMailFolders();
      console.log(`[Outlook] Found ${folders.length} folders`);
      res.json({ folders });
    } catch (err: any) {
      console.error('[Outlook] Error listing folders:', err.message);
      res.status(500).json({ message: 'Failed to list folders', error: err.message });
    }
  });

  // List Netley packing slip emails from Outlook
  app.get('/api/outlook/netley-emails', isAuthenticated, async (req, res) => {
    try {
      console.log('[Outlook] Fetching Netley packing slip emails...');
      const result = await searchNetleyEmails();
      
      if (!result.folderFound) {
        console.log(`[Outlook] Folder not found: ${result.folderName}`);
        return res.status(404).json({
          message: result.error,
          folderFound: false,
          folderName: result.folderName
        });
      }
      
      console.log(`[Outlook] Found ${result.emails.length} emails with PDF attachments in folder "${result.folderName}"`);
      res.json({
        emails: result.emails,
        folderFound: true,
        folderName: result.folderName
      });
    } catch (err: any) {
      console.error('[Outlook] Error fetching emails:', err.message);
      res.status(500).json({ message: 'Failed to fetch emails', error: err.message });
    }
  });

  // Process Netley packing slip emails from Outlook and match to orders
  // Uses shared processing function with deduplication
  app.post('/api/outlook/process-netley-emails', isAuthenticated, async (req, res) => {
    try {
      console.log('[Outlook] Manual email processing triggered...');
      const result = await triggerManualFetch();
      
      res.json({
        message: `Processed ${result.processed} emails, matched ${result.matched} packing slips`,
        processed: result.processed,
        matched: result.matched
      });
    } catch (err: any) {
      console.error('[Outlook] Error processing Netley emails:', err.message);
      res.status(500).json({ message: 'Failed to process emails', error: err.message });
    }
  });

  app.get('/api/asana-import/status', isAuthenticated, async (req, res) => {
    try {
      const status = await getAsanaImportStatus();
      res.json({ status });
    } catch (err: any) {
      console.error('[Asana Import] Error getting status:', err.message);
      res.status(500).json({ message: 'Failed to get Asana import status', error: err.message });
    }
  });

  app.post('/api/asana/sync-all-notes', isAuthenticated, async (req, res) => {
    try {
      const replitUser = (req as any).user;
      const username = replitUser?.claims?.username || replitUser?.name;
      const email = replitUser?.claims?.email;
      const isAdmin = await storage.isUserAdmin(username, email);
      if (!isAdmin) {
        return res.status(403).json({ message: 'Admin access required' });
      }
      const result = await triggerManualAsanaNoteSync();
      res.json({
        message: `Synced ${result.synced} of ${result.total} Asana task descriptions`,
        synced: result.synced,
        failed: result.failed,
        total: result.total
      });
    } catch (err: any) {
      console.error('[Asana Notes] Error triggering sync:', err.message);
      res.status(500).json({ message: 'Failed to sync Asana task notes', error: err.message });
    }
  });

  app.post('/api/asana-import/trigger', isAuthenticated, async (req, res) => {
    try {
      console.log('[Asana Import] Manual import triggered...');
      const result = await triggerManualAsanaImport();
      res.json({
        message: `Processed ${result.processed} tasks, imported ${result.imported} orders`,
        processed: result.processed,
        imported: result.imported
      });
    } catch (err: any) {
      console.error('[Asana Import] Error triggering import:', err.message);
      res.status(500).json({ message: 'Failed to trigger Asana import', error: err.message });
    }
  });

  // Alias routes expected by the prompt spec
  app.post('/api/admin/trigger-asana-import', isAuthenticated, async (_req, res) => {
    try {
      const result = await triggerManualAsanaImport();
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get('/api/admin/asana-import-status', isAuthenticated, async (_req, res) => {
    try {
      const status = await getAsanaImportStatus();
      res.json(status);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post('/api/asana-import/reset/:projectId', isAuthenticated, async (req, res) => {
    try {
      const replitUser = (req as any).user;
      const username = replitUser?.claims?.username || replitUser?.name;
      const email = replitUser?.claims?.email;
      if (!username && !email) {
        return res.status(401).json({ message: 'Not authenticated' });
      }
      const isAdmin = await storage.isUserAdmin(username, email);
      if (!isAdmin) {
        return res.status(403).json({ message: 'Only admins can reset imports' });
      }

      const projectId = Number(req.params.projectId);
      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ message: 'Project not found' });
      }
      if (!project.asanaTaskId) {
        return res.status(400).json({ message: 'Project has no associated Asana task' });
      }

      await db.delete(processedAsanaTasks).where(eq(processedAsanaTasks.taskGid, project.asanaTaskId));
      
      const deleted = await storage.deleteProject(projectId);
      if (!deleted) {
        return res.status(500).json({ message: 'Failed to delete project during reset' });
      }

      console.log(`[Asana Import] Reset import for project ${projectId}, cleared task ${project.asanaTaskId}`);
      res.json({ message: 'Import reset successfully. The task will be re-imported on the next cycle.' });
    } catch (err: any) {
      console.error('[Asana Import] Error resetting import:', err.message);
      res.status(500).json({ message: 'Failed to reset import', error: err.message });
    }
  });

  app.post('/api/asana-import/reset-orphan/:processedTaskId', isAuthenticated, async (req, res) => {
    try {
      const replitUser = (req as any).user;
      const username = replitUser?.claims?.username || replitUser?.name;
      const email = replitUser?.claims?.email;
      if (!username && !email) {
        return res.status(401).json({ message: 'Not authenticated' });
      }
      const isAdmin = await storage.isUserAdmin(username, email);
      if (!isAdmin) {
        return res.status(403).json({ message: 'Only admins can reset imports' });
      }

      const processedTaskId = Number(req.params.processedTaskId);
      await db.delete(processedAsanaTasks).where(eq(processedAsanaTasks.id, processedTaskId));

      console.log(`[Asana Import] Reset orphaned processed task ${processedTaskId}`);
      res.json({ message: 'Orphaned task tracking cleared. The task will be re-imported on the next cycle.' });
    } catch (err: any) {
      console.error('[Asana Import] Error resetting orphaned task:', err.message);
      res.status(500).json({ message: 'Failed to reset orphaned task', error: err.message });
    }
  });

  app.get('/api/asana-import/projects', isAuthenticated, async (req, res) => {
    try {
      const allProjects = await storage.getProjects();
      const processedTasks = await db.select().from(processedAsanaTasks);
      const projectAsanaTaskIds = new Set(allProjects.filter(p => p.asanaTaskId).map(p => p.asanaTaskId));

      const autoImported = allProjects.filter(p => {
        if (p.autoImported === true) return true;
        if (p.asanaTaskId) return true;
        return false;
      });

      const orphanedTasks = processedTasks.filter(t => !projectAsanaTaskIds.has(t.taskGid));
      const orphanedEntries = orphanedTasks.map(t => ({
        id: `orphan-${t.id}`,
        name: t.taskName || 'Unknown Task',
        asanaTaskId: t.taskGid,
        status: t.status === 'failed' ? 'error' : 'pending',
        autoImported: true,
        createdAt: t.processedAt,
        dealer: null,
        orphaned: true,
        processedTaskId: t.id,
      }));

      res.json([...autoImported, ...orphanedEntries]);
    } catch (err: any) {
      console.error('[Asana Import] Error fetching auto-imported projects:', err.message);
      res.status(500).json({ message: 'Failed to fetch auto-imported projects' });
    }
  });

  // Diagnostic endpoint for debugging Outlook matching
  // Returns all order files with their Allmoxy Job # and packing slip status
  app.get('/api/diagnostic/order-files', isAuthenticated, async (req, res) => {
    try {
      const searchNumber = req.query.search as string | undefined;
      
      // Get all projects and their files
      const allProjects = await storage.getProjects();
      const diagnosticData: Array<{
        fileId: number;
        projectId: number;
        projectName: string;
        originalFilename: string;
        poNumber: string | null;
        allmoxyJobNumber: string | null;
        allmoxyJobNumberNormalized: string | null;
      }> = [];
      
      for (const project of allProjects) {
        const files = await storage.getProjectFiles(project.id);
        
        for (const file of files) {
          // Normalize the Allmoxy Job # for comparison
          const normalizedJobNumber = file.allmoxyJobNumber 
            ? file.allmoxyJobNumber.trim().replace(/^0+/, '').toLowerCase()
            : null;
          
          // If search is provided, filter to matching files
          if (searchNumber) {
            const normalizedSearch = searchNumber.trim().replace(/^0+/, '').toLowerCase();
            const matches = 
              normalizedJobNumber === normalizedSearch ||
              file.allmoxyJobNumber?.includes(searchNumber) ||
              file.originalFilename.includes(searchNumber);
            
            if (!matches) continue;
          }
          
          diagnosticData.push({
            fileId: file.id,
            projectId: project.id,
            projectName: project.name,
            originalFilename: file.originalFilename,
            poNumber: file.poNumber,
            allmoxyJobNumber: file.allmoxyJobNumber,
            allmoxyJobNumberNormalized: normalizedJobNumber
          });
        }
      }
      
      console.log(`[Diagnostic] Returning ${diagnosticData.length} files (search: ${searchNumber || 'none'})`);
      
      res.json({
        totalFiles: diagnosticData.length,
        searchQuery: searchNumber || null,
        files: diagnosticData
      });
      
    } catch (err: any) {
      console.error('[Diagnostic] Error fetching order files:', err.message);
      res.status(500).json({ message: 'Failed to fetch diagnostic data', error: err.message });
    }
  });

  // Reset processed Outlook emails - allows reprocessing of emails
  app.delete('/api/outlook/processed-emails', isAuthenticated, async (req, res) => {
    try {
      console.log('[Outlook] Resetting processed email records...');
      const result = await storage.clearProcessedOutlookEmails();
      console.log(`[Outlook] Cleared ${result} processed email records`);
      res.json({ 
        message: `Cleared ${result} processed email records. Emails will be reprocessed on next fetch.`,
        cleared: result
      });
    } catch (err: any) {
      console.error('[Outlook] Error clearing processed emails:', err.message);
      res.status(500).json({ message: 'Failed to clear processed emails', error: err.message });
    }
  });

  // ─── AgentMail routes ────────────────────────────────────────────────────────

  // Test AgentMail connection
  app.get('/api/agentmail/test', isAuthenticated, async (req, res) => {
    try {
      const result = await testAgentMailConnection();
      res.json(result);
    } catch (err: any) {
      console.error('[AgentMail] Connection test failed:', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Get AgentMail sync status
  app.get('/api/agentmail/sync-status', isAuthenticated, async (req, res) => {
    try {
      const status = await getAgentMailSyncStatus();
      res.json(status);
    } catch (err: any) {
      console.error('[AgentMail] Error getting sync status:', err.message);
      res.status(500).json({ message: 'Failed to get AgentMail sync status', error: err.message });
    }
  });

  // Manually trigger AgentMail email processing
  app.post('/api/agentmail/process-emails', isAuthenticated, async (req, res) => {
    try {
      console.log('[AgentMail] Manual email processing triggered...');
      const result = await triggerManualAgentMailFetch();
      res.json({
        message: `Processing complete. Processed ${result.processed} attachments, matched ${result.matched} to orders.`,
        processed: result.processed,
        matched: result.matched
      });
    } catch (err: any) {
      console.error('[AgentMail] Error processing emails:', err.message);
      res.status(500).json({ message: 'Failed to process AgentMail emails', error: err.message });
    }
  });

  // Reset processed AgentMail emails - allows reprocessing of emails
  app.delete('/api/agentmail/processed-emails', isAuthenticated, async (req, res) => {
    try {
      console.log('[AgentMail] Resetting processed email records...');
      const result = await clearAgentMailProcessedEmails();
      console.log(`[AgentMail] Cleared ${result} processed email records`);
      res.json({
        message: `Cleared ${result} processed AgentMail records. Emails will be reprocessed on next fetch.`,
        cleared: result
      });
    } catch (err: any) {
      console.error('[AgentMail] Error clearing processed emails:', err.message);
      res.status(500).json({ message: 'Failed to clear AgentMail processed emails', error: err.message });
    }
  });

  // Spec-required path aliases ─────────────────────────────────────────────────
  app.get('/api/agentmail/status', isAuthenticated, async (_req, res) => {
    try { res.json(await getAgentMailSyncStatus()); } catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.post('/api/agentmail/fetch', isAuthenticated, async (_req, res) => {
    try { res.json(await triggerManualAgentMailFetch()); } catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.post('/api/agentmail/clear', isAuthenticated, async (_req, res) => {
    try { const n = await clearAgentMailProcessedEmails(); res.json({ cleared: n }); } catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.post('/api/agentmail/test', isAuthenticated, async (_req, res) => {
    try { res.json(await testAgentMailConnection()); } catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.get('/api/outlook/status', isAuthenticated, async (_req, res) => {
    try { res.json(await getSyncStatus()); } catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.post('/api/outlook/fetch', isAuthenticated, async (_req, res) => {
    try { res.json(await triggerManualFetch()); } catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.post('/api/outlook/test', isAuthenticated, async (_req, res) => {
    try { res.json(await testOutlookConnection()); } catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.post('/api/outlook/list-folders', isAuthenticated, async (_req, res) => {
    try { res.json({ folders: await listMailFolders() }); } catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  // ─── End AgentMail routes ────────────────────────────────────────────────────

  // Admin endpoint to backfill stored calculated values for existing files
  app.post('/api/admin/backfill-file-metrics', isAuthenticated, async (req, res) => {
    try {
      console.log('[Admin] Starting backfill of file metrics...');
      
      // Get all projects
      const projects = await storage.getProjects();
      let filesUpdated = 0;
      
      for (const project of projects) {
        const files = await storage.getProjectFiles(project.id);
        
        for (const file of files) {
          if (file.rawContent) {
            const records = await parseCSV(file.rawContent);
            const counts = await countPartsFromCSV(records);
            
            // Update file with calculated values
            await storage.updateOrderFile(file.id, {
              coreParts: counts.coreParts,
              dovetails: counts.dovetails,
              assembledDrawers: counts.assembledDrawers,
              fivePieceDoors: counts.fivePiece,
              weightLbs: Math.round(counts.weightLbs),
              maxLength: Math.round(counts.maxLength),
              maxWidth: Math.round(counts.maxWidth),
              largestPartWidth: Math.round(counts.largestPartWidth),
              widestPartLength: Math.round(counts.widestPartLength),
              hasGlassParts: counts.hasGlassParts,
              glassInserts: counts.glassInserts,
              glassShelves: counts.glassShelves,
              hasMJDoors: counts.hasMJDoors,
              hasRichelieuDoors: counts.hasRichelieuDoors,
              hasDoubleThick: counts.hasDoubleThick,
              hasShakerDoors: counts.hasShakerDoors,
              mjDoorsCount: counts.mjDoorsCount,
              richelieuDoorsCount: counts.richelieuDoorsCount,
              doubleThickCount: counts.doubleThickCount,
              wallRailPieces: counts.wallRailPieces,
            });
            
            filesUpdated++;
          }
        }
      }
      
      console.log(`[Admin] Backfill complete. Updated ${filesUpdated} files.`);
      res.json({ message: `Backfill complete. Updated ${filesUpdated} files.`, filesUpdated });
      
    } catch (e: any) {
      console.error('[Admin] Backfill error:', e);
      res.status(500).json({ message: 'Backfill failed', error: e.message });
    }
  });

  // ====== PRODUCT CATALOG ROUTES ======
  
  // Get all products with optional search and category filter
  app.get('/api/products', isAuthenticated, async (req, res) => {
    try {
      const search = req.query.search as string | undefined;
      const category = req.query.category as string | undefined;
      const products = await storage.getProducts(search, category);
      res.json(products);
    } catch (e: any) {
      console.error('[Products] Error fetching products:', e);
      res.status(500).json({ message: 'Failed to fetch products', error: e.message });
    }
  });

  // Get single product by ID
  app.get('/api/products/:id', isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: 'Invalid product ID' });
      }
      const product = await storage.getProduct(id);
      if (!product) {
        return res.status(404).json({ message: 'Product not found' });
      }
      res.json(product);
    } catch (e: any) {
      console.error('[Products] Error fetching product:', e);
      res.status(500).json({ message: 'Failed to fetch product', error: e.message });
    }
  });

  // Get product by code
  app.get('/api/products/by-code/:code', isAuthenticated, async (req, res) => {
    try {
      const code = req.params.code;
      const product = await storage.getProductByCode(code);
      if (!product) {
        return res.status(404).json({ message: 'Product not found' });
      }
      res.json(product);
    } catch (e: any) {
      console.error('[Products] Error fetching product by code:', e);
      res.status(500).json({ message: 'Failed to fetch product', error: e.message });
    }
  });

  // Create new product
  app.post('/api/products', isAuthenticated, async (req, res) => {
    try {
      const validatedData = insertProductSchema.parse(req.body);
      
      // Check if product code already exists
      const existing = await storage.getProductByCode(validatedData.code);
      if (existing) {
        return res.status(409).json({ message: 'Product with this code already exists' });
      }
      
      const product = await storage.createProduct(validatedData);
      console.log(`[Products] Created product: ${product.code}`);
      res.status(201).json(product);
    } catch (e: any) {
      if (e.name === 'ZodError') {
        return res.status(400).json({ message: 'Invalid product data', errors: e.errors });
      }
      console.error('[Products] Error creating product:', e);
      res.status(500).json({ message: 'Failed to create product', error: e.message });
    }
  });

  // Update product
  app.patch('/api/products/:id', isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: 'Invalid product ID' });
      }
      
      // Validate and sanitize update data
      const { code, name, supplier, category, stockStatus, length, width, height, weight, imagePath, notes, importRowNumber } = req.body;
      const updateData: Record<string, any> = {};
      
      if (code !== undefined) updateData.code = typeof code === 'string' ? code.trim() : null;
      if (name !== undefined) updateData.name = typeof name === 'string' ? name.trim() : null;
      if (supplier !== undefined) updateData.supplier = typeof supplier === 'string' ? supplier.trim() : null;
      if (category !== undefined && ['HARDWARE', 'COMPONENT'].includes(category)) {
        updateData.category = category;
      }
      if (stockStatus !== undefined && ['IN_STOCK', 'BUYOUT'].includes(stockStatus)) {
        updateData.stockStatus = stockStatus;
      }
      if (length !== undefined) updateData.length = length ? parseFloat(length) : null;
      if (width !== undefined) updateData.width = width ? parseFloat(width) : null;
      if (height !== undefined) updateData.height = height ? parseFloat(height) : null;
      if (weight !== undefined) updateData.weight = weight ? parseFloat(weight) : null;
      if (imagePath !== undefined) updateData.imagePath = typeof imagePath === 'string' ? imagePath : null;
      if (notes !== undefined) updateData.notes = typeof notes === 'string' ? notes.trim() : null;
      if (importRowNumber !== undefined) updateData.importRowNumber = importRowNumber ? parseInt(importRowNumber) : null;
      
      const product = await storage.updateProduct(id, updateData);
      if (!product) {
        return res.status(404).json({ message: 'Product not found' });
      }
      console.log(`[Products] Updated product: ${product.code}`);
      res.json(product);
    } catch (e: any) {
      console.error('[Products] Error updating product:', e);
      res.status(500).json({ message: 'Failed to update product', error: e.message });
    }
  });

  // Delete product
  app.delete('/api/products/:id', isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: 'Invalid product ID' });
      }
      
      const deleted = await storage.deleteProduct(id);
      if (!deleted) {
        return res.status(404).json({ message: 'Product not found' });
      }
      console.log(`[Products] Deleted product ID: ${id}`);
      res.json({ message: 'Product deleted' });
    } catch (e: any) {
      console.error('[Products] Error deleting product:', e);
      res.status(500).json({ message: 'Failed to delete product', error: e.message });
    }
  });

  // Bulk lookup products by codes (for packaging checklist)
  app.post('/api/products/bulk-lookup', isAuthenticated, async (req, res) => {
    try {
      const { codes } = req.body;
      if (!Array.isArray(codes)) {
        return res.status(400).json({ message: 'codes must be an array' });
      }
      const products = await storage.getProductsByCode(codes);
      // Return as a map for easy lookup
      const productMap: Record<string, typeof products[0]> = {};
      for (const p of products) {
        productMap[p.code] = p;
      }
      res.json(productMap);
    } catch (e: any) {
      console.error('[Products] Error bulk lookup:', e);
      res.status(500).json({ message: 'Failed to lookup products', error: e.message });
    }
  });

  // Parse hardware CSV and return preview (new/changed/unchanged items)
  app.post('/api/products/import/preview', isAuthenticated, upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' });
      }
      
      const fileContent = req.file.buffer.toString('utf-8');
      const records = await parseCSV(fileContent);
      
      // Detect CSV format - check if column 3 has stock/buyout data
      const hasStockColumn = records.some(row => {
        const col3 = (row[3] || '').trim().toLowerCase();
        return col3 === 'stock' || col3 === 'buyout' || col3 === 'stock / buyout';
      });
      
      // Parse the CSV - columns: A=description, B=supplier, C=code, D=stock/buyout (optional)
      // Skip header rows and section headers (all-caps rows, empty codes)
      const parsedItems: Array<{
        rowNumber: number;
        code: string;
        name: string;
        supplier: string;
        stockStatus: string | null; // null when not specified in CSV
      }> = [];
      
      let rowNumber = 0;
      for (const row of records) {
        rowNumber++;
        const description = row[0]?.trim() || '';
        const supplier = row[1]?.trim() || '';
        const code = row[2]?.trim() || '';
        const stockCol = (row[3] || '').trim().toLowerCase();
        
        // Skip empty rows
        if (!description && !supplier && !code) continue;
        
        // Skip section headers (all uppercase description with no code and no supplier)
        if (!code && !supplier && description === description.toUpperCase() && description.length > 3) continue;
        
        // Skip rows without a valid code
        if (!code || code.length < 3) continue;
        
        // Skip header-like rows
        if (code.toLowerCase().includes('codes') || code.toLowerCase().includes('manu') || code.toLowerCase() === 'product code') continue;
        
        // Determine stock status - only set if CSV has stock column
        let stockStatus: string | null = null;
        if (hasStockColumn) {
          if (stockCol === 'buyout') {
            stockStatus = 'BUYOUT';
          } else {
            stockStatus = 'IN_STOCK'; // default when stock column exists
          }
        }
        
        parsedItems.push({
          rowNumber,
          code,
          name: description,
          supplier,
          stockStatus
        });
      }
      
      // Deduplicate items within the CSV - keep only first occurrence of each code
      const seenCodes = new Set<string>();
      const deduplicatedItems = parsedItems.filter(item => {
        const upperCode = item.code.toUpperCase();
        if (seenCodes.has(upperCode)) {
          return false; // Skip duplicate
        }
        seenCodes.add(upperCode);
        return true;
      });
      
      // Look up existing products by code
      const codes = deduplicatedItems.map(item => item.code);
      const existingProducts = await storage.getProductsByCode(codes);
      const existingMap = new Map(existingProducts.map(p => [p.code, p]));
      
      // Categorize items
      const newItems: typeof deduplicatedItems = [];
      const unchangedItems: typeof deduplicatedItems = [];
      const changedItems: Array<{
        rowNumber: number;
        code: string;
        name: string;
        supplier: string;
        stockStatus: string | null;
        existingName: string | null;
        existingSupplier: string | null;
        existingStockStatus: string | null;
        existingId: number;
      }> = [];
      
      for (const item of deduplicatedItems) {
        const existing = existingMap.get(item.code);
        if (!existing) {
          newItems.push(item);
        } else {
          // Check if anything changed
          const nameChanged = (item.name || '') !== (existing.name || '');
          const supplierChanged = (item.supplier || '') !== (existing.supplier || '');
          // Only check stock status change if CSV has stock column
          const stockStatusChanged = hasStockColumn && item.stockStatus !== (existing.stockStatus || 'IN_STOCK');
          
          if (nameChanged || supplierChanged || stockStatusChanged) {
            changedItems.push({
              ...item,
              existingName: existing.name,
              existingSupplier: existing.supplier,
              existingStockStatus: existing.stockStatus,
              existingId: existing.id
            });
          } else {
            unchangedItems.push(item);
          }
        }
      }
      
      const duplicatesSkipped = parsedItems.length - deduplicatedItems.length;
      res.json({
        totalParsed: parsedItems.length,
        uniqueItems: deduplicatedItems.length,
        duplicatesSkipped,
        newItems,
        unchangedItems,
        changedItems,
        hasStockColumn
      });
    } catch (e: any) {
      console.error('[Products Import] Error previewing CSV:', e);
      res.status(500).json({ message: 'Failed to parse CSV', error: e.message });
    }
  });

  // Import new products from CSV (with row numbers for image linking)
  app.post('/api/products/import', isAuthenticated, async (req, res) => {
    try {
      const { items, stockStatus: defaultStockStatus = 'IN_STOCK' } = req.body;
      
      if (!Array.isArray(items)) {
        return res.status(400).json({ message: 'items must be an array' });
      }
      
      // Deduplicate items by code (case-insensitive) - keep first occurrence
      const seenCodes = new Set<string>();
      const deduplicatedItems = items.filter((item: any) => {
        const upperCode = (item.code || '').toUpperCase();
        if (!upperCode || seenCodes.has(upperCode)) {
          return false;
        }
        seenCodes.add(upperCode);
        return true;
      });
      
      const created: any[] = [];
      const errors: any[] = [];
      
      for (const item of deduplicatedItems) {
        try {
          // Use item's stockStatus if provided, otherwise use the default
          const itemStockStatus = item.stockStatus || defaultStockStatus;
          
          const product = await storage.createProduct({
            code: item.code,
            name: item.name || null,
            supplier: item.supplier || null,
            category: 'HARDWARE',
            stockStatus: itemStockStatus,
            weight: null,
            imagePath: null,
            notes: null,
            importRowNumber: item.rowNumber || null
          });
          created.push(product);
        } catch (e: any) {
          errors.push({ code: item.code, error: e.message });
        }
      }
      
      console.log(`[Products Import] Created ${created.length} products, ${errors.length} errors`);
      res.json({ created, errors });
    } catch (e: any) {
      console.error('[Products Import] Error importing:', e);
      res.status(500).json({ message: 'Failed to import products', error: e.message });
    }
  });

  // Update existing products with approved changes
  app.post('/api/products/import/update', isAuthenticated, async (req, res) => {
    try {
      const { items } = req.body;
      
      if (!Array.isArray(items)) {
        return res.status(400).json({ message: 'items must be an array' });
      }
      
      const updated: any[] = [];
      const errors: any[] = [];
      
      for (const item of items) {
        try {
          const updateData: Record<string, any> = {
            name: item.name || null,
            supplier: item.supplier || null,
            importRowNumber: item.rowNumber || null
          };
          
          // Only update stockStatus if it was provided in the CSV
          if (item.stockStatus) {
            updateData.stockStatus = item.stockStatus;
          }
          
          const product = await storage.updateProduct(item.existingId, updateData);
          if (product) {
            updated.push(product);
          }
        } catch (e: any) {
          errors.push({ code: item.code, error: e.message });
        }
      }
      
      console.log(`[Products Import] Updated ${updated.length} products, ${errors.length} errors`);
      res.json({ updated, errors });
    } catch (e: any) {
      console.error('[Products Import] Error updating:', e);
      res.status(500).json({ message: 'Failed to update products', error: e.message });
    }
  });

  // ====== COMPONENT IMPORT ROUTES ======
  // Parse component CSV and return preview (new/changed/unchanged items)
  // Component CSV format: A=name, B=code, C=supplier (no stock column - always IN_STOCK)
  app.post('/api/components/import/preview', isAuthenticated, upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' });
      }
      
      const fileContent = req.file.buffer.toString('utf-8');
      const records = await parseCSV(fileContent);
      
      // Parse the CSV - columns: A=name, B=code, C=supplier
      const parsedItems: Array<{
        rowNumber: number;
        code: string;
        name: string;
        supplier: string;
      }> = [];
      
      let rowNumber = 0;
      for (const row of records) {
        rowNumber++;
        const name = row[0]?.trim() || '';
        const code = row[1]?.trim() || '';
        const supplier = row[2]?.trim() || '';
        
        // Skip empty rows
        if (!name && !code && !supplier) continue;
        
        // Skip header-like rows
        if (code.toLowerCase().includes('code') || code.toLowerCase() === 'product code' || 
            code.toLowerCase() === 'item code' || name.toLowerCase() === 'name' ||
            name.toLowerCase() === 'description' || name.toLowerCase() === 'product name') continue;
        
        // Skip section headers (all uppercase name with no code)
        if (!code && name === name.toUpperCase() && name.length > 3) continue;
        
        // Skip rows without a valid code
        if (!code || code.length < 2) continue;
        
        parsedItems.push({
          rowNumber,
          code,
          name,
          supplier
        });
      }
      
      // Deduplicate items within the CSV - keep only first occurrence of each code
      const seenCodes = new Set<string>();
      const deduplicatedItems = parsedItems.filter(item => {
        const upperCode = item.code.toUpperCase();
        if (seenCodes.has(upperCode)) {
          return false; // Skip duplicate
        }
        seenCodes.add(upperCode);
        return true;
      });
      
      // Look up existing products by code (case-insensitive)
      const codes = deduplicatedItems.map(item => item.code);
      const existingProducts = await storage.getProductsByCode(codes);
      const existingMap = new Map(existingProducts.map(p => [p.code.toUpperCase(), p]));
      
      // Categorize items
      const newItems: typeof deduplicatedItems = [];
      const unchangedItems: typeof deduplicatedItems = [];
      const changedItems: Array<{
        rowNumber: number;
        code: string;
        name: string;
        supplier: string;
        existingName: string | null;
        existingSupplier: string | null;
        existingCategory: string | null;
        existingId: number;
      }> = [];
      
      for (const item of deduplicatedItems) {
        const existing = existingMap.get(item.code.toUpperCase());
        if (!existing) {
          newItems.push(item);
        } else {
          // Check if anything changed
          const nameChanged = (item.name || '') !== (existing.name || '');
          const supplierChanged = (item.supplier || '') !== (existing.supplier || '');
          // Also check if category needs to change from HARDWARE to COMPONENT
          const categoryChanged = existing.category !== 'COMPONENT';
          
          if (nameChanged || supplierChanged || categoryChanged) {
            changedItems.push({
              ...item,
              existingName: existing.name,
              existingSupplier: existing.supplier,
              existingCategory: existing.category,
              existingId: existing.id
            });
          } else {
            unchangedItems.push(item);
          }
        }
      }
      
      const duplicatesSkipped = parsedItems.length - deduplicatedItems.length;
      res.json({
        totalParsed: parsedItems.length,
        uniqueItems: deduplicatedItems.length,
        duplicatesSkipped,
        newItems,
        unchangedItems,
        changedItems
      });
    } catch (e: any) {
      console.error('[Components Import] Error previewing CSV:', e);
      res.status(500).json({ message: 'Failed to parse CSV', error: e.message });
    }
  });

  // Validation schema for component import items
  const componentImportItemSchema = z.object({
    code: z.string().min(2, 'Product code must be at least 2 characters'),
    name: z.string().optional().nullable(),
    supplier: z.string().optional().nullable(),
    rowNumber: z.number().optional().nullable()
  });

  // Import new components from CSV
  app.post('/api/components/import', isAuthenticated, async (req, res) => {
    try {
      const { items } = req.body;
      
      if (!Array.isArray(items)) {
        return res.status(400).json({ message: 'items must be an array' });
      }
      
      // Validate items
      const validItems: z.infer<typeof componentImportItemSchema>[] = [];
      const validationErrors: any[] = [];
      
      for (const item of items) {
        const result = componentImportItemSchema.safeParse(item);
        if (result.success) {
          validItems.push(result.data);
        } else {
          validationErrors.push({ 
            code: item?.code || 'unknown', 
            error: result.error.errors.map(e => e.message).join(', ') 
          });
        }
      }
      
      // Deduplicate items by code (case-insensitive) - keep first occurrence
      const seenCodes = new Set<string>();
      const deduplicatedItems = validItems.filter((item) => {
        const upperCode = item.code.toUpperCase();
        if (seenCodes.has(upperCode)) {
          return false;
        }
        seenCodes.add(upperCode);
        return true;
      });
      
      const created: any[] = [];
      const errors: any[] = [];
      
      for (const item of deduplicatedItems) {
        try {
          const product = await storage.createProduct({
            code: item.code,
            name: item.name || null,
            supplier: item.supplier || null,
            category: 'COMPONENT',  // Components always have COMPONENT category
            stockStatus: 'IN_STOCK', // Components always IN_STOCK (no buyout tracking)
            weight: null,
            imagePath: null,
            notes: null,
            importRowNumber: item.rowNumber || null
          });
          created.push(product);
        } catch (e: any) {
          errors.push({ code: item.code, error: e.message });
        }
      }
      
      // Include validation errors in the response
      const allErrors = [...validationErrors, ...errors];
      console.log(`[Components Import] Created ${created.length} components, ${allErrors.length} errors`);
      res.json({ created, errors: allErrors });
    } catch (e: any) {
      console.error('[Components Import] Error importing:', e);
      res.status(500).json({ message: 'Failed to import components', error: e.message });
    }
  });

  // Validation schema for component update items
  const componentUpdateItemSchema = z.object({
    code: z.string().min(2, 'Product code must be at least 2 characters'),
    existingId: z.number().positive('Invalid product ID'),
    name: z.string().optional().nullable(),
    supplier: z.string().optional().nullable(),
    rowNumber: z.number().optional().nullable()
  });

  // Update existing products with approved component changes
  app.post('/api/components/import/update', isAuthenticated, async (req, res) => {
    try {
      const { items } = req.body;
      
      if (!Array.isArray(items)) {
        return res.status(400).json({ message: 'items must be an array' });
      }
      
      const updated: any[] = [];
      const errors: any[] = [];
      
      for (const item of items) {
        // Validate each item
        const validation = componentUpdateItemSchema.safeParse(item);
        if (!validation.success) {
          errors.push({ 
            code: item?.code || 'unknown', 
            error: validation.error.errors.map(e => e.message).join(', ') 
          });
          continue;
        }
        
        const validItem = validation.data;
        try {
          const updateData: Record<string, any> = {
            name: validItem.name || null,
            supplier: validItem.supplier || null,
            category: 'COMPONENT', // Always set to COMPONENT
            importRowNumber: validItem.rowNumber || null
          };
          
          const product = await storage.updateProduct(validItem.existingId, updateData);
          if (product) {
            updated.push(product);
          }
        } catch (e: any) {
          errors.push({ code: validItem.code, error: e.message });
        }
      }
      
      console.log(`[Components Import] Updated ${updated.length} products to COMPONENT, ${errors.length} errors`);
      res.json({ updated, errors });
    } catch (e: any) {
      console.error('[Components Import] Error updating:', e);
      res.status(500).json({ message: 'Failed to update components', error: e.message });
    }
  });

  // Hardware checklist API endpoints
  app.get('/api/files/:fileId/hardware-checklist', isAuthenticated, async (req, res) => {
    try {
      const fileId = parseInt(req.params.fileId);
      if (isNaN(fileId)) {
        return res.status(400).json({ message: 'Invalid file ID' });
      }
      
      const items = await storage.getHardwareChecklistItems(fileId);
      const progress = await storage.getHardwareChecklistProgress(fileId);
      
      // Get product images for each item
      const productCodes = items.map(item => item.productCode);
      const products = await storage.getProductsByCode(productCodes);
      const productMap = new Map(products.map(p => [p.code.toUpperCase(), p]));
      
      // Enhance items with product images
      // CTS cut lengths are now stored directly on checklist items (item.cutLength)
      const enhancedItems = items.map(item => {
        const product = productMap.get(item.productCode.toUpperCase());
        return {
          ...item,
          imagePath: product?.imagePath || null,
          productStockStatus: product?.stockStatus || null,
          ctsCutLength: item.cutLength // Use stored cutLength directly
        };
      });
      
      res.json({ items: enhancedItems, progress });
    } catch (e: any) {
      console.error('[Hardware Checklist] Error fetching:', e);
      res.status(500).json({ message: 'Failed to fetch hardware checklist', error: e.message });
    }
  });

  // Helper function to recalculate and update BO status for a file and its pallet assignments
  // Status is based on whether buyout items are PACKED (checked off), not arrival status
  async function recalculateBoStatus(fileId: number) {
    console.log(`[BO Sync] recalculateBoStatus called for fileId: ${fileId}`);
    
    const items = await storage.getHardwareChecklistItems(fileId);
    const buyoutItems = items.filter(item => item.isBuyout);
    const buyoutPacked = buyoutItems.filter(item => item.isPacked).length;
    
    console.log(`[BO Sync] File ${fileId}: ${buyoutItems.length} buyout items, ${buyoutPacked} packed`);
    
    let boStatus: 'NO BO HARDWARE' | 'WAITING FOR BO HARDWARE' | 'BO HARDWARE ARRIVED' = 'NO BO HARDWARE';
    if (buyoutItems.length > 0) {
      boStatus = buyoutPacked === buyoutItems.length ? 'BO HARDWARE ARRIVED' : 'WAITING FOR BO HARDWARE';
    }
    
    console.log(`[BO Sync] Calculated boStatus for file ${fileId}: ${boStatus}`);
    
    await storage.updateOrderFile(fileId, { hardwareBoStatus: boStatus });
    console.log(`[BO Sync] Updated file ${fileId} hardwareBoStatus to: ${boStatus}`);
    
    // Also update all pallet file assignments for this file
    const assignments = await storage.getAssignmentsForFile(fileId);
    // Map BO status to BuyoutHardwareOption format
    const buyoutOption: BuyoutHardwareOption = boStatus === 'NO BO HARDWARE' 
      ? 'NO BUYOUT HARDWARE' 
      : boStatus;
    
    console.log(`[BO Sync] Updating ${assignments.length} pallet assignments to: ${buyoutOption}`);
    for (const assignment of assignments) {
      await storage.updateAssignmentBuyoutStatuses(assignment.id, [buyoutOption]);
    }
    
    // Also update the project's pfProductionStatus based on aggregated BO status across all files
    const file = await storage.getOrderFile(fileId);
    if (file) {
      console.log(`[BO Sync] Calling updateProjectBoProductionStatus for project ${file.projectId}`);
      await updateProjectBoProductionStatus(file.projectId);
    } else {
      console.log(`[BO Sync] WARNING: Could not find file ${fileId} to update project status`);
    }
    
    return boStatus;
  }

  app.post('/api/hardware-checklist/:itemId/toggle-packed', isAuthenticated, async (req, res) => {
    try {
      const itemId = parseInt(req.params.itemId);
      const { isPacked, packedBy } = req.body;
      
      if (isNaN(itemId)) {
        return res.status(400).json({ message: 'Invalid item ID' });
      }
      
      const updated = await storage.toggleHardwareItemPacked(itemId, isPacked, packedBy);
      if (!updated) {
        return res.status(404).json({ message: 'Item not found' });
      }
      
      // Recalculate BO status for the file when packing status changes
      const boStatus = await recalculateBoStatus(updated.fileId);
      
      // Also update project-level aggregated BO status for consistency
      const orderFile = await storage.getOrderFile(updated.fileId);
      if (orderFile) {
        await updateProjectBoProductionStatus(orderFile.projectId);
      }
      
      res.json({ ...updated, fileBoStatus: boStatus });
    } catch (e: any) {
      console.error('[Hardware Checklist] Error toggling packed:', e);
      res.status(500).json({ message: 'Failed to toggle packed status', error: e.message });
    }
  });

  app.post('/api/hardware-checklist/:itemId/toggle-buyout-arrived', isAuthenticated, async (req, res) => {
    try {
      const itemId = parseInt(req.params.itemId);
      const { buyoutArrived } = req.body;
      
      if (isNaN(itemId)) {
        return res.status(400).json({ message: 'Invalid item ID' });
      }
      
      const updated = await storage.toggleHardwareItemBuyoutArrived(itemId, buyoutArrived);
      if (!updated) {
        return res.status(404).json({ message: 'Item not found' });
      }
      
      // Recalculate BO status for the file
      const boStatus = await recalculateBoStatus(updated.fileId);
      
      // Also update project-level aggregated BO status
      const orderFile = await storage.getOrderFile(updated.fileId);
      if (orderFile) {
        console.log(`[Hardware Checklist] Syncing project ${orderFile.projectId} BO status after buyout toggle`);
        await updateProjectBoProductionStatus(orderFile.projectId);
      }
      
      res.json({ ...updated, fileBoStatus: boStatus });
    } catch (e: any) {
      console.error('[Hardware Checklist] Error toggling buyout arrived:', e);
      res.status(500).json({ message: 'Failed to toggle buyout arrived', error: e.message });
    }
  });

  // Generate hardware checklist from CSV file
  app.post('/api/files/:fileId/generate-hardware-checklist', isAuthenticated, async (req, res) => {
    try {
      const fileId = parseInt(req.params.fileId);
      if (isNaN(fileId)) {
        return res.status(400).json({ message: 'Invalid file ID' });
      }
      
      const { csvContent } = req.body;
      if (!csvContent) {
        return res.status(400).json({ message: 'CSV content required' });
      }
      
      // Parse CSV content
      const records = await parseCSV(csvContent);
      
      // Track all rows for validation
      interface ParsedRow {
        rowIndex: number;
        code: string;
        name: string;
        quantity: number;
        rawRow: string[];
        skipped: boolean;
        skipReason?: string;
      }
      
      interface ValidationError {
        rowIndex: number;
        code: string;
        name: string;
        error: string;
      }
      
      const allRows: ParsedRow[] = [];
      const validationErrors: ValidationError[] = [];
      
      // Parse all rows and track which ones are valid
      for (let i = 0; i < records.length; i++) {
        const row = records[i];
        const description = row[0]?.trim() || '';
        const code = row[2]?.trim() || '';
        const quantityStr = row[6]?.trim() || '1';
        
        // Determine if this row should be skipped
        let skipped = false;
        let skipReason: string | undefined;
        
        if (!description && !code) {
          skipped = true;
          skipReason = 'Empty row';
        } else if (!code || code.length < 3) {
          skipped = true;
          skipReason = 'No valid product code';
        } else if (code.toLowerCase().includes('codes') || code.toLowerCase().includes('manu')) {
          skipped = true;
          skipReason = 'Header row';
        } else if (description === description.toUpperCase() && !code) {
          skipped = true;
          skipReason = 'Section header';
        }
        
        const quantity = parseInt(quantityStr) || 0;
        if (!skipped && quantity <= 0) {
          validationErrors.push({
            rowIndex: i + 1,
            code,
            name: description,
            error: `Invalid quantity: "${quantityStr}"`
          });
        }
        
        allRows.push({
          rowIndex: i + 1,
          code,
          name: description,
          quantity: quantity || 1,
          rawRow: row,
          skipped,
          skipReason
        });
      }
      
      // Build skipped rows info for transparency (used in all responses)
      const skippedRowsInfo = allRows
        .filter(r => r.skipped)
        .map(r => ({
          rowIndex: r.rowIndex,
          code: r.code || '(empty)',
          name: r.name || '(empty)',
          reason: r.skipReason || 'Unknown'
        }));
      
      // Filter to valid items
      const validItems = allRows.filter(r => !r.skipped && !validationErrors.some(e => e.rowIndex === r.rowIndex));
      const expectedCount = validItems.length;
      
      if (expectedCount === 0) {
        return res.status(400).json({ 
          message: 'No valid hardware items found in CSV',
          totalRows: records.length,
          skippedRows: skippedRowsInfo.length,
          skippedRowsInfo,
          errors: validationErrors
        });
      }
      
      // Look up products to determine buyout status
      const productCodes = validItems.map(item => item.code);
      const products = await storage.getProductsByCode(productCodes);
      const productMap = new Map(products.map(p => [p.code.toUpperCase(), p]));
      
      // Build checklist items to insert
      const itemsToInsert = validItems.map((item, index) => {
        const product = productMap.get(item.code.toUpperCase());
        const isBuyout = product?.stockStatus === 'BUYOUT';
        return {
          fileId,
          productId: product?.id || null,
          productCode: item.code,
          productName: item.name,
          quantity: item.quantity,
          isBuyout,
          buyoutArrived: false,
          isPacked: false,
          packedBy: null,
          sortOrder: index
        };
      });
      
      // Use transactional replacement - atomic delete + insert
      let createdItems: any[];
      try {
        createdItems = await storage.replaceHardwareChecklist(fileId, itemsToInsert);
      } catch (txError: any) {
        console.error(`[Hardware Checklist] Transaction failed:`, txError);
        return res.status(400).json({
          message: 'Database error: failed to save checklist items. No changes were made.',
          expectedCount,
          insertedCount: 0,
          totalRows: records.length,
          skippedRows: skippedRowsInfo.length,
          skippedRowsInfo,
          errors: [...validationErrors, { rowIndex: 0, code: '', name: '', error: txError.message || 'Transaction failed' }]
        });
      }
      
      // Verify parity: expected vs created
      const insertedCount = createdItems.length;
      if (insertedCount !== expectedCount) {
        // This shouldn't happen with transactional insert, but verify anyway
        const missingCount = expectedCount - insertedCount;
        console.error(`[Hardware Checklist] Parity check failed: expected ${expectedCount}, inserted ${insertedCount}`);
        
        return res.status(400).json({
          message: `Unexpected error: ${missingCount} of ${expectedCount} items were not added`,
          expectedCount,
          insertedCount,
          totalRows: records.length,
          skippedRows: skippedRowsInfo.length,
          skippedRowsInfo,
          errors: validationErrors
        });
      }
      
      // Calculate BO status
      const hasBuyout = createdItems.some(item => item.isBuyout);
      let boStatus = 'NO BO HARDWARE';
      if (hasBuyout) {
        boStatus = 'WAITING FOR BO HARDWARE';
      }
      
      // Update the file with the BO status
      await storage.updateOrderFile(fileId, { hardwareBoStatus: boStatus });
      
      // Also update pallet file assignments
      const buyoutOption: BuyoutHardwareOption = boStatus === 'NO BO HARDWARE' 
        ? 'NO BUYOUT HARDWARE' 
        : boStatus as BuyoutHardwareOption;
      const assignments = await storage.getAssignmentsForFile(fileId);
      for (const assignment of assignments) {
        await storage.updateAssignmentBuyoutStatuses(assignment.id, [buyoutOption]);
      }
      
      // Update project-level pfProductionStatus based on all files' BO statuses
      const orderFile = await storage.getOrderFile(fileId);
      if (orderFile) {
        await updateProjectBoProductionStatus(orderFile.projectId);
      }
      
      console.log(`[Hardware Checklist] Generated ${createdItems.length} items for file ${fileId}, BO status: ${boStatus}, skipped ${skippedRowsInfo.length} rows`);
      res.json({ 
        success: true,
        items: createdItems, 
        boStatus,
        totalItems: createdItems.length,
        buyoutItems: createdItems.filter(i => i.isBuyout).length,
        expectedCount,
        insertedCount,
        totalRows: records.length,
        skippedRows: skippedRowsInfo.length,
        skippedRowsInfo, // Detailed info about skipped rows
        errors: [] // Empty means all items were added successfully
      });
    } catch (e: any) {
      console.error('[Hardware Checklist] Error generating:', e);
      res.status(500).json({ message: 'Failed to generate hardware checklist', error: e.message });
    }
  });

  // Generate hardware checklist from order file's stored CSV (rawContent)
  // New logic: cross-reference ALL CSV items against products database
  // Add if: category=HARDWARE OR (not in DB AND has hardware prefix)
  // Skip if: category=COMPONENT OR (not in DB AND no hardware prefix)
  app.post('/api/files/:fileId/generate-hardware-from-order', isAuthenticated, async (req, res) => {
    try {
      const fileId = parseInt(req.params.fileId);
      if (isNaN(fileId)) {
        return res.status(400).json({ message: 'Invalid file ID' });
      }
      
      // Get the order file with its rawContent
      const orderFile = await storage.getOrderFile(fileId);
      if (!orderFile) {
        return res.status(404).json({ message: 'Order file not found' });
      }
      
      if (!orderFile.rawContent) {
        return res.status(400).json({ message: 'No CSV content stored for this order file' });
      }
      
      // Parse the stored CSV content
      const records = await parseCSV(orderFile.rawContent);
      
      // Extract ALL items from CSV (we'll filter based on products DB)
      const { items: allItems, invalidRows, headerFound } = extractAllItemsFromCSV(records);
      
      if (!headerFound) {
        return res.status(400).json({ 
          message: 'No "Manuf code" header row found - CSV format not recognized',
          totalRows: records.length,
          errors: [{ rowIndex: 0, code: '', name: '', error: 'Header row not found' }]
        });
      }
      
      if (allItems.length === 0 && invalidRows.length === 0) {
        return res.status(400).json({ 
          message: 'No items found in CSV data section',
          totalRows: records.length,
          errors: []
        });
      }
      
      console.log(`[Hardware Checklist] Extracted ${allItems.length} valid items, ${invalidRows.length} invalid rows from order file ${fileId}`);
      
      // Look up ALL codes in products database
      const allCodes = allItems.map(item => item.code);
      const productsFromDb = await storage.getProductsByCode(allCodes);
      const productMap = new Map(productsFromDb.map(p => [p.code.toUpperCase(), p]));
      
      // Classify each item
      interface ClassifiedItem {
        rowIndex: number;
        code: string;
        name: string;
        quantity: number;
        height: number | null;
        width: number | null;
        length: number | null;
        product: typeof productsFromDb[0] | null;
        classification: 'HARDWARE_IN_DB' | 'COMPONENT_IN_DB' | 'HARDWARE_PREFIX_NOT_IN_DB' | 'NOT_HARDWARE';
      }
      
      const classifiedItems: ClassifiedItem[] = allItems.map(item => {
        const product = productMap.get(item.code.toUpperCase()) || null;
        let classification: ClassifiedItem['classification'];
        
        if (product) {
          // Item exists in database
          classification = product.category === 'HARDWARE' ? 'HARDWARE_IN_DB' : 'COMPONENT_IN_DB';
        } else {
          // Item not in database - check if it has hardware prefix
          classification = hasHardwarePrefix(item.code) ? 'HARDWARE_PREFIX_NOT_IN_DB' : 'NOT_HARDWARE';
        }
        
        return { ...item, product, classification };
      });
      
      // Filter: keep HARDWARE_IN_DB and HARDWARE_PREFIX_NOT_IN_DB
      const hardwareItems = classifiedItems.filter(
        item => item.classification === 'HARDWARE_IN_DB' || item.classification === 'HARDWARE_PREFIX_NOT_IN_DB'
      );
      
      // Track skipped items for reporting
      const skippedItems = classifiedItems.filter(
        item => item.classification === 'COMPONENT_IN_DB' || item.classification === 'NOT_HARDWARE'
      );
      
      const skippedRowsInfo = [
        ...invalidRows.map(r => ({ rowIndex: r.rowIndex, code: r.code, name: r.name, reason: r.reason })),
        ...skippedItems.map(item => ({
          rowIndex: item.rowIndex,
          code: item.code,
          name: item.name,
          reason: item.classification === 'COMPONENT_IN_DB' 
            ? 'Classified as COMPONENT in product database' 
            : 'Not a hardware item (no hardware prefix and not in database)'
        }))
      ];
      
      if (hardwareItems.length === 0) {
        return res.status(400).json({ 
          message: 'No hardware items found in order CSV',
          totalRows: records.length,
          totalItems: allItems.length,
          skippedRows: skippedRowsInfo.length,
          skippedRowsInfo,
          errors: []
        });
      }
      
      console.log(`[Hardware Checklist] Found ${hardwareItems.length} hardware items (${skippedItems.length} skipped as non-hardware) in order file ${fileId}`);
      
      // Build checklist items to insert
      const itemsToInsert = hardwareItems.map((item, index) => {
        const isBuyout = item.product?.stockStatus === 'BUYOUT';
        const notInDatabase = item.classification === 'HARDWARE_PREFIX_NOT_IN_DB';
        const isCts = item.code.toUpperCase().includes('.CTS');
        return {
          fileId,
          productId: item.product?.id || null,
          productCode: item.code,
          productName: item.name,
          quantity: item.quantity,
          cutLength: isCts ? item.length : null, // Only store cutLength for CTS parts
          isBuyout,
          buyoutArrived: false,
          isPacked: false,
          packedBy: null,
          sortOrder: index,
          notInDatabase
        };
      });
      
      const expectedCount = itemsToInsert.length;
      
      // Use transactional replacement - atomic delete + insert
      let createdItems: any[];
      try {
        createdItems = await storage.replaceHardwareChecklist(fileId, itemsToInsert);
      } catch (txError: any) {
        console.error(`[Hardware Checklist] Transaction failed:`, txError);
        return res.status(400).json({
          message: 'Database error: failed to save checklist items. No changes were made.',
          expectedCount,
          insertedCount: 0,
          totalRows: records.length,
          skippedRows: skippedRowsInfo.length,
          skippedRowsInfo,
          errors: [{ rowIndex: 0, code: '', name: '', error: txError.message || 'Transaction failed' }]
        });
      }
      
      // Verify parity: expected vs created
      const insertedCount = createdItems.length;
      if (insertedCount !== expectedCount) {
        const missingCount = expectedCount - insertedCount;
        console.error(`[Hardware Checklist] Parity check failed: expected ${expectedCount}, inserted ${insertedCount}`);
        return res.status(400).json({
          message: `Unexpected error: ${missingCount} of ${expectedCount} items were not added`,
          expectedCount,
          insertedCount,
          totalRows: records.length,
          skippedRows: skippedRowsInfo.length,
          skippedRowsInfo,
          errors: []
        });
      }
      
      // Calculate BO status
      const hasBuyout = createdItems.some(item => item.isBuyout);
      let boStatus = 'NO BO HARDWARE';
      if (hasBuyout) {
        boStatus = 'WAITING FOR BO HARDWARE';
      }
      
      // Update the file with the BO status
      await storage.updateOrderFile(fileId, { hardwareBoStatus: boStatus });
      
      // Also update pallet file assignments
      const buyoutOption: BuyoutHardwareOption = boStatus === 'NO BO HARDWARE' 
        ? 'NO BUYOUT HARDWARE' 
        : boStatus as BuyoutHardwareOption;
      const assignments = await storage.getAssignmentsForFile(fileId);
      for (const assignment of assignments) {
        await storage.updateAssignmentBuyoutStatuses(assignment.id, [buyoutOption]);
      }
      
      // Update project-level pfProductionStatus based on all files' BO statuses
      await updateProjectBoProductionStatus(orderFile.projectId);
      
      // Count matched vs unmatched products
      const matchedProducts = createdItems.filter((item: any) => item.productId !== null && !item.notInDatabase).length;
      const notInDatabaseCount = createdItems.filter((item: any) => item.notInDatabase).length;
      
      console.log(`[Hardware Checklist] Generated ${createdItems.length} items from order CSV for file ${fileId}, BO status: ${boStatus}, matched: ${matchedProducts}, not in DB: ${notInDatabaseCount}, skipped: ${skippedRowsInfo.length}`);
      
      res.json({ 
        success: true,
        items: createdItems, 
        boStatus,
        totalItems: createdItems.length,
        buyoutItems: createdItems.filter((i: any) => i.isBuyout).length,
        expectedCount,
        insertedCount,
        totalRows: records.length,
        skippedRows: skippedRowsInfo.length,
        skippedRowsInfo,
        matchedProducts,
        notInDatabaseCount,
        errors: [] // Empty means all valid items were added successfully
      });
    } catch (e: any) {
      console.error('[Hardware Checklist] Error generating from order:', e);
      res.status(500).json({ message: 'Failed to generate hardware checklist', error: e.message });
    }
  });

  // Link images to products by row numbers
  app.post('/api/products/link-images', isAuthenticated, async (req, res) => {
    try {
      const { imagePath, rowNumbers } = req.body;
      
      if (!imagePath || !Array.isArray(rowNumbers)) {
        return res.status(400).json({ message: 'imagePath and rowNumbers array required' });
      }
      
      // Find products by their import row numbers
      const products = await storage.getProductsByImportRowNumbers(rowNumbers);
      
      const updated: any[] = [];
      for (const product of products) {
        const updatedProduct = await storage.updateProduct(product.id, { imagePath });
        if (updatedProduct) {
          updated.push(updatedProduct);
        }
      }
      
      console.log(`[Products] Linked image to ${updated.length} products for rows: ${rowNumbers.join(', ')}`);
      res.json({ updated });
    } catch (e: any) {
      console.error('[Products] Error linking images:', e);
      res.status(500).json({ message: 'Failed to link images', error: e.message });
    }
  });

  // ============================================
  // Allowed Users Management Endpoints
  // ============================================

  // Get all allowed users
  app.get('/api/admin/allowed-users', isAuthenticated, async (req, res) => {
    try {
      const users = await storage.getAllowedUsers();
      res.json(users);
    } catch (e: any) {
      console.error('[Admin] Error getting allowed users:', e);
      res.status(500).json({ message: 'Failed to get allowed users', error: e.message });
    }
  });

  // Add a new allowed user
  app.post('/api/admin/allowed-users', isAuthenticated, async (req, res) => {
    try {
      const { email, username, displayName } = req.body;
      
      // Require at least email or username
      const hasEmail = email && typeof email === 'string' && email.trim();
      const hasUsername = username && typeof username === 'string' && username.trim();
      
      if (!hasEmail && !hasUsername) {
        return res.status(400).json({ message: 'Email or username is required' });
      }

      // Check if user already exists by email or username
      if (hasEmail) {
        const existingByEmail = await storage.getAllowedUserByEmail(email.trim());
        if (existingByEmail) {
          return res.status(409).json({ message: 'Email already exists in allowed list' });
        }
      }
      if (hasUsername) {
        const existingByUsername = await storage.getAllowedUserByUsername(username.trim());
        if (existingByUsername) {
          return res.status(409).json({ message: 'Username already exists in allowed list' });
        }
      }

      // Get current user info from session for addedBy
      const currentUser = (req as any).user?.email || (req as any).user?.username || 'unknown';
      
      const user = await storage.createAllowedUser({
        email: hasEmail ? email.trim() : null,
        username: hasUsername ? username.trim() : null,
        displayName: displayName?.trim() || null,
        addedBy: currentUser
      });
      
      console.log(`[Admin] Added allowed user: ${email || username} by ${currentUser}`);
      res.json(user);
    } catch (e: any) {
      console.error('[Admin] Error adding allowed user:', e);
      res.status(500).json({ message: 'Failed to add allowed user', error: e.message });
    }
  });

  // Delete an allowed user
  app.delete('/api/admin/allowed-users/:id', isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: 'Invalid user ID' });
      }

      const user = await storage.getAllowedUser(id);
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      const deleted = await storage.deleteAllowedUser(id);
      console.log(`[Admin] Removed allowed user: ${user.email || user.username}`);
      res.json({ success: deleted });
    } catch (e: any) {
      console.error('[Admin] Error deleting allowed user:', e);
      res.status(500).json({ message: 'Failed to delete allowed user', error: e.message });
    }
  });

  // Toggle admin status for a user (admin only)
  app.post('/api/admin/allowed-users/:id/toggle-admin', isAuthenticated, async (req, res) => {
    try {
      // Check if requester is admin
      const replitUser = (req as any).user;
      const username = replitUser?.claims?.username || replitUser?.name;
      const email = replitUser?.claims?.email;
      if (!username && !email) {
        return res.status(401).json({ message: 'Not authenticated' });
      }
      const requesterIsAdmin = await storage.isUserAdmin(username, email);
      if (!requesterIsAdmin) {
        return res.status(403).json({ message: 'Only admins can modify admin status' });
      }

      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: 'Invalid user ID' });
      }

      const user = await storage.getAllowedUser(id);
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      const newIsAdmin = !user.isAdmin;
      await storage.updateAllowedUserAdmin(id, newIsAdmin);
      console.log(`[Admin] ${replitUser.name} toggled admin status for ${user.email || user.username}: ${newIsAdmin}`);
      res.json({ success: true, isAdmin: newIsAdmin });
    } catch (e: any) {
      console.error('[Admin] Error toggling admin status:', e);
      res.status(500).json({ message: 'Failed to toggle admin status', error: e.message });
    }
  });

  // Bootstrap first admin (one-time use, no auth required if no admin exists)
  app.post('/api/admin/bootstrap-admin', async (req, res) => {
    try {
      const { email } = req.body;
      if (!email) {
        return res.status(400).json({ message: 'Email required' });
      }
      
      // Check if any admin exists - this endpoint only works when no admin exists
      const allUsers = await storage.getAllowedUsers();
      const existingAdmin = allUsers.find(u => u.isAdmin === true);
      if (existingAdmin) {
        return res.status(403).json({ message: 'Admin already exists. Use the toggle endpoint.' });
      }
      
      // Find user by email and make them admin
      const user = allUsers.find(u => u.email?.toLowerCase() === email.toLowerCase());
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }
      
      await storage.updateAllowedUserAdmin(user.id, true);
      console.log(`[Admin] Bootstrap: Set ${email} as first admin`);
      res.json({ success: true, message: `${email} is now an admin` });
    } catch (e: any) {
      console.error('[Admin] Bootstrap error:', e);
      res.status(500).json({ message: 'Failed to bootstrap admin', error: e.message });
    }
  });

  // Check if current user is admin
  app.get('/api/admin/is-admin', isAuthenticated, async (req, res) => {
    try {
      const replitUser = (req as any).user;
      const username = replitUser?.claims?.username || replitUser?.name;
      const email = replitUser?.claims?.email;
      const isAdmin = await storage.isUserAdmin(username, email);
      res.json({ isAdmin });
    } catch (e: any) {
      console.error('[Admin] Error checking admin status:', e);
      res.status(500).json({ message: 'Failed to check admin status', error: e.message });
    }
  });

  // ==================== GOOGLE SHEETS BACKUP ====================
  app.post('/api/backup/google-sheets', isAuthenticated, async (req, res) => {
    try {
      console.log('[Backup] Starting Google Sheets backup...');
      
      const sheets = await getGoogleSheetsClient();
      
      const timestamp = new Date().toISOString().slice(0, 19).replace('T', ' ');
      const title = `PF Order Backup - ${timestamp}`;
      
      const spreadsheet = await sheets.spreadsheets.create({
        requestBody: {
          properties: { title },
          sheets: [
            { properties: { title: 'Orders' } },
            { properties: { title: 'Order Files' } },
            { properties: { title: 'Products' } },
            { properties: { title: 'Pallets' } },
            { properties: { title: 'Hardware Checklist' } },
            { properties: { title: 'Packing Checklist' } },
          ]
        }
      });
      
      const spreadsheetId = spreadsheet.data.spreadsheetId!;
      const spreadsheetUrl = spreadsheet.data.spreadsheetUrl!;
      console.log('[Backup] Created spreadsheet:', spreadsheetId);
      
      const drive = await getGoogleDriveClient();
      const FOLDER_NAME = 'Perfect Fit Orders Replit Backup';
      
      const folderSearch = await drive.files.list({
        q: `mimeType='application/vnd.google-apps.folder' and name='${FOLDER_NAME}' and trashed=false`,
        fields: 'files(id, name)',
        spaces: 'drive',
      });
      
      let folderId: string;
      if (folderSearch.data.files && folderSearch.data.files.length > 0) {
        folderId = folderSearch.data.files[0].id!;
        console.log('[Backup] Found existing folder:', folderId);
      } else {
        const folder = await drive.files.create({
          requestBody: {
            name: FOLDER_NAME,
            mimeType: 'application/vnd.google-apps.folder',
          },
          fields: 'id',
        });
        folderId = folder.data.id!;
        console.log('[Backup] Created new folder:', folderId);
      }
      
      const file = await drive.files.get({
        fileId: spreadsheetId,
        fields: 'parents',
      });
      const previousParents = (file.data.parents || []).join(',');
      await drive.files.update({
        fileId: spreadsheetId,
        addParents: folderId,
        removeParents: previousParents,
        fields: 'id, parents',
      });
      console.log('[Backup] Moved spreadsheet to folder:', FOLDER_NAME);
      
      const allProjects = await storage.getProjects();
      const allProducts = await db.select().from(
        (await import('@shared/schema')).products
      );
      
      const { pallets: palletsTable, palletFileAssignments, orderFiles: orderFilesTable, hardwareChecklistItems: hwTable, packingSlipItems: psTable } = await import('@shared/schema');
      
      const allOrderFiles = await db.select().from(orderFilesTable);
      const allPallets = await db.select().from(palletsTable);
      const allPalletAssignments = await db.select().from(palletFileAssignments);
      const allHardwareItems = await db.select().from(hwTable);
      const allPackingItems = await db.select().from(psTable);
      
      const ordersData: any[][] = [
        ['ID', 'Name', 'Date', 'Dealer', 'Shipping Address', 'Phone', 'Tax ID', 'Order ID', 'Status', 'Asana Task ID', 'Asana Section', 'PF Order Status', 'PF Production Status', 'Cienapps Job #', 'Notes', 'Created At']
      ];
      for (const p of allProjects) {
        ordersData.push([
          p.id, p.name, p.date || '', p.dealer || '', p.shippingAddress || '', p.phone || '', 
          p.taxId || '', p.orderId || '', p.status, p.asanaTaskId || '', 
          p.asanaSection || '', p.pfOrderStatus || '',
          Array.isArray(p.pfProductionStatus) ? p.pfProductionStatus.join(', ') : '',
          p.cienappsJobNumber || '', p.notes || '',
          p.createdAt ? new Date(p.createdAt).toISOString() : ''
        ]);
      }
      
      const filesData: any[][] = [
        ['ID', 'Project ID', 'Filename', 'PO Number', 'Core Parts', 'Dovetails', 'Assembled Drawers', '5-Piece Doors', 'Weight (lbs)', 'Max Length', 'Max Width', 'Has Glass', 'Glass Inserts', 'Glass Shelves', 'Has MJ Doors', 'Has Richelieu Doors', 'Has Double Thick', 'Has Shaker Doors', 'MJ Doors Count', 'Richelieu Doors Count', 'Double Thick Count', 'Wall Rail Pieces', 'Allmoxy Job #', 'HW BO Status', 'Packaging Link', 'Notes', 'Created At']
      ];
      for (const f of allOrderFiles) {
        filesData.push([
          f.id, f.projectId, f.originalFilename, f.poNumber || '', 
          f.coreParts || 0, f.dovetails || 0, f.assembledDrawers || 0, f.fivePieceDoors || 0,
          f.weightLbs || 0, f.maxLength || 0, f.maxWidth || 0,
          f.hasGlassParts ? 'YES' : 'NO', f.glassInserts || 0, f.glassShelves || 0, 
          f.hasMJDoors ? 'YES' : 'NO', f.hasRichelieuDoors ? 'YES' : 'NO',
          f.hasDoubleThick ? 'YES' : 'NO', f.hasShakerDoors ? 'YES' : 'NO',
          f.mjDoorsCount || 0, f.richelieuDoorsCount || 0, f.doubleThickCount || 0,
          f.wallRailPieces || 0, f.allmoxyJobNumber || '', f.hardwareBoStatus || '',
          f.packagingLink || '', f.notes || '', 
          f.createdAt ? new Date(f.createdAt).toISOString() : ''
        ]);
      }
      
      const productsData: any[][] = [
        ['ID', 'Code', 'Name', 'Supplier', 'Category', 'Stock Status', 'Weight (g)', 'Import Row #', 'Notes', 'Created At', 'Updated At']
      ];
      for (const p of allProducts) {
        productsData.push([
          p.id, p.code, p.name || '', p.supplier || '', p.category, p.stockStatus || '',
          p.weight || '', p.importRowNumber || '', p.notes || '',
          p.createdAt ? new Date(p.createdAt).toISOString() : '',
          p.updatedAt ? new Date(p.updatedAt).toISOString() : ''
        ]);
      }
      
      const palletAssignmentMap = new Map<number, number[]>();
      for (const a of allPalletAssignments) {
        if (!palletAssignmentMap.has(a.palletId)) palletAssignmentMap.set(a.palletId, []);
        palletAssignmentMap.get(a.palletId)!.push(a.fileId);
      }
      
      const palletsData: any[][] = [
        ['ID', 'Project ID', 'Pallet #', 'Size', 'Custom Size', 'Notes', 'Assigned File IDs', 'Created At']
      ];
      for (const p of allPallets) {
        const fileIds = palletAssignmentMap.get(p.id) || [];
        palletsData.push([
          p.id, p.projectId, p.palletNumber, p.size, p.customSize || '',
          p.notes || '', fileIds.join(', '),
          p.createdAt ? new Date(p.createdAt).toISOString() : ''
        ]);
      }
      
      const hwData: any[][] = [
        ['ID', 'File ID', 'Product ID', 'Product Code', 'Product Name', 'Quantity', 'Cut Length', 'Is Buyout', 'Buyout Arrived', 'Is Packed', 'Packed By', 'Packed At', 'Not In Database', 'Sort Order', 'Created At']
      ];
      for (const h of allHardwareItems) {
        hwData.push([
          h.id, h.fileId, h.productId || '', h.productCode, h.productName || '', h.quantity,
          h.cutLength || '', h.isBuyout ? 'YES' : 'NO', h.buyoutArrived ? 'YES' : 'NO',
          h.isPacked ? 'YES' : 'NO', h.packedBy || '', 
          h.packedAt ? new Date(h.packedAt).toISOString() : '',
          h.notInDatabase ? 'YES' : 'NO', h.sortOrder || 0,
          h.createdAt ? new Date(h.createdAt).toISOString() : ''
        ]);
      }
      
      const psData: any[][] = [
        ['ID', 'File ID', 'Part Code', 'Color', 'Quantity', 'Height', 'Width', 'Length', 'Thickness', 'Description', 'Is Checked', 'Checked By', 'Checked At', 'Sort Order', 'Created At']
      ];
      for (const p of allPackingItems) {
        psData.push([
          p.id, p.fileId, p.partCode, p.color || '', p.quantity,
          p.height || '', p.width || '', p.length || '', p.thickness || '',
          p.description || '', p.isChecked ? 'YES' : 'NO', p.checkedBy || '',
          p.checkedAt ? new Date(p.checkedAt).toISOString() : '',
          p.sortOrder || 0,
          p.createdAt ? new Date(p.createdAt).toISOString() : ''
        ]);
      }
      
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId,
        requestBody: {
          valueInputOption: 'RAW',
          data: [
            { range: 'Orders!A1', values: ordersData },
            { range: 'Order Files!A1', values: filesData },
            { range: 'Products!A1', values: productsData },
            { range: 'Pallets!A1', values: palletsData },
            { range: 'Hardware Checklist!A1', values: hwData },
            { range: 'Packing Checklist!A1', values: psData },
          ]
        }
      });
      
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: spreadsheet.data.sheets!.map(sheet => ({
            repeatCell: {
              range: {
                sheetId: sheet.properties!.sheetId!,
                startRowIndex: 0,
                endRowIndex: 1,
              },
              cell: {
                userEnteredFormat: {
                  backgroundColor: { red: 0.2, green: 0.4, blue: 0.7 },
                  textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } }
                }
              },
              fields: 'userEnteredFormat(backgroundColor,textFormat)'
            }
          }))
        }
      });
      
      console.log('[Backup] Google Sheets backup complete:', spreadsheetUrl);
      
      const stats = {
        orders: allProjects.length,
        files: allOrderFiles.length,
        products: allProducts.length,
        pallets: allPallets.length,
        hardwareItems: allHardwareItems.length,
        packingItems: allPackingItems.length,
      };
      
      res.json({ 
        success: true,
        url: spreadsheetUrl,
        message: 'Backup completed successfully', 
        spreadsheetUrl,
        spreadsheetId,
        title,
        stats
      });
    } catch (e: any) {
      console.error('[Backup] Google Sheets backup failed:', e);
      res.status(500).json({ success: false, error: e.message, message: 'Backup failed' });
    }
  });

  app.get('/api/backup/status', isAuthenticated, async (_req, res) => {
    try {
      res.json(getBackupSchedulerStatus());
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // Check if a specific user is allowed (for authorization checks)
  app.get('/api/admin/check-allowed/:username', async (req, res) => {
    try {
      const username = req.params.username;
      const isAllowed = await storage.isUserAllowed(username);
      res.json({ username, isAllowed });
    } catch (e: any) {
      console.error('[Admin] Error checking if user is allowed:', e);
      res.status(500).json({ message: 'Failed to check user', error: e.message });
    }
  });

  // ===== Settings Endpoints =====

  app.get('/api/admin/settings', isAuthenticated, async (_req, res) => {
    try {
      const settings = await storage.getAllSettings();
      res.json(settings);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get('/api/admin/settings/:key', isAuthenticated, async (req, res) => {
    try {
      const setting = await storage.getSetting(req.params.key);
      if (!setting) {
        return res.status(404).json({ message: 'Setting not found' });
      }
      res.json(setting);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.put('/api/admin/settings/:key', isAuthenticated, async (req, res) => {
    try {
      const { value, description } = req.body;
      if (typeof value !== 'string') {
        return res.status(400).json({ message: 'value is required and must be a string' });
      }
      const setting = await storage.setSetting(req.params.key, value, description);
      res.json(setting);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // Get color breakdown for a project (computed from stored CSV data)
  // Returns per-file material breakdown: each file with its color/quantity list
  // Excludes: hardware (M-, H., R-, S. prefixes), dovetails (DBX/SDBX), glass items, empty color codes
  app.get('/api/projects/:projectId/color-breakdown', async (req, res) => {
    try {
      const projectId = parseInt(req.params.projectId);
      const files = await storage.getProjectFiles(projectId);
      const colorGridEntries = await storage.getColorGrid();

      const colorMap = new Map(colorGridEntries.map(e => [e.code.toUpperCase(), { originalCode: e.code, description: e.description }]));

      const fileBreakdowns: { fileId: number; fileName: string; totalParts: number; colors: { code: string; description: string; quantity: number }[] }[] = [];

      for (const file of files) {
        if (!file.rawContent) continue;

        const records = await parseCSV(file.rawContent);
        let dataStartIndex = -1;
        for (let i = 0; i < records.length; i++) {
          if (records[i][0]?.toLowerCase().includes('manuf')) {
            dataStartIndex = i + 1;
            break;
          }
        }
        if (dataStartIndex === -1) continue;

        const fileColors: Record<string, { quantity: number; description: string }> = {};

        for (let i = dataStartIndex; i < records.length; i++) {
          const row = records[i];
          const sku = (row[0] || '').trim();
          const colorCode = (row[1] || '').trim();
          const quantity = parseInt(row[2] || '0') || 0;

          if (!sku || quantity <= 0 || !colorCode) continue;

          const upperSku = sku.toUpperCase();
          if (upperSku.startsWith('H.') || upperSku.startsWith('M.') || upperSku.startsWith('M-') ||
              upperSku.startsWith('R-') || upperSku.startsWith('R.') || upperSku.startsWith('S.')) continue;

          if (upperSku.startsWith('DBX') || upperSku.startsWith('SDBX')) continue;

          const upperColor = colorCode.toUpperCase();
          if (upperColor.includes('GLASS')) continue;

          const colorEntry = colorMap.get(upperColor);
          if (!colorEntry) continue;

          const normalizedCode = colorEntry.originalCode;
          if (!fileColors[normalizedCode]) {
            fileColors[normalizedCode] = { quantity: 0, description: colorEntry.description };
          }
          fileColors[normalizedCode].quantity += quantity;
        }

        const colors = Object.entries(fileColors).map(([code, data]) => ({
          code,
          description: data.description,
          quantity: data.quantity
        })).sort((a, b) => b.quantity - a.quantity);

        if (colors.length > 0) {
          fileBreakdowns.push({
            fileId: file.id,
            fileName: file.originalFilename,
            totalParts: colors.reduce((sum, c) => sum + c.quantity, 0),
            colors
          });
        }
      }

      res.json(fileBreakdowns);
    } catch (e: any) {
      res.status(500).json({ message: 'Failed to compute color breakdown', error: e.message });
    }
  });

  // Setup Wizard Routes
  const SEED_FORMULAS: Array<{ name: string; type: 'pricing' | 'export'; formula: string }> = [
    {
      name: 'pricing.shelves',
      type: 'pricing',
      formula: `(shelves.base_price + (width / 304.8) * (height / 304.8) * shelves.sq_ft_price) * (1 + shelves.margin / 100) * (1 + color.level_percent_upcharge / 100) * quantity`,
    },
    {
      name: 'pricing.corner_shelves',
      type: 'pricing',
      formula: `(shelves.base_price + (width / 304.8) * (height / 304.8) * shelves.sq_ft_price) * (1 + shelves.margin / 100) * (1 + color.level_percent_upcharge / 100) * quantity`,
    },
    {
      name: 'pricing.outside_corner_shelves',
      type: 'pricing',
      formula: `(shelves.base_price + (width / 304.8) * (height / 304.8) * shelves.sq_ft_price) * (1 + shelves.margin / 100) * (1 + color.level_percent_upcharge / 100) * quantity`,
    },
    {
      name: 'pricing.garage_shelves',
      type: 'pricing',
      formula: `(shelves.base_price + (width / 304.8) * (height / 304.8) * shelves.sq_ft_price) * (1 + shelves.margin / 100) * (1 + color.level_percent_upcharge / 100) * quantity`,
    },
    {
      name: 'pricing.island_shelves',
      type: 'pricing',
      formula: `(shelves.base_price + (width / 304.8) * (height / 304.8) * shelves.sq_ft_price) * (1 + shelves.margin / 100) * (1 + color.level_percent_upcharge / 100) * quantity`,
    },
    {
      name: 'pricing.drawer_boxes',
      type: 'pricing',
      formula: `(drawer_boxes.base_price + (width / 304.8) * (height / 304.8) * drawer_boxes.sq_ft_price) * (1 + drawer_boxes.margin / 100) * (1 + color.level_percent_upcharge / 100) * quantity`,
    },
    {
      name: 'pricing.inset_drawer_boxes',
      type: 'pricing',
      formula: `(drawer_boxes.base_price + (width / 304.8) * (height / 304.8) * drawer_boxes.sq_ft_price) * (1 + drawer_boxes.margin / 100) * (1 + color.level_percent_upcharge / 100) * quantity`,
    },
    {
      name: 'pricing.dovetail_drawer_boxes',
      type: 'pricing',
      formula: `(drawer_boxes.base_price + (width / 304.8) * (height / 304.8) * drawer_boxes.sq_ft_price) * (1 + drawer_boxes.margin / 100) * (1 + color.level_percent_upcharge / 100) * quantity`,
    },
    {
      name: 'pricing.doors',
      type: 'pricing',
      formula: `(doors.base_price + (width / 304.8) * (height / 304.8) * doors.sq_ft_price) * (1 + doors.margin / 100) * (1 + color.level_percent_upcharge / 100) * quantity`,
    },
    {
      name: 'pricing.doors_tfl90_shaker',
      type: 'pricing',
      formula: `(doors.base_price + (width / 304.8) * (height / 304.8) * color.tfl90_door_sqft_cost) * (1 + doors.margin / 100) * (1 + color.level_percent_upcharge / 100) * quantity`,
    },
    {
      name: 'pricing.doors_poly45',
      type: 'pricing',
      formula: `(doors.base_price + (width / 304.8) * (height / 304.8) * color.poly45_door_sqft_cost) * (1 + doors.margin / 100) * (1 + color.level_percent_upcharge / 100) * quantity`,
    },
    {
      name: 'pricing.drawer_fronts',
      type: 'pricing',
      formula: `(doors.base_price + (width / 304.8) * (height / 304.8) * doors.sq_ft_price) * (1 + doors.margin / 100) * (1 + color.level_percent_upcharge / 100) * quantity`,
    },
    {
      name: 'pricing.modular_drawer_fronts',
      type: 'pricing',
      formula: `(doors.base_price + (width / 304.8) * (height / 304.8) * doors.sq_ft_price) * (1 + doors.margin / 100) * (1 + color.level_percent_upcharge / 100) * quantity`,
    },
    {
      name: 'pricing.product_parts',
      type: 'pricing',
      formula: `(product_parts.base_price + (width / 304.8) * (height / 304.8) * product_parts.sq_ft_price) * (1 + product_parts.margin / 100) * (1 + color.level_percent_upcharge / 100) * quantity`,
    },
    {
      name: 'pricing.closet_panels',
      type: 'pricing',
      formula: `(product_parts.base_price + (width / 304.8) * (height / 304.8) * product_parts.sq_ft_price) * (1 + product_parts.margin / 100) * (1 + color.level_percent_upcharge / 100) * quantity`,
    },
    {
      name: 'pricing.wall_panels',
      type: 'pricing',
      formula: `(product_parts.base_price + (width / 304.8) * (height / 304.8) * product_parts.sq_ft_price) * (1 + product_parts.margin / 100) * (1 + color.level_percent_upcharge / 100) * quantity`,
    },
    {
      name: 'pricing.floor_panels',
      type: 'pricing',
      formula: `(product_parts.base_price + (width / 304.8) * (height / 304.8) * product_parts.sq_ft_price) * (1 + product_parts.margin / 100) * (1 + color.level_percent_upcharge / 100) * quantity`,
    },
    {
      name: 'pricing.garage_panels',
      type: 'pricing',
      formula: `(product_parts.base_price + (width / 304.8) * (height / 304.8) * product_parts.sq_ft_price) * (1 + product_parts.margin / 100) * (1 + color.level_percent_upcharge / 100) * quantity`,
    },
    {
      name: 'pricing.island_panels',
      type: 'pricing',
      formula: `(product_parts.base_price + (width / 304.8) * (height / 304.8) * product_parts.sq_ft_price) * (1 + product_parts.margin / 100) * (1 + color.level_percent_upcharge / 100) * quantity`,
    },
    {
      name: 'pricing.dividers',
      type: 'pricing',
      formula: `(product_parts.base_price + (width / 304.8) * (height / 304.8) * product_parts.sq_ft_price) * (1 + product_parts.margin / 100) * (1 + color.level_percent_upcharge / 100) * quantity`,
    },
    {
      name: 'pricing.back_panels',
      type: 'pricing',
      formula: `(product_parts.base_price + (width / 304.8) * (height / 304.8) * product_parts.sq_ft_price) * (1 + product_parts.margin / 100) * (1 + color.level_percent_upcharge / 100) * quantity`,
    },
    {
      name: 'pricing.fillers',
      type: 'pricing',
      formula: `(product_parts.base_price + (width / 304.8) * (height / 304.8) * product_parts.sq_ft_price) * (1 + product_parts.margin / 100) * (1 + color.level_percent_upcharge / 100) * quantity`,
    },
    {
      name: 'pricing.cleats',
      type: 'pricing',
      formula: `(product_parts.base_price + (width / 304.8) * (height / 304.8) * product_parts.sq_ft_price) * (1 + product_parts.margin / 100) * (1 + color.level_percent_upcharge / 100) * quantity`,
    },
    {
      name: 'pricing.crown_moulding',
      type: 'pricing',
      formula: `(product_parts.base_price + (width / 304.8) * product_parts.sq_ft_price) * (1 + product_parts.margin / 100) * (1 + color.level_percent_upcharge / 100) * quantity`,
    },
    {
      name: 'pricing.mj_doors',
      type: 'pricing',
      formula: `(mjdoors.base_price + (width / 304.8) * (height / 304.8) * mjdoors.sq_ft_price) * (1 + mjdoors.margin / 100) * quantity`,
    },
    {
      name: 'pricing.mj_doors_half',
      type: 'pricing',
      formula: `(mjdoors.base_price + (width / 304.8) * (height / 304.8) * mjdoors.sq_ft_price) * (1 + mjdoors.margin / 100) * quantity`,
    },
    {
      name: 'export.shelves',
      type: 'export',
      formula: `[Item]
Type=1
Width={{item.width}}
Height={{item.height}}
Qty={{item.quantity}}
Material={{shelves.material}}
Comment={{item.description}}`,
    },
    {
      name: 'export.corner_shelves',
      type: 'export',
      formula: `[Item]
Type=1
Width={{item.width}}
Height={{item.height}}
Qty={{item.quantity}}
Material={{shelves.material}}
Comment=Corner - {{item.description}}`,
    },
    {
      name: 'export.outside_corner_shelves',
      type: 'export',
      formula: `[Item]
Type=1
Width={{item.width}}
Height={{item.height}}
Qty={{item.quantity}}
Material={{shelves.material}}
Comment=Outside Corner - {{item.description}}`,
    },
    {
      name: 'export.garage_shelves',
      type: 'export',
      formula: `[Item]
Type=1
Width={{item.width}}
Height={{item.height}}
Qty={{item.quantity}}
Material={{shelves.material}}
Comment=Garage - {{item.description}}`,
    },
    {
      name: 'export.island_shelves',
      type: 'export',
      formula: `[Item]
Type=1
Width={{item.width}}
Height={{item.height}}
Qty={{item.quantity}}
Material={{shelves.material}}
Comment=Island - {{item.description}}`,
    },
    {
      name: 'export.drawer_boxes',
      type: 'export',
      formula: `[Item]
Type=3
Width={{item.width}}
Height={{item.height}}
Depth={{item.depth}}
Qty={{item.quantity}}
Material={{color.material}}
Comment={{item.description}}`,
    },
    {
      name: 'export.inset_drawer_boxes',
      type: 'export',
      formula: `[Item]
Type=3
Width={{item.width}}
Height={{item.height}}
Depth={{item.depth}}
Qty={{item.quantity}}
Material={{color.material}}
Comment=Inset - {{item.description}}`,
    },
    {
      name: 'export.dovetail_drawer_boxes',
      type: 'export',
      formula: `[Item]
Type=3
Width={{item.width}}
Height={{item.height}}
Depth={{item.depth}}
Qty={{item.quantity}}
Material={{color.material}}
Comment=Dovetail - {{item.description}}`,
    },
    {
      name: 'export.doors',
      type: 'export',
      formula: `[Item]
Type=2
Width={{item.width}}
Height={{item.height}}
Qty={{item.quantity}}
Material={{color.material}}
Comment={{item.description}}`,
    },
    {
      name: 'export.doors_tfl90_shaker',
      type: 'export',
      formula: `[Item]
Type=2
Width={{item.width}}
Height={{item.height}}
Qty={{item.quantity}}
Material={{color.material}}
Comment=TFL90 Shaker - {{item.description}}`,
    },
    {
      name: 'export.doors_poly45',
      type: 'export',
      formula: `[Item]
Type=2
Width={{item.width}}
Height={{item.height}}
Qty={{item.quantity}}
Material={{color.material}}
Comment=Poly45 - {{item.description}}`,
    },
    {
      name: 'export.drawer_fronts',
      type: 'export',
      formula: `[Item]
Type=2
Width={{item.width}}
Height={{item.height}}
Qty={{item.quantity}}
Material={{color.material}}
Comment=Drawer Front - {{item.description}}`,
    },
    {
      name: 'export.modular_drawer_fronts',
      type: 'export',
      formula: `[Item]
Type=2
Width={{item.width}}
Height={{item.height}}
Qty={{item.quantity}}
Material={{color.material}}
Comment=Mod Drawer Front - {{item.description}}`,
    },
    {
      name: 'export.product_parts',
      type: 'export',
      formula: `[Item]
Type=1
Width={{item.width}}
Height={{item.height}}
Qty={{item.quantity}}
Material={{color.material}}
Comment={{item.description}}`,
    },
    {
      name: 'export.closet_panels',
      type: 'export',
      formula: `[Item]
Type=1
Width={{item.width}}
Height={{item.height}}
Qty={{item.quantity}}
Material={{color.material}}
Comment={{item.description}}`,
    },
    {
      name: 'export.wall_panels',
      type: 'export',
      formula: `[Item]
Type=1
Width={{item.width}}
Height={{item.height}}
Qty={{item.quantity}}
Material={{color.material}}
Comment=Wall Panel - {{item.description}}`,
    },
    {
      name: 'export.floor_panels',
      type: 'export',
      formula: `[Item]
Type=1
Width={{item.width}}
Height={{item.height}}
Qty={{item.quantity}}
Material={{color.material}}
Comment=Floor Panel - {{item.description}}`,
    },
    {
      name: 'export.garage_panels',
      type: 'export',
      formula: `[Item]
Type=1
Width={{item.width}}
Height={{item.height}}
Qty={{item.quantity}}
Material={{color.material}}
Comment=Garage Panel - {{item.description}}`,
    },
    {
      name: 'export.island_panels',
      type: 'export',
      formula: `[Item]
Type=1
Width={{item.width}}
Height={{item.height}}
Qty={{item.quantity}}
Material={{color.material}}
Comment=Island Panel - {{item.description}}`,
    },
    {
      name: 'export.dividers',
      type: 'export',
      formula: `[Item]
Type=1
Width={{item.width}}
Height={{item.height}}
Qty={{item.quantity}}
Material={{color.material}}
Comment=Divider - {{item.description}}`,
    },
    {
      name: 'export.back_panels',
      type: 'export',
      formula: `[Item]
Type=1
Width={{item.width}}
Height={{item.height}}
Qty={{item.quantity}}
Material={{color.material}}
Comment=Back Panel - {{item.description}}`,
    },
    {
      name: 'export.fillers',
      type: 'export',
      formula: `[Item]
Type=1
Width={{item.width}}
Height={{item.height}}
Qty={{item.quantity}}
Material={{color.material}}
Comment=Filler - {{item.description}}`,
    },
    {
      name: 'export.cleats',
      type: 'export',
      formula: `[Item]
Type=1
Width={{item.width}}
Height={{item.height}}
Qty={{item.quantity}}
Material={{color.material}}
Comment=Cleat - {{item.description}}`,
    },
    {
      name: 'export.crown_moulding',
      type: 'export',
      formula: `[Item]
Type=5
Width={{item.width}}
Qty={{item.quantity}}
Material={{color.material}}
Comment=Crown Moulding - {{item.description}}`,
    },
    {
      name: 'export.mj_doors',
      type: 'export',
      formula: `[Item]
Type=2
Width={{item.width}}
Height={{item.height}}
Qty={{item.quantity}}
Style={{mjdoors.style}}
Color={{mjcolors.color_name}}
Comment={{item.description}}`,
    },
    {
      name: 'export.mj_doors_half',
      type: 'export',
      formula: `[Item]
Type=2
Width={{item.width}}
Height={{item.height}}
Qty={{item.quantity}}
Style={{mjdoors.style}}
Color={{mjcolors.color_name}}
Comment=Half - {{item.description}}`,
    },
  ];

  // First-match-wins by startsWith. color grid always uses lookupColumn:'Color'.
  const SKU_FORMULA_MAP: Array<{
    skuPatterns: string[];
    pricingFormula: string;
    exportFormula: string;
    gridBindings: Array<{ gridNamePattern: string; alias: string; lookupColumn: string }>;
  }> = [
    // MJ full-height doors (listed before any pattern that starts with 34H/BADR)
    {
      skuPatterns: ['BADR', '34HBACK'],
      pricingFormula: 'pricing.mj_doors',
      exportFormula: 'export.mj_doors',
      gridBindings: [
        { gridNamePattern: 'mjdoor', alias: 'mjdoors', lookupColumn: 'MANU_CODE' },
        { gridNamePattern: 'mjcolor', alias: 'mjcolors', lookupColumn: 'MANU_CODE' },
      ],
    },
    // MJ half-height doors
    {
      skuPatterns: ['HBADR'],
      pricingFormula: 'pricing.mj_doors_half',
      exportFormula: 'export.mj_doors_half',
      gridBindings: [
        { gridNamePattern: 'mjdoor', alias: 'mjdoors', lookupColumn: 'MANU_CODE' },
        { gridNamePattern: 'mjcolor', alias: 'mjcolors', lookupColumn: 'MANU_CODE' },
      ],
    },
    // Garage shelves (listed before regular shelves so GHPLTOP patterns match here)
    {
      skuPatterns: ['34GGSHF', '34GGPLTOP', '34GHPLTOP', '15GGSHF', '15GHPLTOP'],
      pricingFormula: 'pricing.garage_shelves',
      exportFormula: 'export.garage_shelves',
      gridBindings: [
        { gridNamePattern: 'shelves', alias: 'shelves', lookupColumn: 'MANU_CODE' },
        { gridNamePattern: 'color', alias: 'color', lookupColumn: 'Color' },
      ],
    },
    // Island shelves
    {
      skuPatterns: ['34ISSHF', '34ISPLTOP', '34HGPLTOP', '15ISSHF', '15HGPLTOP'],
      pricingFormula: 'pricing.island_shelves',
      exportFormula: 'export.island_shelves',
      gridBindings: [
        { gridNamePattern: 'shelves', alias: 'shelves', lookupColumn: 'MANU_CODE' },
        { gridNamePattern: 'color', alias: 'color', lookupColumn: 'Color' },
      ],
    },
    // Regular shelves
    {
      skuPatterns: [
        '34SHF', '34FSHF', '34LCSHF', '34OLCSHF', '34ORCSHF',
        '34HGSHF', '34HGLCSHF', '34HGOLCSHF', '34HGORCSHF',
        '15SHF', '15FSHF', '15HGSHF', '15HGLCSHF', '34CSHF',
      ],
      pricingFormula: 'pricing.shelves',
      exportFormula: 'export.shelves',
      gridBindings: [
        { gridNamePattern: 'shelves', alias: 'shelves', lookupColumn: 'MANU_CODE' },
        { gridNamePattern: 'color', alias: 'color', lookupColumn: 'Color' },
      ],
    },
    // Corner shelves
    {
      skuPatterns: ['34MCORN', '34CORN', '15MCORN', '15CORN'],
      pricingFormula: 'pricing.corner_shelves',
      exportFormula: 'export.corner_shelves',
      gridBindings: [
        { gridNamePattern: 'shelves', alias: 'shelves', lookupColumn: 'MANU_CODE' },
        { gridNamePattern: 'color', alias: 'color', lookupColumn: 'Color' },
      ],
    },
    // Outside corner shelves
    {
      skuPatterns: ['34OCORN', '15OCORN'],
      pricingFormula: 'pricing.outside_corner_shelves',
      exportFormula: 'export.outside_corner_shelves',
      gridBindings: [
        { gridNamePattern: 'shelves', alias: 'shelves', lookupColumn: 'MANU_CODE' },
        { gridNamePattern: 'color', alias: 'color', lookupColumn: 'Color' },
      ],
    },
    // Inset drawer boxes (listed before standard so 34IMDRWB matches here)
    {
      skuPatterns: ['34IMDRWB'],
      pricingFormula: 'pricing.inset_drawer_boxes',
      exportFormula: 'export.inset_drawer_boxes',
      gridBindings: [
        { gridNamePattern: 'drawer', alias: 'drawer_boxes', lookupColumn: 'MANU_CODE' },
        { gridNamePattern: 'color', alias: 'color', lookupColumn: 'Color' },
      ],
    },
    // Standard drawer boxes
    {
      skuPatterns: ['34MDRWB', 'BDRW', 'DRW'],
      pricingFormula: 'pricing.drawer_boxes',
      exportFormula: 'export.drawer_boxes',
      gridBindings: [
        { gridNamePattern: 'drawer', alias: 'drawer_boxes', lookupColumn: 'MANU_CODE' },
        { gridNamePattern: 'color', alias: 'color', lookupColumn: 'Color' },
      ],
    },
    // Dovetail drawer boxes (Elias export)
    {
      skuPatterns: ['DBX', 'SDBX'],
      pricingFormula: 'pricing.dovetail_drawer_boxes',
      exportFormula: 'export.dovetail_drawer_boxes',
      gridBindings: [
        { gridNamePattern: 'drawer', alias: 'drawer_boxes', lookupColumn: 'MANU_CODE' },
        { gridNamePattern: 'color', alias: 'color', lookupColumn: 'Color' },
      ],
    },
    // Regular slab doors (34DRF is a drawer front, not here)
    {
      skuPatterns: ['34DDR', '15DDR'],
      pricingFormula: 'pricing.doors',
      exportFormula: 'export.doors',
      gridBindings: [
        { gridNamePattern: 'doors', alias: 'doors', lookupColumn: 'MANU_CODE' },
        { gridNamePattern: 'color', alias: 'color', lookupColumn: 'Color' },
      ],
    },
    // TFL 90° shaker doors
    {
      skuPatterns: ['34TDOOR', '15TDOOR'],
      pricingFormula: 'pricing.doors_tfl90_shaker',
      exportFormula: 'export.doors_tfl90_shaker',
      gridBindings: [
        { gridNamePattern: 'doors', alias: 'doors', lookupColumn: 'MANU_CODE' },
        { gridNamePattern: 'color', alias: 'color', lookupColumn: 'Color' },
      ],
    },
    // Poly 45 doors
    {
      skuPatterns: ['34SDOOR', '15SDOOR'],
      pricingFormula: 'pricing.doors_poly45',
      exportFormula: 'export.doors_poly45',
      gridBindings: [
        { gridNamePattern: 'doors', alias: 'doors', lookupColumn: 'MANU_CODE' },
        { gridNamePattern: 'color', alias: 'color', lookupColumn: 'Color' },
      ],
    },
    // Modular drawer fronts (listed before regular so 34MDRF matches here)
    {
      skuPatterns: ['34MDRF', '34IMDRWF'],
      pricingFormula: 'pricing.modular_drawer_fronts',
      exportFormula: 'export.modular_drawer_fronts',
      gridBindings: [
        { gridNamePattern: 'doors', alias: 'doors', lookupColumn: 'MANU_CODE' },
        { gridNamePattern: 'color', alias: 'color', lookupColumn: 'Color' },
      ],
    },
    // Regular drawer fronts
    {
      skuPatterns: ['34DRF', 'DRWF'],
      pricingFormula: 'pricing.drawer_fronts',
      exportFormula: 'export.drawer_fronts',
      gridBindings: [
        { gridNamePattern: 'doors', alias: 'doors', lookupColumn: 'MANU_CODE' },
        { gridNamePattern: 'color', alias: 'color', lookupColumn: 'Color' },
      ],
    },
    // Garage panels (listed before closet panels)
    {
      skuPatterns: ['34GGPNL', '34GPNL', '34HGGPNL', '15GPNL', '15GGPNL'],
      pricingFormula: 'pricing.garage_panels',
      exportFormula: 'export.garage_panels',
      gridBindings: [
        { gridNamePattern: 'product_part', alias: 'product_parts', lookupColumn: 'MANU_CODE' },
        { gridNamePattern: 'color', alias: 'color', lookupColumn: 'Color' },
      ],
    },
    // Island panels
    {
      skuPatterns: ['34ISPNL', '15ISPNL'],
      pricingFormula: 'pricing.island_panels',
      exportFormula: 'export.island_panels',
      gridBindings: [
        { gridNamePattern: 'product_part', alias: 'product_parts', lookupColumn: 'MANU_CODE' },
        { gridNamePattern: 'color', alias: 'color', lookupColumn: 'Color' },
      ],
    },
    // Wall panels
    {
      skuPatterns: ['34WPNL', '34WMPNL', '15WPNL'],
      pricingFormula: 'pricing.wall_panels',
      exportFormula: 'export.wall_panels',
      gridBindings: [
        { gridNamePattern: 'product_part', alias: 'product_parts', lookupColumn: 'MANU_CODE' },
        { gridNamePattern: 'color', alias: 'color', lookupColumn: 'Color' },
      ],
    },
    // Floor panels
    {
      skuPatterns: ['34FPNL', '34FLPNL', '15FPNL'],
      pricingFormula: 'pricing.floor_panels',
      exportFormula: 'export.floor_panels',
      gridBindings: [
        { gridNamePattern: 'product_part', alias: 'product_parts', lookupColumn: 'MANU_CODE' },
        { gridNamePattern: 'color', alias: 'color', lookupColumn: 'Color' },
      ],
    },
    // Closet panels
    {
      skuPatterns: ['34HGPNL', '34PNL', '15PNL', '15HGPNL'],
      pricingFormula: 'pricing.closet_panels',
      exportFormula: 'export.closet_panels',
      gridBindings: [
        { gridNamePattern: 'product_part', alias: 'product_parts', lookupColumn: 'MANU_CODE' },
        { gridNamePattern: 'color', alias: 'color', lookupColumn: 'Color' },
      ],
    },
    // Dividers
    {
      skuPatterns: ['34DIV', '34HGDIV', '15DIV', '15HGDIV'],
      pricingFormula: 'pricing.dividers',
      exportFormula: 'export.dividers',
      gridBindings: [
        { gridNamePattern: 'product_part', alias: 'product_parts', lookupColumn: 'MANU_CODE' },
        { gridNamePattern: 'color', alias: 'color', lookupColumn: 'Color' },
      ],
    },
    // Back panels
    {
      skuPatterns: ['34BACK', '34GBACK', '34HGBACK', '14BACK', '14HBACK', '15BACK'],
      pricingFormula: 'pricing.back_panels',
      exportFormula: 'export.back_panels',
      gridBindings: [
        { gridNamePattern: 'product_part', alias: 'product_parts', lookupColumn: 'MANU_CODE' },
        { gridNamePattern: 'color', alias: 'color', lookupColumn: 'Color' },
      ],
    },
    // Fillers
    {
      skuPatterns: ['FILL', '34FILL', '15FILL'],
      pricingFormula: 'pricing.fillers',
      exportFormula: 'export.fillers',
      gridBindings: [
        { gridNamePattern: 'product_part', alias: 'product_parts', lookupColumn: 'MANU_CODE' },
        { gridNamePattern: 'color', alias: 'color', lookupColumn: 'Color' },
      ],
    },
    // Cleats
    {
      skuPatterns: ['CLEAT', '34CLEAT', '15CLEAT'],
      pricingFormula: 'pricing.cleats',
      exportFormula: 'export.cleats',
      gridBindings: [
        { gridNamePattern: 'product_part', alias: 'product_parts', lookupColumn: 'MANU_CODE' },
        { gridNamePattern: 'color', alias: 'color', lookupColumn: 'Color' },
      ],
    },
    // Crown moulding
    {
      skuPatterns: ['CROWN', 'CRNML', 'CM', '34CM', '34CROWN', '15CM', '15CROWN'],
      pricingFormula: 'pricing.crown_moulding',
      exportFormula: 'export.crown_moulding',
      gridBindings: [
        { gridNamePattern: 'product_part', alias: 'product_parts', lookupColumn: 'MANU_CODE' },
        { gridNamePattern: 'color', alias: 'color', lookupColumn: 'Color' },
      ],
    },
    // Misc product parts (catch-all, listed last)
    {
      skuPatterns: ['PART', 'MISC', 'HLEG', 'LEG', 'AKICK', 'KICK', 'ADJ', 'HRDW'],
      pricingFormula: 'pricing.product_parts',
      exportFormula: 'export.product_parts',
      gridBindings: [
        { gridNamePattern: 'product_part', alias: 'product_parts', lookupColumn: 'MANU_CODE' },
        { gridNamePattern: 'color', alias: 'color', lookupColumn: 'Color' },
      ],
    },
  ];

  app.post('/api/admin/seed-formulas', isAuthenticated, async (_req, res) => {
    try {
      let created = 0;
      let updated = 0;
      for (const seed of SEED_FORMULAS) {
        const existing = await storage.getProxyVariableByName(seed.name);
        await storage.upsertProxyVariable({
          name: seed.name,
          type: seed.type,
          formula: seed.formula,
        });
        if (existing) {
          updated++;
        } else {
          created++;
        }
      }
      res.json({ created, updated, total: SEED_FORMULAS.length });
    } catch (e: any) {
      console.error('[SeedFormulas] Error:', e);
      res.status(500).json({ message: e.message });
    }
  });

  app.post('/api/admin/products/auto-assign-formulas', isAuthenticated, async (req, res) => {
    try {
      const { overwrite } = req.body as { overwrite?: boolean };
      const allProducts = await storage.getAllmoxyProducts();
      const activeProducts = allProducts.filter(p => p.status === 'active' && p.skuPrefix);
      const allProxyVars = await storage.getProxyVariables();
      const proxyByName = new Map(allProxyVars.map(v => [v.name, v]));
      const allGrids = await storage.getAttributeGrids();

      let formulasAssigned = 0;
      let bindingsCreated = 0;
      let skipped = 0;
      const errors: string[] = [];

      const fuzzyMatchGrid = (pattern: string): typeof allGrids[number] | undefined => {
        const lowerPattern = pattern.toLowerCase().replace(/[^a-z0-9]/g, '');
        return allGrids.find(g => {
          const lowerName = g.name.toLowerCase().replace(/[^a-z0-9]/g, '');
          return lowerName.includes(lowerPattern) || lowerPattern.includes(lowerName);
        });
      };

      for (const product of activeProducts) {
        const upperPrefix = (product.skuPrefix || '').toUpperCase().trim();
        if (!upperPrefix) continue;

        if (!overwrite && product.pricingProxyId) {
          skipped++;
          continue;
        }

        let matched = false;
        for (const mapping of SKU_FORMULA_MAP) {
          const prefixMatch = mapping.skuPatterns.some(pat => 
            upperPrefix.startsWith(pat) || upperPrefix === pat
          );
          if (!prefixMatch) continue;

          matched = true;
          const pricingProxy = proxyByName.get(mapping.pricingFormula);
          const exportProxy = proxyByName.get(mapping.exportFormula);

          let hasError = false;
          if (!pricingProxy) {
            errors.push(`${product.name}: pricing formula "${mapping.pricingFormula}" not found`);
            hasError = true;
          }
          if (!exportProxy) {
            errors.push(`${product.name}: export formula "${mapping.exportFormula}" not found`);
            hasError = true;
          }

          if (pricingProxy || exportProxy) {
            await storage.upsertAllmoxyProduct({
              ...product,
              pricingProxyId: pricingProxy?.id ?? product.pricingProxyId ?? null,
              exportProxyId: exportProxy?.id ?? product.exportProxyId ?? null,
            });
            if (!hasError) formulasAssigned++;
          }

          const newBindings: Array<{ productId: number; gridId: number; alias: string; lookupColumn: string }> = [];
          for (const gb of mapping.gridBindings) {
            const grid = fuzzyMatchGrid(gb.gridNamePattern);
            if (grid) {
              newBindings.push({
                productId: product.id,
                gridId: grid.id,
                alias: gb.alias,
                lookupColumn: gb.lookupColumn,
              });
            }
          }

          // Always replace (even when empty) to delete stale bindings from
          // previous runs. Storage.replaceProductGridBindings handles this
          // correctly — it deletes all existing then re-inserts.
          await storage.replaceProductGridBindings(product.id, newBindings);
          bindingsCreated += newBindings.length;
          if (newBindings.length === 0 && mapping.gridBindings.length > 0) {
            errors.push(`${product.name}: no grids found for patterns [${mapping.gridBindings.map(g => g.gridNamePattern).join(', ')}]`);
          }

          break;
        }

        if (!matched) {
          errors.push(`${product.name} (prefix: ${upperPrefix}): no SKU pattern match found`);
        }
      }

      res.json({ formulasAssigned, bindingsCreated, skipped, errors });
    } catch (e: any) {
      console.error('[AutoAssign] Error:', e);
      res.status(500).json({ message: e.message });
    }
  });

  const allowedImageMimes = ['image/jpeg', 'image/png', 'image/webp'];
  const imageUpload = multer({
    storage: multer.memoryStorage(),
    limits: { files: 200, fileSize: 5 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      cb(null, allowedImageMimes.includes(file.mimetype));
    }
  });

  app.post('/api/admin/products/bulk-upload-images', isAuthenticated, imageUpload.array('images', 200), async (req, res) => {
    try {
      const files = req.files as Express.Multer.File[] | undefined;
      if (!files || files.length === 0) {
        return res.status(400).json({ message: 'No files uploaded' });
      }

      const targetFilter = (req.body.targetTable as string) || (req.body.target as string) || 'both';

      const allHardwareProducts = targetFilter !== 'allmoxy' ? await storage.getProducts() : [];
      const allAllmoxyProducts = targetFilter !== 'hardware' ? await storage.getAllmoxyProducts() : [];

      const results: Array<{
        filename: string;
        storagePath: string;
        matchedProduct: string | null;
        targetTable: 'allmoxy' | 'hardware' | null;
        productId: number | null;
        confidence: 'exact' | 'prefix' | 'partial' | 'none';
      }> = [];

      for (const file of files) {
        const ext = path.extname(file.originalname).toLowerCase();
        const allowedExts = ['.jpg', '.jpeg', '.png', '.webp'];
        if (!allowedExts.includes(ext)) continue;

        const baseName = path.basename(file.originalname, ext);
        const storagePath = `product-images/${file.originalname}`;

        const contentTypeMap: Record<string, string> = {
          '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
          '.png': 'image/png', '.webp': 'image/webp'
        };
        await objectStorageService.uploadBuffer(file.buffer, storagePath, contentTypeMap[ext] || 'application/octet-stream');

        const searchVariants = new Set<string>([baseName]);
        const dottedPrefixes = ['H.', 'M.', 'S.', 'R.'];
        const dashedPrefixes = ['M-', 'R-', 'S-'];
        const allPrefixes = [...dottedPrefixes, ...dashedPrefixes];
        for (const pfx of allPrefixes) {
          searchVariants.add(`${pfx}${baseName}`);
        }
        for (const pfx of allPrefixes) {
          if (baseName.startsWith(pfx)) {
            searchVariants.add(baseName.substring(pfx.length));
          }
        }
        const variantArray = Array.from(searchVariants);

        type MatchResult = { productId: number; displayName: string; table: 'allmoxy' | 'hardware'; confidence: 'exact' | 'prefix' | 'partial' };
        let match: MatchResult | null = null;

        // Stage 1: Allmoxy exact (name or skuPrefix) across ALL variants
        if (!match && targetFilter !== 'hardware') {
          for (const variant of variantArray) {
            const lv = variant.toLowerCase();
            const found = allAllmoxyProducts.find(p =>
              p.name.toLowerCase() === lv ||
              (p.skuPrefix && p.skuPrefix.toLowerCase() === lv)
            );
            if (found) { match = { productId: found.id, displayName: found.name, table: 'allmoxy', confidence: 'exact' }; break; }
          }
        }

        // Stage 2: Hardware exact (code) across ALL variants
        if (!match && targetFilter !== 'allmoxy') {
          for (const variant of variantArray) {
            const lv = variant.toLowerCase();
            const found = allHardwareProducts.find(p => p.code.toLowerCase() === lv);
            if (found) { match = { productId: found.id, displayName: `${found.code} - ${found.name || ''}`, table: 'hardware', confidence: 'exact' }; break; }
          }
        }

        // Stage 3: Allmoxy prefix (variant starts with product name/sku)
        if (!match && targetFilter !== 'hardware') {
          for (const variant of variantArray) {
            const lv = variant.toLowerCase();
            const found = allAllmoxyProducts.find(p => {
              const pName = p.name.toLowerCase();
              const pSku = p.skuPrefix?.toLowerCase();
              return (pName.length >= 3 && lv.startsWith(pName)) ||
                     (pSku && pSku.length >= 3 && lv.startsWith(pSku));
            });
            if (found) { match = { productId: found.id, displayName: found.name, table: 'allmoxy', confidence: 'prefix' }; break; }
          }
        }

        // Stage 4: Hardware prefix (variant starts with product code)
        if (!match && targetFilter !== 'allmoxy') {
          for (const variant of variantArray) {
            const lv = variant.toLowerCase();
            const found = allHardwareProducts.find(p => {
              const pCode = p.code.toLowerCase();
              return pCode.length >= 3 && lv.startsWith(pCode);
            });
            if (found) { match = { productId: found.id, displayName: `${found.code} - ${found.name || ''}`, table: 'hardware', confidence: 'prefix' }; break; }
          }
        }

        // Stage 5: Allmoxy partial (substring containment, min 4 chars)
        if (!match && targetFilter !== 'hardware') {
          for (const variant of variantArray) {
            const lv = variant.toLowerCase();
            if (lv.length < 4) continue;
            const found = allAllmoxyProducts.find(p => {
              const pName = p.name.toLowerCase();
              const pSku = p.skuPrefix?.toLowerCase();
              return (pName.length >= 4 && (pName.includes(lv) || lv.includes(pName))) ||
                     (pSku && pSku.length >= 4 && (pSku.includes(lv) || lv.includes(pSku)));
            });
            if (found) { match = { productId: found.id, displayName: found.name, table: 'allmoxy', confidence: 'partial' }; break; }
          }
        }

        // Stage 6: Hardware partial (substring containment, min 4 chars)
        if (!match && targetFilter !== 'allmoxy') {
          for (const variant of variantArray) {
            const lv = variant.toLowerCase();
            if (lv.length < 4) continue;
            const found = allHardwareProducts.find(p => {
              const pCode = p.code.toLowerCase();
              return pCode.length >= 4 && (pCode.includes(lv) || lv.includes(pCode));
            });
            if (found) { match = { productId: found.id, displayName: `${found.code} - ${found.name || ''}`, table: 'hardware', confidence: 'partial' }; break; }
          }
        }

        if (match) {
          results.push({ filename: file.originalname, storagePath, matchedProduct: match.displayName, targetTable: match.table, productId: match.productId, confidence: match.confidence });
        } else {
          results.push({ filename: file.originalname, storagePath, matchedProduct: null, targetTable: null, productId: null, confidence: 'none' });
        }
      }

      const summary = {
        total: results.length,
        exact: results.filter(r => r.confidence === 'exact').length,
        prefix: results.filter(r => r.confidence === 'prefix').length,
        partial: results.filter(r => r.confidence === 'partial').length,
        unmatched: results.filter(r => r.confidence === 'none').length,
      };

      res.json({ results, summary });
    } catch (e: any) {
      console.error('[BulkImageUpload] Error:', e);
      res.status(500).json({ message: 'Failed to process bulk image upload', error: e.message });
    }
  });

  app.post('/api/admin/products/confirm-image-assignments', isAuthenticated, async (req, res) => {
    try {
      const { assignments } = req.body;
      if (!Array.isArray(assignments)) {
        return res.status(400).json({ message: 'assignments must be an array' });
      }

      let updated = 0;
      const errors: Array<{ storagePath: string; error: string }> = [];

      for (const assignment of assignments) {
        const { storagePath, targetTable, productId } = assignment;
        if (!storagePath || !targetTable || !productId) {
          errors.push({ storagePath: storagePath || 'unknown', error: 'Missing required fields' });
          continue;
        }

        try {
          if (targetTable === 'allmoxy') {
            await db.update(allmoxyProducts)
              .set({ imagePath: storagePath })
              .where(eq(allmoxyProducts.id, productId));
            updated++;
          } else if (targetTable === 'hardware') {
            await storage.updateProduct(productId, { imagePath: storagePath });
            updated++;
          } else {
            errors.push({ storagePath, error: `Unknown table: ${targetTable}` });
          }
        } catch (e: any) {
          errors.push({ storagePath, error: e.message });
        }
      }

      res.json({ updated, errors });
    } catch (e: any) {
      console.error('[ConfirmImageAssignments] Error:', e);
      res.status(500).json({ message: 'Failed to confirm assignments', error: e.message });
    }
  });

  app.get('/api/product-images/*', isAuthenticated, async (req, res) => {
    try {
      const imagePath = req.params[0];
      if (!imagePath || imagePath.includes('..') || imagePath.startsWith('/')) {
        return res.status(400).json({ message: 'Invalid image path' });
      }

      const storagePath = `product-images/${imagePath}`;
      const buffer = await objectStorageService.downloadBuffer(storagePath);

      if (!buffer) {
        return res.status(404).json({ message: 'Image not found' });
      }

      const ext = path.extname(imagePath).toLowerCase();
      const contentTypeMap: Record<string, string> = {
        '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
        '.png': 'image/png', '.webp': 'image/webp',
        '.gif': 'image/gif', '.svg': 'image/svg+xml'
      };

      res.set({
        'Content-Type': contentTypeMap[ext] || 'application/octet-stream',
        'Cache-Control': 'public, max-age=86400',
        'Content-Length': String(buffer.length),
      });

      res.send(buffer);
    } catch (e: any) {
      console.error('[ProductImages] Error serving image:', e);
      res.status(500).json({ message: 'Failed to serve image' });
    }
  });

  app.get('/api/admin/products/search-all', isAuthenticated, async (req, res) => {
    try {
      const q = (req.query.q as string || '').toLowerCase().trim();
      if (!q) return res.json([]);

      const hwProducts = await storage.getProducts(q);
      const allHw = await storage.getProducts();
      const hwByName = allHw.filter(p =>
        p.name && p.name.toLowerCase().includes(q) &&
        !hwProducts.some(hp => hp.id === p.id)
      );
      const combinedHw = [...hwProducts, ...hwByName];
      const amProducts = await storage.getAllmoxyProducts();
      const filteredAm = amProducts.filter(p =>
        p.name.toLowerCase().includes(q) ||
        (p.skuPrefix && p.skuPrefix.toLowerCase().includes(q))
      );

      const results = [
        ...combinedHw.slice(0, 20).map(p => ({ id: p.id, name: `${p.code} - ${p.name || ''}`, table: 'hardware' as const })),
        ...filteredAm.slice(0, 20).map(p => ({ id: p.id, name: p.name, table: 'allmoxy' as const })),
      ];

      res.json(results.slice(0, 30));
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  return httpServer;
}
