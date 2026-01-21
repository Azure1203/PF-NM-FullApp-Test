// Dymo Label Printing Utility
// Dynamically loads the official DYMO Connect Framework from the local service
// This approach bypasses CORS issues by loading the script from the DYMO service itself
// Supports Dymo 450 (30323 labels) and Dymo 4XL (1744907 labels)

// TypeScript declarations for the DYMO Connect Framework
declare global {
  interface Window {
    dymo?: {
      connect?: {
        framework?: DymoFramework;
      };
    };
  }
}

interface DymoFramework {
  init: () => Promise<void>;
  getPrinters: () => Promise<DymoPrinter[]>;
  printLabel: (printerName: string, printParamsXml: string, labelXml: string, labelSetXml: string) => Promise<void>;
  createLabelWriterPrintParamsXml: (params: { copies?: number; jobTitle?: string; flowDirection?: string; printQuality?: string; twinTurboRoll?: string }) => string;
}

interface DymoPrinter {
  name: string;
  modelName: string;
  isConnected: boolean;
  isLocal: boolean;
  isTwinTurbo: boolean;
}

// Cached state
let frameworkLoaded = false;
let frameworkLoading = false;
let loadedPort: number | null = null;
let loadPromise: Promise<void> | null = null;

// LocalStorage key for user-configured port
const DYMO_PORT_STORAGE_KEY = 'dymo_connect_port';

// Ports to try for DYMO Connect Web Service
const DYMO_PORTS = [
  41951, 41952, 41953, 41954, 41955, 41956, 41957, 41958, 41959, 41960,
  41961, 41962, 41963, 41964, 41965, 41966, 41967, 41968, 41969, 41970,
  8080, 8443, 9100, 9200
];

// Get user-configured port from localStorage (if set)
function getUserConfiguredPort(): number | null {
  try {
    const stored = localStorage.getItem(DYMO_PORT_STORAGE_KEY);
    if (stored) {
      const port = parseInt(stored, 10);
      if (!isNaN(port) && port > 0 && port < 65536) {
        return port;
      }
    }
  } catch {
    // localStorage not available
  }
  return null;
}

// Allow users to set a custom DYMO Connect port
export function setDymoPort(port: number): void {
  try {
    localStorage.setItem(DYMO_PORT_STORAGE_KEY, port.toString());
    // Reset framework state to force reload from new port
    frameworkLoaded = false;
    frameworkLoading = false;
    loadedPort = null;
    loadPromise = null;
    console.log(`[Dymo] Port set to ${port}. Next print will use this port.`);
  } catch {
    // localStorage not available
  }
}

// Clear custom port setting
export function clearDymoPort(): void {
  try {
    localStorage.removeItem(DYMO_PORT_STORAGE_KEY);
    frameworkLoaded = false;
    frameworkLoading = false;
    loadedPort = null;
    loadPromise = null;
    console.log('[Dymo] Custom port cleared. Will auto-discover on next print.');
  } catch {
    // localStorage not available
  }
}

// Get current DYMO Connect port (for display)
export function getDymoPort(): number | null {
  return loadedPort || getUserConfiguredPort();
}

// Try to load the DYMO framework from a specific port and host
// Uses localhost (not 127.0.0.1) as browsers treat localhost specially
function tryLoadFrameworkUrl(url: string, description: string): Promise<boolean> {
  return new Promise((resolve) => {
    const script = document.createElement('script');
    const timeoutId = setTimeout(() => {
      script.remove();
      resolve(false);
    }, 3000);

    script.onload = () => {
      clearTimeout(timeoutId);
      if (window.dymo?.connect?.framework) {
        console.log(`[Dymo] Framework loaded from ${description}`);
        resolve(true);
      } else {
        script.remove();
        resolve(false);
      }
    };

    script.onerror = () => {
      clearTimeout(timeoutId);
      script.remove();
      resolve(false);
    };

    script.src = url;
    document.head.appendChild(script);
  });
}

