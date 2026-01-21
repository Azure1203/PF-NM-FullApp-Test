// Dymo Label Printing Utility
// Uses direct REST API calls to DYMO Connect Web Service
// Supports Dymo 450 (30323 labels) and Dymo 4XL (1744907 labels)

// Cached connection info for DYMO Connect
let cachedPort: number | null = null;
let cachedProtocol: 'https' | 'http' = 'https';

// LocalStorage key for user-configured port
const DYMO_PORT_STORAGE_KEY = 'dymo_connect_port';

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
    cachedPort = null; // Clear cache to force rediscovery
  } catch {
    // localStorage not available
  }
}

// Clear custom port setting
export function clearDymoPort(): void {
  try {
    localStorage.removeItem(DYMO_PORT_STORAGE_KEY);
    cachedPort = null;
  } catch {
    // localStorage not available
  }
}

// Get current DYMO Connect port (for display)
export function getDymoPort(): number | null {
  return cachedPort || getUserConfiguredPort();
}

// Ports to try for DYMO Connect Web Service (expanded range)
const DYMO_PORTS = [
  41951, 41952, 41953, 41954, 41955, 41956, 41957, 41958, 41959, 41960,
  41961, 41962, 41963, 41964, 41965, 41966, 41967, 41968, 41969, 41970,
  // Also try some other common ports that DYMO might use
  8080, 8443, 9100, 9200
];

// Try to connect to a specific port with both HTTPS and HTTP
async function tryPort(port: number): Promise<{ port: number; protocol: 'https' | 'http' } | null> {
  const protocols: ('https' | 'http')[] = ['https', 'http'];
  
  for (const protocol of protocols) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1000);
      
      const response = await fetch(`${protocol}://127.0.0.1:${port}/DYMO/DLS/Printing/StatusConnected`, {
        method: 'GET',
        mode: 'cors',
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      if (response.ok) {
        return { port, protocol };
      }
    } catch {
      // Protocol/port combination not available
    }
  }
  
  return null;
}

// Discover which port DYMO Connect is running on
async function discoverDymoPort(): Promise<number> {
  // Check cached connection first
  if (cachedPort !== null) {
    try {
      const response = await fetch(`${cachedProtocol}://127.0.0.1:${cachedPort}/DYMO/DLS/Printing/StatusConnected`, {
        method: 'GET',
        mode: 'cors',
      });
      if (response.ok) {
        return cachedPort;
      }
    } catch {
      // Port no longer valid, discover again
      cachedPort = null;
    }
  }

  // Try user-configured port first (if set)
  const userPort = getUserConfiguredPort();
  if (userPort) {
    const result = await tryPort(userPort);
    if (result) {
      cachedPort = result.port;
      cachedProtocol = result.protocol;
      console.log(`[Dymo] Found DYMO Connect on user-configured port ${result.protocol}://127.0.0.1:${result.port}`);
      return result.port;
    }
  }

  // Try ports in parallel batches for faster discovery
  const batchSize = 5;
  for (let i = 0; i < DYMO_PORTS.length; i += batchSize) {
    const batch = DYMO_PORTS.slice(i, i + batchSize);
    const results = await Promise.all(batch.map(port => tryPort(port)));
    
    for (const result of results) {
      if (result) {
        cachedPort = result.port;
        cachedProtocol = result.protocol;
        console.log(`[Dymo] Found DYMO Connect on ${result.protocol}://127.0.0.1:${result.port}`);
        return result.port;
      }
    }
  }
  
  const triedPorts = userPort ? [userPort, ...DYMO_PORTS] : DYMO_PORTS;
  throw new Error(`DYMO Connect not found. Tried ports: ${triedPorts.slice(0, 10).join(', ')}... Please ensure DYMO Connect for Desktop is installed and running. If DYMO Connect is on a different port, use setDymoPort() in browser console.`);
}

// Get the base URL for DYMO Connect
async function getDymoBaseUrl(): Promise<string> {
  const port = await discoverDymoPort();
  return `${cachedProtocol}://127.0.0.1:${port}`;
}

