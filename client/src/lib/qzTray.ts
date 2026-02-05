// QZ Tray Label Printing Utility
// Uses QZ Tray for raw ZPL printing to thermal label printers
// QZ Tray must be installed and running on the local machine

import qz from 'qz-tray';

export type Printer = {
  name: string;
  uid: string;
};

interface PrintResult {
  success: boolean;
  error?: string;
}

interface PalletPrintResult {
  success: boolean;
  printed: number;
  error?: string;
}

export interface LabelSize {
  widthInches: number;
  heightInches: number;
}

export interface PrinterConfig {
  printer4x2Name: string | null;
  printer4x6Name: string | null;
  label4x2Size: LabelSize;
  label4x6Size: LabelSize;
}

const DEFAULT_4X2_SIZE: LabelSize = { widthInches: 4, heightInches: 2 };
const DEFAULT_4X6_SIZE: LabelSize = { widthInches: 4, heightInches: 6 };

const PRINTER_CONFIG_KEY = 'qz_printer_config';
const PRINTER_DPI = 203;

export function inchesToDots(inches: number): number {
  return Math.round(inches * PRINTER_DPI);
}

export function getPrinterConfig(): PrinterConfig {
  try {
    const stored = localStorage.getItem(PRINTER_CONFIG_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        printer4x2Name: parsed.printer4x2Name || null,
        printer4x6Name: parsed.printer4x6Name || null,
        label4x2Size: parsed.label4x2Size || DEFAULT_4X2_SIZE,
        label4x6Size: parsed.label4x6Size || DEFAULT_4X6_SIZE,
      };
    }
  } catch {
    // Ignore parse errors
  }
  return { 
    printer4x2Name: null, 
    printer4x6Name: null,
    label4x2Size: DEFAULT_4X2_SIZE,
    label4x6Size: DEFAULT_4X6_SIZE,
  };
}

export function savePrinterConfig(config: PrinterConfig): void {
  localStorage.setItem(PRINTER_CONFIG_KEY, JSON.stringify(config));
}

let isConnected = false;

// Signing callbacks removed - QZ Tray will show "Allow" dialog for each site
// To enable auto-signing without dialogs, set QZ_TRAY_CERTIFICATE and QZ_TRAY_PRIVATE_KEY env vars

async function ensureConnection(): Promise<void> {
  
  if (qz.websocket.isActive()) {
    isConnected = true;
    return;
  }
  
  try {
    console.log('[QZ Tray] Connecting...');
    await qz.websocket.connect();
    isConnected = true;
    console.log('[QZ Tray] Connected successfully');
  } catch (error) {
    isConnected = false;
    console.error('[QZ Tray] Connection error:', error);
    throw new Error('QZ Tray not found. Please ensure QZ Tray is installed and running. Download from https://qz.io');
  }
}

export async function getPrinters(): Promise<Printer[]> {
  try {
    console.log('[QZ Tray] getPrinters() called');
    await ensureConnection();
    console.log('[QZ Tray] Connection established, calling qz.printers.find()...');
    const printers = await qz.printers.find();
    console.log('[QZ Tray] qz.printers.find() returned:', printers);
    
    if (Array.isArray(printers)) {
      return printers.map((name: string) => ({
        name,
        uid: name
      }));
    }
    
    return [{ name: printers as string, uid: printers as string }];
  } catch (error) {
    console.error('[QZ Tray] Error getting printers:', error);
    throw error;
  }
}

async function findConfiguredPrinter(labelSize: '4x2' | '4x6'): Promise<string | null> {
  const printers = await getPrinters();
  console.log('[QZ Tray] Available printers:', printers);
  
  if (printers.length === 0) {
    return null;
  }
  
  const config = getPrinterConfig();
  const configuredName = labelSize === '4x2' ? config.printer4x2Name : config.printer4x6Name;
  
  if (configuredName) {
    const configuredPrinter = printers.find(p => p.name === configuredName);
    if (configuredPrinter) {
      console.log(`[QZ Tray] Using configured ${labelSize} printer: ${configuredPrinter.name}`);
      return configuredPrinter.name;
    }
    console.log(`[QZ Tray] Configured ${labelSize} printer not found, falling back to first available`);
  }
  
  return printers[0].name;
}

async function sendZpl(printerName: string, zpl: string): Promise<void> {
  await ensureConnection();
  
  const config = qz.configs.create(printerName);
  const data = [{ type: 'raw', format: 'plain', data: zpl }];
  
  console.log('[QZ Tray] Sending ZPL to printer:', printerName);
  await qz.print(config, data);
}

