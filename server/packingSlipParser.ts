import * as fs from 'fs';
import * as path from 'path';
import { PDFDocument } from 'pdf-lib';
import { ObjectStorageService } from './replit_integrations/object_storage';
import { createRequire } from 'module';

// Use createRequire to properly import CommonJS pdf-parse module
const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

async function getPdfParser() {
  return pdfParse;
}

export interface PackingSlipPart {
  partCode: string;
  color: string | null;
  quantity: number;
  height: number | null;
  width: number | null;
  length: number | null;
  thickness: number | null;
  description: string | null;
  imagePath: string | null;
  sortOrder: number;
}

export interface ParsedPackingSlip {
  jobNumber: string | null;
  orderName: string | null;
  parts: PackingSlipPart[];
}

const objectStorageService = new ObjectStorageService();

export async function parsePackingSlipPdf(pdfBuffer: Buffer, fileId: number): Promise<ParsedPackingSlip> {
  const result: ParsedPackingSlip = {
    jobNumber: null,
    orderName: null,
    parts: []
  };

  try {
    const pdf = await getPdfParser();
    const data = await pdf(pdfBuffer);
    const text = data.text;
    
    const jobMatch = text.match(/Job\s*#\s*(\d+)/i);
    if (jobMatch) {
      result.jobNumber = jobMatch[1];
    }
    
    const orderNameMatch = text.match(/Order\s*Name:\s*([^\n]+)/i);
    if (orderNameMatch) {
      result.orderName = orderNameMatch[1].trim();
    }
    
    const parts = extractPartsFromText(text);
    
    const images = await extractImagesFromPdf(pdfBuffer, fileId);
    
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (images[i]) {
        part.imagePath = images[i];
      }
      result.parts.push(part);
    }
    
    console.log(`[PackingSlipParser] Parsed ${result.parts.length} parts from PDF`);
    
  } catch (error: any) {
    console.error('[PackingSlipParser] Error parsing PDF:', error.message);
  }

  return result;
}