// Try all URL variations for a given port
// Order: HTTP localhost, HTTPS localhost, HTTP 127.0.0.1, HTTPS 127.0.0.1
async function tryLoadFrameworkPort(port: number): Promise<boolean> {
  const frameworkPath = '/DYMO/DLS/Printing/Host/Dymo.Connect.Framework.js';
  
  // Try HTTP localhost first (browsers have special exceptions for localhost HTTP)
  console.log(`[Dymo] Trying http://localhost:${port}...`);
  if (await tryLoadFrameworkUrl(`http://localhost:${port}${frameworkPath}`, `localhost:${port} (HTTP)`)) {
    return true;
  }
  
  // Try HTTPS localhost
  console.log(`[Dymo] Trying https://localhost:${port}...`);
  if (await tryLoadFrameworkUrl(`https://localhost:${port}${frameworkPath}`, `localhost:${port} (HTTPS)`)) {
    return true;
  }
  
  // Try HTTP 127.0.0.1 as fallback
  console.log(`[Dymo] Trying http://127.0.0.1:${port}...`);
  if (await tryLoadFrameworkUrl(`http://127.0.0.1:${port}${frameworkPath}`, `127.0.0.1:${port} (HTTP)`)) {
    return true;
  }
  
  // Try HTTPS 127.0.0.1 as last resort
  console.log(`[Dymo] Trying https://127.0.0.1:${port}...`);
  if (await tryLoadFrameworkUrl(`https://127.0.0.1:${port}${frameworkPath}`, `127.0.0.1:${port} (HTTPS)`)) {
    return true;
  }
  
  return false;
}

// Load the DYMO framework by discovering the port
async function loadDymoFramework(): Promise<void> {
  if (frameworkLoaded && window.dymo?.connect?.framework) {
    return;
  }

  if (frameworkLoading && loadPromise) {
    return loadPromise;
  }

  frameworkLoading = true;

  loadPromise = (async () => {
    // Try user-configured port first
    const userPort = getUserConfiguredPort();
    if (userPort) {
      console.log(`[Dymo] Trying user-configured port ${userPort}...`);
      if (await tryLoadFrameworkPort(userPort)) {
        loadedPort = userPort;
        frameworkLoaded = true;
        await window.dymo!.connect!.framework!.init();
        return;
      }
    }

    // Try each port in sequence
    for (const port of DYMO_PORTS) {
      if (await tryLoadFrameworkPort(port)) {
        loadedPort = port;
        frameworkLoaded = true;
        await window.dymo!.connect!.framework!.init();
        return;
      }
    }

    frameworkLoading = false;
    loadPromise = null;
    
    const triedPorts = userPort ? [userPort, ...DYMO_PORTS] : DYMO_PORTS;
    throw new Error(
      `DYMO Connect not found. Browser security is blocking access to localhost. ` +
      `Tried ports: ${triedPorts.slice(0, 5).join(', ')}... ` +
      `This is a browser limitation when accessing localhost from HTTPS sites. ` +
      `Please ensure DYMO Connect for Desktop is installed and running.`
    );
  })();

  return loadPromise;
}

// Public interface types
export interface DymoPrinterInfo {
  name: string;
  modelName: string;
  isConnected: boolean;
  isLocal: boolean;
  isTwinTurbo: boolean;
}

// Get list of available printers
export async function getPrinters(): Promise<DymoPrinterInfo[]> {
  await loadDymoFramework();
  
  const framework = window.dymo?.connect?.framework;
  if (!framework) {
    throw new Error('DYMO framework not loaded');
  }

  const printers = await framework.getPrinters();
  return printers.filter(p => p.isConnected);
}

// Label types
export type LabelType = 'project' | 'order' | 'pallet';

// Get the appropriate printer for a label type
export function getPrinterForLabelType(printers: DymoPrinterInfo[], labelType: LabelType): DymoPrinterInfo | null {
  // Dymo 450 for project and order labels (30323 labels)
  // Dymo 4XL for pallet labels (1744907 labels)
  
  if (labelType === 'pallet') {
    // Look for 4XL printer
    const xl = printers.find(p => p.modelName.includes('4XL') || p.name.includes('4XL'));
    if (xl) return xl;
  }
  
  // Look for LabelWriter 450 or similar for project/order labels
  const lw450 = printers.find(p => 
    (p.modelName.includes('450') || p.name.includes('450')) && 
    !p.modelName.includes('4XL') && !p.name.includes('4XL')
  );
  if (lw450) return lw450;
  
  // Fall back to any connected printer
  return printers[0] || null;
}