// Get available printers from DYMO Connect
export async function getPrinters(): Promise<{ name: string; isConnected: boolean; modelName: string }[]> {
  const baseUrl = await getDymoBaseUrl();
  
  const response = await fetch(`${baseUrl}/DYMO/DLS/Printing/GetPrinters`, {
    method: 'GET',
    mode: 'cors',
  });
  
  if (!response.ok) {
    throw new Error('Failed to get printers from DYMO Connect');
  }
  
  const text = await response.text();
  
  // Parse the XML response - try multiple possible node names for resilience
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, 'application/xml');
  
  // Try various printer node names that DYMO might use
  const printerNodeNames = ['LabelWriterPrinter', 'Printer', 'TapePrinter', 'LabelPrinter'];
  let printerElements: Element[] = [];
  
  for (const nodeName of printerNodeNames) {
    const elements = doc.querySelectorAll(nodeName);
    if (elements.length > 0) {
      printerElements = [...printerElements, ...Array.from(elements)];
    }
  }
  
  // If no specific printer nodes found, try to find any element with Name and IsConnected children
  if (printerElements.length === 0) {
    const allElements = doc.querySelectorAll('*');
    allElements.forEach(el => {
      if (el.querySelector('Name') && el.querySelector('IsConnected')) {
        printerElements.push(el);
      }
    });
  }
  
  const printers: { name: string; isConnected: boolean; modelName: string }[] = [];
  const seenNames = new Set<string>();
  
  printerElements.forEach((printer) => {
    const name = printer.querySelector('Name')?.textContent || '';
    if (!name || seenNames.has(name)) return;
    seenNames.add(name);
    
    const modelName = printer.querySelector('ModelName')?.textContent || 
                      printer.querySelector('Model')?.textContent || name;
    const isConnectedText = printer.querySelector('IsConnected')?.textContent || 
                            printer.querySelector('Connected')?.textContent || 'False';
    const isConnected = isConnectedText.toLowerCase() === 'true';
    
    printers.push({ name, isConnected, modelName });
  });
  
  return printers;
}

// Find a specific printer type
export async function findPrinter(printerType: '450' | '4XL'): Promise<string | null> {
  const printers = await getPrinters();
  
  for (const printer of printers) {
    if (!printer.isConnected) continue;
    
    const nameLower = printer.name.toLowerCase();
    const modelLower = printer.modelName.toLowerCase();
    
    if (printerType === '4XL') {
      if (nameLower.includes('4xl') || modelLower.includes('4xl') || 
          nameLower.includes('5xl') || modelLower.includes('5xl')) {
        return printer.name;
      }
    } else if (printerType === '450') {
      // Match 450 but not 4XL/5XL
      if ((nameLower.includes('450') || modelLower.includes('450') ||
           nameLower.includes('labelwriter') || modelLower.includes('labelwriter')) &&
          !nameLower.includes('4xl') && !modelLower.includes('4xl') &&
          !nameLower.includes('5xl') && !modelLower.includes('5xl')) {
        return printer.name;
      }
    }
  }
  
  return null;
}

