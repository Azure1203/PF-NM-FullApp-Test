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
import { testOutlookConnection, searchNetleyEmails, downloadEmailAttachment, listMailFolders, type NetleyEmail, type MailFolder, type SearchResult } from "./outlook";
import { getSyncStatus, triggerManualFetch } from "./outlookScheduler";

const upload = multer({ storage: multer.memoryStorage() });

// Asana Perfect Fit Production Project GID - use this for all Asana operations
const ASANA_PERFECT_FIT_PROJECT_GID = '1208263802564738';

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

// Wall Rail part numbers to count
const WALL_RAIL_PARTS = [
  'H.290.11.901.CTS', 'H.290.11.907.CTS', 'H.290.11.901', 'H.290.11.907',
  'H.290.12.781.CTS', 'H.290.12.790.CTS', 'H.290.12.380.CTS', 'H.290.12.390.CTS',
  'H.290.12.180.CTS', 'H.290.12.190.CTS', 'H.290.12.481.CTS', 'H.290.12.490.CTS',
  'H.290.12.781', 'H.290.12.790', 'H.290.12.380', 'H.290.12.390',
  'H.290.12.180', 'H.290.12.190', 'H.290.12.481', 'H.290.12.490'
];

// Compute auto-enabled production statuses based on order content
function computeAutoProductionStatuses(params: {
  hasCTSParts: boolean;
  hasFivePiece: boolean;
  hasDoubleThick: boolean;
  hasDovetails: boolean;
  hasAssembledDrawers: boolean;
  hasGlassParts: boolean;
  hasGlassShelves: boolean;
}): string[] {
  const statuses: string[] = [];
  
  // CTS Parts → CLOSET RODS NOT CUT
  if (params.hasCTSParts) {
    statuses.push('CLOSET RODS NOT CUT');
  }
  
  // 5 Piece Shaker → WAITING FOR NETLEY SHAKER DOORS
  if (params.hasFivePiece) {
    statuses.push('WAITING FOR NETLEY SHAKER DOORS');
  }
  
  // Double Thick Parts → DOUBLE UP PARTS AT CUSTOM
  if (params.hasDoubleThick) {
    statuses.push('DOUBLE UP PARTS AT CUSTOM');
  }
  
  // Dovetails → WAITING FOR DOVETAIL
  if (params.hasDovetails) {
    statuses.push('WAITING FOR DOVETAIL');
  }
  
  // Assembled Drawers → WAITING FOR NETLEY ASSEMBLED DRAWERS
  if (params.hasAssembledDrawers) {
    statuses.push('WAITING FOR NETLEY ASSEMBLED DRAWERS');
  }
  
  // Glass Parts (inserts) → WAITING FOR GLASS FOR DOORS
  if (params.hasGlassParts) {
    statuses.push('WAITING FOR GLASS FOR DOORS');
  }
  
  // Glass Shelves (GLSHFA_6, GLSHFA_10) → WAITING FOR GLASS SHELVES
  if (params.hasGlassShelves) {
    statuses.push('WAITING FOR GLASS SHELVES');
  }
  
  return statuses;
}

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
          cutLength: parseFloat(cutLength.toFixed(1)),
          quantity
        });
      }
    }
  }
  
  return ctsParts;
}

