// Dymo Label Printing Utility
// Uses DYMO Connect REST API directly via fetch
// Supports Dymo 450 (30323 labels) and Dymo 4XL (1744907 labels)

// Convert an image URL to base64 for embedding in labels
export async function imageToBase64(imageUrl: string): Promise<string> {
  const response = await fetch(imageUrl);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(',')[1] || '';
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// Cached state
let discoveredBaseUrl: string | null = null;
let discoveryInProgress = false;
let discoveryPromise: Promise<string | null> | null = null;

// LocalStorage key for user-configured port
const DYMO_PORT_STORAGE_KEY = 'dymo_connect_port';

// Ports to try for DYMO Connect Web Service
const DYMO_PORTS = [
  41951, 41952, 41953, 41954, 41955, 41956, 41957, 41958, 41959, 41960,
  41961, 41962, 41963, 41964, 41965, 41966, 41967, 41968, 41969, 41970
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
    discoveredBaseUrl = null;
    discoveryPromise = null;
    console.log(`[Dymo] Port set to ${port}. Next print will use this port.`);
  } catch {
    // localStorage not available
  }
}

// Clear custom port setting
export function clearDymoPort(): void {
  try {
    localStorage.removeItem(DYMO_PORT_STORAGE_KEY);
    discoveredBaseUrl = null;
    discoveryPromise = null;
    console.log('[Dymo] Custom port cleared. Will auto-discover on next print.');
  } catch {
    // localStorage not available
  }
}

// Get current DYMO Connect port (for display)
export function getDymoPort(): number | null {
  if (discoveredBaseUrl) {
    const match = discoveredBaseUrl.match(/:(\d+)$/);
    if (match) return parseInt(match[1], 10);
  }
  return getUserConfiguredPort();
}

// Expose functions to browser console for debugging
if (typeof window !== 'undefined') {
  (window as any).setDymoPort = setDymoPort;
  (window as any).clearDymoPort = clearDymoPort;
  (window as any).getDymoPort = getDymoPort;
}

// Try to connect to DYMO service at a specific URL
async function tryConnectUrl(baseUrl: string): Promise<boolean> {
  try {
    const response = await fetch(`${baseUrl}/DYMO/DLS/Printing/StatusConnected`, {
      method: 'GET',
      mode: 'cors',
    });
    if (response.ok) {
      const text = await response.text();
      return text.toLowerCase().includes('true');
    }
  } catch {
    // Connection failed
  }
  return false;
}

// Discover the DYMO Connect service URL
async function discoverDymoService(): Promise<string> {
  if (discoveredBaseUrl) {
    return discoveredBaseUrl;
  }

  if (discoveryInProgress && discoveryPromise) {
    const result = await discoveryPromise;
    if (result) return result;
    throw new Error('DYMO Connect discovery failed');
  }

  discoveryInProgress = true;

  discoveryPromise = (async (): Promise<string | null> => {
    // Try user-configured port first
    const userPort = getUserConfiguredPort();
    if (userPort) {
      const urls = [
        `https://localhost:${userPort}`,
        `http://localhost:${userPort}`,
        `https://127.0.0.1:${userPort}`,
        `http://127.0.0.1:${userPort}`
      ];
      for (const url of urls) {
        console.log(`[Dymo] Trying ${url}...`);
        if (await tryConnectUrl(url)) {
          console.log(`[Dymo] Connected to ${url}`);
          discoveredBaseUrl = url;
          return url;
        }
      }
    }

    // Try default ports - HTTPS localhost first since user confirmed it works
    for (const port of DYMO_PORTS) {
      const url = `https://localhost:${port}`;
      console.log(`[Dymo] Trying ${url}...`);
      if (await tryConnectUrl(url)) {
        console.log(`[Dymo] Connected to ${url}`);
        discoveredBaseUrl = url;
        return url;
      }
    }

    discoveryInProgress = false;
    return null;
  })();

  const result = await discoveryPromise;
  discoveryInProgress = false;

  if (!result) {
    throw new Error(
      'DYMO Connect not found. Please ensure DYMO Connect for Desktop is installed and running. ' +
      'If using a custom port, run setDymoPort(PORT) in browser console.'
    );
  }

  return result;
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
  const baseUrl = await discoverDymoService();
  
  const response = await fetch(`${baseUrl}/DYMO/DLS/Printing/GetPrinters`, {
    method: 'GET',
    mode: 'cors',
  });

  if (!response.ok) {
    throw new Error(`Failed to get printers: ${response.statusText}`);
  }

  const xmlText = await response.text();
  
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'text/xml');
  const printerElements = doc.querySelectorAll('LabelWriterPrinter');
  
  const printers: DymoPrinterInfo[] = [];
  printerElements.forEach((el) => {
    const name = el.querySelector('Name')?.textContent || '';
    const modelName = el.querySelector('ModelName')?.textContent || '';
    const isConnected = el.querySelector('IsConnected')?.textContent?.toLowerCase() === 'true';
    const isLocal = el.querySelector('IsLocal')?.textContent?.toLowerCase() === 'true';
    const isTwinTurbo = el.querySelector('IsTwinTurbo')?.textContent?.toLowerCase() === 'true';
    
    if (name) {
      printers.push({ name, modelName, isConnected, isLocal, isTwinTurbo });
    }
  });

  return printers;
}