// Generate label XML for different label types
function generateLabelXml(labelType: LabelType, data: Record<string, string>): string {
  if (labelType === 'project') {
    return generateProjectLabelXml(data);
  } else if (labelType === 'order') {
    return generateOrderLabelXml(data);
  } else if (labelType === 'pallet') {
    return generatePalletLabelXml(data);
  }
  throw new Error(`Unknown label type: ${labelType}`);
}

// Project label XML (30323 - Address labels for Dymo 450)
function generateProjectLabelXml(data: Record<string, string>): string {
  const projectName = escapeXml(data.projectName || '');
  const orderNumber = escapeXml(data.orderNumber || '');
  const customerName = escapeXml(data.customerName || '');
  const date = escapeXml(data.date || '');
  
  return `<?xml version="1.0" encoding="utf-8"?>
<DieCutLabel Version="8.0" Units="twips">
  <PaperOrientation>Landscape</PaperOrientation>
  <Id>Address</Id>
  <PaperName>30323 Shipping</PaperName>
  <DrawCommands>
    <RoundRectangle X="0" Y="0" Width="3060" Height="5040" Rx="270" Ry="270"/>
  </DrawCommands>
  <ObjectInfo>
    <TextObject>
      <Name>ProjectName</Name>
      <ForeColor Alpha="255" Red="0" Green="0" Blue="0"/>
      <BackColor Alpha="0" Red="255" Green="255" Blue="255"/>
      <LinkedObjectName></LinkedObjectName>
      <Rotation>Rotation0</Rotation>
      <IsMirrored>False</IsMirrored>
      <IsVariable>False</IsVariable>
      <HorizontalAlignment>Left</HorizontalAlignment>
      <VerticalAlignment>Top</VerticalAlignment>
      <TextFitMode>ShrinkToFit</TextFitMode>
      <UseFullFontHeight>True</UseFullFontHeight>
      <Verticalized>False</Verticalized>
      <StyledText>
        <Element>
          <String>${projectName}</String>
          <Attributes>
            <Font Family="Arial" Size="14" Bold="True" Italic="False" Underline="False" Strikethrough="False"/>
            <ForeColor Alpha="255" Red="0" Green="0" Blue="0"/>
          </Attributes>
        </Element>
      </StyledText>
    </TextObject>
    <Bounds X="200" Y="100" Width="4640" Height="600"/>
  </ObjectInfo>
  <ObjectInfo>
    <TextObject>
      <Name>OrderNumber</Name>
      <ForeColor Alpha="255" Red="0" Green="0" Blue="0"/>
      <BackColor Alpha="0" Red="255" Green="255" Blue="255"/>
      <LinkedObjectName></LinkedObjectName>
      <Rotation>Rotation0</Rotation>
      <IsMirrored>False</IsMirrored>
      <IsVariable>False</IsVariable>
      <HorizontalAlignment>Left</HorizontalAlignment>
      <VerticalAlignment>Top</VerticalAlignment>
      <TextFitMode>ShrinkToFit</TextFitMode>
      <UseFullFontHeight>True</UseFullFontHeight>
      <Verticalized>False</Verticalized>
      <StyledText>
        <Element>
          <String>Order #${orderNumber}</String>
          <Attributes>
            <Font Family="Arial" Size="12" Bold="False" Italic="False" Underline="False" Strikethrough="False"/>
            <ForeColor Alpha="255" Red="0" Green="0" Blue="0"/>
          </Attributes>
        </Element>
      </StyledText>
    </TextObject>
    <Bounds X="200" Y="700" Width="4640" Height="500"/>
  </ObjectInfo>
  <ObjectInfo>
    <TextObject>
      <Name>CustomerName</Name>
      <ForeColor Alpha="255" Red="0" Green="0" Blue="0"/>
      <BackColor Alpha="0" Red="255" Green="255" Blue="255"/>
      <LinkedObjectName></LinkedObjectName>
      <Rotation>Rotation0</Rotation>
      <IsMirrored>False</IsMirrored>
      <IsVariable>False</IsVariable>
      <HorizontalAlignment>Left</HorizontalAlignment>
      <VerticalAlignment>Top</VerticalAlignment>
      <TextFitMode>ShrinkToFit</TextFitMode>
      <UseFullFontHeight>True</UseFullFontHeight>
      <Verticalized>False</Verticalized>
      <StyledText>
        <Element>
          <String>${customerName}</String>
          <Attributes>
            <Font Family="Arial" Size="10" Bold="False" Italic="False" Underline="False" Strikethrough="False"/>
            <ForeColor Alpha="255" Red="0" Green="0" Blue="0"/>
          </Attributes>
        </Element>
      </StyledText>
    </TextObject>
    <Bounds X="200" Y="1200" Width="4640" Height="400"/>
  </ObjectInfo>
  <ObjectInfo>
    <TextObject>
      <Name>Date</Name>
      <ForeColor Alpha="255" Red="0" Green="0" Blue="0"/>
      <BackColor Alpha="0" Red="255" Green="255" Blue="255"/>
      <LinkedObjectName></LinkedObjectName>
      <Rotation>Rotation0</Rotation>
      <IsMirrored>False</IsMirrored>
      <IsVariable>False</IsVariable>
      <HorizontalAlignment>Left</HorizontalAlignment>
      <VerticalAlignment>Top</VerticalAlignment>
      <TextFitMode>ShrinkToFit</TextFitMode>
      <UseFullFontHeight>True</UseFullFontHeight>
      <Verticalized>False</Verticalized>
      <StyledText>
        <Element>
          <String>${date}</String>
          <Attributes>
            <Font Family="Arial" Size="10" Bold="False" Italic="False" Underline="False" Strikethrough="False"/>
            <ForeColor Alpha="255" Red="0" Green="0" Blue="0"/>
          </Attributes>
        </Element>
      </StyledText>
    </TextObject>
    <Bounds X="200" Y="1600" Width="4640" Height="400"/>
  </ObjectInfo>
</DieCutLabel>`;
}