function extractPartsFromText(text: string): PackingSlipPart[] {
  const parts: PackingSlipPart[] = [];
  
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  
  // Log first 50 lines for debugging
  console.log('[PackingSlipParser] === TEXT EXTRACTION DEBUG ===');
  console.log('[PackingSlipParser] Total lines:', lines.length);
  console.log('[PackingSlipParser] First 50 lines:');
  lines.slice(0, 50).forEach((line, idx) => {
    console.log(`[PackingSlipParser] Line ${idx}: "${line}"`);
  });
  
  let currentPart: Partial<PackingSlipPart> | null = null;
  let sortOrder = 0;
  
  // Expanded part code patterns to match actual Netley Packing Slip format
  // Matches: DBX24_14_167, SDBX24_12_6, 34MDRWB2, HGJDRWEURO, DRWTFL90SHA, HGSFLAT4, 34LCSHFAR, etc.
  const partCodePatterns = [
    // Handle codes like H.111.95.310
    /^(H\.\d+\.\d+\.\d+)$/,
    // Drawer box codes: DBX24_14_167, SDBX24_12_6
    /^(S?DBX\d+[_A-Z0-9]+)$/i,
    // Codes starting with numbers: 34MDRWB2, 34LCSHFAR, 34HGSHFF
    /^(\d+[A-Z]+[A-Z0-9_]*)$/i,
    // Drawer front codes: HGJDRWEURO, HGDRWEURO, DRWTFL90SHA, etc.
    /^([A-Z]*DRW[A-Z0-9]+)$/i,
    // Shelf/flat codes: HGSFLAT, HGSFLAT4
    /^([A-Z]+FLAT\d*)$/i,
    // Generic pattern for alphanumeric codes with specific keywords
    /^([A-Z0-9._]+(?:DRWB|DRW|SH|FLAT|BOX|EURO|SHA|DBX|SDBX|HGJ|HGS|LC|RC|SHFF|SHFA|CLEAT|TK|PNLL|PNLR|PNLF|WPNL)[A-Z0-9_]*)$/i,
    // Catch codes that are purely uppercase alphanumeric with underscores, at least 4 chars
    /^([A-Z][A-Z0-9_]{3,})$/
  ];
  
  const colorPattern = /^(TFL[0-9A-Z]+|HG[A-Z]+|[A-Z]{2,6})$/;
  
  const isPartCode = (line: string): boolean => {
    // Skip known non-part-code lines
    if (line.match(/^(Order|Page|ID|Qty|Height|Width|Length|Thickness|Edge|Color|Total|INTERNAL|DO NOT|Project)/i)) {
      return false;
    }
    // Skip lines that are just numbers
    if (line.match(/^\d+$/)) {
      return false;
    }
    // Check against all patterns
    for (const pattern of partCodePatterns) {
      if (pattern.test(line)) {
        console.log(`[PackingSlipParser] Matched part code: "${line}" with pattern ${pattern}`);
        return true;
      }
    }
    return false;
  };
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    if (isPartCode(line)) {
      if (currentPart && currentPart.partCode) {
        parts.push({
          partCode: currentPart.partCode,
          color: currentPart.color || null,
          quantity: currentPart.quantity || 1,
          height: currentPart.height || null,
          width: currentPart.width || null,
          length: currentPart.length || null,
          thickness: currentPart.thickness || null,
          description: currentPart.description || null,
          imagePath: null,
          sortOrder: sortOrder++
        });
      }
      
      currentPart = {
        partCode: line
      };
      continue;
    }
    
    if (currentPart) {
      if (line.startsWith('Color:')) {
        const colorValue = lines[i + 1];
        if (colorValue && colorPattern.test(colorValue)) {
          currentPart.color = colorValue;
        }
        continue;
      }
      
      if (colorPattern.test(line) && !currentPart.color) {
        currentPart.color = line;
        continue;
      }
      
      const totalMatch = line.match(/^(\d+)\s*Total\s*Items?$/i);
      if (totalMatch) {
        currentPart.quantity = parseInt(totalMatch[1], 10);
        continue;
      }
      
      // Match dimension lines from Netley format
      // Format: "ID Qty Height Width Length Thickness" where ID is like "2 01" or just a row number
      // Examples: "2 01    1         167      599.625        340"
      // Or simpler: "1 167 599.625 340 19"
      const dimensionMatch = line.match(/^\d+\s+\d*\s*(\d+)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)(?:\s+(\d+(?:\.\d+)?))?/);
      if (dimensionMatch) {
        const qty = parseInt(dimensionMatch[1], 10);
        if (qty > 0 && qty < 1000) { // Sanity check for quantity
          currentPart.quantity = qty;
        }
        currentPart.height = parseFloat(dimensionMatch[2]) || null;
        currentPart.width = parseFloat(dimensionMatch[3]) || null;
        currentPart.length = parseFloat(dimensionMatch[4]) || null;
        if (dimensionMatch[5]) {
          currentPart.thickness = parseFloat(dimensionMatch[5]) || null;
        }
        continue;
      }
      
      // Also try simpler dimension match
      const simpleDimensionMatch = line.match(/^(\d+)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)(?:\s+(\d+(?:\.\d+)?))?$/);
      if (simpleDimensionMatch) {
        const qty = parseInt(simpleDimensionMatch[1], 10);
        if (qty > 0 && qty < 1000) {
          currentPart.quantity = qty;
        }
        currentPart.height = parseFloat(simpleDimensionMatch[2]) || null;
        currentPart.width = parseFloat(simpleDimensionMatch[3]) || null;
        currentPart.length = parseFloat(simpleDimensionMatch[4]) || null;
        if (simpleDimensionMatch[5]) {
          currentPart.thickness = parseFloat(simpleDimensionMatch[5]) || null;
        }
        continue;
      }
      
      const descPatterns = [
        /Drawer\s*Box/i,
        /Dovetail/i,
        /Shaker/i,
        /Shelf/i,
        /Molding/i,
        /Corner/i,
        /Euro/i,
        /High\s*Gloss/i,
        /TFL/i,
        /Handles/i,
        /Drawer\s*Fronts/i,
        /Scooped/i,
        /Flat\s*Packed/i,
        /Adjustable/i,
        /Fixed/i,
        /Radius/i
      ];
      
      for (const pattern of descPatterns) {
        if (pattern.test(line)) {
          if (!currentPart.description) {
            currentPart.description = line;
          } else {
            currentPart.description += ' ' + line;
          }
          break;
        }
      }
    }
  }
  
  if (currentPart && currentPart.partCode) {
    parts.push({
      partCode: currentPart.partCode,
      color: currentPart.color || null,
      quantity: currentPart.quantity || 1,
      height: currentPart.height || null,
      width: currentPart.width || null,
      length: currentPart.length || null,
      thickness: currentPart.thickness || null,
      description: currentPart.description || null,
      imagePath: null,
      sortOrder: sortOrder
    });
  }
  
  console.log('[PackingSlipParser] === EXTRACTION COMPLETE ===');
  console.log('[PackingSlipParser] Total parts found:', parts.length);
  parts.slice(0, 10).forEach((part, idx) => {
    console.log(`[PackingSlipParser] Part ${idx}: ${part.partCode} (qty: ${part.quantity}, color: ${part.color})`);
  });
  
  return parts;
}

async function extractImagesFromPdf(pdfBuffer: Buffer, fileId: number): Promise<string[]> {
  const imagePaths: string[] = [];
  
  try {
    const pdfDoc = await PDFDocument.load(pdfBuffer);
    const pages = pdfDoc.getPages();
    
    console.log(`[PackingSlipParser] PDF has ${pages.length} pages - image extraction currently disabled`);
    
    // Note: pdf-lib doesn't provide a reliable way to extract embedded images
    // For now, we skip image extraction. The checklist works without images,
    // showing part codes, colors, quantities, and dimensions.
    // Future enhancement: use a dedicated PDF image extraction library like pdf2pic or pdfjs-dist
    
    console.log(`[PackingSlipParser] Extracted ${imagePaths.length} images`);
    
  } catch (error: any) {
    console.error('[PackingSlipParser] Error extracting images:', error.message);
  }
  
  return imagePaths;
}

function extractImageData(xObject: any, pdfDoc: PDFDocument): Buffer | null {
  try {
    const stream = xObject;
    if (!stream || !stream.contents) return null;
    
    return Buffer.from(stream.contents);
  } catch (e) {
    return null;
  }
}

export async function parsePackingSlipFromPath(pdfPath: string, fileId: number): Promise<ParsedPackingSlip> {
  const pdfBuffer = await objectStorageService.downloadBuffer(pdfPath);
  if (!pdfBuffer) {
    throw new Error(`Failed to download PDF from path: ${pdfPath}`);
  }
  return parsePackingSlipPdf(pdfBuffer, fileId);
}