// Find a printer by model name pattern
async function findPrinterByModel(modelPattern: RegExp): Promise<DymoPrinterInfo | null> {
  const printers = await getPrinters();
  return printers.find(p => p.isConnected && modelPattern.test(p.modelName)) || null;
}

// Print a label using the REST API
async function printLabelRaw(printerName: string, labelXml: string): Promise<void> {
  const baseUrl = await discoverDymoService();
  
  // Fix DYMO Connect XML parsing bug - self-closing tags need explicit closing
  const fixedLabelXml = fixDymoXml(labelXml);
  
  // Log the XML being sent for debugging
  console.log('[Dymo] Sending label XML:', fixedLabelXml.substring(0, 500) + '...');
  
  // Build request body exactly like dymojs library does (empty printParamsXml)
  const body = `printerName=${encodeURIComponent(printerName)}&printParamsXml=&labelXml=${encodeURIComponent(fixedLabelXml)}&labelSetXml=`;

  const response = await fetch(`${baseUrl}/DYMO/DLS/Printing/PrintLabel`, {
    method: 'POST',
    mode: 'cors',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body,
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[Dymo] Print failed. Full label XML:', fixedLabelXml);
    throw new Error(`Print failed: ${errorText || response.statusText}`);
  }
}

// Escape XML special characters
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Fix XML for DYMO Connect bug - self-closing Color/Font tags cause errors
// DYMO Connect requires explicit closing tags with at least a space inside
function fixDymoXml(xml: string): string {
  // Fix Color elements (ForeColor, BackColor)
  xml = xml.replace(/<((?:Fore|Back)?Color)([^>]*?)\/>/g, '<$1$2> </$1>');
  // Fix Font elements
  xml = xml.replace(/<Font([^>]*?)\/>/g, '<Font$1></Font>');
  // Fix RoundRectangle (might be needed too)
  xml = xml.replace(/<RoundRectangle([^>]*?)\/>/g, '<RoundRectangle$1></RoundRectangle>');
  // Fix Bounds
  xml = xml.replace(/<Bounds([^>]*?)\/>/g, '<Bounds$1></Bounds>');
  return xml;
}

// Label XML templates - using simplified format from dymojs example

function createProjectLabelXml(data: {
  projectName: string;
  orderNumber: string;
  customerName: string;
  date: string;
}): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<DieCutLabel Version="8.0" Units="twips">
  <PaperOrientation>Landscape</PaperOrientation>
  <Id>LargeShipping</Id>
  <PaperName>30256 Shipping</PaperName>
  <DrawCommands>
    <RoundRectangle X="0" Y="0" Width="3331" Height="5715" Rx="270" Ry="270"/>
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
      <HorizontalAlignment>Center</HorizontalAlignment>
      <VerticalAlignment>Middle</VerticalAlignment>
      <TextFitMode>AlwaysFit</TextFitMode>
      <UseFullFontHeight>True</UseFullFontHeight>
      <Verticalized>False</Verticalized>
      <StyledText>
        <Element>
          <String>${escapeXml(data.projectName)}</String>
          <Attributes>
            <Font Family="Helvetica" Size="24" Bold="True" Italic="False" Underline="False" Strikeout="False"/>
            <ForeColor Alpha="255" Red="0" Green="0" Blue="0"/>
          </Attributes>
        </Element>
      </StyledText>
    </TextObject>
    <Bounds X="336" Y="100" Width="5040" Height="800"/>
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
      <HorizontalAlignment>Center</HorizontalAlignment>
      <VerticalAlignment>Middle</VerticalAlignment>
      <TextFitMode>AlwaysFit</TextFitMode>
      <UseFullFontHeight>True</UseFullFontHeight>
      <Verticalized>False</Verticalized>
      <StyledText>
        <Element>
          <String>Order #${escapeXml(data.orderNumber)}</String>
          <Attributes>
            <Font Family="Helvetica" Size="18" Bold="False" Italic="False" Underline="False" Strikeout="False"/>
            <ForeColor Alpha="255" Red="0" Green="0" Blue="0"/>
          </Attributes>
        </Element>
      </StyledText>
    </TextObject>
    <Bounds X="336" Y="950" Width="5040" Height="600"/>
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
      <HorizontalAlignment>Center</HorizontalAlignment>
      <VerticalAlignment>Middle</VerticalAlignment>
      <TextFitMode>AlwaysFit</TextFitMode>
      <UseFullFontHeight>True</UseFullFontHeight>
      <Verticalized>False</Verticalized>
      <StyledText>
        <Element>
          <String>${escapeXml(data.customerName)}</String>
          <Attributes>
            <Font Family="Helvetica" Size="14" Bold="False" Italic="False" Underline="False" Strikeout="False"/>
            <ForeColor Alpha="255" Red="0" Green="0" Blue="0"/>
          </Attributes>
        </Element>
      </StyledText>
    </TextObject>
    <Bounds X="336" Y="1600" Width="5040" Height="500"/>
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
      <HorizontalAlignment>Center</HorizontalAlignment>
      <VerticalAlignment>Middle</VerticalAlignment>
      <TextFitMode>AlwaysFit</TextFitMode>
      <UseFullFontHeight>True</UseFullFontHeight>
      <Verticalized>False</Verticalized>
      <StyledText>
        <Element>
          <String>${escapeXml(data.date)}</String>
          <Attributes>
            <Font Family="Helvetica" Size="12" Bold="False" Italic="False" Underline="False" Strikeout="False"/>
            <ForeColor Alpha="255" Red="0" Green="0" Blue="0"/>
          </Attributes>
        </Element>
      </StyledText>
    </TextObject>
    <Bounds X="336" Y="2150" Width="5040" Height="400"/>
  </ObjectInfo>
</DieCutLabel>`;
}

function createOrderLabelXml(data: {
  orderNumber: string;
  customerName: string;
  itemCount: string;
  description: string;
}): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<DieCutLabel Version="8.0" Units="twips">
  <PaperOrientation>Landscape</PaperOrientation>
  <Id>LargeShipping</Id>
  <PaperName>30256 Shipping</PaperName>
  <DrawCommands>
    <RoundRectangle X="0" Y="0" Width="3331" Height="5715" Rx="270" Ry="270"/>
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
      <HorizontalAlignment>Center</HorizontalAlignment>
      <VerticalAlignment>Middle</VerticalAlignment>
      <TextFitMode>AlwaysFit</TextFitMode>
      <UseFullFontHeight>True</UseFullFontHeight>
      <Verticalized>False</Verticalized>
      <StyledText>
        <Element>
          <String>Order #${escapeXml(data.orderNumber)}</String>
          <Attributes>
            <Font Family="Helvetica" Size="24" Bold="True" Italic="False" Underline="False" Strikeout="False"/>
            <ForeColor Alpha="255" Red="0" Green="0" Blue="0"/>
          </Attributes>
        </Element>
      </StyledText>
    </TextObject>
    <Bounds X="336" Y="100" Width="5040" Height="800"/>
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
      <HorizontalAlignment>Center</HorizontalAlignment>
      <VerticalAlignment>Middle</VerticalAlignment>
      <TextFitMode>AlwaysFit</TextFitMode>
      <UseFullFontHeight>True</UseFullFontHeight>
      <Verticalized>False</Verticalized>
      <StyledText>
        <Element>
          <String>${escapeXml(data.customerName)}</String>
          <Attributes>
            <Font Family="Helvetica" Size="18" Bold="False" Italic="False" Underline="False" Strikeout="False"/>
            <ForeColor Alpha="255" Red="0" Green="0" Blue="0"/>
          </Attributes>
        </Element>
      </StyledText>
    </TextObject>
    <Bounds X="336" Y="950" Width="5040" Height="600"/>
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
      <HorizontalAlignment>Center</HorizontalAlignment>
      <VerticalAlignment>Middle</VerticalAlignment>
      <TextFitMode>AlwaysFit</TextFitMode>
      <UseFullFontHeight>True</UseFullFontHeight>
      <Verticalized>False</Verticalized>
      <StyledText>
        <Element>
          <String>${escapeXml(data.itemCount)}</String>
          <Attributes>
            <Font Family="Helvetica" Size="14" Bold="False" Italic="False" Underline="False" Strikeout="False"/>
            <ForeColor Alpha="255" Red="0" Green="0" Blue="0"/>
          </Attributes>
        </Element>
      </StyledText>
    </TextObject>
    <Bounds X="336" Y="1600" Width="5040" Height="500"/>
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
      <HorizontalAlignment>Center</HorizontalAlignment>
      <VerticalAlignment>Middle</VerticalAlignment>
      <TextFitMode>AlwaysFit</TextFitMode>
      <UseFullFontHeight>True</UseFullFontHeight>
      <Verticalized>False</Verticalized>
      <StyledText>
        <Element>
          <String>${escapeXml(data.description)}</String>
          <Attributes>
            <Font Family="Helvetica" Size="12" Bold="False" Italic="False" Underline="False" Strikeout="False"/>
            <ForeColor Alpha="255" Red="0" Green="0" Blue="0"/>
          </Attributes>
        </Element>
      </StyledText>
    </TextObject>
    <Bounds X="336" Y="2150" Width="5040" Height="400"/>
  </ObjectInfo>
</DieCutLabel>`;
}