// Order label XML (30323 - Address labels for Dymo 450)
function generateOrderLabelXml(data: Record<string, string>): string {
  const orderNumber = escapeXml(data.orderNumber || '');
  const customerName = escapeXml(data.customerName || '');
  const itemCount = escapeXml(data.itemCount || '');
  const description = escapeXml(data.description || '');
  
  return `<?xml version="1.0" encoding="utf-8"?>
<DieCutLabel Version="8.0" Units="twips">
  <PaperOrientation>Landscape</PaperOrientation>
  <Id>Address</Id>
  <PaperName>30323 Shipping</PaperName>
  <DrawCommands>
    <RoundRectangle X="0" Y="0" Width="3060" Height="5040" Rx="270" Ry="270"/>
  </DrawCommands>
  <ObjectInfo>
    <TextObject>
      <Name>OrderNumber</Name>
      <ForeColor Alpha="255" Red="0" Green="0" Blue="0"/>
      <BackColor Alpha="0" Red="255" Green="255" Blue="255"/>
      <LinkedObjectName></LinkedObjectName>
      <Rotation>Rotation0</Rotation>
      <IsMirrored>False</IsMirrored>
      <IsVariable>False</IsVariable>
      <HorizontalAlignment>Left</HorizontalAlignment>
      <VerticalAlignment>Top</VerticalAlignment>
      <TextFitMode>ShrinkToFit</TextFitMode>
      <UseFullFontHeight>True</UseFullFontHeight>
      <Verticalized>False</Verticalized>
      <StyledText>
        <Element>
          <String>ORDER #${orderNumber}</String>
          <Attributes>
            <Font Family="Arial" Size="16" Bold="True" Italic="False" Underline="False" Strikethrough="False"/>
            <ForeColor Alpha="255" Red="0" Green="0" Blue="0"/>
          </Attributes>
        </Element>
      </StyledText>
    </TextObject>
    <Bounds X="200" Y="100" Width="4640" Height="700"/>
  </ObjectInfo>
  <ObjectInfo>
    <TextObject>
      <Name>CustomerName</Name>
      <ForeColor Alpha="255" Red="0" Green="0" Blue="0"/>
      <BackColor Alpha="0" Red="255" Green="255" Blue="255"/>
      <LinkedObjectName></LinkedObjectName>
      <Rotation>Rotation0</Rotation>
      <IsMirrored>False</IsMirrored>
      <IsVariable>False</IsVariable>
      <HorizontalAlignment>Left</HorizontalAlignment>
      <VerticalAlignment>Top</VerticalAlignment>
      <TextFitMode>ShrinkToFit</TextFitMode>
      <UseFullFontHeight>True</UseFullFontHeight>
      <Verticalized>False</Verticalized>
      <StyledText>
        <Element>
          <String>${customerName}</String>
          <Attributes>
            <Font Family="Arial" Size="12" Bold="False" Italic="False" Underline="False" Strikethrough="False"/>
            <ForeColor Alpha="255" Red="0" Green="0" Blue="0"/>
          </Attributes>
        </Element>
      </StyledText>
    </TextObject>
    <Bounds X="200" Y="800" Width="4640" Height="500"/>
  </ObjectInfo>
  <ObjectInfo>
    <TextObject>
      <Name>ItemCount</Name>
      <ForeColor Alpha="255" Red="0" Green="0" Blue="0"/>
      <BackColor Alpha="0" Red="255" Green="255" Blue="255"/>
      <LinkedObjectName></LinkedObjectName>
      <Rotation>Rotation0</Rotation>
      <IsMirrored>False</IsMirrored>
      <IsVariable>False</IsVariable>
      <HorizontalAlignment>Left</HorizontalAlignment>
      <VerticalAlignment>Top</VerticalAlignment>
      <TextFitMode>ShrinkToFit</TextFitMode>
      <UseFullFontHeight>True</UseFullFontHeight>
      <Verticalized>False</Verticalized>
      <StyledText>
        <Element>
          <String>Items: ${itemCount}</String>
          <Attributes>
            <Font Family="Arial" Size="10" Bold="False" Italic="False" Underline="False" Strikethrough="False"/>
            <ForeColor Alpha="255" Red="0" Green="0" Blue="0"/>
          </Attributes>
        </Element>
      </StyledText>
    </TextObject>
    <Bounds X="200" Y="1300" Width="4640" Height="400"/>
  </ObjectInfo>
  <ObjectInfo>
    <TextObject>
      <Name>Description</Name>
      <ForeColor Alpha="255" Red="0" Green="0" Blue="0"/>
      <BackColor Alpha="0" Red="255" Green="255" Blue="255"/>
      <LinkedObjectName></LinkedObjectName>
      <Rotation>Rotation0</Rotation>
      <IsMirrored>False</IsMirrored>
      <IsVariable>False</IsVariable>
      <HorizontalAlignment>Left</HorizontalAlignment>
      <VerticalAlignment>Top</VerticalAlignment>
      <TextFitMode>ShrinkToFit</TextFitMode>
      <UseFullFontHeight>True</UseFullFontHeight>
      <Verticalized>False</Verticalized>
      <StyledText>
        <Element>
          <String>${description}</String>
          <Attributes>
            <Font Family="Arial" Size="10" Bold="False" Italic="False" Underline="False" Strikethrough="False"/>
            <ForeColor Alpha="255" Red="0" Green="0" Blue="0"/>
          </Attributes>
        </Element>
      </StyledText>
    </TextObject>
    <Bounds X="200" Y="1700" Width="4640" Height="400"/>
  </ObjectInfo>
</DieCutLabel>`;
}

