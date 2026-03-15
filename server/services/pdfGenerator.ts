import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface InvoiceItem {
  id: string;
  qty: number;
  height?: number | null;
  width?: number | null;
  length?: number | null;
  thickness?: number | null;
  edgeLeft?: string;
  edgeRight?: string;
  edgeTop?: string;
  edgeBottom?: string;
  type?: string;
  supplyType?: string | null;
  unitPrice: number;
  totalPrice: number;
}

export interface InternalPackingSlipItem {
  id: string;
  qty: number;
  height?: number | null;
  width?: number | null;
  length?: number | null;
  thickness?: number | null;
  edgeLeft?: string;
  edgeRight?: string;
  edgeTop?: string;
  edgeBottom?: string;
  type?: string;
  supplyType?: string | null;
  rackLocation?: string | null;
}

export interface InternalPackingSlipSection {
  sku: string;
  color: string | null;
  categoryLabel: string;
  productDescription: string;
  columns: string[];
  items: InternalPackingSlipItem[];
  totalItems: number;
}

export interface InternalPackingSlipData {
  orderId: number;
  orderName: string;
  sections: InternalPackingSlipSection[];
  outputPath: string;
}

export interface InvoiceSection {
  sku: string;
  color: string | null;
  categoryLabel: string;
  productDescription: string;
  columns: string[];
  items: InvoiceItem[];
  totalItems: number;
  subtotal: number;
}

export interface InvoiceData {
  orderId: number;
  orderName: string;
  orderStatus: string;
  dateOrdered?: string;
  paymentDueBy?: string;
  projectedShipDate?: string;
  shippingMethod?: string;
  shipTo?: string;
  sections: InvoiceSection[];
  originalTotal: number;
  discountAmount: number;
  finalTotal: number;
  outputPath: string;
}

const SCRIPT_PATH                  = path.join(process.cwd(), 'server', 'scripts', 'generate_invoice.py');
const PACKING_SLIP_SCRIPT          = path.join(process.cwd(), 'server', 'scripts', 'generate_customer_packing_slip.py');
const ELIAS_SCRIPT                 = path.join(process.cwd(), 'server', 'scripts', 'generate_elias_pdf.py');
const INTERNAL_PACKING_SLIP_SCRIPT = path.join(process.cwd(), 'server', 'scripts', 'generate_internal_packing_slip.py');

export async function generateInvoicePdf(data: InvoiceData): Promise<Buffer> {
  const tmpPath = path.join(os.tmpdir(), `invoice_${data.orderId}_${Date.now()}.pdf`);
  const payload: InvoiceData = { ...data, outputPath: tmpPath };

  return new Promise((resolve, reject) => {
    const py = spawn('python3', [SCRIPT_PATH], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    py.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    py.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

    py.stdin.write(JSON.stringify(payload));
    py.stdin.end();

    py.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(`PDF generator failed (exit ${code}): ${stderr.slice(0, 500)}`));
      }
      const successLine = stdout.trim().split('\n').find(l => l.startsWith('SUCCESS:'));
      if (!successLine) {
        return reject(new Error(`PDF generator gave no SUCCESS line. stderr: ${stderr.slice(0, 500)}`));
      }
      const pdfPath = successLine.replace('SUCCESS:', '').trim();
      try {
        const buf = fs.readFileSync(pdfPath);
        try { fs.unlinkSync(pdfPath); } catch { }
        resolve(buf);
      } catch (e: any) {
        reject(new Error(`Could not read generated PDF: ${e.message}`));
      }
    });

    py.on('error', (err) => {
      reject(new Error(`Failed to spawn Python: ${err.message}`));
    });
  });
}

