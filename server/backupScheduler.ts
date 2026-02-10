import { getGoogleSheetsClient, getGoogleDriveClient } from "./googleSheets";
import { db } from "./db";
import { log } from "./index";

const FOLDER_NAME = 'Perfect Fit Orders Replit Backup';
let schedulerTimeout: NodeJS.Timeout | null = null;
let lastBackupTime: string | null = null;
let lastBackupStatus: 'success' | 'error' | null = null;
let lastBackupError: string | null = null;

function getNextRunTime(): Date {
  const now = new Date();
  const next = new Date(now);
  next.setHours(3, 0, 0, 0);
  if (next <= now) {
    next.setDate(next.getDate() + 1);
  }
  return next;
}

function getMsUntilNext(): number {
  return getNextRunTime().getTime() - Date.now();
}

async function runScheduledBackup(): Promise<void> {
  log('Starting scheduled daily backup...', 'backup-scheduler');

  try {
    const sheets = await getGoogleSheetsClient();
    const drive = await getGoogleDriveClient();

    const timestamp = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const title = `PF Order Backup - ${timestamp}`;

    const spreadsheet = await sheets.spreadsheets.create({
      requestBody: {
        properties: { title },
        sheets: [
          { properties: { title: 'Orders' } },
          { properties: { title: 'Order Files' } },
          { properties: { title: 'Products' } },
          { properties: { title: 'Pallets' } },
          { properties: { title: 'Hardware Checklist' } },
          { properties: { title: 'Packing Checklist' } },
        ]
      }
    });

    const spreadsheetId = spreadsheet.data.spreadsheetId!;

    const folderSearch = await drive.files.list({
      q: `mimeType='application/vnd.google-apps.folder' and name='${FOLDER_NAME}' and trashed=false`,
      fields: 'files(id, name)',
      spaces: 'drive',
    });

    let folderId: string;
    if (folderSearch.data.files && folderSearch.data.files.length > 0) {
      folderId = folderSearch.data.files[0].id!;
    } else {
      const folder = await drive.files.create({
        requestBody: {
          name: FOLDER_NAME,
          mimeType: 'application/vnd.google-apps.folder',
        },
        fields: 'id',
      });
      folderId = folder.data.id!;
      log('Created backup folder in Google Drive', 'backup-scheduler');
    }

    const file = await drive.files.get({
      fileId: spreadsheetId,
      fields: 'parents',
    });
    const previousParents = (file.data.parents || []).join(',');
    await drive.files.update({
      fileId: spreadsheetId,
      addParents: folderId,
      removeParents: previousParents,
      fields: 'id, parents',
    });

    const { projects: projectsTable, products, pallets: palletsTable, palletFileAssignments, orderFiles: orderFilesTable, hardwareChecklistItems: hwTable, packingSlipItems: psTable } = await import('@shared/schema');

    const allProjects = await db.select().from(projectsTable);
    const allProducts = await db.select().from(products);
    const allOrderFiles = await db.select().from(orderFilesTable);
    const allPallets = await db.select().from(palletsTable);
    const allPalletAssignments = await db.select().from(palletFileAssignments);
    const allHardwareItems = await db.select().from(hwTable);
    const allPackingItems = await db.select().from(psTable);

    const ordersData: any[][] = [
      ['ID', 'Name', 'Date', 'Dealer', 'Shipping Address', 'Phone', 'Tax ID', 'Order ID', 'Status', 'Asana Task ID', 'Asana Section', 'PF Order Status', 'PF Production Status', 'Cienapps Job #', 'Notes', 'Created At']
    ];
    for (const p of allProjects) {
      ordersData.push([
        p.id, p.name, p.date || '', p.dealer || '', p.shippingAddress || '', p.phone || '',
        p.taxId || '', p.orderId || '', p.status, p.asanaTaskId || '',
        p.asanaSection || '', p.pfOrderStatus || '',
        Array.isArray(p.pfProductionStatus) ? p.pfProductionStatus.join(', ') : '',
        p.cienappsJobNumber || '', p.notes || '',
        p.createdAt ? new Date(p.createdAt).toISOString() : ''
      ]);
    }

    const filesData: any[][] = [
      ['ID', 'Project ID', 'Filename', 'PO Number', 'Core Parts', 'Dovetails', 'Assembled Drawers', '5-Piece Doors', 'Weight (lbs)', 'Max Length', 'Max Width', 'Has Glass', 'Glass Inserts', 'Glass Shelves', 'Has MJ Doors', 'Has Richelieu Doors', 'Has Double Thick', 'Has Shaker Doors', 'MJ Doors Count', 'Richelieu Doors Count', 'Double Thick Count', 'Wall Rail Pieces', 'Allmoxy Job #', 'HW BO Status', 'Packaging Link', 'Notes', 'Created At']
    ];
    for (const f of allOrderFiles) {
      filesData.push([
        f.id, f.projectId, f.originalFilename, f.poNumber || '',
        f.coreParts || 0, f.dovetails || 0, f.assembledDrawers || 0, f.fivePieceDoors || 0,
        f.weightLbs || 0, f.maxLength || 0, f.maxWidth || 0,
        f.hasGlassParts ? 'YES' : 'NO', f.glassInserts || 0, f.glassShelves || 0,
        f.hasMJDoors ? 'YES' : 'NO', f.hasRichelieuDoors ? 'YES' : 'NO',
        f.hasDoubleThick ? 'YES' : 'NO', f.hasShakerDoors ? 'YES' : 'NO',
        f.mjDoorsCount || 0, f.richelieuDoorsCount || 0, f.doubleThickCount || 0,
        f.wallRailPieces || 0, f.allmoxyJobNumber || '', f.hardwareBoStatus || '',
        f.packagingLink || '', f.notes || '',
        f.createdAt ? new Date(f.createdAt).toISOString() : ''
      ]);
    }

    const productsData: any[][] = [
      ['ID', 'Code', 'Name', 'Supplier', 'Category', 'Stock Status', 'Weight (g)', 'Import Row #', 'Notes', 'Created At', 'Updated At']
    ];
    for (const p of allProducts) {
      productsData.push([
        p.id, p.code, p.name || '', p.supplier || '', p.category, p.stockStatus || '',
        p.weight || '', p.importRowNumber || '', p.notes || '',
        p.createdAt ? new Date(p.createdAt).toISOString() : '',
        p.updatedAt ? new Date(p.updatedAt).toISOString() : ''
      ]);
    }

    const palletAssignmentMap = new Map<number, number[]>();
    for (const a of allPalletAssignments) {
      if (!palletAssignmentMap.has(a.palletId)) palletAssignmentMap.set(a.palletId, []);
      palletAssignmentMap.get(a.palletId)!.push(a.fileId);
    }

    const palletsData: any[][] = [
      ['ID', 'Project ID', 'Pallet #', 'Size', 'Custom Size', 'Notes', 'Assigned File IDs', 'Created At']
    ];
    for (const p of allPallets) {
      const fileIds = palletAssignmentMap.get(p.id) || [];
      palletsData.push([
        p.id, p.projectId, p.palletNumber, p.size, p.customSize || '',
        p.notes || '', fileIds.join(', '),
        p.createdAt ? new Date(p.createdAt).toISOString() : ''
      ]);
    }

    const hwData: any[][] = [
      ['ID', 'File ID', 'Product ID', 'Product Code', 'Product Name', 'Quantity', 'Cut Length', 'Is Buyout', 'Buyout Arrived', 'Is Packed', 'Packed By', 'Packed At', 'Not In Database', 'Sort Order', 'Created At']
    ];
    for (const h of allHardwareItems) {
      hwData.push([
        h.id, h.fileId, h.productId || '', h.productCode, h.productName || '', h.quantity,
        h.cutLength || '', h.isBuyout ? 'YES' : 'NO', h.buyoutArrived ? 'YES' : 'NO',
        h.isPacked ? 'YES' : 'NO', h.packedBy || '',
        h.packedAt ? new Date(h.packedAt).toISOString() : '',
        h.notInDatabase ? 'YES' : 'NO', h.sortOrder || 0,
        h.createdAt ? new Date(h.createdAt).toISOString() : ''
      ]);
    }

    const psData: any[][] = [
      ['ID', 'File ID', 'Part Code', 'Color', 'Quantity', 'Height', 'Width', 'Length', 'Thickness', 'Description', 'Is Checked', 'Checked By', 'Checked At', 'Sort Order', 'Created At']
    ];
    for (const p of allPackingItems) {
      psData.push([
        p.id, p.fileId, p.partCode, p.color || '', p.quantity,
        p.height || '', p.width || '', p.length || '', p.thickness || '',
        p.description || '', p.isChecked ? 'YES' : 'NO', p.checkedBy || '',
        p.checkedAt ? new Date(p.checkedAt).toISOString() : '',
        p.sortOrder || 0,
        p.createdAt ? new Date(p.createdAt).toISOString() : ''
      ]);
    }

    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: {
        valueInputOption: 'RAW',
        data: [
          { range: 'Orders!A1', values: ordersData },
          { range: 'Order Files!A1', values: filesData },
          { range: 'Products!A1', values: productsData },
          { range: 'Pallets!A1', values: palletsData },
          { range: 'Hardware Checklist!A1', values: hwData },
          { range: 'Packing Checklist!A1', values: psData },
        ]
      }
    });

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: spreadsheet.data.sheets!.map(sheet => ({
          repeatCell: {
            range: {
              sheetId: sheet.properties!.sheetId!,
              startRowIndex: 0,
              endRowIndex: 1,
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: { red: 0.2, green: 0.4, blue: 0.7 },
                textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } }
              }
            },
            fields: 'userEnteredFormat(backgroundColor,textFormat)'
          }
        }))
      }
    });

    const totalRecords = allProjects.length + allOrderFiles.length + allProducts.length + allPallets.length + allHardwareItems.length + allPackingItems.length;
    lastBackupTime = new Date().toISOString();
    lastBackupStatus = 'success';
    lastBackupError = null;
    log(`Scheduled backup complete: ${totalRecords} records exported to "${title}"`, 'backup-scheduler');
  } catch (err: any) {
    lastBackupTime = new Date().toISOString();
    lastBackupStatus = 'error';
    lastBackupError = err.message || String(err);
    log(`Scheduled backup failed: ${err.message}`, 'backup-scheduler');
  }
}

function scheduleNext(): void {
  const ms = getMsUntilNext();
  const nextRun = getNextRunTime();
  log(`Next backup scheduled for ${nextRun.toLocaleString()} (in ${Math.round(ms / 60000)} minutes)`, 'backup-scheduler');

  schedulerTimeout = setTimeout(async () => {
    await runScheduledBackup();
    scheduleNext();
  }, ms);
}

export function startBackupScheduler(): void {
  log('Starting daily Google Sheets backup scheduler (3:00 AM)', 'backup-scheduler');
  scheduleNext();
}

export function stopBackupScheduler(): void {
  if (schedulerTimeout) {
    clearTimeout(schedulerTimeout);
    schedulerTimeout = null;
  }
  log('Backup scheduler stopped', 'backup-scheduler');
}

export function getBackupSchedulerStatus() {
  return {
    nextRun: getNextRunTime().toISOString(),
    lastBackupTime,
    lastBackupStatus,
    lastBackupError,
  };
}
