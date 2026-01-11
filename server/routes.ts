import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import multer from 'multer';
import { parse } from 'csv-parse';
import { getAsanaApiInstances } from "./lib/asana";
import { setupAuth, registerAuthRoutes, isAuthenticated } from "./replit_integrations/auth";
import path from 'path';
import fs from 'fs';
import express from 'express';
import { registerObjectStorageRoutes, ObjectStorageService } from "./replit_integrations/object_storage";

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

// M&J door keywords to detect
const MJ_DOOR_KEYWORDS = [
  'DRSLIMLINE', 'DRVENICE', 'DRSUSSEX', 'DRLANCASTER', 'DRLANCASTER-VGROOVE', 'DRLANCASTER-GD'
];

// Richelieu door keywords to detect
const RICHELIEU_DOOR_KEYWORDS = ['ALUMSHAKER-06', 'ALUMSLIMSHAKER-03'];

// Glass Insert keywords to detect
const GLASS_INSERT_KEYWORDS = [
  'CLEAR', 'FROSTED', 'FLUTEX', 'CATHEDRAL', 'BAMBOO', 'MIRROR',
  'CLEARSAFETY', 'FROSTEDSAFETY', 'FLUTEXSAFETY', 'CATHEDRALSAFETY', 'SAFETYBAMBOO', 'MIRRORSAFETY',
  'ACID', 'SMOKED-GREY', 'EXTRA-CANNES', 'EXTRA-LINEN', 'SMOKED-BRONZE',
  'PURE-WHITE', 'METALLIC-GREY', 'JET-BLACK', 'BEIGE', 'CHOCOLATE', 'BLUE-GREY', 'TURQUOISE-BLUE',
  'ALBARIUM', 'NACRE', 'SIRIUS', 'BROMO'
];

// Glass Shelf keywords to detect
const GLASS_SHELF_KEYWORDS = ['GLSHFA_6', 'GLSHFA_10'];

// Extract CTS (Cut To Size) parts from CSV
function extractCTSParts(records: string[][]): Array<{ partNumber: string; description: string; cutLength: number; quantity: number }> {
  const ctsParts: Array<{ partNumber: string; description: string; cutLength: number; quantity: number }> = [];
  
  // Find the data section (starts after "Manuf code" header row)
  let dataStartIndex = -1;
  for (let i = 0; i < records.length; i++) {
    if (records[i][0]?.toLowerCase().includes('manuf')) {
      dataStartIndex = i + 1;
      break;
    }
  }
  
  if (dataStartIndex === -1) return ctsParts;
  
  // Process each data row looking for .CTS parts
  for (let i = dataStartIndex; i < records.length; i++) {
    const row = records[i];
    const sku = (row[0] || '').trim();
    
    // Check if this is a CTS part (ends with .CTS)
    if (sku.toUpperCase().endsWith('.CTS')) {
      const description = (row[1] || '').trim();
      const quantity = parseInt(row[2] || '0') || 0;
      // Length is in column 5 (index 5 = Length(L))
      const cutLength = parseFloat(row[5] || '0') || 0;
      
      if (quantity > 0 && cutLength > 0) {
        ctsParts.push({
          partNumber: sku,
          description,
          cutLength: Math.round(cutLength),
          quantity
        });
      }
    }
  }
  
  return ctsParts;
}