export async function generateCustomerPackingSlipPdf(data: InvoiceData): Promise<Buffer> {
  const tmpPath = path.join(os.tmpdir(), `packing_slip_${data.orderId}_${Date.now()}.pdf`);
  const payload: InvoiceData = { ...data, outputPath: tmpPath };

  return new Promise((resolve, reject) => {
    const py = spawn('python3', [PACKING_SLIP_SCRIPT], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    py.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    py.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

    py.stdin.write(JSON.stringify(payload));
    py.stdin.end();

    py.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(`Packing slip generator failed (exit ${code}): ${stderr.slice(0, 500)}`));
      }
      const successLine = stdout.trim().split('\n').find(l => l.startsWith('SUCCESS:'));
      if (!successLine) {
        return reject(new Error(`Packing slip generator gave no SUCCESS line. stderr: ${stderr.slice(0, 500)}`));
      }
      const pdfPath = successLine.replace('SUCCESS:', '').trim();
      try {
        const buf = fs.readFileSync(pdfPath);
        try { fs.unlinkSync(pdfPath); } catch { }
        resolve(buf);
      } catch (e: any) {
        reject(new Error(`Could not read generated packing slip PDF: ${e.message}`));
      }
    });

    py.on('error', (err) => {
      reject(new Error(`Failed to spawn Python for packing slip: ${err.message}`));
    });
  });
}

export interface EliasSection {
  sku: string;
  color: string | null;
  supplierCheckmarks: number;
  items: {
    id: string;
    qty: number;
    height?: number | null;
    width?: number | null;
    length?: number | null;
    type?: string;
  }[];
  totalItems: number;
}

export interface EliasData {
  orderId: number;
  orderName: string;
  projectLabel?: string;
  sections: EliasSection[];
  outputPath: string;
}

export async function generateEliasPdf(data: EliasData): Promise<Buffer> {
  const tmpPath = path.join(os.tmpdir(), `elias_${data.orderId}_${Date.now()}.pdf`);
  const payload: EliasData = { ...data, outputPath: tmpPath };

  return new Promise((resolve, reject) => {
    const py = spawn('python3', [ELIAS_SCRIPT], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    py.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    py.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

    py.stdin.write(JSON.stringify(payload));
    py.stdin.end();

    py.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(`Elias PDF generator failed (exit ${code}): ${stderr.slice(0, 500)}`));
      }
      const successLine = stdout.trim().split('\n').find(l => l.startsWith('SUCCESS:'));
      if (!successLine) {
        return reject(new Error(`Elias PDF generator gave no SUCCESS line. stderr: ${stderr.slice(0, 500)}`));
      }
      const pdfPath = successLine.replace('SUCCESS:', '').trim();
      try {
        const buf = fs.readFileSync(pdfPath);
        try { fs.unlinkSync(pdfPath); } catch { }
        resolve(buf);
      } catch (e: any) {
        reject(new Error(`Could not read generated Elias PDF: ${e.message}`));
      }
    });

    py.on('error', (err) => {
      reject(new Error(`Failed to spawn Python for Elias PDF: ${err.message}`));
    });
  });
}


export async function generateInternalPackingSlipPdf(data: InternalPackingSlipData): Promise<Buffer> {
  const tmpPath = path.join(os.tmpdir(), `internal_packing_slip_${data.orderId}_${Date.now()}.pdf`);
  const payload: InternalPackingSlipData = { ...data, outputPath: tmpPath };

  return new Promise((resolve, reject) => {
    const py = spawn('python3', [INTERNAL_PACKING_SLIP_SCRIPT], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    py.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    py.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

    py.stdin.write(JSON.stringify(payload));
    py.stdin.end();

    py.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(`Internal packing slip generator failed (exit ${code}): ${stderr.slice(0, 500)}`));
      }
      const successLine = stdout.trim().split('\n').find(l => l.startsWith('SUCCESS:'));
      if (!successLine) {
        return reject(new Error(`Internal packing slip generator gave no SUCCESS line. stderr: ${stderr.slice(0, 500)}`));
      }
      const pdfPath = successLine.replace('SUCCESS:', '').trim();
      try {
        const buf = fs.readFileSync(pdfPath);
        try { fs.unlinkSync(pdfPath); } catch { }
        resolve(buf);
      } catch (e: any) {
        reject(new Error(`Could not read generated internal packing slip PDF: ${e.message}`));
      }
    });

    py.on('error', (err) => {
      reject(new Error(`Failed to spawn Python for internal packing slip: ${err.message}`));
    });
  });
}
