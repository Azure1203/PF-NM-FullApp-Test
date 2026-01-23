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

// Create ZPL for 4x2 Project Label - optimized for direct thermal printing
function createProjectLabelZpl(data: {
  projectName: string;
  orderId: string;
  cienappsJobNumber: string;
}, labelSize: LabelSize): string {
  // Absolute 203 DPI dots for 4x2
  const labelWidth = 812;   // 4 inches
  const labelHeight = 406;  // 2 inches
  const leftMargin = 30;
  
  // Build ZPL - match working pallet label structure exactly
  let zpl = `^XA`;
  zpl += `^MTD`;           // Direct Thermal
  zpl += `^MNW`;           // Web/Gap Sensing
  zpl += `^PW${labelWidth}`;
  zpl += `^LL${labelHeight}`;
  zpl += `^LS0`;
  zpl += `^LT0`;           // No vertical shift
  zpl += `^CI28`;

  let yPos = 30;

  // --- Header ---
  zpl += `\n^CF0,45`;
  zpl += `\n^FO${leftMargin},${yPos}^FDPERFECT FIT PROJECT LABEL^FS`;
  yPos += 50;
  zpl += `\n^FO${leftMargin},${yPos}^GB400,2,2^FS`;
  yPos += 30;

  // --- Content ---
  zpl += `\n^CF0,35`;

  zpl += `\n^FO${leftMargin},${yPos}^FDJob #: ${data.cienappsJobNumber || 'N/A'}^FS`;
  yPos += 55;

  zpl += `\n^FO${leftMargin},${yPos}^FDProject: ${data.projectName || 'N/A'}^FS`;
  yPos += 55;

  zpl += `\n^FO${leftMargin},${yPos}^FDOrder ID: ${data.orderId || 'N/A'}^FS`;

  // Debug border
  zpl += `\n^FO0,0^GB${labelWidth},${labelHeight},2^FS`;

  zpl += `\n^XZ`;
  return zpl;
}

// Font sizes for pallet labels (GX420d at 203 DPI)
// 20pt = 56 dots, 40pt = 113 dots (dots = points * 203/72)
const PALLET_FONT_NORMAL = 56;  // 20pt font for content lines
const PALLET_FONT_FOOTER = 113; // 40pt font for pallet footer
const PALLET_MAX_CHARS = 24;    // Max chars for value text wrapping

// Line thickness constants
const THIN_LINE = 2;   // Thin underline under labels
const BOLD_LINE = 6;   // Bold separator between sections

