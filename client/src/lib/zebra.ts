// Zebra Label Printing Utility
// Uses Zebra Browser Print API with ZPL (Zebra Programming Language)
// Browser Print runs on localhost:9101 (HTTPS) or localhost:9100 (HTTP)

// Use Record to allow all fields from Browser Print API response
// The API returns various fields like name, uid, connection, deviceType, version, provider, manufacturer, etc.
type ZebraPrinter = Record<string, unknown> & {
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

// Calculate optimal font size for 4x2 label based on longest line
// 4x2 label at 203 DPI = 812 x 406 dots, usable width ~750 dots
function calculateFontSize(lines: string[]): number {
  const maxWidth = 750; // usable print width in dots
  const maxFontSize = 45; // max font size for 4 lines
  const minFontSize = 20; // minimum readable font size
  
  // Find the longest line
  const longestLine = lines.reduce((a, b) => a.length > b.length ? a : b, '');
  const charCount = longestLine.length;
  
  // Approximate character width is ~60% of font height for standard ZPL fonts
  // So: charCount * (fontSize * 0.6) <= maxWidth
  // fontSize <= maxWidth / (charCount * 0.6)
  const calculatedSize = Math.floor(maxWidth / (charCount * 0.55));
  
  // Clamp between min and max
  return Math.min(maxFontSize, Math.max(minFontSize, calculatedSize));
}

// Create ZPL for 4x2 Project Label with auto-scaling font
function createProjectLabelZpl(data: {
  projectName: string;
  orderId: string;
  cienappsJobNumber: string;
}): string {
  // 4x2 inch label at 203 DPI = 812 x 406 dots
  // 4 lines of text with auto-scaling font
  const line1 = 'PERFECT FIT PROJECT LABEL';
  const line2 = `Cienapps & CV Job #: ${data.cienappsJobNumber}`;
  const line3 = `Project Name: ${data.projectName}`;
  const line4 = `Perfect Fit Order ID: ${data.orderId}`;
  
  const fontSize = calculateFontSize([line1, line2, line3, line4]);
  const lineHeight = Math.floor(406 / 5); // ~81 dots per line with margins
  
  return `^XA
^PW812
^LL406
^CF0,${fontSize}
^FO30,${lineHeight * 0.5}^FD${line1}^FS
^FO30,${lineHeight * 1.5}^FD${line2}^FS
^FO30,${lineHeight * 2.5}^FD${line3}^FS
^FO30,${lineHeight * 3.5}^FD${line4}^FS
^XZ`;
}

// Calculate optimal font size for 4x6 pallet label based on longest line
// 4x6 label at 203 DPI = 812 x 1218 dots, usable width ~750 dots
function calculatePalletFontSize(lines: string[]): number {
  const maxWidth = 750;
  const maxFontSize = 60;
  const minFontSize = 25;
  
  const longestLine = lines.reduce((a, b) => a.length > b.length ? a : b, '');
  const charCount = longestLine.length;
  
  const calculatedSize = Math.floor(maxWidth / (charCount * 0.55));
  return Math.min(maxFontSize, Math.max(minFontSize, calculatedSize));
}

// Create ZPL for 4x6 Pallet Label with auto-scaling
function createPalletLabelZpl(data: {
  date: string;
  projectName: string;
  dealer: string;
  phone: string;
  orderId: string;
  palletNumber: string;
  totalPallets: string;
}): string {
  // 4x6 inch label at 203 DPI = 812 x 1218 dots
  // Layout: Date top-left, PERFECT FIT top-right
  // Then 5 content lines plus pallet info
  
  const line1 = `Project Name: ${data.projectName}`;
  const line2 = `Dealer: ${data.dealer || 'N/A'}`;
  const line3 = `Phone: ${data.phone || 'N/A'}`;
  const line4 = `Perfect Fit Order ID: ${data.orderId}`;
  const line5 = `PALLET ${data.palletNumber} OF ${data.totalPallets}`;
  
  const fontSize = calculatePalletFontSize([line1, line2, line3, line4, line5]);
  const lineHeight = Math.floor(1218 / 8); // 8 sections for header + 5 lines + margins
  
  return `^XA
^PW812
^LL1218
^CF0,35
^FO30,30^FD${data.date}^FS
^FO500,30^FDPERFECT FIT^FS
^CF0,${fontSize}
^FO30,${lineHeight * 1.5}^FD${line1}^FS
^FO30,${lineHeight * 2.5}^FD${line2}^FS
^FO30,${lineHeight * 3.5}^FD${line3}^FS
^FO30,${lineHeight * 4.5}^FD${line4}^FS
^CF0,${Math.min(fontSize + 15, 75)}
^FO30,${lineHeight * 6}^FD${line5}^FS
^XZ`;
}

// Public print functions

export async function printProjectLabel(
  projectName: string,
  orderId: string,
  cienappsJobNumber: string
): Promise<PrintResult> {
  try {
    const printer = await findZebraPrinter();
    if (!printer) {
      return { success: false, error: 'No Zebra printer found. Please ensure Zebra Browser-Link is running and a printer is connected.' };
    }
    
    const zpl = createProjectLabelZpl({
      projectName,
      orderId,
      cienappsJobNumber
    });
    
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
  cienappsJobNumber: string
): Promise<PrintResult> {
  // Hardware Label - 4x2 inch format with auto-scaling
  try {
    const printer = await findZebraPrinter();
    if (!printer) {
      return { success: false, error: 'No Zebra printer found. Please ensure Zebra Browser-Link is running and a printer is connected.' };
    }
    
    // Combine order name with Allmoxy job number
    const orderLine = allmoxyJobNumber 
      ? `${orderName} - Allmoxy #${allmoxyJobNumber}`
      : orderName;
    
    // 4 lines with auto-scaling
    const line1 = 'PERFECT FIT HARDWARE LABEL';
    const line2 = `Cienapps & CV Job #: ${cienappsJobNumber}`;
    const line3 = `Perfect Fit Order ID: ${orderId}`;
    const line4 = `Order Name: ${orderLine}`;
    
    const fontSize = calculateFontSize([line1, line2, line3, line4]);
    const lineHeight = Math.floor(406 / 5);
    
    // 4x2 hardware label at 203 DPI = 812 x 406 dots
    const zpl = `^XA
^PW812
^LL406
^CF0,${fontSize}
^FO30,${lineHeight * 0.5}^FD${line1}^FS
^FO30,${lineHeight * 1.5}^FD${line2}^FS
^FO30,${lineHeight * 2.5}^FD${line3}^FS
^FO30,${lineHeight * 3.5}^FD${line4}^FS
^XZ`;
    
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
  cutLength: number
): Promise<PrintResult> {
  // CTS (Cut To Size) Label - 4x2 inch format with auto-scaling, 5 lines
  try {
    const printer = await findZebraPrinter();
    if (!printer) {
      return { success: false, error: 'No Zebra printer found. Please ensure Zebra Browser-Link is running and a printer is connected.' };
    }
    
    // Combine order name with Allmoxy job number
    const orderLine = allmoxyJobNumber 
      ? `${orderName} - Allmoxy #${allmoxyJobNumber}`
      : orderName;
    
    // Product info line: Name - Code - Qty X @ Ymm
    const productLine = `${productName} - ${productCode} - Qty ${quantity} @ ${cutLength.toFixed(1)}mm`;
    
    // 5 lines with auto-scaling
    const line1 = 'PERFECT FIT CTS LABEL';
    const line2 = `Cienapps & CV Job #: ${cienappsJobNumber}`;
    const line3 = `Perfect Fit Order ID: ${orderId}`;
    const line4 = `Order Name: ${orderLine}`;
    const line5 = productLine;
    
    const fontSize = calculateFontSize([line1, line2, line3, line4, line5]);
    const lineHeight = Math.floor(406 / 6); // 6 sections for 5 lines with margins
    
    // 4x2 CTS label at 203 DPI = 812 x 406 dots
    const zpl = `^XA
^PW812
^LL406
^CF0,${fontSize}
^FO30,${lineHeight * 0.5}^FD${line1}^FS
^FO30,${lineHeight * 1.5}^FD${line2}^FS
^FO30,${lineHeight * 2.5}^FD${line3}^FS
^FO30,${lineHeight * 3.5}^FD${line4}^FS
^FO30,${lineHeight * 4.5}^FD${line5}^FS
^XZ`;
    
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
    const printer = await findZebraPrinter();
    if (!printer) {
      return { success: false, printed: 0, error: 'No Zebra printer found. Please ensure Zebra Browser-Link is running and a printer is connected.' };
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
      });
      
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
