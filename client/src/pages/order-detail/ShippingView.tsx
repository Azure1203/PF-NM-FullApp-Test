import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { PalletManager } from "./PalletManager";
import type { FileSummaryItem } from "./FileSidebar";

interface Props {
  orderId: number;
  allFiles: FileSummaryItem[];
}

export function ShippingView({ orderId, allFiles }: Props) {
  return (
    <div className="space-y-4 p-4">
      {allFiles.map((file) => (
        <div key={file.fileId} className="border rounded-lg p-4 space-y-3 bg-card">
          <h4 className="font-medium text-sm">{file.displayName}</h4>

          <div className="flex flex-wrap gap-2">
            <Link href={`/files/${file.fileId}/checklist`}>
              <Button variant="outline" size="sm" data-testid={`link-packing-${file.fileId}`}>
                Packing Checklist
              </Button>
            </Link>

            {file.hasHardware && (
              <Link href={`/files/${file.fileId}/hardware-checklist`}>
                <Button variant="outline" size="sm" data-testid={`link-hardware-checklist-${file.fileId}`}>
                  Hardware Checklist
                </Button>
              </Link>
            )}

            {file.hasCTS && (
              <Link href={`/files/${file.fileId}/cts`}>
                <Button variant="outline" size="sm" data-testid={`link-cts-${file.fileId}`}>
                  Cut-to-Size
                </Button>
              </Link>
            )}
          </div>
        </div>
      ))}

      <div className="border rounded-lg p-4 bg-card">
        <h4 className="font-medium text-sm mb-3">Pallets</h4>
        <PalletManager orderId={orderId} />
      </div>
    </div>
  );
}
