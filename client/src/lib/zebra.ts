// Zebra Label Printing Utility
// Uses Zebra Browser Print API with ZPL (Zebra Programming Language)
// Browser Print runs on localhost:9101 (HTTPS) or localhost:9100 (HTTP)

// Use Record to allow all fields from Browser Print API response
// The API returns various fields like name, uid, connection, deviceType, version, provider, manufacturer, etc.
export type ZebraPrinter = Record<string, unknown> & {
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

// Label size configuration in inches
export interface LabelSize {
  widthInches: number;
  heightInches: number;
}

// Printer configuration stored per-computer in localStorage
export interface PrinterConfig {
  printer4x2Uid: string | null;  // For Project, Hardware, CTS labels
  printer4x6Uid: string | null;  // For Pallet labels
  label4x2Size: LabelSize;       // Actual dimensions for "4x2" labels
  label4x6Size: LabelSize;       // Actual dimensions for "4x6" labels
}

// Default label sizes
const DEFAULT_4X2_SIZE: LabelSize = { widthInches: 4, heightInches: 2 };
const DEFAULT_4X6_SIZE: LabelSize = { widthInches: 4, heightInches: 6 };

const PRINTER_CONFIG_KEY = 'zebra_printer_config';

// Printer DPI (dots per inch) - standard for Zebra printers
const PRINTER_DPI = 203;

// Convert inches to dots
export function inchesToDots(inches: number): number {
  return Math.round(inches * PRINTER_DPI);
}

// Get stored printer configuration
export function getPrinterConfig(): PrinterConfig {
  try {
    const stored = localStorage.getItem(PRINTER_CONFIG_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Ensure label sizes have defaults if not set
      return {
        printer4x2Uid: parsed.printer4x2Uid || null,
        printer4x6Uid: parsed.printer4x6Uid || null,
        label4x2Size: parsed.label4x2Size || DEFAULT_4X2_SIZE,
        label4x6Size: parsed.label4x6Size || DEFAULT_4X6_SIZE,
      };
    }
  } catch {
    // Ignore parse errors
  }
  return { 
    printer4x2Uid: null, 
    printer4x6Uid: null,
    label4x2Size: DEFAULT_4X2_SIZE,
    label4x6Size: DEFAULT_4X6_SIZE,
  };
}

// Save printer configuration
export function savePrinterConfig(config: PrinterConfig): void {
  localStorage.setItem(PRINTER_CONFIG_KEY, JSON.stringify(config));
}

// Cached working base URL
let browserPrintUrl: string | null = null;

// Try to connect to Browser Print service
async function discoverBrowserPrint(): Promise<string> {
  if (browserPrintUrl) {
    return browserPrintUrl;
  }
  
  // Try HTTPS first (port 9101), then HTTP (port 9100)
  const urls = [
    'https://localhost:9101',
    'http://localhost:9100',
    'https://127.0.0.1:9101',
    'http://127.0.0.1:9100'
  ];
  
  for (const url of urls) {
    try {
      console.log(`[Zebra] Trying ${url}...`);
      const response = await fetch(`${url}/available`, {
        method: 'GET',
        mode: 'cors',
      });
      
      if (response.ok) {
        console.log(`[Zebra] Connected to Browser Print at ${url}`);
        browserPrintUrl = url;
        return url;
      }
    } catch {
      // Try next URL
    }
  }
  
  throw new Error('Zebra Browser Print not found. Please ensure Browser Print is installed and running. Visit https://localhost:9101/ssl_support to accept the SSL certificate.');
}

// Discover available Zebra printers via Browser Print
export async function getZebraPrinters(): Promise<ZebraPrinter[]> {
  try {
    const baseUrl = await discoverBrowserPrint();
    const response = await fetch(`${baseUrl}/available`, {
      method: 'GET',
      mode: 'cors',
    });
    
    if (!response.ok) {
      throw new Error(`Failed to get printers: ${response.statusText}`);
    }
    
    const data = await response.json();
    return data.printer || [];
  } catch (error) {
    console.error('[Zebra] Error getting printers:', error);
    throw error;
  }
}

// Find the first available Zebra printer
async function findZebraPrinter(): Promise<ZebraPrinter | null> {
  const printers = await getZebraPrinters();
  console.log('[Zebra] Available printers:', printers);
  return printers.length > 0 ? printers[0] : null;
}

// Find configured printer for a specific label size
async function findConfiguredPrinter(labelSize: '4x2' | '4x6'): Promise<ZebraPrinter | null> {
  const printers = await getZebraPrinters();
  console.log('[Zebra] Available printers:', printers);
  
  if (printers.length === 0) {
    return null;
  }
  
  const config = getPrinterConfig();
  const configuredUid = labelSize === '4x2' ? config.printer4x2Uid : config.printer4x6Uid;
  
  if (configuredUid) {
    const configuredPrinter = printers.find(p => p.uid === configuredUid);
    if (configuredPrinter) {
      console.log(`[Zebra] Using configured ${labelSize} printer: ${configuredPrinter.name}`);
      return configuredPrinter;
    }
    console.log(`[Zebra] Configured ${labelSize} printer not found, falling back to first available`);
  }
  
  // Fall back to first printer if none configured
  return printers[0];
}

// Send ZPL to printer via Browser Print
async function sendZpl(printer: ZebraPrinter, zpl: string): Promise<void> {
  const baseUrl = await discoverBrowserPrint();
  
  // Pass through the entire printer object as-is from the API response
  // This ensures all required fields (name, uid, connection, manufacturer, etc.) are included
  const response = await fetch(`${baseUrl}/write`, {
    method: 'POST',
    mode: 'cors',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      device: printer,
      data: zpl
    }),
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Print failed: ${errorText || response.statusText}`);
  }
}

// Fixed font sizes (in dots at 203 DPI)
const FONT_SIZE_12 = 40; // ~12pt font
const FONT_SIZE_15 = 50; // ~15pt font for project/hardware labels
const FONT_SIZE_25 = 75; // ~25pt font for pallet line

// Wrap text to fit within max characters per line
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

// Max characters per line at size 12 font (~40 dots) on 4x2 label (750 dots usable width)
// At 40 dots, char width is ~22 dots, so ~34 chars per line
const MAX_CHARS_4X2 = 34;

// Max characters per line at size 15 font (~50 dots) on 4x2 label
// At 50 dots, char width is ~27.5 dots, so ~27 chars per line
const MAX_CHARS_4X2_SIZE15 = 27;

// Max characters per line at size 12 font on 4x6 label
const MAX_CHARS_4X6 = 34;

// Create ZPL for 4x2 Project Label with fixed font and text wrapping
function createProjectLabelZpl(data: {
  projectName: string;
  orderId: string;
  cienappsJobNumber: string;
}, labelSize: LabelSize): string {
  // Get dimensions from config (in dots)
  const labelWidth = inchesToDots(labelSize.widthInches);
  const labelHeight = inchesToDots(labelSize.heightInches);
  
  // Fixed font size 15 (~50 dots) with text wrapping
  const line1 = 'PERFECT FIT PROJECT LABEL';
  const line2 = `Cienapps & CV Job #: ${data.cienappsJobNumber}`;
  const line3Parts = wrapText(`Project Name: ${data.projectName}`, MAX_CHARS_4X2_SIZE15);
  const line4 = `Perfect Fit Order ID: ${data.orderId}`;
  
  // Build all lines including wrapped ones
  const allLines = [line1, line2, ...line3Parts, line4];
  const lineHeight = Math.floor(labelHeight / (allLines.length + 1));
  
  let zpl = `^XA
^LH0,0
^LT0
^PW${labelWidth}
^LL${labelHeight}
^CF0,${FONT_SIZE_15}`;
  
  allLines.forEach((line, i) => {
    zpl += `\n^FO30,${lineHeight * (i + 0.5)}^FD${line}^FS`;
  });
  
  zpl += '\n^XZ';
  return zpl;
}

// Create ZPL for 4x6 Pallet Label with fixed font and text wrapping
function createPalletLabelZpl(data: {
  date: string;
  projectName: string;
  dealer: string;
  phone: string;
  orderId: string;
  palletNumber: string;
  totalPallets: string;
}, labelSize: LabelSize): string {
  // Get dimensions from config (in dots)
  const labelWidth = inchesToDots(labelSize.widthInches);
  const labelHeight = inchesToDots(labelSize.heightInches);
  // Layout: Content at top, PALLET X OF Y at bottom
  // Fixed font size 15 for content, size 25 for pallet line
  
  // Use size-15 appropriate max chars (27 chars like 4x2)
  const maxChars = MAX_CHARS_4X2_SIZE15;
  
  const headerLine = 'PERFECT FIT PALLET LABEL';
  const projectNameParts = wrapText(`Project Name: ${data.projectName}`, maxChars);
  const dealerParts = wrapText(`Dealer: ${data.dealer || 'N/A'}`, maxChars);
  const phoneLine = `Phone Number: ${data.phone || 'N/A'}`;
  const orderIdLine = `Perfect Fit Order ID: ${data.orderId}`;
  const palletLine = `PALLET ${data.palletNumber} OF ${data.totalPallets}`;
  
  // Build content lines
  const contentLines = [headerLine, ...projectNameParts, ...dealerParts, phoneLine, orderIdLine];
  
  // Layout constants - positions relative to label height
  const startY = 60; // Start from top
  const palletLineY = labelHeight - 120; // Position for pallet line near bottom (120 dots from bottom)
  const minLineSpacing = FONT_SIZE_15 + 20; // Minimum: font height + padding
  const maxLineSpacing = 140; // Maximum spacing for readability
  
  // Calculate available space for content (excluding pallet line area)
  const availableHeight = palletLineY - startY - FONT_SIZE_15; // Last line must fit above pallet
  
  // Calculate line spacing ensuring all lines fit
  let lineSpacing = Math.floor(availableHeight / Math.max(contentLines.length, 1));
  lineSpacing = Math.max(minLineSpacing, Math.min(maxLineSpacing, lineSpacing));
  
  // ZPL with explicit label length, home position, and top-of-form
  let zpl = `^XA
^LH0,0
^LT0
^PW${labelWidth}
^LL${labelHeight}
^CF0,${FONT_SIZE_15}`;
  
  // Add content lines with calculated spacing from top
  contentLines.forEach((line, i) => {
    const yPos = startY + (i * lineSpacing);
    zpl += `\n^FO30,${yPos}^FD${line}^FS`;
  });
  
  // Add pallet line with larger font near bottom
  zpl += `\n^CF0,${FONT_SIZE_25}`;
  zpl += `\n^FO30,${palletLineY}^FD${palletLine}^FS`;
  zpl += '\n^XZ';
  
  return zpl;
}

// Public print functions

export async function printProjectLabel(
  projectName: string,
  orderId: string,
  cienappsJobNumber: string
): Promise<PrintResult> {
  try {
    const printer = await findConfiguredPrinter('4x2');
    if (!printer) {
      return { success: false, error: 'No Zebra printer found. Please ensure Zebra Browser Print is running and a printer is connected.' };
    }
    
    const config = getPrinterConfig();
    const zpl = createProjectLabelZpl({
      projectName,
      orderId,
      cienappsJobNumber
    }, config.label4x2Size);
    
    console.log('[Zebra] Sending project label ZPL:', zpl);
    await sendZpl(printer, zpl);
    console.log(`[Zebra] Printed project label on ${printer.name}`);
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[Zebra] Print error:', message);
    return { success: false, error: message };
  }
}

export async function printHardwareLabel(
  orderName: string,
  allmoxyJobNumber: string,
  orderId: string,
  cienappsJobNumber: string,
  palletNumber?: number
): Promise<PrintResult> {
  // Hardware Label - 4x2 inch format with fixed font and text wrapping
  try {
    const printer = await findConfiguredPrinter('4x2');
    if (!printer) {
      return { success: false, error: 'No Zebra printer found. Please ensure Zebra Browser Print is running and a printer is connected.' };
    }
    
    const config = getPrinterConfig();
    const labelWidth = inchesToDots(config.label4x2Size.widthInches);
    const labelHeight = inchesToDots(config.label4x2Size.heightInches);
    
    // Combine order name with Allmoxy job number
    const orderLine = allmoxyJobNumber 
      ? `Order Name: ${orderName} ${allmoxyJobNumber}`
      : `Order Name: ${orderName}`;
    
    // Fixed font size 15 with text wrapping
    const line1 = 'PERFECT FIT HARDWARE LABEL';
    const line2 = `Cienapps & CV Job #: ${cienappsJobNumber}`;
    const line3 = `Perfect Fit Order ID: ${orderId}`;
    const line4Parts = wrapText(orderLine, MAX_CHARS_4X2_SIZE15);
    const palletLine = palletNumber ? `PALLET ${palletNumber}` : '';
    
    // Build all lines including wrapped ones
    const allLines = [line1, line2, line3, ...line4Parts];
    if (palletLine) allLines.push(palletLine);
    
    const lineHeight = Math.floor(labelHeight / (allLines.length + 1));
    
    let zpl = `^XA
^LH0,0
^LT0
^PW${labelWidth}
^LL${labelHeight}
^CF0,${FONT_SIZE_15}`;
    
    allLines.forEach((line, i) => {
      zpl += `\n^FO30,${lineHeight * (i + 0.5)}^FD${line}^FS`;
    });
    
    zpl += '\n^XZ';
    
    console.log('[Zebra] Sending hardware label ZPL:', zpl);
    await sendZpl(printer, zpl);
    console.log(`[Zebra] Printed hardware label on ${printer.name}`);
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[Zebra] Print error:', message);
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
  palletNumber?: number
): Promise<PrintResult> {
  // CTS (Cut To Size) Label - 4x2 inch format with fixed font and text wrapping
  try {
    const printer = await findConfiguredPrinter('4x2');
    if (!printer) {
      return { success: false, error: 'No Zebra printer found. Please ensure Zebra Browser Print is running and a printer is connected.' };
    }
    
    const config = getPrinterConfig();
    const labelWidth = inchesToDots(config.label4x2Size.widthInches);
    const labelHeight = inchesToDots(config.label4x2Size.heightInches);
    
    // Combine order name with Allmoxy job number
    const orderLine = allmoxyJobNumber 
      ? `Order Name: ${orderName} + ${allmoxyJobNumber}`
      : `Order Name: ${orderName}`;
    
    // Product info line: Name + Code + Length + Quantity
    const productLine = `${productName} + ${productCode} + ${cutLength} + ${quantity}`;
    const palletLine = palletNumber ? `PALLET ${palletNumber}` : '';
    
    // Fixed font size 12 with text wrapping
    const line1 = 'PERFECT FIT CTS LABEL';
    const line2 = `Cienapps & CV Job #: ${cienappsJobNumber}`;
    const line3 = `Perfect Fit Order ID: ${orderId}`;
    const line4Parts = wrapText(orderLine, MAX_CHARS_4X2);
    const line5Parts = wrapText(productLine, MAX_CHARS_4X2);
    
    // Build all lines including wrapped ones
    const allLines = [line1, line2, line3, ...line4Parts, ...line5Parts];
    if (palletLine) allLines.push(palletLine);
    
    const lineHeight = Math.floor(labelHeight / (allLines.length + 1));
    
    let zpl = `^XA
^LH0,0
^LT0
^PW${labelWidth}
^LL${labelHeight}
^CF0,${FONT_SIZE_12}`;
    
    allLines.forEach((line, i) => {
      zpl += `\n^FO30,${lineHeight * (i + 0.5)}^FD${line}^FS`;
    });
    
    zpl += '\n^XZ';
    
    console.log('[Zebra] Sending CTS label ZPL:', zpl);
    await sendZpl(printer, zpl);
    console.log(`[Zebra] Printed CTS label on ${printer.name}`);
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[Zebra] Print error:', message);
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
    const printer = await findConfiguredPrinter('4x6');
    if (!printer) {
      return { success: false, printed: 0, error: 'No Zebra printer found. Please ensure Zebra Browser Print is running and a printer is connected.' };
    }
    
    const config = getPrinterConfig();
    
    let printed = 0;
    for (let i = 1; i <= palletCount; i++) {
      const zpl = createPalletLabelZpl({
        date,
        projectName,
        dealer: dealer || '',
        phone: phone || '',
        orderId,
        palletNumber: String(i),
        totalPallets: String(palletCount)
      }, config.label4x6Size);
      
      console.log(`[Zebra] Sending pallet label ${i}/${palletCount} ZPL:`, zpl);
      await sendZpl(printer, zpl);
      printed++;
      console.log(`[Zebra] Printed pallet label ${i}/${palletCount} on ${printer.name}`);
    }
    
    return { success: true, printed };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[Zebra] Print error:', message);
    return { success: false, printed: 0, error: message };
  }
}