// Count parts from actual CSV data rows
function countPartsFromCSV(records: string[][]): { coreParts: number; dovetails: number; assembledDrawers: number; fivePiece: number; hasDoubleThick: boolean; doubleThickCount: number; hasShakerDoors: boolean; hasGlassParts: boolean; glassInserts: number; glassShelves: number; hasMJDoors: boolean; hasRichelieuDoors: boolean; mjDoorsCount: number; richelieuDoorsCount: number; maxLength: number; weightLbs: number; customParts: string[]; wallRailPieces: number } {
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
  let wallRailPieces = 0;
  
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

  if (dataStartIndex === -1) return { coreParts, dovetails, assembledDrawers, fivePiece, hasDoubleThick, doubleThickCount, hasShakerDoors, hasGlassParts, glassInserts, glassShelves, hasMJDoors, hasRichelieuDoors, mjDoorsCount, richelieuDoorsCount, maxLength, weightLbs, customParts: [], wallRailPieces };

  // Process each data row
  for (let i = dataStartIndex; i < records.length; i++) {
    const row = records[i];
    const sku = (row[0] || '').trim().toUpperCase();
    const quantity = parseInt(row[2] || '0') || 0;

    if (!sku || quantity === 0) continue;

    // Check for wall rail parts BEFORE skipping hardware (since wall rails start with H.)
    if (WALL_RAIL_PARTS.some(part => sku === part.toUpperCase())) {
      wallRailPieces += quantity;
    }

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

  return { coreParts, dovetails, assembledDrawers, fivePiece, hasDoubleThick, doubleThickCount, hasShakerDoors, hasGlassParts, glassInserts, glassShelves, hasMJDoors, hasRichelieuDoors, mjDoorsCount, richelieuDoorsCount, maxLength, weightLbs, customParts, wallRailPieces };
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
        
        return {
          ...project,
          ctsStatus: { hasCTSParts, allCtsCut },
          hardwarePackaged
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
    let totalWallRailPieces = 0;
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
      ctsAllCut: boolean;
      wallRailPieces: number;
    }
    const fileBreakdowns: FileBreakdown[] = [];
    let totalCtsPartsCount = 0;

    for (const file of projectFiles) {
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
      if ((file.maxLength || 0) > overallMaxLength) overallMaxLength = file.maxLength || 0;

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
          hasShakerDoors: partCounts.hasShakerDoors,
          mjDoorsCount: partCounts.mjDoorsCount,
          richelieuDoorsCount: partCounts.richelieuDoorsCount,
          doubleThickCount: partCounts.doubleThickCount,
          wallRailPieces: partCounts.wallRailPieces,
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
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
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
      if (fileIds !== undefined && Array.isArray(fileIds)) {
        const assignments = await storage.setAssignmentsForPallet(palletId, fileIds);
        assignedFileIds = assignments.map(a => a.fileId);
      } else {
        const assignments = await storage.getAssignmentsForPallet(palletId);
        assignedFileIds = assignments.map(a => a.fileId);
      }
      
      res.json({
        ...pallet,
        fileIds: assignedFileIds
      });
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
        taskNotes += `${fileName} - Allmoxy Job #${jobNumber}\n`;
      }

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
        
        // Update the task with the project app link and file list
        if (taskNotes) {
          try {
            console.log('[Asana] Updating task notes:', taskNotes);
            await tasksApi.updateTask({ data: { notes: taskNotes } }, newTaskGid, {});
            console.log('[Asana] Successfully updated notes');
          } catch (notesError: any) {
            console.error('[Asana] Failed to update notes:', notesError.message);
            // Continue with the rest of the sync - don't fail the whole operation
          }
        }

      } else {
        // Fallback: create task from scratch if template not found
        console.log('Template task not found, creating task from scratch');
        
        const taskData: any = {
          name: taskName,
          projects: [asanaProjectGid],
          ...(taskNotes && { notes: taskNotes }),
        };

        const task = await tasksApi.createTask({ data: taskData });
        newTaskGid = task.data.gid;
      }

      // Variable to hold auto statuses for database update
      let autoStatusesForDb: string[] = [];
      
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
        
        // Set PF PRODUCTION STATUS if there are auto statuses to set
        if (autoStatuses.length > 0) {
          for (const setting of customFieldSettings) {
            const field = setting.custom_field;
            const name = field.name?.toUpperCase().trim();
            
            if (name === 'PF PRODUCTION STATUS' && field.type === 'multi_enum' && field.enum_options) {
              // Map status names to their GIDs
              const selectedGids = autoStatuses
                .map((statusName: string) => {
                  const option = field.enum_options.find((o: any) => 
                    o.name?.toUpperCase().trim() === statusName.toUpperCase().trim()
                  );
                  return option?.gid;
                })
                .filter((gid: string | undefined) => gid);
              
              if (selectedGids.length > 0) {
                customFields[field.gid] = selectedGids;
                console.log('[Asana] Auto-enabling production statuses:', autoStatuses);
              }
              break;
            }
          }
        }
        
        console.log("Setting custom fields:", customFields);
        
        if (Object.keys(customFields).length > 0) {
          await tasksApi.updateTask({ data: { custom_fields: customFields } }, newTaskGid, {});
        }
        // Store auto statuses for database update
        autoStatusesForDb = autoStatuses;
      } catch (e) {
        console.error("Error updating custom fields:", e);
      }

      // Update project status in our database (including auto-enabled production statuses)
      const updatedProject = await storage.updateProject(project.id, {
        asanaTaskId: newTaskGid,
        status: 'synced',
        pfProductionStatus: autoStatusesForDb
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
      
      const { tasksApi, sectionsApi } = await getAsanaApiInstances();
      
      // First, get the task's projects to find PERFECT FIT PRODUCTION
      const taskResponse = await tasksApi.getTask(project.asanaTaskId, { 
        opt_fields: 'name,projects.name,projects.gid,custom_fields.name,custom_fields.display_value,custom_fields.multi_enum_values.name' 
      });
      
      console.log('[Asana] Task projects:', JSON.stringify(taskResponse.data.projects, null, 2));
      
      const customFields = taskResponse.data.custom_fields || [];
      const taskProjects = taskResponse.data.projects || [];
      
      let pfOrderStatus: string | null = null;
      let pfProductionStatus: string[] = [];
      let asanaSection: string | null = null;
      let cienappsJobNumber: string | null = null;
      
      // Find the PERFECT FIT PRODUCTION project using the global constant
      let perfectFitProject = taskProjects.find((p: any) => p.gid === ASANA_PERFECT_FIT_PROJECT_GID);
      
      // If not found by GID, try name matching for "PERFECT FIT PRODUCTION"
      if (!perfectFitProject) {
        perfectFitProject = taskProjects.find((p: any) => 
          p.name?.toUpperCase().includes('PERFECT FIT PRODUCTION')
        );
      }
      
      console.log('[Asana] Looking for project GID:', ASANA_PERFECT_FIT_PROJECT_GID);
      console.log('[Asana] Task projects:', taskProjects.map((p: any) => ({ gid: p.gid, name: p.name })));
      
      if (perfectFitProject) {
        try {
          // Get sections for this project
          const sectionsResponse = await sectionsApi.getSectionsForProject(perfectFitProject.gid, {});
          const sections = sectionsResponse.data || [];
          
          console.log('[Asana] Project sections:', JSON.stringify(sections, null, 2));
          
          // Now get the task's section within this project by checking which section contains the task
          // We need to check each section to find where this task is
          for (const section of sections) {
            try {
              const sectionTasksResponse = await tasksApi.getTasksForSection(section.gid, {
                opt_fields: 'gid',
                limit: 100
              });
              const sectionTasks = sectionTasksResponse.data || [];
              
              if (sectionTasks.some((t: any) => t.gid === project.asanaTaskId)) {
                asanaSection = section.name;
                console.log('[Asana] Found task in section:', asanaSection);
                break;
              }
            } catch (sectionErr) {
              console.error('[Asana] Error checking section:', section.name, sectionErr);
            }
          }
        } catch (sectionsErr) {
          console.error('[Asana] Error fetching sections:', sectionsErr);
        }
      } else {
        console.log('[Asana] No PERFECT FIT project found for task');
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

  // Background sync all synced projects from Asana (called by cron job)
  app.post('/api/sync-all-asana-status', async (req, res) => {
    try {
      // Get all synced projects
      const projects = await storage.getProjects();
      const syncedProjects = projects.filter(p => p.status === 'synced' && p.asanaTaskId);
      
      if (syncedProjects.length === 0) {
        return res.json({ message: 'No synced projects to update', updated: 0 });
      }
      
      const { tasksApi, sectionsApi } = await getAsanaApiInstances();
      let updatedCount = 0;
      
      for (const proj of syncedProjects) {
        try {
          const taskResponse = await tasksApi.getTask(proj.asanaTaskId!, { 
            opt_fields: 'projects.name,projects.gid,custom_fields.name,custom_fields.display_value,custom_fields.multi_enum_values.name' 
          });
          
          const customFields = taskResponse.data.custom_fields || [];
          const taskProjects = taskResponse.data.projects || [];
          
          let pfOrderStatus: string | null = null;
          let pfProductionStatus: string[] = [];
          let asanaSection: string | null = null;
          
          // Find the PERFECT FIT PRODUCTION project using the global constant
          let perfectFitProject = taskProjects.find((p: any) => p.gid === ASANA_PERFECT_FIT_PROJECT_GID);
          if (!perfectFitProject) {
            perfectFitProject = taskProjects.find((p: any) => 
              p.name?.toUpperCase().includes('PERFECT FIT PRODUCTION')
            );
          }
          
          if (perfectFitProject) {
            try {
              // Get sections for this project
              const sectionsResponse = await sectionsApi.getSectionsForProject(perfectFitProject.gid, {});
              const sections = sectionsResponse.data || [];
              
              // Check each section to find where this task is
              for (const section of sections) {
                try {
                  const sectionTasksResponse = await tasksApi.getTasksForSection(section.gid, {
                    opt_fields: 'gid',
                    limit: 100
                  });
                  const sectionTasks = sectionTasksResponse.data || [];
                  
                  if (sectionTasks.some((t: any) => t.gid === proj.asanaTaskId)) {
                    asanaSection = section.name;
                    break;
                  }
                } catch (sectionErr) {
                  // Skip this section on error
                }
              }
            } catch (sectionsErr) {
              console.error(`[Background Sync] Error fetching sections for project ${proj.id}:`, sectionsErr);
            }
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


  // Download Netley packing slip PDF for a file
  app.get('/api/files/:fileId/packing-slip-pdf', isAuthenticated, async (req, res) => {
    try {
      const fileId = Number(req.params.fileId);
      const fileData = await storage.getFileWithProject(fileId);
      
      if (!fileData) {
        return res.status(404).json({ message: 'File not found' });
      }
      
      if (!fileData.file.packingSlipPdfPath) {
        return res.status(404).json({ message: 'No packing slip PDF found for this file' });
      }
      
      // Download from object storage
      const pdfBuffer = await objectStorageService.downloadBuffer(fileData.file.packingSlipPdfPath);
      
      if (!pdfBuffer) {
        return res.status(404).json({ message: 'PDF file not found in storage' });
      }
      
      // Extract filename from path
      const filename = fileData.file.packingSlipPdfPath.split('/').pop() || 'packing-slip.pdf';
      
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(pdfBuffer);
      
    } catch (err: any) {
      console.error('[API] Error downloading packing slip PDF:', err.message);
      res.status(500).json({ message: 'Failed to download PDF', error: err.message });
    }
  });

  // Upload Netley packing slip PDF for a file (manual upload)
  app.post('/api/files/:fileId/packing-slip-pdf', isAuthenticated, upload.single('file'), async (req, res) => {
    try {
      const fileId = Number(req.params.fileId);
      const fileData = await storage.getFileWithProject(fileId);
      
      if (!fileData) {
        return res.status(404).json({ message: 'File not found' });
      }
      
      if (!req.file) {
        return res.status(400).json({ message: 'No PDF file provided' });
      }
      
      // Validate it's a PDF
      if (req.file.mimetype !== 'application/pdf') {
        return res.status(400).json({ message: 'File must be a PDF' });
      }
      
      // Create a sanitized filename from the original filename and order name
      const orderName = fileData.file.originalFilename?.replace(/\.csv$/i, '') || `order-${fileId}`;
      const originalName = req.file.originalname.replace(/[^a-zA-Z0-9\s\-_.]/g, '').replace(/\s+/g, '_');
      const sanitizedFilename = `${orderName.replace(/[^a-zA-Z0-9\s\-_.]/g, '').replace(/\s+/g, '_')}_${originalName}`;
      
      // Store in object storage under .private directory
      const storagePath = `.private/packing-slips/${sanitizedFilename}`;
      await objectStorageService.uploadBuffer(
        req.file.buffer,
        storagePath,
        'application/pdf'
      );
      
      // Update the order file with the PDF path
      await storage.updateOrderFile(fileId, {
        packingSlipPdfPath: storagePath
      });
      
      console.log(`[API] Uploaded packing slip PDF "${sanitizedFilename}" for file ${fileId}`);
      
      res.json({ 
        message: 'Packing slip PDF uploaded successfully',
        path: storagePath
      });
      
    } catch (err: any) {
      console.error('[API] Error uploading packing slip PDF:', err.message);
      res.status(500).json({ message: 'Failed to upload PDF', error: err.message });
    }
  });

  // Delete Netley packing slip PDF for a file
  app.delete('/api/files/:fileId/packing-slip-pdf', isAuthenticated, async (req, res) => {
    try {
      const fileId = Number(req.params.fileId);
      const fileData = await storage.getFileWithProject(fileId);
      
      if (!fileData) {
        return res.status(404).json({ message: 'File not found' });
      }
      
      if (!fileData.file.packingSlipPdfPath) {
        return res.status(404).json({ message: 'No packing slip PDF found for this file' });
      }
      
      // Delete from object storage (log if file doesn't exist but continue anyway)
      const deleted = await objectStorageService.deleteObject(fileData.file.packingSlipPdfPath);
      if (!deleted) {
        console.log(`[API] Object storage file not found for ${fileId}, clearing database reference anyway`);
      }
      
      // Clear the path in the database
      await storage.updateOrderFile(fileId, {
        packingSlipPdfPath: null
      });
      
      console.log(`[API] Deleted packing slip PDF for file ${fileId}`);
      
      res.json({ message: 'Packing slip PDF deleted successfully' });
      
    } catch (err: any) {
      console.error('[API] Error deleting packing slip PDF:', err.message);
      res.status(500).json({ message: 'Failed to delete PDF', error: err.message });
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
        hasPackingSlip: boolean;
        packingSlipPath: string | null;
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
            allmoxyJobNumberNormalized: normalizedJobNumber,
            hasPackingSlip: !!file.packingSlipPdfPath,
            packingSlipPath: file.packingSlipPdfPath
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
            const counts = countPartsFromCSV(records);
            
            // Update file with calculated values
            await storage.updateOrderFile(file.id, {
              coreParts: counts.coreParts,
              dovetails: counts.dovetails,
              assembledDrawers: counts.assembledDrawers,
              fivePieceDoors: counts.fivePiece,
              weightLbs: Math.round(counts.weightLbs),
              maxLength: Math.round(counts.maxLength),
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

  return httpServer;
}
