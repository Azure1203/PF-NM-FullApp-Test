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

// Fixed DYMO Connect port (configured on all computers)
const DYMO_PORT = 41951;

// Cached base URL after successful connection
let discoveredBaseUrl: string | null = null;

// Get current DYMO Connect port (for display)
export function getDymoPort(): number {
  return DYMO_PORT;
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

// Connect to the DYMO Connect service using fixed port
async function discoverDymoService(): Promise<string> {
  if (discoveredBaseUrl) {
    return discoveredBaseUrl;
  }

  // Try HTTPS first (preferred), then HTTP as fallback
  const urls = [
    `https://localhost:${DYMO_PORT}`,
    `http://localhost:${DYMO_PORT}`,
    `https://127.0.0.1:${DYMO_PORT}`,
    `http://127.0.0.1:${DYMO_PORT}`
  ];

  for (const url of urls) {
    console.log(`[Dymo] Trying ${url}...`);
    if (await tryConnectUrl(url)) {
      console.log(`[Dymo] Connected to ${url}`);
      discoveredBaseUrl = url;
      return url;
    }
  }

  throw new Error(
    `DYMO Connect not found on port ${DYMO_PORT}. Please ensure DYMO Connect for Desktop is installed and running.`
  );
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
  // Fix Color elements (ForeColor, BackColor, BorderColor) - no space inside
  xml = xml.replace(/<((?:Fore|Back|Border)?Color)([^>]*?)\/>/g, '<$1$2></$1>');
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
  palletNumber: string;
  totalPallets: string;
}): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<DieCutLabel Version="8.0" Units="twips" xmlns="http://www.dymo.com/nam/ls/v1">
  <PaperOrientation>Landscape</PaperOrientation>
  <Id>Shipping</Id>
  <PaperName>30323 Shipping 2-1/8 in x 4 in</PaperName>
  <DrawCommands>
    <RoundRectangle X="0" Y="0" Width="3060" Height="5760" Rx="270" Ry="270"/>
  </DrawCommands>
  <ObjectInfo>
    <TextObject>
      <Name>ProjectName</Name>
      <HorizontalAlignment>Center</HorizontalAlignment>
      <VerticalAlignment>Middle</VerticalAlignment>
      <TextFitMode>AlwaysFit</TextFitMode>
      <StyledText>
        <Element>
          <String>${escapeXml(data.projectName)}</String>
          <Attributes>
            <Font Family="Helvetica" Size="18" Bold="True"/>
          </Attributes>
        </Element>
      </StyledText>
    </TextObject>
    <Bounds X="144" Y="150" Width="2800" Height="1000"/>
  </ObjectInfo>
  <ObjectInfo>
    <TextObject>
      <Name>PalletInfo</Name>
      <HorizontalAlignment>Center</HorizontalAlignment>
      <VerticalAlignment>Middle</VerticalAlignment>
      <TextFitMode>AlwaysFit</TextFitMode>
      <StyledText>
        <Element>
          <String>Pallet ${escapeXml(data.palletNumber)} of ${escapeXml(data.totalPallets)}</String>
          <Attributes>
            <Font Family="Helvetica" Size="14" Bold="True"/>
          </Attributes>
        </Element>
      </StyledText>
    </TextObject>
    <Bounds X="144" Y="1400" Width="2800" Height="800"/>
  </ObjectInfo>
</DieCutLabel>`;
}

function createOrderLabelXml(data: {
  orderNumber: string;
  customerName: string;
  itemCount: string;
  description: string;
  logoBase64?: string;
}): string {
  const logoSection = data.logoBase64 ? `
  <ObjectInfo>
    <ImageObject>
      <Name>Logo</Name>
      <ForeColor Alpha="255" Red="0" Green="0" Blue="0"/>
      <BackColor Alpha="0" Red="255" Green="255" Blue="255"/>
      <LinkedObjectName></LinkedObjectName>
      <Rotation>Rotation0</Rotation>
      <IsMirrored>False</IsMirrored>
      <IsVariable>False</IsVariable>
      <Image>${data.logoBase64}</Image>
      <ScaleMode>Uniform</ScaleMode>
      <BorderWidth>0</BorderWidth>
      <BorderColor Alpha="255" Red="0" Green="0" Blue="0"/>
      <HorizontalAlignment>Center</HorizontalAlignment>
      <VerticalAlignment>Middle</VerticalAlignment>
    </ImageObject>
    <Bounds X="100" Y="80" Width="2860" Height="500"/>
  </ObjectInfo>` : '';

  return `<?xml version="1.0" encoding="utf-8"?>