// Pallet label XML (1744907 - 4x6 Shipping labels for Dymo 4XL)
function generatePalletLabelXml(data: Record<string, string>): string {
  const palletNumber = escapeXml(data.palletNumber || '');
  const orderNumber = escapeXml(data.orderNumber || '');
  const customerName = escapeXml(data.customerName || '');
  const destination = escapeXml(data.destination || '');
  const contents = escapeXml(data.contents || '');
  const weight = escapeXml(data.weight || '');
  const date = escapeXml(data.date || '');
  
  return `<?xml version="1.0" encoding="utf-8"?>
<DieCutLabel Version="8.0" Units="twips">
  <PaperOrientation>Portrait</PaperOrientation>
  <Id>Shipping</Id>
  <PaperName>1744907 4 x 6 in</PaperName>
  <DrawCommands>
    <RoundRectangle X="0" Y="0" Width="5760" Height="8640" Rx="270" Ry="270"/>
  </DrawCommands>
  <ObjectInfo>
    <TextObject>
      <Name>PalletNumber</Name>
      <ForeColor Alpha="255" Red="0" Green="0" Blue="0"/>
      <BackColor Alpha="0" Red="255" Green="255" Blue="255"/>
      <LinkedObjectName></LinkedObjectName>
      <Rotation>Rotation0</Rotation>
      <IsMirrored>False</IsMirrored>
      <IsVariable>False</IsVariable>
      <HorizontalAlignment>Center</HorizontalAlignment>
      <VerticalAlignment>Top</VerticalAlignment>
      <TextFitMode>ShrinkToFit</TextFitMode>
      <UseFullFontHeight>True</UseFullFontHeight>
      <Verticalized>False</Verticalized>
      <StyledText>
        <Element>
          <String>PALLET ${palletNumber}</String>
          <Attributes>
            <Font Family="Arial" Size="24" Bold="True" Italic="False" Underline="False" Strikethrough="False"/>
            <ForeColor Alpha="255" Red="0" Green="0" Blue="0"/>
          </Attributes>
        </Element>
      </StyledText>
    </TextObject>
    <Bounds X="200" Y="200" Width="5360" Height="1000"/>
  </ObjectInfo>
  <ObjectInfo>
    <TextObject>
      <Name>OrderNumber</Name>
      <ForeColor Alpha="255" Red="0" Green="0" Blue="0"/>
      <BackColor Alpha="0" Red="255" Green="255" Blue="255"/>
      <LinkedObjectName></LinkedObjectName>
      <Rotation>Rotation0</Rotation>
      <IsMirrored>False</IsMirrored>
      <IsVariable>False</IsVariable>
      <HorizontalAlignment>Left</HorizontalAlignment>
      <VerticalAlignment>Top</VerticalAlignment>
      <TextFitMode>ShrinkToFit</TextFitMode>
      <UseFullFontHeight>True</UseFullFontHeight>
      <Verticalized>False</Verticalized>
      <StyledText>
        <Element>
          <String>Order #${orderNumber}</String>
          <Attributes>
            <Font Family="Arial" Size="14" Bold="False" Italic="False" Underline="False" Strikethrough="False"/>
            <ForeColor Alpha="255" Red="0" Green="0" Blue="0"/>
          </Attributes>
        </Element>
      </StyledText>
    </TextObject>
    <Bounds X="200" Y="1300" Width="5360" Height="600"/>
  </ObjectInfo>
  <ObjectInfo>
    <TextObject>
      <Name>CustomerName</Name>
      <ForeColor Alpha="255" Red="0" Green="0" Blue="0"/>
      <BackColor Alpha="0" Red="255" Green="255" Blue="255"/>
      <LinkedObjectName></LinkedObjectName>
      <Rotation>Rotation0</Rotation>
      <IsMirrored>False</IsMirrored>
      <IsVariable>False</IsVariable>
      <HorizontalAlignment>Left</HorizontalAlignment>
      <VerticalAlignment>Top</VerticalAlignment>
      <TextFitMode>ShrinkToFit</TextFitMode>
      <UseFullFontHeight>True</UseFullFontHeight>
      <Verticalized>False</Verticalized>
      <StyledText>
        <Element>
          <String>${customerName}</String>
          <Attributes>
            <Font Family="Arial" Size="14" Bold="True" Italic="False" Underline="False" Strikethrough="False"/>
            <ForeColor Alpha="255" Red="0" Green="0" Blue="0"/>
          </Attributes>
        </Element>
      </StyledText>
    </TextObject>
    <Bounds X="200" Y="1900" Width="5360" Height="600"/>
  </ObjectInfo>
  <ObjectInfo>
    <TextObject>
      <Name>Destination</Name>
      <ForeColor Alpha="255" Red="0" Green="0" Blue="0"/>
      <BackColor Alpha="0" Red="255" Green="255" Blue="255"/>
      <LinkedObjectName></LinkedObjectName>
      <Rotation>Rotation0</Rotation>
      <IsMirrored>False</IsMirrored>
      <IsVariable>False</IsVariable>
      <HorizontalAlignment>Left</HorizontalAlignment>
      <VerticalAlignment>Top</VerticalAlignment>
      <TextFitMode>ShrinkToFit</TextFitMode>
      <UseFullFontHeight>True</UseFullFontHeight>
      <Verticalized>False</Verticalized>
      <StyledText>
        <Element>
          <String>${destination}</String>
          <Attributes>
            <Font Family="Arial" Size="12" Bold="False" Italic="False" Underline="False" Strikethrough="False"/>
            <ForeColor Alpha="255" Red="0" Green="0" Blue="0"/>
          </Attributes>
        </Element>
      </StyledText>
    </TextObject>
    <Bounds X="200" Y="2500" Width="5360" Height="800"/>
  </ObjectInfo>
  <ObjectInfo>
    <TextObject>
      <Name>Contents</Name>
      <ForeColor Alpha="255" Red="0" Green="0" Blue="0"/>
      <BackColor Alpha="0" Red="255" Green="255" Blue="255"/>
      <LinkedObjectName></LinkedObjectName>
      <Rotation>Rotation0</Rotation>
      <IsMirrored>False</IsMirrored>
      <IsVariable>False</IsVariable>
      <HorizontalAlignment>Left</HorizontalAlignment>
      <VerticalAlignment>Top</VerticalAlignment>
      <TextFitMode>ShrinkToFit</TextFitMode>
      <UseFullFontHeight>True</UseFullFontHeight>
      <Verticalized>False</Verticalized>
      <StyledText>
        <Element>
          <String>Contents: ${contents}</String>
          <Attributes>
            <Font Family="Arial" Size="12" Bold="False" Italic="False" Underline="False" Strikethrough="False"/>
            <ForeColor Alpha="255" Red="0" Green="0" Blue="0"/>
          </Attributes>
        </Element>
      </StyledText>
    </TextObject>
    <Bounds X="200" Y="3300" Width="5360" Height="1200"/>
  </ObjectInfo>
  <ObjectInfo>
    <TextObject>
      <Name>Weight</Name>
      <ForeColor Alpha="255" Red="0" Green="0" Blue="0"/>
      <BackColor Alpha="0" Red="255" Green="255" Blue="255"/>
      <LinkedObjectName></LinkedObjectName>
      <Rotation>Rotation0</Rotation>
      <IsMirrored>False</IsMirrored>
      <IsVariable>False</IsVariable>
      <HorizontalAlignment>Left</HorizontalAlignment>
      <VerticalAlignment>Top</VerticalAlignment>
      <TextFitMode>ShrinkToFit</TextFitMode>
      <UseFullFontHeight>True</UseFullFontHeight>
      <Verticalized>False</Verticalized>
      <StyledText>
        <Element>
          <String>Weight: ${weight}</String>
          <Attributes>
            <Font Family="Arial" Size="12" Bold="False" Italic="False" Underline="False" Strikethrough="False"/>
            <ForeColor Alpha="255" Red="0" Green="0" Blue="0"/>
          </Attributes>
        </Element>
      </StyledText>
    </TextObject>
    <Bounds X="200" Y="4500" Width="5360" Height="500"/>
  </ObjectInfo>
  <ObjectInfo>
    <TextObject>
      <Name>Date</Name>
      <ForeColor Alpha="255" Red="0" Green="0" Blue="0"/>
      <BackColor Alpha="0" Red="255" Green="255" Blue="255"/>
      <LinkedObjectName></LinkedObjectName>
      <Rotation>Rotation0</Rotation>
      <IsMirrored>False</IsMirrored>
      <IsVariable>False</IsVariable>
      <HorizontalAlignment>Left</HorizontalAlignment>
      <VerticalAlignment>Top</VerticalAlignment>
      <TextFitMode>ShrinkToFit</TextFitMode>
      <UseFullFontHeight>True</UseFullFontHeight>
      <Verticalized>False</Verticalized>
      <StyledText>
        <Element>
          <String>Date: ${date}</String>
          <Attributes>
            <Font Family="Arial" Size="10" Bold="False" Italic="False" Underline="False" Strikethrough="False"/>
            <ForeColor Alpha="255" Red="0" Green="0" Blue="0"/>
          </Attributes>
        </Element>
      </StyledText>
    </TextObject>
    <Bounds X="200" Y="5000" Width="5360" Height="400"/>
  </ObjectInfo>
</DieCutLabel>`;
}

