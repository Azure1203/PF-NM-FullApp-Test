import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { FileItemsTable } from "./FileItemsTable";
import { PdfViewer } from "./PdfViewer";
import type { FileSummaryItem } from "./FileSidebar";

interface Props {
  orderId: number;
  fileId: number;
  fileSummary: FileSummaryItem | null;
}

export function DocumentsView({ orderId, fileId, fileSummary }: Props) {
  const [activeTab, setActiveTab] = useState("items");

  const pdfUrl = (endpoint: string) =>
    `/api/orders/${orderId}/${endpoint}?fileId=${fileId}`;

  const hasElias = fileSummary?.hasElias ?? false;
  const hasMJ = fileSummary?.hasMJ ?? false;
  const hasHardware = fileSummary?.hasHardware ?? false;
  const hasGlass = fileSummary?.hasGlass ?? false;
  const hasORD = fileSummary?.hasORD ?? false;

  const ordDownloadUrl = `/api/orders/${orderId}/download/ord?fileId=${fileId}`;

  const tabs = [
    { id: "items", label: "Items", always: true },
    { id: "invoice", label: "Invoice", always: true },
    { id: "customer-slip", label: "Customer Slip", always: true },
    { id: "internal-slip", label: "Internal Slip", always: true },
    { id: "cabinet-vision", label: "Cabinet Vision", always: false, show: hasORD },
    { id: "elias", label: "Elias", always: false, show: hasElias },
    { id: "mj", label: "M&J", always: false, show: hasMJ },
    { id: "hardware", label: "Hardware", always: false, show: hasHardware },
    { id: "glass", label: "Glass", always: false, show: hasGlass },
  ].filter(t => t.always || t.show);

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
      <div className="overflow-x-auto">
        <TabsList className="flex h-9 w-max gap-0.5">
          {tabs.map(tab => (
            <TabsTrigger
              key={tab.id}
              value={tab.id}
              className="text-xs px-2.5 py-1 h-8 whitespace-nowrap"
              data-testid={`tab-${tab.id}`}
            >
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>

      <div className="mt-4">
        <TabsContent value="items" className="mt-0">
          <FileItemsTable orderId={orderId} fileId={fileId} />
        </TabsContent>

        <TabsContent value="invoice" className="mt-0">
          <PdfViewer
            url={pdfUrl("pdf/invoice")}
            downloadUrl={pdfUrl("pdf/invoice")}
            filename={`Invoice_${orderId}_f${fileId}.pdf`}
          />
        </TabsContent>

        <TabsContent value="customer-slip" className="mt-0">
          <PdfViewer
            url={pdfUrl("pdf/customer-packing-slip")}
            downloadUrl={pdfUrl("pdf/customer-packing-slip")}
            filename={`CustomerSlip_${orderId}_f${fileId}.pdf`}
          />
        </TabsContent>

        <TabsContent value="internal-slip" className="mt-0">
          <PdfViewer
            url={pdfUrl("pdf/internal-packing-slip")}
            downloadUrl={pdfUrl("pdf/internal-packing-slip")}
            filename={`InternalSlip_${orderId}_f${fileId}.pdf`}
          />
        </TabsContent>

        {hasORD && (
          <TabsContent value="cabinet-vision" className="mt-0">
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <a
                  href={ordDownloadUrl}
                  download
                  className="inline-flex items-center gap-2 text-sm px-3 py-1.5 rounded-md border border-border bg-card hover:bg-muted/50 transition-colors"
                  data-testid="button-download-ord"
                >
                  Download .ORD File
                </a>
              </div>
              <ORDPreview orderId={orderId} fileId={fileId} />
            </div>
          </TabsContent>
        )}

        {hasElias && (
          <TabsContent value="elias" className="mt-0">
            <PdfViewer
              url={pdfUrl("pdf/elias")}
              downloadUrl={pdfUrl("pdf/elias")}
              filename={`Elias_${orderId}_f${fileId}.pdf`}
            />
          </TabsContent>
        )}

        {hasMJ && (
          <TabsContent value="mj" className="mt-0">
            <PdfViewer
              url={pdfUrl("pdf/mj")}
              downloadUrl={pdfUrl("pdf/mj")}
              filename={`MJ_${orderId}_f${fileId}.pdf`}
            />
          </TabsContent>
        )}

        {hasHardware && (
          <TabsContent value="hardware" className="mt-0">
            <HardwareDataTable orderId={orderId} fileId={fileId} />
          </TabsContent>
        )}

        {hasGlass && (
          <TabsContent value="glass" className="mt-0">
            <GlassDataTable orderId={orderId} fileId={fileId} />
          </TabsContent>
        )}
      </div>
    </Tabs>
  );
}

function ORDPreview({ orderId, fileId }: { orderId: number; fileId: number }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/orders/${orderId}/data/ord?fileId=${fileId}`, { credentials: "include" });
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  };

  if (!loaded) {
    return (
      <button onClick={load} className="text-sm text-primary underline underline-offset-2">
        Preview ORD items
      </button>
    );
  }

  if (!data || !data.rooms?.length) {
    return <p className="text-sm text-muted-foreground">No ORD items for this file.</p>;
  }

  const room = data.rooms[0];
  return (
    <div className="rounded-md border bg-card p-3 text-xs font-mono space-y-1 overflow-x-auto">
      <p className="text-muted-foreground font-sans text-sm font-medium mb-2">{room.roomName} — {room.itemCount} items</p>
      {room.items.map((item: any, idx: number) => (
        <div key={idx} className="text-xs">
          1,"{item.sku}",{item.width},{item.height},{item.depth},"*","N",{item.qty}
        </div>
      ))}
    </div>
  );
}

function HardwareDataTable({ orderId, fileId }: { orderId: number; fileId: number }) {
  const [data, setData] = useState<any>(null);
  const [loaded, setLoaded] = useState(false);

  const load = async () => {
    const res = await fetch(`/api/orders/${orderId}/data/hardware?fileId=${fileId}`, { credentials: "include" });
    if (res.ok) setData(await res.json());
    setLoaded(true);
  };

  if (!loaded) {
    return <button onClick={load} className="text-sm text-primary underline underline-offset-2">Load hardware items</button>;
  }

  if (!data?.items?.length) return <p className="text-sm text-muted-foreground">No hardware items.</p>;

  return (
    <div className="rounded-md border overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b bg-muted/30">
          <tr>
            <th className="text-left p-2 font-medium">SKU</th>
            <th className="text-left p-2 font-medium">Product</th>
            <th className="text-center p-2 font-medium">Qty</th>
            <th className="text-right p-2 font-medium">Total</th>
          </tr>
        </thead>
        <tbody>
          {data.items.map((item: any, i: number) => (
            <tr key={i} className="border-b last:border-0">
              <td className="p-2 font-mono text-xs">{item.sku}</td>
              <td className="p-2 text-xs">{item.productName ?? "—"}</td>
              <td className="p-2 text-center">{item.qty}</td>
              <td className="p-2 text-right">${(item.totalPrice ?? 0).toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={3} className="p-2 text-right text-sm font-medium">Total</td>
            <td className="p-2 text-right font-semibold">${data.total?.toFixed(2)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function GlassDataTable({ orderId, fileId }: { orderId: number; fileId: number }) {
  const [data, setData] = useState<any>(null);
  const [loaded, setLoaded] = useState(false);

  const load = async () => {
    const res = await fetch(`/api/orders/${orderId}/data/glass?fileId=${fileId}`, { credentials: "include" });
    if (res.ok) setData(await res.json());
    setLoaded(true);
  };

  if (!loaded) {
    return <button onClick={load} className="text-sm text-primary underline underline-offset-2">Load glass items</button>;
  }

  if (!data?.items?.length) return <p className="text-sm text-muted-foreground">No glass items.</p>;

  return (
    <div className="rounded-md border overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b bg-muted/30">
          <tr>
            <th className="text-left p-2 font-medium">SKU</th>
            <th className="text-center p-2 font-medium">H×W×D</th>
            <th className="text-center p-2 font-medium">Qty</th>
            <th className="text-right p-2 font-medium">Total</th>
          </tr>
        </thead>
        <tbody>
          {data.items.map((item: any, i: number) => (
            <tr key={i} className="border-b last:border-0">
              <td className="p-2 font-mono text-xs">{item.sku}</td>
              <td className="p-2 text-center text-xs">{item.height}×{item.width}×{item.depth}</td>
              <td className="p-2 text-center">{item.qty}</td>
              <td className="p-2 text-right">${(item.totalPrice ?? 0).toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={3} className="p-2 text-right text-sm font-medium">Total</td>
            <td className="p-2 text-right font-semibold">${data.total?.toFixed(2)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