<DieCutLabel Version="8.0" Units="twips" xmlns="http://www.dymo.com/nam/ls/v1">
  <PaperOrientation>Landscape</PaperOrientation>
  <Id>Shipping</Id>
  <PaperName>30323 Shipping</PaperName>
  <DrawCommands>
    <RoundRectangle X="0" Y="0" Width="5760" Height="3060" Rx="270" Ry="270"/>
  </DrawCommands>${logoSection}
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
    <Bounds X="100" Y="620" Width="2860" Height="550"/>
  </ObjectInfo>
  <ObjectInfo>
    <TextObject>
      <Name>CustomerNameLabel</Name>
      <ForeColor Alpha="255" Red="128" Green="128" Blue="128"/>
      <BackColor Alpha="0" Red="255" Green="255" Blue="255"/>
      <LinkedObjectName></LinkedObjectName>
      <Rotation>Rotation0</Rotation>
      <IsMirrored>False</IsMirrored>
      <IsVariable>False</IsVariable>
      <HorizontalAlignment>Center</HorizontalAlignment>
      <VerticalAlignment>Bottom</VerticalAlignment>
      <TextFitMode>AlwaysFit</TextFitMode>
      <UseFullFontHeight>True</UseFullFontHeight>
      <Verticalized>False</Verticalized>
      <StyledText>
        <Element>
          <String>PROJECT</String>
          <Attributes>
            <Font Family="Helvetica" Size="8" Bold="True" Italic="False" Underline="False" Strikeout="False"/>
            <ForeColor Alpha="255" Red="128" Green="128" Blue="128"/>
          </Attributes>
        </Element>
      </StyledText>
    </TextObject>
    <Bounds X="100" Y="1200" Width="2860" Height="200"/>
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
      <VerticalAlignment>Top</VerticalAlignment>
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
    <Bounds X="100" Y="1400" Width="2860" Height="450"/>
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
    <Bounds X="100" Y="1900" Width="2860" Height="350"/>
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
    <Bounds X="100" Y="2300" Width="2860" Height="400"/>
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
  logoBase64?: string;
}): string {
  const logoSection = data.logoBase64 ? `
  <ObjectInfo>
    <ImageObject>
      <Name>Logo</Name>
      <ForeColor Alpha="255" Red="0" Green="0" Blue="0"/>
      <BackColor Alpha="0" Red="255" Green="255" Blue="255"/>
      <LinkedObjectName></LinkedObjectName>
      <Rotation>Rotation0</Rotation>
      <IsMirrored>False</IsMirrored>
      <IsVariable>False</IsVariable>
      <Image>${data.logoBase64}</Image>
      <ScaleMode>Uniform</ScaleMode>
      <BorderWidth>0</BorderWidth>
      <BorderColor Alpha="255" Red="0" Green="0" Blue="0"/>
      <HorizontalAlignment>Center</HorizontalAlignment>
      <VerticalAlignment>Middle</VerticalAlignment>
    </ImageObject>
    <Bounds X="200" Y="150" Width="5360" Height="900"/>
  </ObjectInfo>` : '';

  return `<?xml version="1.0" encoding="utf-8"?>
<DieCutLabel Version="8.0" Units="twips" xmlns="http://www.dymo.com/nam/ls/v1">
  <PaperOrientation>Portrait</PaperOrientation>
  <Id>SmallShipping</Id>
  <PaperName>1744907 4 in x 6 in</PaperName>
  <DrawCommands>
    <RoundRectangle X="0" Y="0" Width="5760" Height="8640" Rx="270" Ry="270"/>
  </DrawCommands>${logoSection}
  <ObjectInfo>
    <TextObject>
      <Name>ProjectName</Name>
      <StyledText>
        <Element>
          <String>${escapeXml(data.projectName)}</String>
          <Attributes>
            <Font Family="Helvetica" Size="24" Bold="True"/>
          </Attributes>
        </Element>
      </StyledText>
      <HorizontalAlignment>Center</HorizontalAlignment>
    </TextObject>
    <Bounds X="200" Y="1850" Width="5360" Height="900"/>
  </ObjectInfo>
</DieCutLabel>`;
}

// Public print functions

export async function printProjectLabel(
  projectName: string,
  orderId: string,
  cienappsJobNumber: string,
  palletNumber: string = '1',
  totalPallets: string = '1'
): Promise<{ success: boolean; error?: string }> {
  try {
    // Log available printers for debugging
    const allPrinters = await getPrinters();
    console.log('[Dymo] Available printers:', allPrinters.map(p => `${p.name} (${p.modelName}, connected: ${p.isConnected})`));
    
    const printer = await findPrinterByModel(/450/i);
    console.log('[Dymo] Selected printer for project label:', printer ? `${printer.name} (${printer.modelName})` : 'none');
    
    if (!printer) {
      return { success: false, error: 'No Dymo LabelWriter 450 printer found. Please connect a Dymo LabelWriter 450.' };
    }

    const labelXml = createProjectLabelXml({
      projectName: projectName,
      palletNumber: palletNumber,
      totalPallets: totalPallets
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
  cienappsJobNumber: string,
  logoUrl?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const printer = await findPrinterByModel(/450/i);
    if (!printer) {
      return { success: false, error: 'No Dymo LabelWriter 450 printer found. Please connect a Dymo LabelWriter 450.' };
    }

    let logoBase64: string | undefined;
    if (logoUrl) {
      try {
        logoBase64 = await imageToBase64(logoUrl);
        console.log('[Dymo] Logo loaded for order label');
      } catch (err) {
        console.warn('[Dymo] Could not load logo:', err);
      }
    }

    const labelXml = createOrderLabelXml({
      orderNumber: orderId,
      customerName: projectName,
      itemCount: allmoxyJobNumber ? `Allmoxy: ${allmoxyJobNumber}` : '',
      description: orderName + (cienappsJobNumber ? ` (Job #${cienappsJobNumber})` : ''),
      logoBase64
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
  logoUrl?: string
): Promise<{ success: boolean; printed: number; error?: string }> {
  try {
    const printer = await findPrinterByModel(/4XL|XL/i);
    if (!printer) {
      return { success: false, printed: 0, error: 'No Dymo 4XL printer found. Please connect a Dymo LabelWriter 4XL.' };
    }

    let logoBase64: string | undefined;
    if (logoUrl) {
      try {
        logoBase64 = await imageToBase64(logoUrl);
        console.log('[Dymo] Logo loaded successfully');
      } catch (err) {
        console.warn('[Dymo] Could not load logo:', err);
      }
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
        totalPallets: String(palletCount),
        logoBase64
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