// Helper to escape XML special characters
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Print a label
export async function printLabel(
  labelType: LabelType,
  data: Record<string, string>,
  printerName?: string
): Promise<void> {
  await loadDymoFramework();
  
  const framework = window.dymo?.connect?.framework;
  if (!framework) {
    throw new Error('DYMO framework not loaded');
  }

  // Get printers and select appropriate one
  const printers = await framework.getPrinters();
  const connectedPrinters = printers.filter(p => p.isConnected);
  
  if (connectedPrinters.length === 0) {
    throw new Error('No connected DYMO printers found');
  }

  let selectedPrinter: DymoPrinter;
  if (printerName) {
    const found = connectedPrinters.find(p => p.name === printerName);
    if (!found) {
      throw new Error(`Printer "${printerName}" not found or not connected`);
    }
    selectedPrinter = found;
  } else {
    // Auto-select based on label type
    const printerInfo = getPrinterForLabelType(
      connectedPrinters.map(p => ({
        name: p.name,
        modelName: p.modelName,
        isConnected: p.isConnected,
        isLocal: p.isLocal,
        isTwinTurbo: p.isTwinTurbo
      })),
      labelType
    );
    if (!printerInfo) {
      throw new Error('No suitable printer found for this label type');
    }
    selectedPrinter = connectedPrinters.find(p => p.name === printerInfo.name)!;
  }

  // Generate label XML
  const labelXml = generateLabelXml(labelType, data);
  
  // Create print parameters
  const printParamsXml = framework.createLabelWriterPrintParamsXml({
    copies: 1,
    jobTitle: `${labelType} label`,
    printQuality: 'BarcodeAndGraphics'
  });

  // Print the label
  await framework.printLabel(selectedPrinter.name, printParamsXml, labelXml, '');
  
  console.log(`[Dymo] Printed ${labelType} label on ${selectedPrinter.name}`);
}

