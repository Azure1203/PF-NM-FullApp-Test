import { parse } from 'csv-parse';
import { storage } from './storage';
import { getAsanaApiInstances } from './lib/asana';

const ASANA_PERFECT_FIT_PROJECT_GID = '1208263802564738';

const MJ_DOOR_KEYWORDS = [
  'DRSLIMLINE', 'DRVENICE', 'DRSUSSEX', 'DRLANCASTER', 'DRLANCASTER-VGROOVE', 'DRLANCASTER-GD'
];

const RICHELIEU_DOOR_KEYWORDS = ['ALUMSHAKER-06', 'ALUMSLIMSHAKER-03'];

const GLASS_INSERT_KEYWORDS = [
  'CLEAR', 'FROSTED', 'FLUTEX', 'CATHEDRAL', 'BAMBOO', 'MIRROR',
  'CLEARSAFETY', 'FROSTEDSAFETY', 'FLUTEXSAFETY', 'CATHEDRALSAFETY', 'SAFETYBAMBOO', 'MIRRORSAFETY',
  'ACID', 'SMOKED-GREY', 'EXTRA-CANNES', 'EXTRA-LINEN', 'SMOKED-BRONZE',
  'PURE-WHITE', 'METALLIC-GREY', 'JET-BLACK', 'BEIGE', 'CHOCOLATE', 'BLUE-GREY', 'TURQUOISE-BLUE',
  'ALBARIUM', 'NACRE', 'SIRIUS', 'BROMO'
];

const GLASS_SHELF_KEYWORDS = ['GLSHFA_6', 'GLSHFA_10'];

const WALL_RAIL_PARTS = [
  'H.290.11.901.CTS', 'H.290.11.907.CTS', 'H.290.11.901', 'H.290.11.907',
  'H.290.12.781.CTS', 'H.290.12.790.CTS', 'H.290.12.380.CTS', 'H.290.12.390.CTS',
  'H.290.12.180.CTS', 'H.290.12.190.CTS', 'H.290.12.481.CTS', 'H.290.12.490.CTS',
  'H.290.12.781', 'H.290.12.790', 'H.290.12.380', 'H.290.12.390',
  'H.290.12.180', 'H.290.12.190', 'H.290.12.481', 'H.290.12.490'
];

const HARDWARE_PREFIXES = ['H.', 'M.', 'M-', 'R-', 'R.', 'S.'];

export function parseCSV(fileContent: string): Promise<string[][]> {
  return new Promise((resolve, reject) => {
    parse(fileContent, {
      relax_column_count: true,
      skip_empty_lines: true,
      trim: true
    }, (err, records: string[][]) => {
      if (err) reject(err);
      else resolve(records);
    });
  });
}

export function findValue(records: string[][], keyStart: string): string | undefined {
  for (let i = 0; i < Math.min(records.length, 20); i++) {
    const row = records[i];
    if (row[0] && row[0].toLowerCase().trim().includes(keyStart.toLowerCase().trim())) {
      return row[1]?.trim();
    }
  }
  return undefined;
}