function wrapText(text: string, maxCharsPerLine: number): string[] {
  if (text.length <= maxCharsPerLine) {
    return [text];
  }
  
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';
  
  for (const word of words) {
    if (currentLine.length === 0) {
      currentLine = word;
    } else if ((currentLine + ' ' + word).length <= maxCharsPerLine) {
      currentLine += ' ' + word;
    } else {
      lines.push(currentLine);
      currentLine = word;
    }
  }
  
  if (currentLine.length > 0) {
    lines.push(currentLine);
  }
  
  return lines;
}

const MAX_CHARS_4X2 = 34;
const MAX_CHARS_4X6 = 34;
const PALLET_MAX_CHARS = 24;

function createProjectLabelZpl(data: {
  projectName: string;
  orderId: string;
  cienappsJobNumber: string;
}, labelSize: LabelSize): string {
  const labelWidth = 812;
  const labelHeight = 406;
  const leftMargin = 30;
  const fontSize = 60;
  const lineHeight = 60;
  const maxChars = 25;

  let zpl = `~JA^XA^MTD^MNW^PW${labelWidth}^LL${labelHeight}^LS0^CI28\n`;
  let yPos = 15;

  zpl += `^FO${leftMargin},${yPos}^A0N,${fontSize},${fontSize}^FDPROJECT LABEL^FS\n`;
  yPos += 55;
  zpl += `^FO${leftMargin},${yPos}^GB500,3,3^FS\n`;
  yPos += 20;

  zpl += `^FO${leftMargin},${yPos}^A0N,${fontSize},${fontSize}^FDCienapps Job #: ${data.cienappsJobNumber || 'N/A'}^FS\n`;
  yPos += lineHeight;

  const projectNameText = `Project Name: ${data.projectName || 'N/A'}`;
  const projectNameLines = wrapText(projectNameText, maxChars).slice(0, 3);
  for (const line of projectNameLines) {
    zpl += `^FO${leftMargin},${yPos}^A0N,${fontSize},${fontSize}^FD${line}^FS\n`;
    yPos += lineHeight;
  }

  zpl += `^FO${leftMargin},${yPos}^A0N,${fontSize},${fontSize}^FDPF Order ID: ${data.orderId || 'N/A'}^FS\n`;

  zpl += '^XZ';
  return zpl;
}

export async function printProjectLabel(
  projectName: string,
  orderId: string,
  cienappsJobNumber: string
): Promise<PrintResult> {
  try {
    const printerName = await findConfiguredPrinter('4x2');
    if (!printerName) {
      return { success: false, error: 'No printer found. Please ensure QZ Tray is running and a printer is connected.' };
    }
    
    const config = getPrinterConfig();
    const zpl = createProjectLabelZpl({ projectName, orderId, cienappsJobNumber }, config.label4x2Size);
    
    console.log('[QZ Tray] Sending project label ZPL:', zpl);
    await sendZpl(printerName, zpl);
    console.log(`[QZ Tray] Printed project label on ${printerName}`);
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[QZ Tray] Print error:', message);
    return { success: false, error: message };
  }
}

export async function printHardwareLabel(
  orderName: string,
  allmoxyJobNumber: string,
  orderId: string,
  cienappsJobNumber: string,
  palletNumber?: number,
  palletCount?: number
): Promise<PrintResult> {
  try {
    const printerName = await findConfiguredPrinter('4x2');
    if (!printerName) {
      return { success: false, error: 'No printer found. Please ensure QZ Tray is running and a printer is connected.' };
    }
    
    const labelWidth = 812;
    const labelHeight = 406;
    const leftMargin = 30;
    const fontSize = 50;
    const smallerFontSize = 45;
    const lineHeight = 50;
    const smallerLineHeight = 45;
    const maxChars = 25;
    
    let zpl = `~JA^XA^MTD^MNW^PW${labelWidth}^LL${labelHeight}^LS0^CI28\n`;
    let yPos = 24;

    zpl += `^FO${leftMargin},${yPos}^A0N,${fontSize},${fontSize}^FDHARDWARE LABEL^FS\n`;
    yPos += 48;
    zpl += `^FO${leftMargin},${yPos}^GB500,3,3^FS\n`;
    yPos += 12;

    zpl += `^FO${leftMargin},${yPos}^A0N,${fontSize},${fontSize}^FDCienapps Job #: ${cienappsJobNumber || 'N/A'}^FS\n`;
    yPos += lineHeight;

    zpl += `^FO${leftMargin},${yPos}^A0N,${fontSize},${fontSize}^FDALLMOXY #: ${allmoxyJobNumber || 'N/A'}^FS\n`;
    yPos += lineHeight;

    zpl += `^FO${leftMargin},${yPos}^A0N,${fontSize},${fontSize}^FDPF ORDER ID: ${orderId || 'N/A'}^FS\n`;
    yPos += lineHeight;

    const orderNameText = `ORDER NAME: ${orderName || 'N/A'}`;
    const orderNameLines = wrapText(orderNameText, 35).slice(0, 3);
    for (const line of orderNameLines) {
      zpl += `^FO${leftMargin},${yPos}^A0N,${smallerFontSize},${smallerFontSize}^FD${line}^FS\n`;
      yPos += smallerLineHeight;
    }

    if (palletNumber && palletCount) {
      zpl += `^FO0,${yPos}^A0N,${fontSize},${fontSize}^FB${labelWidth},1,0,C^FDPALLET ${palletNumber} OF ${palletCount}^FS\n`;
    } else if (palletNumber) {
      zpl += `^FO0,${yPos}^A0N,${fontSize},${fontSize}^FB${labelWidth},1,0,C^FDPALLET ${palletNumber}^FS\n`;
    }

    zpl += '^XZ';
    
    console.log('[QZ Tray] Sending hardware label ZPL:', zpl);
    await sendZpl(printerName, zpl);
    console.log(`[QZ Tray] Printed hardware label on ${printerName}`);
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[QZ Tray] Print error:', message);
    return { success: false, error: message };
  }
}

