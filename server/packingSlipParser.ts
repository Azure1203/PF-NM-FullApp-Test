import * as fs from 'fs';
import * as path from 'path';
import { PDFDocument } from 'pdf-lib';
import { ObjectStorageService } from './replit_integrations/object_storage';

// Dynamic import for pdf-parse to avoid bundler issues with createRequire
let pdfParse: any = null;

async function getPdfParser() {
  if (!pdfParse) {
    const module = await import('pdf-parse');
    // Handle both CommonJS and ESM exports
    pdfParse = module.default || module;
  }
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
  
  let currentPart: Partial<PackingSlipPart> | null = null;
  let sortOrder = 0;
  
  const partCodePattern = /^([A-Z0-9._]+(?:DRWB|DRW|SH|FLAT|BOX|EURO|SHA|DBX|SDBX|HGJ|HGS|LC|RC)[A-Z0-9_]*)$/i;
  const handlePattern = /^(H\.\d+\.\d+\.\d+)$/;
  const colorPattern = /^(TFL[0-9A-Z]+|HG[A-Z]+|[A-Z]{2,6})$/;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    if (partCodePattern.test(line) || handlePattern.test(line)) {
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
      
      // Match dimension lines: qty height width length [thickness]
      // Format: "1 3.5 12 24" or "2 4.25 14.5 36 0.75"
      const dimensionMatch = line.match(/^(\d+)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)(?:\s+(\d+(?:\.\d+)?))?/);
      if (dimensionMatch) {
        currentPart.quantity = parseInt(dimensionMatch[1], 10) || currentPart.quantity;
        currentPart.height = parseFloat(dimensionMatch[2]) || null;
        currentPart.width = parseFloat(dimensionMatch[3]) || null;
        currentPart.length = parseFloat(dimensionMatch[4]) || null;
        if (dimensionMatch[5]) {
          currentPart.thickness = parseFloat(dimensionMatch[5]) || null;
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
        /Drawer\s*Fronts/i
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