function createPalletLabelXml(data: {
  date: string;
  projectName: string;
  dealer: string;
  phone: string;
  orderId: string;
  palletNumber: string;
  totalPallets: string;
}): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<DieCutLabel Version="8.0" Units="twips">
  <PaperOrientation>Portrait</PaperOrientation>
  <Id>LargeShipping</Id>
  <PaperName>1744907 4 in x 6 in</PaperName>
  <DrawCommands>
    <RoundRectangle X="0" Y="0" Width="5760" Height="8640" Rx="270" Ry="270"/>
  </DrawCommands>
  <ObjectInfo>
    <TextObject>
      <Name>Date</Name>
      <ForeColor Alpha="255" Red="0" Green="0" Blue="0"/>
      <BackColor Alpha="0" Red="255" Green="255" Blue="255"/>
      <LinkedObjectName></LinkedObjectName>
      <Rotation>Rotation0</Rotation>
      <IsMirrored>False</IsMirrored>
      <IsVariable>False</IsVariable>
      <HorizontalAlignment>Right</HorizontalAlignment>
      <VerticalAlignment>Top</VerticalAlignment>
      <TextFitMode>AlwaysFit</TextFitMode>
      <UseFullFontHeight>True</UseFullFontHeight>
      <Verticalized>False</Verticalized>
      <StyledText>
        <Element>
          <String>${escapeXml(data.date)}</String>
          <Attributes>
            <Font Family="Helvetica" Size="12" Bold="False" Italic="False" Underline="False" Strikeout="False"/>
            <ForeColor Alpha="255" Red="0" Green="0" Blue="0"/>
          </Attributes>
        </Element>
      </StyledText>
    </TextObject>
    <Bounds X="3500" Y="200" Width="2060" Height="400"/>
  </ObjectInfo>
  <ObjectInfo>
    <TextObject>
      <Name>ProjectName</Name>
      <ForeColor Alpha="255" Red="0" Green="0" Blue="0"/>
      <BackColor Alpha="0" Red="255" Green="255" Blue="255"/>
      <LinkedObjectName></LinkedObjectName>
      <Rotation>Rotation0</Rotation>
      <IsMirrored>False</IsMirrored>
      <IsVariable>False</IsVariable>
      <HorizontalAlignment>Center</HorizontalAlignment>
      <VerticalAlignment>Middle</VerticalAlignment>
      <TextFitMode>AlwaysFit</TextFitMode>
      <UseFullFontHeight>True</UseFullFontHeight>
      <Verticalized>False</Verticalized>
      <StyledText>
        <Element>
          <String>${escapeXml(data.projectName)}</String>
          <Attributes>
            <Font Family="Helvetica" Size="36" Bold="True" Italic="False" Underline="False" Strikeout="False"/>
            <ForeColor Alpha="255" Red="0" Green="0" Blue="0"/>
          </Attributes>
        </Element>
      </StyledText>
    </TextObject>
    <Bounds X="200" Y="800" Width="5360" Height="1000"/>
  </ObjectInfo>
  <ObjectInfo>
    <TextObject>
      <Name>Dealer</Name>
      <ForeColor Alpha="255" Red="0" Green="0" Blue="0"/>
      <BackColor Alpha="0" Red="255" Green="255" Blue="255"/>
      <LinkedObjectName></LinkedObjectName>
      <Rotation>Rotation0</Rotation>
      <IsMirrored>False</IsMirrored>
      <IsVariable>False</IsVariable>
      <HorizontalAlignment>Center</HorizontalAlignment>
      <VerticalAlignment>Middle</VerticalAlignment>
      <TextFitMode>AlwaysFit</TextFitMode>
      <UseFullFontHeight>True</UseFullFontHeight>
      <Verticalized>False</Verticalized>
      <StyledText>
        <Element>
          <String>${escapeXml(data.dealer)}</String>
          <Attributes>
            <Font Family="Helvetica" Size="18" Bold="False" Italic="False" Underline="False" Strikeout="False"/>
            <ForeColor Alpha="255" Red="0" Green="0" Blue="0"/>
          </Attributes>
        </Element>
      </StyledText>
    </TextObject>
    <Bounds X="200" Y="2000" Width="5360" Height="600"/>
  </ObjectInfo>
  <ObjectInfo>
    <TextObject>
      <Name>Phone</Name>
      <ForeColor Alpha="255" Red="0" Green="0" Blue="0"/>
      <BackColor Alpha="0" Red="255" Green="255" Blue="255"/>
      <LinkedObjectName></LinkedObjectName>
      <Rotation>Rotation0</Rotation>
      <IsMirrored>False</IsMirrored>
      <IsVariable>False</IsVariable>
      <HorizontalAlignment>Center</HorizontalAlignment>
      <VerticalAlignment>Middle</VerticalAlignment>
      <TextFitMode>AlwaysFit</TextFitMode>
      <UseFullFontHeight>True</UseFullFontHeight>
      <Verticalized>False</Verticalized>
      <StyledText>
        <Element>
          <String>${escapeXml(data.phone)}</String>
          <Attributes>
            <Font Family="Helvetica" Size="14" Bold="False" Italic="False" Underline="False" Strikeout="False"/>
            <ForeColor Alpha="255" Red="0" Green="0" Blue="0"/>
          </Attributes>
        </Element>
      </StyledText>
    </TextObject>
    <Bounds X="200" Y="2700" Width="5360" Height="500"/>
  </ObjectInfo>
  <ObjectInfo>
    <TextObject>
      <Name>OrderId</Name>
      <ForeColor Alpha="255" Red="0" Green="0" Blue="0"/>
      <BackColor Alpha="0" Red="255" Green="255" Blue="255"/>
      <LinkedObjectName></LinkedObjectName>
      <Rotation>Rotation0</Rotation>
      <IsMirrored>False</IsMirrored>
      <IsVariable>False</IsVariable>
      <HorizontalAlignment>Center</HorizontalAlignment>
      <VerticalAlignment>Middle</VerticalAlignment>
      <TextFitMode>AlwaysFit</TextFitMode>
      <UseFullFontHeight>True</UseFullFontHeight>
      <Verticalized>False</Verticalized>
      <StyledText>
        <Element>
          <String>Order #${escapeXml(data.orderId)}</String>
          <Attributes>
            <Font Family="Helvetica" Size="24" Bold="True" Italic="False" Underline="False" Strikeout="False"/>
            <ForeColor Alpha="255" Red="0" Green="0" Blue="0"/>
          </Attributes>
        </Element>
      </StyledText>
    </TextObject>
    <Bounds X="200" Y="3400" Width="5360" Height="700"/>
  </ObjectInfo>
  <ObjectInfo>
    <TextObject>
      <Name>PalletInfo</Name>
      <ForeColor Alpha="255" Red="0" Green="0" Blue="0"/>
      <BackColor Alpha="0" Red="255" Green="255" Blue="255"/>
      <LinkedObjectName></LinkedObjectName>
      <Rotation>Rotation0</Rotation>
      <IsMirrored>False</IsMirrored>
      <IsVariable>False</IsVariable>
      <HorizontalAlignment>Center</HorizontalAlignment>
      <VerticalAlignment>Middle</VerticalAlignment>
      <TextFitMode>AlwaysFit</TextFitMode>
      <UseFullFontHeight>True</UseFullFontHeight>
      <Verticalized>False</Verticalized>
      <StyledText>
        <Element>
          <String>Pallet ${escapeXml(data.palletNumber)} of ${escapeXml(data.totalPallets)}</String>
          <Attributes>
            <Font Family="Helvetica" Size="48" Bold="True" Italic="False" Underline="False" Strikeout="False"/>
            <ForeColor Alpha="255" Red="0" Green="0" Blue="0"/>
          </Attributes>
        </Element>
      </StyledText>
    </TextObject>
    <Bounds X="200" Y="4400" Width="5360" Height="1200"/>
  </ObjectInfo>