export async function printCTSLabel(
  orderName: string,
  allmoxyJobNumber: string,
  orderId: string,
  cienappsJobNumber: string,
  productName: string,
  productCode: string,
  quantity: number,
  cutLength: number,
  palletNumber?: number,
  palletCount?: number
): Promise<PrintResult> {
  try {
    const printerName = await findConfiguredPrinter('4x2');
    if (!printerName) {
      return { success: false, error: 'No printer found. Please ensure QZ Tray is running and a printer is connected.' };
    }
    
    const labelWidth = 812;
    const labelHeight = 406;
    const leftMargin = 40;
    
    let zpl = `~JA^XA^MTD^MNW^PW${labelWidth}^LL${labelHeight}^LS0^CI28\n`;
    const largeFontSize = 38;
    const largeLineHeight = 42;
    const smallFontSize = 35;
    const smallLineHeight = 38;
    const maxChars = 38;
    let yPos = 20;

    zpl += `^FO0,${yPos}^A0N,${largeFontSize},${largeFontSize}^FB${labelWidth},1,0,C^FDCTS LABEL^FS\n`;
    yPos += 45;
    zpl += `^FO${leftMargin},${yPos}^GB400,2,2^FS\n`;
    yPos += 15;

    zpl += `^FO${leftMargin},${yPos}^A0N,${largeFontSize},${largeFontSize}^FDCienapps Job #: ${cienappsJobNumber || 'N/A'}^FS\n`;
    yPos += largeLineHeight;

    zpl += `^FO${leftMargin},${yPos}^A0N,${largeFontSize},${largeFontSize}^FDPerfect Fit Order ID: ${orderId || 'N/A'}^FS\n`;
    yPos += largeLineHeight;

    zpl += `^FO${leftMargin},${yPos}^A0N,${largeFontSize},${largeFontSize}^FDAllmoxy Job #: ${allmoxyJobNumber || 'N/A'}^FS\n`;
    yPos += largeLineHeight;

    const orderNameText = `Order Name: ${orderName || 'N/A'}`;
    const orderNameLines = wrapText(orderNameText, maxChars).slice(0, 3);
    for (const line of orderNameLines) {
      zpl += `^FO${leftMargin},${yPos}^A0N,${smallFontSize},${smallFontSize}^FD${line}^FS\n`;
      yPos += smallLineHeight;
    }

    const productLine = `${productName || 'N/A'} + ${productCode || 'N/A'} + (LENGTH: ${cutLength} MM) + (QTY: ${quantity})`;
    const productLines = wrapText(productLine, maxChars).slice(0, 2);
    for (const line of productLines) {
      zpl += `^FO${leftMargin},${yPos}^A0N,${smallFontSize},${smallFontSize}^FD${line}^FS\n`;
      yPos += smallLineHeight;
    }

    if (palletNumber && palletCount) {
      const palletText = `PALLET ${palletNumber} OF ${palletCount}`;
      zpl += `^FO0,${yPos}^A0N,${smallFontSize},${smallFontSize}^FB${labelWidth},1,0,C^FD${palletText}^FS\n`;
    } else if (palletNumber) {
      const palletText = `PALLET ${palletNumber}`;
      zpl += `^FO0,${yPos}^A0N,${smallFontSize},${smallFontSize}^FB${labelWidth},1,0,C^FD${palletText}^FS\n`;
    }

    zpl += '^XZ';
    
    console.log('[QZ Tray] Sending CTS label ZPL:', zpl);
    await sendZpl(printerName, zpl);
    console.log(`[QZ Tray] Printed CTS label on ${printerName}`);
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[QZ Tray] Print error:', message);
    return { success: false, error: message };
  }
}

