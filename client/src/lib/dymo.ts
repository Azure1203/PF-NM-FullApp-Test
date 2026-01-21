// Dymo Label Printing Utility
// Supports Dymo 450 (30323 labels) and Dymo 4XL (1744907 labels)

declare global {
  interface Window {
    dymo: any;
  }
}

// SDK loading state
let sdkLoaded = false;
let sdkLoading = false;
let sdkLoadPromise: Promise<void> | null = null;

// Load Dymo JavaScript SDK
export async function loadDymoSDK(): Promise<void> {
  if (sdkLoaded) return;
  if (sdkLoading && sdkLoadPromise) return sdkLoadPromise;
  
  sdkLoading = true;
  sdkLoadPromise = new Promise((resolve, reject) => {
    // Check if already loaded
    if (window.dymo?.label?.framework) {
      sdkLoaded = true;
      resolve();
      return;
    }
    
    const script = document.createElement('script');
    script.src = 'https://labelwriter.com/software/dls/sdk/js/dymo.connect.framework.js';
    script.async = true;
    
    script.onload = () => {
      // Wait for framework to initialize
      const checkFramework = setInterval(() => {
        if (window.dymo?.label?.framework) {
          clearInterval(checkFramework);
          sdkLoaded = true;
          resolve();
        }
      }, 100);
      
      // Timeout after 10 seconds
      setTimeout(() => {
        clearInterval(checkFramework);
        if (!sdkLoaded) {
          reject(new Error('Dymo SDK failed to initialize'));
        }
      }, 10000);
    };
    
    script.onerror = () => {
      reject(new Error('Failed to load Dymo SDK'));
    };
    
    document.head.appendChild(script);
  });
  
  return sdkLoadPromise;
}

// Get available printers
export async function getPrinters(): Promise<{ name: string; isConnected: boolean; modelName: string }[]> {
  await loadDymoSDK();
  
  try {
    const printers = window.dymo.label.framework.getPrinters();
    return printers.map((p: any) => ({
      name: p.name,
      isConnected: p.isConnected,
      modelName: p.modelName || p.name
    }));
  } catch (error) {
    console.error('Error getting printers:', error);
    return [];
  }
}

// Find a specific printer type
export async function findPrinter(printerType: '450' | '4XL'): Promise<string | null> {
  const printers = await getPrinters();
  
  for (const printer of printers) {
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

// Escape XML special characters
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Print Project Label (30323)
export async function printProjectLabel(
  projectName: string,
  orderId: string,
  cienappsJobNumber: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await loadDymoSDK();
    
    const printerName = await findPrinter('450');
    if (!printerName) {
      return { success: false, error: 'Dymo 450 printer not found. Make sure DYMO Connect is running.' };
    }
    
    const labelXml = create30323LabelXml([
      { label: 'Project Name', value: projectName },
      { label: 'Order ID', value: orderId || '—' },
      { label: 'Cienapps Job #', value: cienappsJobNumber || '—' }
    ]);
    
    const label = window.dymo.label.framework.openLabelXml(labelXml);
    label.print(printerName);
    
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
    await loadDymoSDK();
    
    const printerName = await findPrinter('450');
    if (!printerName) {
      return { success: false, error: 'Dymo 450 printer not found. Make sure DYMO Connect is running.' };
    }
    
    const labelXml = create30323LabelXml([
      { label: 'Project Name', value: projectName },
      { label: 'Order Name', value: orderName },
      { label: 'Allmoxy Job #', value: allmoxyJobNumber || '—' },
      { label: 'Order ID', value: orderId || '—' },
      { label: 'Cienapps Job #', value: cienappsJobNumber || '—' }
    ]);
    
    const label = window.dymo.label.framework.openLabelXml(labelXml);
    label.print(printerName);
    
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
    await loadDymoSDK();
    
    const printerName = await findPrinter('4XL');
    if (!printerName) {
      return { success: false, error: 'Dymo 4XL printer not found. Make sure DYMO Connect is running.' };
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
      
      const label = window.dymo.label.framework.openLabelXml(labelXml);
      label.print(printerName);
      
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