// Print label via DYMO Connect REST API
async function printLabelXml(printerName: string, labelXml: string): Promise<void> {
  const baseUrl = await getDymoBaseUrl();
  
  // Prepare the print request
  const printParams = `printerName=${encodeURIComponent(printerName)}&printParamsXml=&labelXml=${encodeURIComponent(labelXml)}&labelSetXml=`;
  
  const response = await fetch(`${baseUrl}/DYMO/DLS/Printing/PrintLabel`, {
    method: 'POST',
    mode: 'cors',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: printParams,
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Print failed: ${errorText}`);
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

// Label XML template for 30323 (2-1/8" x 4") - Project and Order labels
function create30323LabelXml(lines: { label: string; value: string }[]): string {
  const textObjects = lines.map((line, index) => {
    const yPos = 150 + (index * 300);
    return `
      <TextObject>
        <Name>Line${index + 1}</Name>
        <ForeColor Alpha="255" Red="0" Green="0" Blue="0" />
        <BackColor Alpha="0" Red="255" Green="255" Blue="255" />
        <LinkedObjectName></LinkedObjectName>
        <Rotation>Rotation0</Rotation>
        <IsMirrored>False</IsMirrored>
        <IsVariable>False</IsVariable>
        <HorizontalAlignment>Left</HorizontalAlignment>
        <VerticalAlignment>Top</VerticalAlignment>
        <TextFitMode>AlwaysFit</TextFitMode>
        <UseFullFontHeight>True</UseFullFontHeight>
        <Verticalized>False</Verticalized>
        <StyledText>
          <Element>
            <String xml:space="preserve">${line.label}: ${escapeXml(line.value)}</String>
            <Attributes>
              <Font Family="Arial" Size="12" Bold="True" Italic="False" Underline="False" Strikeout="False" />
              <ForeColor Alpha="255" Red="0" Green="0" Blue="0" />
            </Attributes>
          </Element>
        </StyledText>
        <ObjectLayout>
          <DYMOPoint>
            <X>100</X>
            <Y>${yPos}</Y>
          </DYMOPoint>
          <Size>
            <Width>2800</Width>
            <Height>280</Height>
          </Size>
        </ObjectLayout>
      </TextObject>`;
  }).join('');

  return `<?xml version="1.0" encoding="utf-8"?>
<DesktopLabel Version="1">
  <DYMOLabel Version="3">
    <Description>30323 Shipping Label</Description>
    <Orientation>Landscape</Orientation>
    <LabelName>30323 Shipping</LabelName>
    <InitialLength>0</InitialLength>
    <BorderStyle>SolidLine</BorderStyle>
    <DYMORect>
      <DYMOPoint>
        <X>0</X>
        <Y>0</Y>
      </DYMOPoint>
      <Size>
        <Width>3060</Width>
        <Height>1530</Height>
      </Size>
    </DYMORect>
    <BorderColor>
      <SolidColorBrush>
        <Color Alpha="255" Red="0" Green="0" Blue="0" />
      </SolidColorBrush>
    </BorderColor>
    <BorderThickness>1</BorderThickness>
    <Show_Border>False</Show_Border>
    <ObjectInfo>
      ${textObjects}
    </ObjectInfo>
  </DYMOLabel>
</DesktopLabel>`;
}

// Label XML template for 1744907 (4" x 6") - Pallet labels with logo
function create1744907LabelXml(
  date: string,
  projectName: string,
  dealerName: string,
  phone: string,
  orderId: string,
  palletNumber: number,
  totalPallets: number,
  logoBase64: string
): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<DesktopLabel Version="1">
  <DYMOLabel Version="3">
    <Description>1744907 4x6 Shipping Label</Description>
    <Orientation>Portrait</Orientation>
    <LabelName>1744907 Extra Large</LabelName>
    <InitialLength>0</InitialLength>
    <BorderStyle>SolidLine</BorderStyle>
    <DYMORect>
      <DYMOPoint>
        <X>0</X>
        <Y>0</Y>
      </DYMOPoint>
      <Size>
        <Width>2880</Width>
        <Height>4320</Height>
      </Size>
    </DYMORect>
    <BorderColor>
      <SolidColorBrush>
        <Color Alpha="255" Red="0" Green="0" Blue="0" />
      </SolidColorBrush>
    </BorderColor>
    <BorderThickness>1</BorderThickness>
    <Show_Border>False</Show_Border>
    <ObjectInfo>
      <!-- Date (top left) -->
      <TextObject>
        <Name>Date</Name>
        <ForeColor Alpha="255" Red="0" Green="0" Blue="0" />
        <BackColor Alpha="0" Red="255" Green="255" Blue="255" />
        <LinkedObjectName></LinkedObjectName>
        <Rotation>Rotation0</Rotation>
        <IsMirrored>False</IsMirrored>
        <IsVariable>False</IsVariable>
        <HorizontalAlignment>Left</HorizontalAlignment>
        <VerticalAlignment>Top</VerticalAlignment>
        <TextFitMode>AlwaysFit</TextFitMode>
        <UseFullFontHeight>True</UseFullFontHeight>
        <Verticalized>False</Verticalized>
        <StyledText>
          <Element>
            <String xml:space="preserve">${escapeXml(date)}</String>
            <Attributes>
              <Font Family="Arial" Size="10" Bold="True" Italic="True" Underline="False" Strikeout="False" />
              <ForeColor Alpha="255" Red="0" Green="0" Blue="0" />
            </Attributes>
          </Element>
        </StyledText>
        <ObjectLayout>
          <DYMOPoint>
            <X>100</X>
            <Y>80</Y>
          </DYMOPoint>
          <Size>
            <Width>800</Width>
            <Height>200</Height>
          </Size>
        </ObjectLayout>
      </TextObject>
      
      <!-- Logo (top right) -->
      <ImageObject>
        <Name>Logo</Name>
        <ForeColor Alpha="255" Red="0" Green="0" Blue="0" />
        <BackColor Alpha="0" Red="255" Green="255" Blue="255" />
        <LinkedObjectName></LinkedObjectName>
        <Rotation>Rotation0</Rotation>
        <IsMirrored>False</IsMirrored>
        <IsVariable>False</IsVariable>
        <Image>${logoBase64}</Image>
        <ScaleMode>Uniform</ScaleMode>
        <BorderWidth>0</BorderWidth>
        <BorderColor Alpha="255" Red="0" Green="0" Blue="0" />
        <HorizontalAlignment>Right</HorizontalAlignment>
        <VerticalAlignment>Top</VerticalAlignment>
        <ObjectLayout>
          <DYMOPoint>
            <X>1800</X>
            <Y>50</Y>
          </DYMOPoint>
          <Size>
            <Width>1000</Width>
            <Height>300</Height>
          </Size>
        </ObjectLayout>
      </ImageObject>
      
      <!-- Job Info Header -->
      <TextObject>
        <Name>JobInfoHeader</Name>
        <ForeColor Alpha="255" Red="0" Green="0" Blue="0" />
        <BackColor Alpha="0" Red="255" Green="255" Blue="255" />
        <LinkedObjectName></LinkedObjectName>
        <Rotation>Rotation0</Rotation>
        <IsMirrored>False</IsMirrored>
        <IsVariable>False</IsVariable>
        <HorizontalAlignment>Center</HorizontalAlignment>
        <VerticalAlignment>Top</VerticalAlignment>
        <TextFitMode>AlwaysFit</TextFitMode>
        <UseFullFontHeight>True</UseFullFontHeight>
        <Verticalized>False</Verticalized>
        <StyledText>
          <Element>
            <String xml:space="preserve">Job Info:</String>
            <Attributes>
              <Font Family="Arial" Size="16" Bold="True" Italic="True" Underline="True" Strikeout="False" />
              <ForeColor Alpha="255" Red="0" Green="0" Blue="0" />
            </Attributes>
          </Element>
        </StyledText>
        <ObjectLayout>
          <DYMOPoint>
            <X>100</X>
            <Y>450</Y>
          </DYMOPoint>
          <Size>
            <Width>2680</Width>
            <Height>300</Height>
          </Size>
        </ObjectLayout>
      </TextObject>
      
      <!-- PO (Project Name) -->
      <TextObject>
        <Name>PO</Name>
        <ForeColor Alpha="255" Red="0" Green="0" Blue="0" />
        <BackColor Alpha="0" Red="255" Green="255" Blue="255" />
        <LinkedObjectName></LinkedObjectName>
        <Rotation>Rotation0</Rotation>
        <IsMirrored>False</IsMirrored>
        <IsVariable>False</IsVariable>
        <HorizontalAlignment>Center</HorizontalAlignment>
        <VerticalAlignment>Top</VerticalAlignment>
        <TextFitMode>AlwaysFit</TextFitMode>
        <UseFullFontHeight>True</UseFullFontHeight>
        <Verticalized>False</Verticalized>
        <StyledText>
          <Element>
            <String xml:space="preserve">PO:</String>
            <Attributes>
              <Font Family="Arial" Size="10" Bold="True" Italic="False" Underline="False" Strikeout="False" />
              <ForeColor Alpha="255" Red="0" Green="0" Blue="0" />
            </Attributes>
          </Element>
        </StyledText>
        <ObjectLayout>
          <DYMOPoint>
            <X>100</X>
            <Y>780</Y>
          </DYMOPoint>
          <Size>
            <Width>2680</Width>
            <Height>180</Height>
          </Size>
        </ObjectLayout>
      </TextObject>
      
      <TextObject>
        <Name>POValue</Name>
        <ForeColor Alpha="255" Red="0" Green="0" Blue="0" />
        <BackColor Alpha="0" Red="255" Green="255" Blue="255" />
        <LinkedObjectName></LinkedObjectName>
        <Rotation>Rotation0</Rotation>
        <IsMirrored>False</IsMirrored>
        <IsVariable>False</IsVariable>
        <HorizontalAlignment>Center</HorizontalAlignment>
        <VerticalAlignment>Top</VerticalAlignment>
        <TextFitMode>AlwaysFit</TextFitMode>
        <UseFullFontHeight>True</UseFullFontHeight>
        <Verticalized>False</Verticalized>
        <StyledText>
          <Element>
            <String xml:space="preserve">${escapeXml(projectName)}</String>
            <Attributes>
              <Font Family="Arial" Size="11" Bold="False" Italic="False" Underline="False" Strikeout="False" />
              <ForeColor Alpha="255" Red="0" Green="0" Blue="0" />
            </Attributes>
          </Element>
        </StyledText>
        <ObjectLayout>
          <DYMOPoint>
            <X>100</X>
            <Y>980</Y>
          </DYMOPoint>
          <Size>
            <Width>2680</Width>
            <Height>200</Height>
          </Size>
        </ObjectLayout>
      </TextObject>
      
      <!-- Dealer Name -->
      <TextObject>
        <Name>DealerLabel</Name>
        <ForeColor Alpha="255" Red="0" Green="0" Blue="0" />
        <BackColor Alpha="0" Red="255" Green="255" Blue="255" />
        <LinkedObjectName></LinkedObjectName>
        <Rotation>Rotation0</Rotation>
        <IsMirrored>False</IsMirrored>
        <IsVariable>False</IsVariable>
        <HorizontalAlignment>Center</HorizontalAlignment>
        <VerticalAlignment>Top</VerticalAlignment>
        <TextFitMode>AlwaysFit</TextFitMode>
        <UseFullFontHeight>True</UseFullFontHeight>
        <Verticalized>False</Verticalized>
        <StyledText>
          <Element>
            <String xml:space="preserve">DEALER NAME:</String>
            <Attributes>
              <Font Family="Arial" Size="10" Bold="True" Italic="False" Underline="False" Strikeout="False" />
              <ForeColor Alpha="255" Red="0" Green="0" Blue="0" />
            </Attributes>
          </Element>
        </StyledText>
        <ObjectLayout>
          <DYMOPoint>
            <X>100</X>
            <Y>1200</Y>
          </DYMOPoint>
          <Size>
            <Width>2680</Width>
            <Height>180</Height>
          </Size>
        </ObjectLayout>
      </TextObject>
      
      <TextObject>
        <Name>DealerValue</Name>
        <ForeColor Alpha="255" Red="0" Green="0" Blue="0" />
        <BackColor Alpha="0" Red="255" Green="255" Blue="255" />
        <LinkedObjectName></LinkedObjectName>
        <Rotation>Rotation0</Rotation>
        <IsMirrored>False</IsMirrored>
        <IsVariable>False</IsVariable>
        <HorizontalAlignment>Center</HorizontalAlignment>
        <VerticalAlignment>Top</VerticalAlignment>
        <TextFitMode>AlwaysFit</TextFitMode>
        <UseFullFontHeight>True</UseFullFontHeight>
        <Verticalized>False</Verticalized>
        <StyledText>
          <Element>
            <String xml:space="preserve">${escapeXml(dealerName)}</String>
            <Attributes>
              <Font Family="Arial" Size="11" Bold="False" Italic="False" Underline="False" Strikeout="False" />
              <ForeColor Alpha="255" Red="0" Green="0" Blue="0" />
            </Attributes>
          </Element>
        </StyledText>
        <ObjectLayout>
          <DYMOPoint>
            <X>100</X>
            <Y>1400</Y>
          </DYMOPoint>
          <Size>
            <Width>2680</Width>
            <Height>200</Height>
          </Size>
        </ObjectLayout>
      </TextObject>
      
      <!-- Phone -->
      <TextObject>
        <Name>PhoneLabel</Name>
        <ForeColor Alpha="255" Red="0" Green="0" Blue="0" />
        <BackColor Alpha="0" Red="255" Green="255" Blue="255" />
        <LinkedObjectName></LinkedObjectName>
        <Rotation>Rotation0</Rotation>
        <IsMirrored>False</IsMirrored>
        <IsVariable>False</IsVariable>
        <HorizontalAlignment>Center</HorizontalAlignment>
        <VerticalAlignment>Top</VerticalAlignment>
        <TextFitMode>AlwaysFit</TextFitMode>
        <UseFullFontHeight>True</UseFullFontHeight>
        <Verticalized>False</Verticalized>
        <StyledText>
          <Element>
            <String xml:space="preserve">PHONE:</String>
            <Attributes>
              <Font Family="Arial" Size="10" Bold="True" Italic="False" Underline="False" Strikeout="False" />
              <ForeColor Alpha="255" Red="0" Green="0" Blue="0" />
            </Attributes>
          </Element>
        </StyledText>
        <ObjectLayout>
          <DYMOPoint>
            <X>100</X>
            <Y>1620</Y>
          </DYMOPoint>
          <Size>
            <Width>2680</Width>
            <Height>180</Height>
          </Size>
        </ObjectLayout>
      </TextObject>
      
      <TextObject>
        <Name>PhoneValue</Name>
        <ForeColor Alpha="255" Red="0" Green="0" Blue="0" />
        <BackColor Alpha="0" Red="255" Green="255" Blue="255" />
        <LinkedObjectName></LinkedObjectName>
        <Rotation>Rotation0</Rotation>
        <IsMirrored>False</IsMirrored>
        <IsVariable>False</IsVariable>
        <HorizontalAlignment>Center</HorizontalAlignment>
        <VerticalAlignment>Top</VerticalAlignment>
        <TextFitMode>AlwaysFit</TextFitMode>
        <UseFullFontHeight>True</UseFullFontHeight>
        <Verticalized>False</Verticalized>
        <StyledText>
          <Element>
            <String xml:space="preserve">${escapeXml(phone)}</String>
            <Attributes>
              <Font Family="Arial" Size="11" Bold="False" Italic="False" Underline="False" Strikeout="False" />
              <ForeColor Alpha="255" Red="0" Green="0" Blue="0" />
            </Attributes>
          </Element>
        </StyledText>
        <ObjectLayout>
          <DYMOPoint>
            <X>100</X>
            <Y>1820</Y>
          </DYMOPoint>
          <Size>
            <Width>2680</Width>
            <Height>200</Height>
          </Size>
        </ObjectLayout>
      </TextObject>
      
      <!-- Order ID -->
      <TextObject>
        <Name>OrderIdLabel</Name>
        <ForeColor Alpha="255" Red="0" Green="0" Blue="0" />
        <BackColor Alpha="0" Red="255" Green="255" Blue="255" />
        <LinkedObjectName></LinkedObjectName>
        <Rotation>Rotation0</Rotation>
        <IsMirrored>False</IsMirrored>
        <IsVariable>False</IsVariable>
        <HorizontalAlignment>Center</HorizontalAlignment>
        <VerticalAlignment>Top</VerticalAlignment>
        <TextFitMode>AlwaysFit</TextFitMode>
        <UseFullFontHeight>True</UseFullFontHeight>
        <Verticalized>False</Verticalized>
        <StyledText>
          <Element>
            <String xml:space="preserve">ORDER ID:</String>
            <Attributes>
              <Font Family="Arial" Size="10" Bold="True" Italic="False" Underline="False" Strikeout="False" />
              <ForeColor Alpha="255" Red="0" Green="0" Blue="0" />
            </Attributes>
          </Element>
        </StyledText>
        <ObjectLayout>
          <DYMOPoint>
            <X>100</X>
            <Y>2040</Y>
          </DYMOPoint>
          <Size>
            <Width>2680</Width>
            <Height>180</Height>
          </Size>
        </ObjectLayout>
      </TextObject>
      
      <TextObject>
        <Name>OrderIdValue</Name>
        <ForeColor Alpha="255" Red="0" Green="0" Blue="0" />
        <BackColor Alpha="0" Red="255" Green="255" Blue="255" />
        <LinkedObjectName></LinkedObjectName>
        <Rotation>Rotation0</Rotation>
        <IsMirrored>False</IsMirrored>
        <IsVariable>False</IsVariable>
        <HorizontalAlignment>Center</HorizontalAlignment>
        <VerticalAlignment>Top</VerticalAlignment>
        <TextFitMode>AlwaysFit</TextFitMode>
        <UseFullFontHeight>True</UseFullFontHeight>
        <Verticalized>False</Verticalized>
        <StyledText>
          <Element>
            <String xml:space="preserve">${escapeXml(orderId)}</String>
            <Attributes>
              <Font Family="Arial" Size="11" Bold="False" Italic="False" Underline="False" Strikeout="False" />
              <ForeColor Alpha="255" Red="0" Green="0" Blue="0" />
            </Attributes>
          </Element>
        </StyledText>
        <ObjectLayout>
          <DYMOPoint>
            <X>100</X>
            <Y>2240</Y>
          </DYMOPoint>
          <Size>
            <Width>2680</Width>
            <Height>200</Height>
          </Size>
        </ObjectLayout>
      </TextObject>
      
      <!-- PALLET Header -->
      <TextObject>
        <Name>PalletHeader</Name>
        <ForeColor Alpha="255" Red="0" Green="0" Blue="0" />
        <BackColor Alpha="0" Red="255" Green="255" Blue="255" />
        <LinkedObjectName></LinkedObjectName>
        <Rotation>Rotation0</Rotation>
        <IsMirrored>False</IsMirrored>
        <IsVariable>False</IsVariable>
        <HorizontalAlignment>Center</HorizontalAlignment>
        <VerticalAlignment>Top</VerticalAlignment>
        <TextFitMode>AlwaysFit</TextFitMode>
        <UseFullFontHeight>True</UseFullFontHeight>
        <Verticalized>False</Verticalized>
        <StyledText>
          <Element>
            <String xml:space="preserve">PALLET</String>
            <Attributes>
              <Font Family="Arial" Size="28" Bold="True" Italic="False" Underline="False" Strikeout="False" />
              <ForeColor Alpha="255" Red="0" Green="0" Blue="0" />
            </Attributes>
          </Element>
        </StyledText>
        <ObjectLayout>
          <DYMOPoint>
            <X>100</X>
            <Y>2700</Y>
          </DYMOPoint>
          <Size>
            <Width>2680</Width>
            <Height>500</Height>
          </Size>
        </ObjectLayout>
      </TextObject>
      
      <!-- Pallet Number -->
      <TextObject>
        <Name>PalletNumber</Name>
        <ForeColor Alpha="255" Red="0" Green="0" Blue="0" />
        <BackColor Alpha="0" Red="255" Green="255" Blue="255" />
        <LinkedObjectName></LinkedObjectName>
        <Rotation>Rotation0</Rotation>
        <IsMirrored>False</IsMirrored>
        <IsVariable>False</IsVariable>
        <HorizontalAlignment>Center</HorizontalAlignment>
        <VerticalAlignment>Top</VerticalAlignment>
        <TextFitMode>AlwaysFit</TextFitMode>
        <UseFullFontHeight>True</UseFullFontHeight>
        <Verticalized>False</Verticalized>
        <StyledText>
          <Element>
            <String xml:space="preserve">${palletNumber} OF ${totalPallets}</String>
            <Attributes>
              <Font Family="Arial" Size="36" Bold="True" Italic="False" Underline="False" Strikeout="False" />
              <ForeColor Alpha="255" Red="0" Green="0" Blue="0" />
            </Attributes>
          </Element>
        </StyledText>
        <ObjectLayout>
          <DYMOPoint>
            <X>100</X>
            <Y>3300</Y>
          </DYMOPoint>
          <Size>
            <Width>2680</Width>
            <Height>800</Height>
          </Size>
        </ObjectLayout>
      </TextObject>
    </ObjectInfo>
  </DYMOLabel>
</DesktopLabel>`;
}

// Print Project Label (30323)
export async function printProjectLabel(
  projectName: string,
  orderId: string,
  cienappsJobNumber: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const printerName = await findPrinter('450');
    if (!printerName) {
      return { success: false, error: 'Dymo 450 printer not found. Make sure a Dymo LabelWriter is connected and DYMO Connect is running.' };
    }
    
    const labelXml = create30323LabelXml([
      { label: 'Project Name', value: projectName },
      { label: 'Order ID', value: orderId || '—' },
      { label: 'Cienapps Job #', value: cienappsJobNumber || '—' }
    ]);
    
    await printLabelXml(printerName, labelXml);
    
    return { success: true };
  } catch (error) {
    console.error('Print error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Print failed' };
  }
}

// Print Order Label (30323)
export async function printOrderLabel(
  projectName: string,
  orderName: string,
  allmoxyJobNumber: string,
  orderId: string,
  cienappsJobNumber: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const printerName = await findPrinter('450');
    if (!printerName) {
      return { success: false, error: 'Dymo 450 printer not found. Make sure a Dymo LabelWriter is connected and DYMO Connect is running.' };
    }
    
    const labelXml = create30323LabelXml([
      { label: 'Project Name', value: projectName },
      { label: 'Order Name', value: orderName },
      { label: 'Allmoxy Job #', value: allmoxyJobNumber || '—' },
      { label: 'Order ID', value: orderId || '—' },
      { label: 'Cienapps Job #', value: cienappsJobNumber || '—' }
    ]);
    
    await printLabelXml(printerName, labelXml);
    
    return { success: true };
  } catch (error) {
    console.error('Print error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Print failed' };
  }
}

// Print all Pallet Labels (1744907)
export async function printPalletLabels(
  date: string,
  projectName: string,
  dealerName: string,
  phone: string,
  orderId: string,
  totalPallets: number,
  logoBase64: string
): Promise<{ success: boolean; error?: string; printed?: number }> {
  try {
    const printerName = await findPrinter('4XL');
    if (!printerName) {
      return { success: false, error: 'Dymo 4XL printer not found. Make sure a Dymo 4XL/5XL is connected and DYMO Connect is running.' };
    }
    
    // Print each pallet label in sequence
    for (let i = 1; i <= totalPallets; i++) {
      const labelXml = create1744907LabelXml(
        date,
        projectName,
        dealerName,
        phone,
        orderId,
        i,
        totalPallets,
        logoBase64
      );
      
      await printLabelXml(printerName, labelXml);
      
      // Small delay between prints to avoid overwhelming the printer
      if (i < totalPallets) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    return { success: true, printed: totalPallets };
  } catch (error) {
    console.error('Print error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Print failed' };
  }
}

// Convert image URL to base64 for embedding in labels
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