export async function printPalletLabels(
  date: string,
  projectName: string,
  orderId: string,
  palletCount: number,
  dealer?: string,
  phone?: string
): Promise<PalletPrintResult> {
  try {
    const printerName = await findConfiguredPrinter('4x6');
    if (!printerName) {
      return { success: false, printed: 0, error: 'No printer found. Please ensure QZ Tray is running and a printer is connected.' };
    }
    
    const labelWidth = 812;
    const labelHeight = 1218;
    const leftMargin = 40;
    const lineSpacing = 55;
    
    let printed = 0;
    
    for (let pallet = 1; pallet <= palletCount; pallet++) {
      let zpl = `~JA^XA^MTD^MNW^PW${labelWidth}^LL${labelHeight}^LS0^CI28\n`;
      
      let yPos = 78;
      
      zpl += `^CF0,56\n`;
      zpl += `^FO${leftMargin},${yPos}^FDPALLET LABEL^FS\n`;
      yPos += lineSpacing;
      zpl += `^FO${leftMargin},${yPos}^GB450,2,2^FS\n`;
      yPos += 30;
      
      zpl += `^CF0,56\n`;
      zpl += `^FO${leftMargin},${yPos}^FDProject:^FS\n`;
      yPos += lineSpacing;
      zpl += `^FO${leftMargin},${yPos}^GB240,2,2^FS\n`;
      yPos += 15;
      
      const wrappedProject = wrapText(projectName || 'N/A', PALLET_MAX_CHARS).slice(0, 3);
      for (const line of wrappedProject) {
        zpl += `^FO${leftMargin},${yPos}^FD${line}^FS\n`;
        yPos += 60;
      }
      if (wrappedProject.length === 1) yPos += 10;
      
      zpl += `^FO${leftMargin},${yPos}^GB732,6,6^FS\n`;
      yPos += 25;
      
      zpl += `^CF0,56\n`;
      zpl += `^FO${leftMargin},${yPos}^FDDealer:^FS\n`;
      yPos += lineSpacing;
      zpl += `^FO${leftMargin},${yPos}^GB210,2,2^FS\n`;
      yPos += 15;
      
      const wrappedDealer = wrapText(dealer || 'N/A', PALLET_MAX_CHARS);
      for (const line of wrappedDealer) {
        zpl += `^FO${leftMargin},${yPos}^FD${line}^FS\n`;
        yPos += 60;
      }
      if (wrappedDealer.length === 1) yPos += 10;
      
      zpl += `^FO${leftMargin},${yPos}^GB732,6,6^FS\n`;
      yPos += 25;
      
      zpl += `^CF0,56\n`;
      zpl += `^FO${leftMargin},${yPos}^FDDealer Phone #:^FS\n`;
      yPos += lineSpacing;
      zpl += `^FO${leftMargin},${yPos}^GB380,2,2^FS\n`;
      yPos += 15;
      zpl += `^FO${leftMargin},${yPos}^FD${phone || 'N/A'}^FS\n`;
      yPos += 70;
      
      zpl += `^FO${leftMargin},${yPos}^GB732,6,6^FS\n`;
      yPos += 25;
      
      zpl += `^CF0,56\n`;
      zpl += `^FO${leftMargin},${yPos}^FDPF ORDER ID:^FS\n`;
      yPos += lineSpacing;
      zpl += `^FO${leftMargin},${yPos}^GB320,2,2^FS\n`;
      yPos += 15;
      zpl += `^FO${leftMargin},${yPos}^FD${orderId || 'N/A'}^FS\n`;
      
      zpl += `^CF0,113\n`;
      zpl += `^FO0,950^FB${labelWidth},1,0,C^FDPALLET^FS\n`;
      zpl += `^FO246,1060^GB320,2,2^FS\n`;
      zpl += `^FO0,1095^FB${labelWidth},1,0,C^FD${pallet} OF ${palletCount}^FS\n`;
      
      zpl += '^XZ';
      
      console.log(`[QZ Tray] Sending pallet label ${pallet}/${palletCount} ZPL:`, zpl);
      await sendZpl(printerName, zpl);
      console.log(`[QZ Tray] Printed pallet label ${pallet}/${palletCount} on ${printerName}`);
      printed++;
    }
    
    return { success: true, printed };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[QZ Tray] Print error:', message);
    return { success: false, printed: 0, error: message };
  }
}

export async function checkConnection(): Promise<{ connected: boolean; error?: string }> {
  try {
    await ensureConnection();
    return { connected: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { connected: false, error: message };
  }
}

export async function disconnect(): Promise<void> {
  if (qz.websocket.isActive()) {
    await qz.websocket.disconnect();
    isConnected = false;
    console.log('[QZ Tray] Disconnected');
  }
}