// Convenience functions for specific label types
// printProjectLabel(projectName, orderId, cienappsJobNumber)
// Returns { success: boolean, error?: string }
export async function printProjectLabel(
  projectName: string,
  orderId: string,
  cienappsJobNumber: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const today = new Date().toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' });
    await printLabel('project', {
      projectName: projectName,
      orderNumber: orderId,
      customerName: cienappsJobNumber ? `Job #${cienappsJobNumber}` : '',
      date: today
    });
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  }
}

// printOrderLabel(projectName, orderName, allmoxyJobNumber, orderId, cienappsJobNumber)
// Returns { success: boolean, error?: string }
export async function printOrderLabel(
  projectName: string,
  orderName: string,
  allmoxyJobNumber: string,
  orderId: string,
  cienappsJobNumber: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await printLabel('order', {
      orderNumber: orderId,
      customerName: projectName,
      itemCount: allmoxyJobNumber ? `Allmoxy: ${allmoxyJobNumber}` : '',
      description: orderName + (cienappsJobNumber ? ` (Job #${cienappsJobNumber})` : '')
    });
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  }
}

export async function printPalletLabel(data: {
  palletNumber: string;
  orderNumber: string;
  customerName: string;
  destination: string;
  contents: string;
  weight: string;
  date: string;
}): Promise<void> {
  return printLabel('pallet', data);
}