// Create ZPL for 4x6 Pallet Label - optimized for GX420d direct thermal printer
function createPalletLabelZpl(data: {
  date: string;
  projectName: string;
  dealer: string;
  phone: string;
  orderId: string;
  palletNumber: string;
  totalPallets: string;
}, labelSize: LabelSize): string {
  // Fixed 4x6 dimensions at 203 DPI
  const labelWidth = 812;  // 4 inches * 203 DPI
  const labelHeight = 1218; // 6 inches * 203 DPI
  const leftMargin = 40;
  const lineWidth = labelWidth - (leftMargin * 2); // Width for separator lines
  
  // Build ZPL string with direct thermal settings
  let zpl = `^XA` +
    `^MTD` + // Direct Thermal (no ribbon)
    `^MNW` + // Web/Gap Sensing (detects end of label)
    `^PW${labelWidth}` +
    `^LL${labelHeight}` +
    `^LS0` + // Label shift zero
    `^CI28`; // Character encoding
  
  let yPos = 78;  // Start 6mm down from top edge (48 dots at 203 DPI)
  
  // Helper to add a section: label (underlined), value, then bold separator
  const addSection = (label: string, value: string, addSeparator: boolean = true) => {
    // Label text
    zpl += `\n^CF0,${PALLET_FONT_NORMAL}`;
    zpl += `\n^FO${leftMargin},${yPos}^FD${label}^FS`;
    yPos += 55;
    
    // Thin underline under label (width based on label length estimate)
    const labelUnderlineWidth = Math.min(label.length * 30, 300);
    zpl += `\n^FO${leftMargin},${yPos}^GB${labelUnderlineWidth},${THIN_LINE},${THIN_LINE}^FS`;
    yPos += 15;
    
    // Value text (may wrap)
    const valueParts = wrapText(value, PALLET_MAX_CHARS);
    valueParts.forEach(part => {
      zpl += `\n^FO${leftMargin},${yPos}^FD${part}^FS`;
      yPos += 60;
    });
    
    // Bold separator line (only if requested)
    if (addSeparator) {
      yPos += 10;
      zpl += `\n^FO${leftMargin},${yPos}^GB${lineWidth},${BOLD_LINE},${BOLD_LINE}^FS`;
      yPos += 25;
    }
  };
  
  // Header - "PERFECT FIT PALLET LABEL" with thin underline (no separator after)
  zpl += `\n^CF0,${PALLET_FONT_NORMAL}`;
  zpl += `\n^FO${leftMargin},${yPos}^FDPERFECT FIT PALLET LABEL^FS`;
  yPos += 55;
  zpl += `\n^FO${leftMargin},${yPos}^GB${450},${THIN_LINE},${THIN_LINE}^FS`;
  yPos += 30;
  
  // Content sections with separators
  addSection('Project:', data.projectName || 'N/A');
  addSection('Dealer:', data.dealer || 'N/A');
  addSection('Phone:', data.phone || 'N/A');
  addSection('Order ID:', data.orderId, false); // No separator after last section
  
  // Pallet footer at bottom - centered
  const palletTextY = 950;
  const palletUnderlineY = palletTextY + 110;
  const numberY = palletUnderlineY + 35;
  
  zpl += `\n^CF0,${PALLET_FONT_FOOTER}`;
  // Center "PALLET" using field block
  zpl += `\n^FO0,${palletTextY}^FB${labelWidth},1,0,C^FDPALLET^FS`;
  // Thin underline (centered, about 320 dots wide)
  const palletUnderlineWidth = 320;
  const palletUnderlineX = Math.floor((labelWidth - palletUnderlineWidth) / 2);
  zpl += `\n^FO${palletUnderlineX},${palletUnderlineY}^GB${palletUnderlineWidth},${THIN_LINE},${THIN_LINE}^FS`;
  // Center "X OF Y"
  zpl += `\n^FO0,${numberY}^FB${labelWidth},1,0,C^FD${data.palletNumber} OF ${data.totalPallets}^FS`;
  
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
  // Hardware Label - 4x2 inch format with direct thermal settings
  try {
    const printer = await findConfiguredPrinter('4x2');
    if (!printer) {
      return { success: false, error: 'No Zebra printer found. Please ensure Zebra Browser Print is running and a printer is connected.' };
    }
    
    // Absolute 203 DPI dots for 4x2
    const labelWidth = 812;   // 4 inches
    const labelHeight = 406;  // 2 inches
    const leftMargin = 30;
    
    // Build ZPL - match working pallet label structure exactly
    let zpl = `^XA`;
    zpl += `^MTD`;           // Direct Thermal
    zpl += `^MNW`;           // Web/Gap Sensing
    zpl += `^PW${labelWidth}`;
    zpl += `^LL${labelHeight}`;
    zpl += `^LS0`;
    zpl += `^LT0`;           // No vertical shift
    zpl += `^CI28`;

    let yPos = 30;

    // --- Header ---
    zpl += `\n^CF0,45`;
    zpl += `\n^FO${leftMargin},${yPos}^FDPERFECT FIT HARDWARE LABEL^FS`;
    yPos += 50;
    zpl += `\n^FO${leftMargin},${yPos}^GB400,2,2^FS`;
    yPos += 30;

    // --- Content ---
    zpl += `\n^CF0,35`;

    zpl += `\n^FO${leftMargin},${yPos}^FDJob #: ${cienappsJobNumber || 'N/A'}^FS`;
    yPos += 55;

    zpl += `\n^FO${leftMargin},${yPos}^FDOrder ID: ${orderId || 'N/A'}^FS`;
    yPos += 55;

    const orderLine = allmoxyJobNumber 
      ? `Order: ${orderName || 'N/A'} ${allmoxyJobNumber}`
      : `Order: ${orderName || 'N/A'}`;
    zpl += `\n^FO${leftMargin},${yPos}^FD${orderLine}^FS`;
    yPos += 55;

    if (palletNumber) {
      zpl += `\n^FO${leftMargin},${yPos}^FDPALLET ${palletNumber}^FS`;
    }

    // Debug border
    zpl += `\n^FO0,0^GB${labelWidth},${labelHeight},2^FS`;

    zpl += `\n^XZ`;
    
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
  // CTS (Cut To Size) Label - 4x2 inch format with direct thermal settings
  try {
    const printer = await findConfiguredPrinter('4x2');
    if (!printer) {
      return { success: false, error: 'No Zebra printer found. Please ensure Zebra Browser Print is running and a printer is connected.' };
    }
    
    // Absolute 203 DPI dots for 4x2
    const labelWidth = 812;   // 4 inches
    const labelHeight = 406;  // 2 inches
    const leftMargin = 30;
    
    // Build ZPL - match working pallet label structure exactly
    let zpl = `^XA`;
    zpl += `^MTD`;           // Direct Thermal
    zpl += `^MNW`;           // Web/Gap Sensing
    zpl += `^PW${labelWidth}`;
    zpl += `^LL${labelHeight}`;
    zpl += `^LS0`;
    zpl += `^LT0`;           // No vertical shift
    zpl += `^CI28`;

    let yPos = 25;

    // --- Header ---
    zpl += `\n^CF0,40`;
    zpl += `\n^FO${leftMargin},${yPos}^FDPERFECT FIT CTS LABEL^FS`;
    yPos += 45;
    zpl += `\n^FO${leftMargin},${yPos}^GB350,2,2^FS`;
    yPos += 25;

    // --- Content (smaller font for CTS - more lines) ---
    zpl += `\n^CF0,30`;

    zpl += `\n^FO${leftMargin},${yPos}^FDJob #: ${cienappsJobNumber || 'N/A'}^FS`;
    yPos += 40;

    zpl += `\n^FO${leftMargin},${yPos}^FDOrder ID: ${orderId || 'N/A'}^FS`;
    yPos += 40;

    const orderLine = allmoxyJobNumber 
      ? `Order: ${orderName || 'N/A'} ${allmoxyJobNumber}`
      : `Order: ${orderName || 'N/A'}`;
    zpl += `\n^FO${leftMargin},${yPos}^FD${orderLine}^FS`;
    yPos += 40;

    const productLine = `${productName || 'N/A'} + ${productCode || 'N/A'} + ${cutLength} + ${quantity}`;
    zpl += `\n^FO${leftMargin},${yPos}^FD${productLine}^FS`;
    yPos += 40;

    if (palletNumber) {
      zpl += `\n^FO${leftMargin},${yPos}^FDPALLET ${palletNumber}^FS`;
    }

    // Debug border
    zpl += `\n^FO0,0^GB${labelWidth},${labelHeight},2^FS`;

    zpl += `\n^XZ`;
    
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
    const config = getPrinterConfig();
    
    // Require explicit 4x6 printer configuration for pallet labels
    if (!config.printer4x6Uid) {
      return { 
        success: false, 
        printed: 0, 
        error: 'No 4x6 printer configured. Please go to Printer Settings and select a printer for "Large Labels (Pallet)".' 
      };
    }
    
    const printer = await findConfiguredPrinter('4x6');
    if (!printer) {
      return { success: false, printed: 0, error: 'No Zebra printer found. Please ensure Zebra Browser Print is running and a printer is connected.' };
    }
    
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