// Count parts from actual CSV data rows
function countPartsFromCSV(records: string[][]): { coreParts: number; dovetails: number; assembledDrawers: number; fivePiece: number; hasDoubleThick: boolean; doubleThickCount: number; hasShakerDoors: boolean; hasGlassParts: boolean; glassInserts: number; glassShelves: number; hasMJDoors: boolean; hasRichelieuDoors: boolean; mjDoorsCount: number; richelieuDoorsCount: number; maxLength: number; weightLbs: number; customParts: string[] } {
  let coreParts = 0;
  let dovetails = 0;
  let assembledDrawers = 0;
  let fivePiece = 0;
  let hasDoubleThick = false;
  let doubleThickCount = 0;
  let hasShakerDoors = false;
  let hasGlassParts = false;
  let glassInserts = 0;
  let glassShelves = 0;
  let hasMJDoors = false;
  let hasRichelieuDoors = false;
  let mjDoorsCount = 0;
  let richelieuDoorsCount = 0;
  let maxLength = 0;
  let weightLbs = 0;
  
  // Weight constant: 3/4" melamine ~3 lbs per sq ft
  const LBS_PER_SQFT = 3;
  // Conversion: mm² to sq ft (1 sq ft = 92903.04 mm²)
  const SQMM_TO_SQFT = 92903.04;

  // Find the data section (starts after "Manuf code" header row)
  let dataStartIndex = -1;
  for (let i = 0; i < records.length; i++) {
    if (records[i][0]?.toLowerCase().includes('manuf')) {
      dataStartIndex = i + 1;
      break;
    }
  }

  if (dataStartIndex === -1) return { coreParts, dovetails, assembledDrawers, fivePiece, hasDoubleThick, doubleThickCount, hasShakerDoors, hasGlassParts, glassInserts, glassShelves, hasMJDoors, hasRichelieuDoors, mjDoorsCount, richelieuDoorsCount, maxLength, weightLbs, customParts: [] };

  // Process each data row
  for (let i = dataStartIndex; i < records.length; i++) {
    const row = records[i];
    const sku = (row[0] || '').trim().toUpperCase();
    const quantity = parseInt(row[2] || '0') || 0;

    if (!sku || quantity === 0) continue;

    // Skip hardware (starts with H., M., R-, S.)
    if (sku.startsWith('H.') || sku.startsWith('M.') || sku.startsWith('M-') || 
        sku.startsWith('R-') || sku.startsWith('R.') || sku.startsWith('S.')) {
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

    // 5-piece shaker doors (all TFL90SHA parts including SHAGD)
    if (sku.includes('TFL90SHA')) {
      fivePiece += quantity;
      hasShakerDoors = true;
      continue;
    }

    // Check for double thick parts (starts with 15) and count them
    if (sku.startsWith('15')) {
      hasDoubleThick = true;
      doubleThickCount += quantity;
    }

    // Check for glass inserts
    if (GLASS_INSERT_KEYWORDS.some(keyword => sku.includes(keyword))) {
      hasGlassParts = true;
      glassInserts += quantity;
    }
    
    // Check for glass shelves
    if (GLASS_SHELF_KEYWORDS.some(keyword => sku.includes(keyword))) {
      hasGlassParts = true;
      glassShelves += quantity;
    }

    // Check for M&J doors and count them
    if (MJ_DOOR_KEYWORDS.some(keyword => sku.includes(keyword))) {
      hasMJDoors = true;
      mjDoorsCount += quantity;
    }

    // Check for Richelieu doors and count them
    if (RICHELIEU_DOOR_KEYWORDS.some(keyword => sku.includes(keyword))) {
      hasRichelieuDoors = true;
      richelieuDoorsCount += quantity;
    }

    // Track max part height (column 3 is Height)
    const height = parseFloat(row[3] || '0') || 0;
    if (height > maxLength) {
      maxLength = height;
    }

    // Calculate weight for this part (Height × Width in mm², then convert to sq ft)
    const width = parseFloat(row[4] || '0') || 0;
    if (height > 0 && width > 0) {
      const areaSqMm = height * width * quantity;
      const areaSqFt = areaSqMm / SQMM_TO_SQFT;
      weightLbs += areaSqFt * LBS_PER_SQFT;
    }

    // Count valid part SKUs as core parts
    // 34*, 15*, 14*, 1G* parts (panels, dividers, backs, shelves, etc.)
    if (sku.startsWith('34') || sku.startsWith('15') || sku.startsWith('14') || sku.startsWith('1G')) {
      coreParts += quantity;
      continue;
    }
    
    // Drawer fronts (DRWEURO, JDRWEURO, BDRWEURO, IDRWEURO variants)
    if (sku.includes('DRWEURO')) {
      coreParts += quantity;
      continue;
    }
    
    // Door parts - all EURO door variants (LIFTDREURO, BADREURO, etc.)
    if (sku.includes('LIFTDREURO') || sku.includes('BADREURO') || sku.includes('HBADREURO') ||
        sku.includes('DDREURO') || sku.includes('LDREURO') || sku.includes('RDREURO') ||
        sku.includes('HDREURO') || sku.includes('KLDREURO') || sku.includes('KRDREURO') ||
        sku.includes('GLDREURO') || sku.includes('GRDREURO')) {
      coreParts += quantity;
      continue;
    }
    
    // Other known part prefixes (VAL, CLEAT, FILL, TK, SFLAT, SVAL)
    if (sku.startsWith('VAL') || sku.startsWith('MTVAL') || sku.startsWith('HGVAL') ||
        sku.startsWith('CLEAT') || sku.startsWith('MTCLEAT') || sku.startsWith('HGCLEAT') ||
        sku.startsWith('FILL') || sku.startsWith('MTFILL') || sku.startsWith('HGFILL') ||
        sku.startsWith('TK') || sku.startsWith('MTTK') || sku.startsWith('HGTK') ||
        sku.startsWith('SFLAT') || sku.startsWith('MTSFLAT') || sku.startsWith('HGSFLAT') ||
        sku.startsWith('SVAL')) {
      coreParts += quantity;
    }
  }

  // Build custom parts list for this file
  const customParts: string[] = [];
  if (hasDoubleThick) customParts.push('DOUBLE THICK PARTS');
  if (hasShakerDoors) customParts.push('SHAKER DOORS');

  return { coreParts, dovetails, assembledDrawers, fivePiece, hasDoubleThick, doubleThickCount, hasShakerDoors, hasGlassParts, glassInserts, glassShelves, hasMJDoors, hasRichelieuDoors, mjDoorsCount, richelieuDoorsCount, maxLength, weightLbs, customParts };
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // Setup authentication (must be before other routes)
  await setupAuth(app);
  registerAuthRoutes(app);
  
  // Register object storage routes
  registerObjectStorageRoutes(app);
  
  // Create object storage service instance
  const objectStorageService = new ObjectStorageService();

  // List all projects (protected)
  app.get(api.orders.list.path, isAuthenticated, async (req, res) => {
    const projects = await storage.getProjects();
    res.json(projects);
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

  // Delete a project (protected)
  app.delete(api.orders.delete.path, isAuthenticated, async (req, res) => {
    const success = await storage.deleteProject(Number(req.params.id));
    if (!success) {
      return res.status(404).json({ message: 'Project not found' });
    }
    res.status(204).send();
  });

  // Get sync preview data (protected) - calculates all totals before syncing
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
    let hasDoubleThick = false;
    let hasShakerDoors = false;
    let hasGlassParts = false;
    let hasMJDoors = false;
    let hasRichelieuDoors = false;
    let overallMaxLength = 0;

    interface FileBreakdown {
      name: string;
      coreParts: number;
      dovetails: number;
      assembledDrawers: number;
      fivePieceDoors: number;
      weightLbs: number;
      maxLength: number;
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
    }
    const fileBreakdowns: FileBreakdown[] = [];
    let totalCtsPartsCount = 0;

    for (const file of projectFiles) {
      if (file.rawContent) {
        const records = await parseCSV(file.rawContent);
        const counts = countPartsFromCSV(records);
        
        totalCoreParts += counts.coreParts;
        totalDovetails += counts.dovetails;
        totalAssembledDrawers += counts.assembledDrawers;
        totalFivePiece += counts.fivePiece;
        totalGlassInserts += counts.glassInserts;
        totalGlassShelves += counts.glassShelves;
        totalMJDoors += counts.mjDoorsCount;
        totalRichelieuDoors += counts.richelieuDoorsCount;
        totalDoubleThick += counts.doubleThickCount;
        totalWeight += counts.weightLbs;
        if (counts.hasDoubleThick) hasDoubleThick = true;
        if (counts.hasShakerDoors) hasShakerDoors = true;
        if (counts.hasGlassParts) hasGlassParts = true;
        if (counts.hasMJDoors) hasMJDoors = true;
        if (counts.hasRichelieuDoors) hasRichelieuDoors = true;
        if (counts.maxLength > overallMaxLength) overallMaxLength = counts.maxLength;

        // Get CTS parts count for this file
        const fileCtsPartsCount = await storage.getCtsPartsCountForFile(file.id);
        totalCtsPartsCount += fileCtsPartsCount;

        fileBreakdowns.push({
          name: file.poNumber || file.originalFilename,
          coreParts: counts.coreParts,
          dovetails: counts.dovetails,
          assembledDrawers: counts.assembledDrawers,
          fivePieceDoors: counts.fivePiece,
          weightLbs: counts.weightLbs,
          maxLength: counts.maxLength,
          hasGlassParts: counts.hasGlassParts,
          glassInserts: counts.glassInserts,
          glassShelves: counts.glassShelves,
          hasMJDoors: counts.hasMJDoors,
          hasRichelieuDoors: counts.hasRichelieuDoors,
          mjDoorsCount: counts.mjDoorsCount,
          richelieuDoorsCount: counts.richelieuDoorsCount,
          hasDoubleThick: counts.hasDoubleThick,
          doubleThickCount: counts.doubleThickCount,
          customParts: counts.customParts,
          ctsPartsCount: fileCtsPartsCount,
          fileId: file.id
        });
      }
    }

    // Determine pallet size
    let palletSize = '';
    if (totalCoreParts < 100 && overallMaxLength <= 2550) {
      palletSize = 'USE 34" WIDE PALLET CUT TO SIZE';
    } else if (totalCoreParts >= 100 && overallMaxLength < 2400) {
      palletSize = 'USE 96" LONG PALLET';
    } else if (totalCoreParts >= 100 && overallMaxLength >= 2400 && overallMaxLength <= 2550) {
      palletSize = 'USE 105" LONG PALLET';
    } else if (totalCoreParts >= 100 && overallMaxLength > 2550) {
      palletSize = 'USE 110" LONG PALLET';
    }

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
        fileCount: projectFiles.length
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

      // Create order files linked to the project with calculated values
      for (const pf of parsedFiles) {
        // Calculate part counts from CSV data
        const partCounts = countPartsFromCSV(pf.records);
        
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
          hasGlassParts: partCounts.hasGlassParts,
          glassInserts: partCounts.glassInserts,
          glassShelves: partCounts.glassShelves,
          hasMJDoors: partCounts.hasMJDoors,
          hasRichelieuDoors: partCounts.hasRichelieuDoors,
          hasDoubleThick: partCounts.hasDoubleThick,
        });
        
        // Extract and save CTS parts for this file
        const ctsParts = extractCTSParts(pf.records);
        for (const ctsPart of ctsParts) {
          await storage.createCtsPart({
            fileId: orderFile.id,
            partNumber: ctsPart.partNumber,
            description: ctsPart.description,
            cutLength: ctsPart.cutLength,
            quantity: ctsPart.quantity,
          });
        }
      }

      res.status(201).json(project);

    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // Update project data (protected)
  app.put(api.orders.update.path, isAuthenticated, async (req, res) => {
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
      let hasDoubleThick = false;
      let hasShakerDoors = false;
      let hasGlassParts = false;
      let hasMJDoors = false;
      let hasRichelieuDoors = false;
      let overallMaxLength = 0;

      interface FileData {
        name: string;
        coreParts: number;
        dovetails: number;
        assembledDrawers: number;
        fivePiece: number;
        weightLbs: number;
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
          if (counts.hasDoubleThick) hasDoubleThick = true;
          if (counts.hasShakerDoors) hasShakerDoors = true;
          if (counts.hasGlassParts) hasGlassParts = true;
          if (counts.hasMJDoors) hasMJDoors = true;
          if (counts.hasRichelieuDoors) hasRichelieuDoors = true;
          if (counts.maxLength > overallMaxLength) overallMaxLength = counts.maxLength;

          // Use full PO name for the file listing
          const fullPoName = file.poNumber || file.originalFilename;
          
          fileDataList.push({
            name: fullPoName,
            coreParts: counts.coreParts,
            dovetails: counts.dovetails,
            assembledDrawers: counts.assembledDrawers,
            fivePiece: counts.fivePiece,
            weightLbs: counts.weightLbs
          });
        }
      }

      // Build per-file breakdown (values are bolded, not labels)
      const fileBreakdown = fileDataList.map(f => 
        `${f.name}
Parts: <strong>${f.coreParts}</strong>
Dovetails: <strong>${f.dovetails}</strong>
Assembled Netley Drawers: <strong>${f.assembledDrawers}</strong>
5 Piece Shaker Doors: <strong>${f.fivePiece}</strong>
Expected Weight: <strong>${Math.round(f.weightLbs)} lbs</strong>`
      ).join('\n\n');
      
      // Calculate total weight
      const totalWeight = fileDataList.reduce((sum, f) => sum + f.weightLbs, 0);

      // Build custom parts answer
      const customPartsList: string[] = [];
      if (hasDoubleThick) customPartsList.push('DOUBLE THICK PARTS');
      if (hasShakerDoors) customPartsList.push('SHAKER DOORS');
      const customPartsAnswer = customPartsList.length > 0 ? customPartsList.join(', ') : '';

      // Determine pallet size based on part count and max length
      let palletSize = '';
      if (totalCoreParts < 100 && overallMaxLength <= 2550) {
        palletSize = 'USE 34" WIDE PALLET CUT TO SIZE';
      } else if (totalCoreParts >= 100 && overallMaxLength < 2400) {
        palletSize = 'USE 96" LONG PALLET';
      } else if (totalCoreParts >= 100 && overallMaxLength >= 2400 && overallMaxLength <= 2550) {
        palletSize = 'USE 105" LONG PALLET';
      } else if (totalCoreParts >= 100 && overallMaxLength > 2550) {
        palletSize = 'USE 110" LONG PALLET';
      }

      const taskName = `(PERFECT FIT) ${project.name}`;
      
      // Build description in the user's preferred format (values are bolded, not labels)
      // Using html_notes with <body> wrapper for Asana HTML formatting
      let taskNotes = `<body>PALLET 1:
${project.dealer || project.name}
# OF ORDER ON PALLET: <strong>${projectFiles.length}</strong>
PALLET SIZE: <strong>${palletSize}</strong>
Parts: <strong>${totalCoreParts}</strong>
Dovetails: <strong>${totalDovetails}</strong>
Assembled Netley Drawers: <strong>${totalAssembledDrawers}</strong>
5 Piece Shaker Doors: <strong>${totalFivePiece}</strong>
Expected Weight: <strong>${Math.round(totalWeight)} lbs</strong>

WAS THERE BUYOUT HARDWARE: 
ARE THERE PARTS AT CUSTOM: <strong>${customPartsAnswer}</strong>
ARE THERE GLASS PARTS: <strong>${hasGlassParts ? 'YES' : 'NO'}</strong>
ARE THERE DOORS FROM M&J: <strong>${hasMJDoors ? 'YES' : 'NO'}</strong>
ARE THERE DOORS FROM RICHELIEU: <strong>${hasRichelieuDoors ? 'YES' : 'NO'}</strong>`;

      // Add per-file breakdown if there are multiple files
      if (fileDataList.length > 1) {
        taskNotes += `

--- ORDER BREAKDOWN ---

${fileBreakdown}`;
      }
      
      taskNotes += '</body>';
      taskNotes = taskNotes.trim();

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

        // Update the duplicated task with project-specific notes (using html_notes for formatting)
        await tasksApi.updateTask({ data: { html_notes: taskNotes } }, newTaskGid, {});

      } else {
        // Fallback: create task from scratch if template not found
        console.log('Template task not found, creating task from scratch');
        
        const taskData: any = {
          name: taskName,
          html_notes: taskNotes,
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
          } else if ((name === 'PF 5016 FORM NEEDED' || name === 'PF 5016 FORM NEEDED?') && field.type === 'enum' && field.enum_options) {
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
        asanaTaskId: newTaskGid,
        status: 'synced'
      });

      res.json(updatedProject);

    } catch (e: any) {
      console.error("Asana Sync Error:", e.response?.body || e);
      res.status(400).json({ message: 'Failed to sync to Asana: ' + (e.response?.body?.errors?.[0]?.message || e.message) });
    }
  });

  return httpServer;
}
