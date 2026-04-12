import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PackingChecklistInline } from "./PackingChecklistInline";
import { HardwareChecklistInline } from "./HardwareChecklistInline";
import { CtsPartsInline } from "./CtsPartsInline";
import { PalletManager } from "./PalletManager";
import type { FileSummaryItem } from "./FileSidebar";

interface Props {
  orderId: number;
  fileId: number;
  fileSummary: FileSummaryItem | null;
}

export function ShippingView({ orderId, fileId, fileSummary }: Props) {
  const [activeTab, setActiveTab] = useState("packing");

  const hasHardware = fileSummary?.hasHardware ?? false;
  const hasCTS = fileSummary?.hasCTS ?? false;

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
      <div className="overflow-x-auto">
        <TabsList className="flex h-9 w-max gap-0.5">
          <TabsTrigger value="packing" className="text-xs px-2.5 py-1 h-8 whitespace-nowrap" data-testid="tab-packing">
            Packing Checklist
          </TabsTrigger>
          {hasHardware && (
            <TabsTrigger value="hardware" className="text-xs px-2.5 py-1 h-8 whitespace-nowrap" data-testid="tab-hardware">
              Hardware Checklist
            </TabsTrigger>
          )}
          {hasCTS && (
            <TabsTrigger value="cts" className="text-xs px-2.5 py-1 h-8 whitespace-nowrap" data-testid="tab-cts">
              Cut-to-Size
            </TabsTrigger>
          )}
          <TabsTrigger value="pallets" className="text-xs px-2.5 py-1 h-8 whitespace-nowrap" data-testid="tab-pallets">
            Pallets
          </TabsTrigger>
        </TabsList>
      </div>

      <div className="mt-4">
        <TabsContent value="packing" className="mt-0">
          <PackingChecklistInline fileId={fileId} />
        </TabsContent>

        {hasHardware && (
          <TabsContent value="hardware" className="mt-0">
            <HardwareChecklistInline fileId={fileId} projectId={orderId} />
          </TabsContent>
        )}

        {hasCTS && (
          <TabsContent value="cts" className="mt-0">
            <CtsPartsInline fileId={fileId} />
          </TabsContent>
        )}

        <TabsContent value="pallets" className="mt-0">
          <PalletManager orderId={orderId} />
        </TabsContent>
      </div>
    </Tabs>
  );
}