</DieCutLabel>`;
}

// Public print functions

export async function printProjectLabel(
  projectName: string,
  orderId: string,
  cienappsJobNumber: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const printer = await findPrinterByModel(/450|LabelWriter/i);
    if (!printer) {
      return { success: false, error: 'No Dymo 450 printer found. Please connect a Dymo LabelWriter 450.' };
    }

    const today = new Date().toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' });
    const labelXml = createProjectLabelXml({
      projectName: projectName,
      orderNumber: orderId,
      customerName: cienappsJobNumber ? `Job #${cienappsJobNumber}` : '',
      date: today
    });

    await printLabelRaw(printer.name, labelXml);
    console.log(`[Dymo] Printed project label on ${printer.name}`);
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[Dymo] Print error:', message);
    return { success: false, error: message };
  }
}

export async function printOrderLabel(
  projectName: string,
  orderName: string,
  allmoxyJobNumber: string,
  orderId: string,
  cienappsJobNumber: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const printer = await findPrinterByModel(/450|LabelWriter/i);
    if (!printer) {
      return { success: false, error: 'No Dymo 450 printer found. Please connect a Dymo LabelWriter 450.' };
    }

    const labelXml = createOrderLabelXml({
      orderNumber: orderId,
      customerName: projectName,
      itemCount: allmoxyJobNumber ? `Allmoxy: ${allmoxyJobNumber}` : '',
      description: orderName + (cienappsJobNumber ? ` (Job #${cienappsJobNumber})` : '')
    });

    await printLabelRaw(printer.name, labelXml);
    console.log(`[Dymo] Printed order label on ${printer.name}`);
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[Dymo] Print error:', message);
    return { success: false, error: message };
  }
}

export async function printPalletLabels(
  date: string,
  projectName: string,
  dealer: string,
  phone: string,
  orderId: string,
  palletCount: number,
  _logoBase64?: string
): Promise<{ success: boolean; printed: number; error?: string }> {
  try {
    const printer = await findPrinterByModel(/4XL|XL/i);
    if (!printer) {
      return { success: false, printed: 0, error: 'No Dymo 4XL printer found. Please connect a Dymo LabelWriter 4XL.' };
    }

    let printed = 0;
    for (let i = 1; i <= palletCount; i++) {
      const labelXml = createPalletLabelXml({
        date,
        projectName,
        dealer,
        phone,
        orderId,
        palletNumber: String(i),
        totalPallets: String(palletCount)
      });

      await printLabelRaw(printer.name, labelXml);
      printed++;
      console.log(`[Dymo] Printed pallet label ${i}/${palletCount} on ${printer.name}`);
    }

    return { success: true, printed };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[Dymo] Print error:', message);
    return { success: false, printed: 0, error: message };
  }
}