export function formatPhoneNumber(phone: string | undefined): string | undefined {
  if (!phone) return undefined;
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits.startsWith('1')) {
    return `${digits.slice(1, 4)}-${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return phone;
}

export function formatPONumber(po: string | undefined): string | undefined {
  if (!po) return undefined;
  return po.replace(/[#\-]/g, '').replace(/\s+/g, ' ').trim();
}

export function computeAutoProductionStatuses(params: {
  hasCTSParts: boolean;
  hasFivePiece: boolean;
  hasDoubleThick: boolean;
  hasDovetails: boolean;
  hasAssembledDrawers: boolean;
  hasGlassParts: boolean;
  hasGlassShelves: boolean;
}): string[] {
  const statuses: string[] = [];
  if (params.hasCTSParts) statuses.push('CLOSET RODS NOT CUT');
  if (params.hasFivePiece) statuses.push('WAITING FOR NETLEY SHAKER DOORS');
  if (params.hasDoubleThick) statuses.push('DOUBLE UP PARTS AT CUSTOM');
  if (params.hasDovetails) statuses.push('WAITING FOR DOVETAIL');
  if (params.hasAssembledDrawers) statuses.push('WAITING FOR NETLEY ASSEMBLED DRAWERS');
  if (params.hasGlassParts) statuses.push('WAITING FOR GLASS FOR DOORS');
  if (params.hasGlassShelves) statuses.push('WAITING FOR GLASS SHELVES');
  return statuses;
}

export function extractCTSParts(records: string[][]): Array<{ partNumber: string; description: string; cutLength: number; quantity: number }> {
  const ctsParts: Array<{ partNumber: string; description: string; cutLength: number; quantity: number }> = [];
  
  let dataStartIndex = -1;
  for (let i = 0; i < records.length; i++) {
    if (records[i][0]?.toLowerCase().includes('manuf')) {
      dataStartIndex = i + 1;
      break;
    }
  }
  
  if (dataStartIndex === -1) return ctsParts;
  
  for (let i = dataStartIndex; i < records.length; i++) {
    const row = records[i];
    const sku = (row[0] || '').trim();
    
    if (sku.toUpperCase().endsWith('.CTS')) {
      const description = (row[1] || '').trim();
      const quantity = parseInt(row[2] || '0') || 0;
      const cutLength = parseFloat(row[5] || '0') || 0;
      
      if (quantity > 0 && cutLength > 0) {
        ctsParts.push({
          partNumber: sku,
          description,
          cutLength: parseFloat(cutLength.toFixed(1)),
          quantity
        });
      }
    }
  }
  
  return ctsParts;
}

export async function countPartsFromCSV(records: string[][], productsMap?: Map<string, { category: string; supplier: string | null }>): Promise<{ coreParts: number; dovetails: number; assembledDrawers: number; fivePiece: number; hasDoubleThick: boolean; doubleThickCount: number; hasShakerDoors: boolean; hasGlassParts: boolean; glassInserts: number; glassShelves: number; hasMJDoors: boolean; hasRichelieuDoors: boolean; mjDoorsCount: number; richelieuDoorsCount: number; maxLength: number; maxWidth: number; largestPartWidth: number; weightLbs: number; customParts: string[]; wallRailPieces: number }> {
  let coreParts = 0;
  let dovetails = 0;
  let assembledDrawers = 0;
  let fivePiece = 0;
  let hasDoubleThick = false;
  let doubleThickCount = 0;
  let hasShakerDoors = false;
  let hasGlassParts = false;
  let glassInserts = 0;
  let glassShelves = 0;
  let hasMJDoors = false;
  let hasRichelieuDoors = false;
  let mjDoorsCount = 0;
  let richelieuDoorsCount = 0;
  let maxLength = 0;
  let maxWidth = 0;
  let largestPartWidth = 0;
  let weightLbs = 0;
  let wallRailPieces = 0;
  
  const LBS_PER_SQFT = 3;
  const SQMM_TO_SQFT = 92903.04;

  let dataStartIndex = -1;
  for (let i = 0; i < records.length; i++) {
    if (records[i][0]?.toLowerCase().includes('manuf')) {
      dataStartIndex = i + 1;
      break;
    }
  }

  if (dataStartIndex === -1) return { coreParts, dovetails, assembledDrawers, fivePiece, hasDoubleThick, doubleThickCount, hasShakerDoors, hasGlassParts, glassInserts, glassShelves, hasMJDoors, hasRichelieuDoors, mjDoorsCount, richelieuDoorsCount, maxLength, maxWidth, weightLbs, customParts: [], wallRailPieces };

  if (!productsMap) {
    const allCodes: string[] = [];
    for (let i = dataStartIndex; i < records.length; i++) {
      const sku = (records[i][0] || '').trim();
      if (sku) allCodes.push(sku);
    }
    
    const productsFromDb = await storage.getProductsByCode(allCodes);
    productsMap = new Map(productsFromDb.map(p => [
      p.code.toUpperCase(), 
      { category: p.category, supplier: p.supplier }
    ]));
  }

  for (let i = dataStartIndex; i < records.length; i++) {
    const row = records[i];
    const sku = (row[0] || '').trim().toUpperCase();
    const quantity = parseInt(row[2] || '0') || 0;

    if (!sku || quantity === 0) continue;

    if (WALL_RAIL_PARTS.some(part => sku === part.toUpperCase())) {
      wallRailPieces += quantity;
    }

    if (sku.startsWith('H.') || sku.startsWith('M.') || sku.startsWith('M-') || 
        sku.startsWith('R-') || sku.startsWith('R.') || sku.startsWith('S.')) {
      continue;
    }

    const productInfo = productsMap.get(sku);
    if (productInfo && productInfo.category === 'COMPONENT') {
      const supplier = (productInfo.supplier || '').toUpperCase();
      if (supplier.includes('MJ WOODCRAFT') || supplier.includes('M&J WOODCRAFT')) {
        hasMJDoors = true;
        mjDoorsCount += quantity;
      }
      if (supplier.includes('RICHELIEU')) {
        hasRichelieuDoors = true;
        richelieuDoorsCount += quantity;
      }
    }

    if (sku.includes('MDRW')) {
      if (sku.endsWith('ASS')) {
        assembledDrawers += quantity;
      } else {
        coreParts += quantity * 5;
      }
      continue;
    }

    if (sku.startsWith('DBX') || sku.startsWith('SDBX')) {
      dovetails += quantity;
      continue;
    }

    if (sku.includes('TFL90SHA')) {
      fivePiece += quantity;
      hasShakerDoors = true;
      continue;
    }

    if (sku.startsWith('15')) {
      hasDoubleThick = true;
      doubleThickCount += quantity;
    }

    if (GLASS_INSERT_KEYWORDS.some(keyword => sku.includes(keyword))) {
      hasGlassParts = true;
      glassInserts += quantity;
    }
    
    if (GLASS_SHELF_KEYWORDS.some(keyword => sku.includes(keyword))) {
      hasGlassParts = true;
      glassShelves += quantity;
    }

    const height = parseFloat(row[3] || '0') || 0;
    const width = parseFloat(row[4] || '0') || 0;
    if (height > maxLength) {
      maxLength = height;
      largestPartWidth = width;
    }
    if (height > 600 && width > 1092) {
      if (width > maxWidth) maxWidth = width;
    }

    if (height > 0 && width > 0) {
      const areaSqMm = height * width * quantity;
      const areaSqFt = areaSqMm / SQMM_TO_SQFT;
      weightLbs += areaSqFt * LBS_PER_SQFT;
    }

    if (sku.startsWith('34') || sku.startsWith('15') || sku.startsWith('14') || sku.startsWith('1G')) {
      coreParts += quantity;
      continue;
    }
    
    if (sku.includes('DRWEURO')) {
      coreParts += quantity;
      continue;
    }
    
    if (sku.includes('LIFTDREURO') || sku.includes('BADREURO') || sku.includes('HBADREURO') ||
        sku.includes('DDREURO') || sku.includes('LDREURO') || sku.includes('RDREURO') ||
        sku.includes('HDREURO') || sku.includes('KLDREURO') || sku.includes('KRDREURO') ||
        sku.includes('GLDREURO') || sku.includes('GRDREURO')) {
      coreParts += quantity;
      continue;
    }
    
    if (sku.startsWith('VAL') || sku.startsWith('MTVAL') || sku.startsWith('HGVAL') ||
        sku.startsWith('CLEAT') || sku.startsWith('MTCLEAT') || sku.startsWith('HGCLEAT') ||
        sku.startsWith('FILL') || sku.startsWith('MTFILL') || sku.startsWith('HGFILL') ||
        sku.startsWith('TK') || sku.startsWith('MTTK') || sku.startsWith('HGTK') ||
        sku.startsWith('SFLAT') || sku.startsWith('MTSFLAT') || sku.startsWith('HGSFLAT') ||
        sku.startsWith('SVAL')) {
      coreParts += quantity;
    }
  }

  const customParts: string[] = [];
  if (hasDoubleThick) customParts.push('DOUBLE THICK PARTS');
  if (hasShakerDoors) customParts.push('SHAKER DOORS');

  return { coreParts, dovetails, assembledDrawers, fivePiece, hasDoubleThick, doubleThickCount, hasShakerDoors, hasGlassParts, glassInserts, glassShelves, hasMJDoors, hasRichelieuDoors, mjDoorsCount, richelieuDoorsCount, maxLength, maxWidth, largestPartWidth, weightLbs, customParts, wallRailPieces };
}

export function getRecommendedPalletSize(maxLength: number, maxWidth: number): string {
  const needsWidePallet = maxWidth > 864;

  if (needsWidePallet) {
    if (maxLength <= 2388) return '44" x 96"';
    if (maxLength <= 2592) return '44" x 104"';
    return '44" x 110"';
  }

  return '34" x 104"';
}

interface CsvItemExtractionResult {
  items: Array<{
    rowIndex: number;
    code: string;
    name: string;
    quantity: number;
    height: number | null;
    width: number | null;
    length: number | null;
  }>;
  invalidRows: Array<{
    rowIndex: number;
    code: string;
    name: string;
    reason: string;
  }>;
  headerFound: boolean;
}

function extractAllItemsFromCSV(records: string[][]): CsvItemExtractionResult {
  const items: CsvItemExtractionResult['items'] = [];
  const invalidRows: CsvItemExtractionResult['invalidRows'] = [];
  
  let dataStartIndex = -1;
  for (let i = 0; i < records.length; i++) {
    if (records[i][0]?.toLowerCase().includes('manuf')) {
      dataStartIndex = i + 1;
      break;
    }
  }
  
  if (dataStartIndex === -1) {
    return { items, invalidRows, headerFound: false };
  }
  
  for (let i = dataStartIndex; i < records.length; i++) {
    const row = records[i];
    const originalCode = (row[0] || '').trim();
    const description = (row[1] || '').trim();
    const quantityStr = row[2] || '0';
    const quantity = parseInt(quantityStr) || 0;
    const heightStr = (row[3] || '').trim();
    const widthStr = (row[4] || '').trim();
    const lengthStr = (row[5] || '').trim();
    const height = heightStr ? parseFloat(heightStr) : null;
    const width = widthStr ? parseFloat(widthStr) : null;
    const length = lengthStr ? parseFloat(lengthStr) : null;
    
    if (!originalCode) continue;
    
    if (quantity <= 0) {
      invalidRows.push({
        rowIndex: i + 1,
        code: originalCode,
        name: description || '(empty)',
        reason: `Invalid quantity: "${quantityStr}"`
      });
      continue;
    }
    
    items.push({
      rowIndex: i + 1,
      code: originalCode,
      name: description,
      quantity,
      height: height && !isNaN(height) ? height : null,
      width: width && !isNaN(width) ? width : null,
      length: length && !isNaN(length) ? length : null
    });
  }
  
  return { items, invalidRows, headerFound: true };
}

function hasHardwarePrefix(code: string): boolean {
  const upperCode = code.trim().toUpperCase();
  return HARDWARE_PREFIXES.some(prefix => upperCode.startsWith(prefix));
}

export async function updateProjectBoProductionStatus(projectId: number) {
  console.log(`[BO Sync] updateProjectBoProductionStatus called for projectId: ${projectId}`);
  
  const project = await storage.getProject(projectId);
  if (!project) {
    console.log(`[BO Sync] WARNING: Project ${projectId} not found`);
    return;
  }
  
  const files = await storage.getProjectFiles(projectId);
  console.log(`[BO Sync] Project ${projectId} has ${files.length} files`);
  
  const fileBoStatuses = files.map(f => f.hardwareBoStatus).filter(Boolean) as string[];
  console.log(`[BO Sync] File BO statuses:`, fileBoStatuses);
  
  const hasWaitingForBo = fileBoStatuses.some(s => s === 'WAITING FOR BO HARDWARE');
  const hasBoHardware = fileBoStatuses.some(s => s === 'WAITING FOR BO HARDWARE' || s === 'BO HARDWARE ARRIVED');
  const allBoArrived = hasBoHardware && fileBoStatuses.every(s => s === 'NO BO HARDWARE' || s === 'BO HARDWARE ARRIVED');
  
  const currentStatuses = project.pfProductionStatus || [];
  let newStatuses = [...currentStatuses];
  
  newStatuses = newStatuses.filter(s => s !== 'WAITING FOR BO HARDWARE' && s !== 'BO HARDWARE ARRIVED');
  
  if (hasWaitingForBo) {
    newStatuses.push('WAITING FOR BO HARDWARE');
  } else if (allBoArrived && hasBoHardware) {
    newStatuses.push('BO HARDWARE ARRIVED');
  }
  
  const statusesChanged = 
    newStatuses.length !== currentStatuses.length || 
    newStatuses.some(s => !currentStatuses.includes(s)) ||
    currentStatuses.some(s => !newStatuses.includes(s));
  
  if (statusesChanged) {
    await storage.updateProject(projectId, { pfProductionStatus: newStatuses });
    console.log(`[BO Status] Updated project ${projectId} pfProductionStatus:`, newStatuses);
    
    if (project.asanaTaskId) {
      try {
        const { tasksApi, projectsApi } = await getAsanaApiInstances();
        const asanaProjectGid = ASANA_PERFECT_FIT_PROJECT_GID;
        
        const projectDetails = await projectsApi.getProject(asanaProjectGid, { 
          opt_fields: 'custom_field_settings.custom_field.name,custom_field_settings.custom_field.gid,custom_field_settings.custom_field.type,custom_field_settings.custom_field.enum_options'
        });
        
        const customFieldSettings = projectDetails.data.custom_field_settings || [];
        
        for (const setting of customFieldSettings) {
          const field = setting.custom_field;
          const name = field.name?.toUpperCase().trim();
          
          if (name === 'PF PRODUCTION STATUS' && field.type === 'multi_enum' && field.enum_options) {
            const selectedGids = newStatuses.map((statusName: string) => {
              const option = field.enum_options.find((o: any) => o.name === statusName);
              return option?.gid;
            }).filter(Boolean);
            
            await tasksApi.updateTask({ 
              data: { 
                custom_fields: { [field.gid]: selectedGids }
              } 
            }, project.asanaTaskId, {});
            
            console.log(`[BO Status] Synced pfProductionStatus to Asana task ${project.asanaTaskId}:`, newStatuses);
            break;
          }
        }
      } catch (asanaErr: any) {
        console.error("[BO Status] Failed to sync to Asana:", asanaErr.response?.body || asanaErr);
      }
    }
  }
}

export async function generateHardwareChecklistForFile(fileId: number, rawContent: string): Promise<{ success: boolean; itemCount: number; error?: string }> {
  try {
    const records = await parseCSV(rawContent);
    const { items: allItems, invalidRows, headerFound } = extractAllItemsFromCSV(records);
    
    if (!headerFound) {
      console.log(`[Hardware Checklist Auto] File ${fileId}: No "Manuf code" header found`);
      return { success: false, itemCount: 0, error: 'No header found' };
    }
    
    if (allItems.length === 0) {
      console.log(`[Hardware Checklist Auto] File ${fileId}: No items found in CSV`);
      return { success: false, itemCount: 0, error: 'No items in CSV' };
    }
    
    const allCodes = allItems.map(item => item.code);
    const productsFromDb = await storage.getProductsByCode(allCodes);
    const productMap = new Map(productsFromDb.map(p => [p.code.toUpperCase(), p]));
    
    const hardwareItems: Array<{
      rowIndex: number;
      code: string;
      name: string;
      quantity: number;
      height: number | null;
      width: number | null;
      length: number | null;
      product: typeof productsFromDb[0] | null;
      classification: string;
    }> = [];
    
    for (const item of allItems) {
      const product = productMap.get(item.code.toUpperCase()) || null;
      let classification: string;
      
      if (product) {
        classification = product.category === 'HARDWARE' ? 'HARDWARE_IN_DB' : 'COMPONENT_IN_DB';
      } else {
        classification = hasHardwarePrefix(item.code) ? 'HARDWARE_PREFIX_NOT_IN_DB' : 'NOT_HARDWARE';
      }
      
      if (classification === 'HARDWARE_IN_DB' || classification === 'HARDWARE_PREFIX_NOT_IN_DB') {
        hardwareItems.push({ ...item, product, classification });
      }
    }
    
    if (hardwareItems.length === 0) {
      console.log(`[Hardware Checklist Auto] File ${fileId}: No hardware items found (${allItems.length} items checked)`);
      return { success: true, itemCount: 0 };
    }
    
    const itemsToInsert = hardwareItems.map((item, index) => {
      const isBuyout = item.product?.stockStatus === 'BUYOUT';
      const notInDatabase = item.classification === 'HARDWARE_PREFIX_NOT_IN_DB';
      const isCts = item.code.toUpperCase().includes('.CTS');
      return {
        fileId,
        productId: item.product?.id || null,
        productCode: item.code,
        productName: item.name,
        quantity: item.quantity,
        cutLength: isCts ? item.length : null,
        isBuyout,
        buyoutArrived: false,
        isPacked: false,
        packedBy: null,
        sortOrder: index,
        notInDatabase
      };
    });
    
    const createdItems = await storage.replaceHardwareChecklist(fileId, itemsToInsert);
    
    const buyoutItems = createdItems.filter(i => i.isBuyout);
    const buyoutPacked = buyoutItems.filter(i => i.isPacked).length;
    
    let boStatus: 'NO BO HARDWARE' | 'WAITING FOR BO HARDWARE' | 'BO HARDWARE ARRIVED' = 'NO BO HARDWARE';
    if (buyoutItems.length > 0) {
      boStatus = buyoutPacked === buyoutItems.length ? 'BO HARDWARE ARRIVED' : 'WAITING FOR BO HARDWARE';
    }
    
    await storage.updateOrderFile(fileId, { hardwareBoStatus: boStatus });
    
    const buyoutOption = boStatus === 'NO BO HARDWARE' ? 'NO BUYOUT HARDWARE' : boStatus;
    const assignments = await storage.getAssignmentsForFile(fileId);
    for (const assignment of assignments) {
      await storage.updateAssignmentBuyoutStatuses(assignment.id, [buyoutOption]);
    }
    
    const orderFile = await storage.getOrderFile(fileId);
    if (orderFile) {
      console.log(`[Hardware Checklist Auto] File ${fileId}: Calling updateProjectBoProductionStatus for project ${orderFile.projectId}`);
      await updateProjectBoProductionStatus(orderFile.projectId);
    }
    
    console.log(`[Hardware Checklist Auto] File ${fileId}: Generated ${createdItems.length} items, BO status: ${boStatus}`);
    return { success: true, itemCount: createdItems.length };
    
  } catch (e: any) {
    console.error(`[Hardware Checklist Auto] File ${fileId}: Error generating:`, e);
    return { success: false, itemCount: 0, error: e.message };
  }
}

export async function generatePackingSlipChecklistForFile(fileId: number, rawContent: string): Promise<{ success: boolean; itemCount: number; error?: string }> {
  try {
    const records = await parseCSV(rawContent);
    const { items: allItems, headerFound } = extractAllItemsFromCSV(records);
    
    if (!headerFound) {
      console.log(`[Packing Slip Checklist] File ${fileId}: No "Manuf code" header found`);
      return { success: false, itemCount: 0, error: 'No header found' };
    }
    
    if (allItems.length === 0) {
      console.log(`[Packing Slip Checklist] File ${fileId}: No items found in CSV`);
      return { success: false, itemCount: 0, error: 'No items in CSV' };
    }
    
    const itemsToInsert = allItems.map((item, index) => ({
      fileId,
      partCode: item.code,
      color: null,
      quantity: item.quantity,
      height: item.height,
      width: item.width,
      length: item.length,
      thickness: null,
      description: item.name,
      imagePath: null,
      isChecked: false,
      sortOrder: index
    }));
    
    const createdItems = await storage.replacePackingSlipItems(fileId, itemsToInsert);
    
    console.log(`[Packing Slip Checklist] File ${fileId}: Generated ${createdItems.length} items from CSV`);
    return { success: true, itemCount: createdItems.length };
    
  } catch (e: any) {
    console.error(`[Packing Slip Checklist] File ${fileId}: Error generating:`, e);
    return { success: false, itemCount: 0, error: e.message };
  }
}