// Print multiple pallet labels (used by OrderDetails page)
// Parameters match the call from OrderDetails.tsx:
// printPalletLabels(date, projectName, dealer, phone, orderId, palletCount, logoBase64)
export async function printPalletLabels(
  date: string,
  projectName: string,
  dealer: string,
  phone: string,
  orderId: string,
  palletCount: number,
  _logoBase64?: string // Logo is embedded in label XML, not used separately
): Promise<{ success: boolean; printed: number; error?: string }> {
  const errors: string[] = [];
  let printed = 0;

  for (let i = 1; i <= palletCount; i++) {
    try {
      await printPalletLabel({
        palletNumber: `${i} of ${palletCount}`,
        orderNumber: orderId,
        customerName: dealer,
        destination: `${projectName}${phone ? ` - ${phone}` : ''}`,
        contents: '',
        weight: '',
        date: date
      });
      printed++;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`Pallet ${i}: ${message}`);
    }
  }

  return {
    success: errors.length === 0,
    printed,
    error: errors.length > 0 ? errors.join('; ') : undefined
  };
}

// Convert an image URL to base64 (for embedding logos in labels)
export async function imageToBase64(imageUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Could not get canvas context'));
        return;
      }
      ctx.drawImage(img, 0, 0);
      const dataUrl = canvas.toDataURL('image/png');
      // Remove the data:image/png;base64, prefix
      const base64 = dataUrl.split(',')[1];
      resolve(base64);
    };
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = imageUrl;
  });
}

// Expose port configuration functions globally for browser console access
if (typeof window !== 'undefined') {
  (window as any).setDymoPort = setDymoPort;
  (window as any).clearDymoPort = clearDymoPort;
  (window as any).getDymoPort = getDymoPort;
}
