import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Printer, RefreshCw, Settings } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  getZebraPrinters,
  getPrinterConfig,
  savePrinterConfig,
  type ZebraPrinter,
} from "@/lib/zebra";

export function PrinterSettings() {
  const [open, setOpen] = useState(false);
  const [printers, setPrinters] = useState<ZebraPrinter[]>([]);
  const [loading, setLoading] = useState(false);
  const [printer4x2, setPrinter4x2] = useState<string>("");
  const [printer4x6, setPrinter4x6] = useState<string>("");
  const { toast } = useToast();

  const loadPrinters = async () => {
    setLoading(true);
    try {
      const availablePrinters = await getZebraPrinters();
      setPrinters(availablePrinters);
      
      const config = getPrinterConfig();
      if (config.printer4x2Uid) {
        setPrinter4x2(config.printer4x2Uid);
      } else if (availablePrinters.length > 0) {
        setPrinter4x2(availablePrinters[0].uid);
      }
      if (config.printer4x6Uid) {
        setPrinter4x6(config.printer4x6Uid);
      } else if (availablePrinters.length > 0) {
        setPrinter4x6(availablePrinters[0].uid);
      }
    } catch (error) {
      toast({
        title: "Cannot connect to Zebra Browser Print",
        description: "Make sure Browser Print is running on your computer.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      loadPrinters();
    }
  }, [open]);

  const handleSave = () => {
    savePrinterConfig({
      printer4x2Uid: printer4x2 || null,
      printer4x6Uid: printer4x6 || null,
    });
    toast({
      title: "Printer settings saved",
      description: "Your printer preferences have been saved for this computer.",
    });
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" data-testid="button-printer-settings">
          <Printer className="h-4 w-4 mr-2" />
          Printer Settings
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Zebra Printer Settings
          </DialogTitle>
          <DialogDescription>
            Configure which printer to use for each label size. Settings are saved per computer.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              {printers.length} printer{printers.length !== 1 ? "s" : ""} found
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={loadPrinters}
              disabled={loading}
              data-testid="button-refresh-printers"
            >
              <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>

          {printers.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground">
              <Printer className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>No Zebra printers found</p>
              <p className="text-sm">Make sure Zebra Browser Print is running</p>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="printer-4x2">4x2 Labels (Project, Hardware, CTS)</Label>
                <Select value={printer4x2} onValueChange={setPrinter4x2}>
                  <SelectTrigger id="printer-4x2" data-testid="select-printer-4x2">
                    <SelectValue placeholder="Select a printer" />
                  </SelectTrigger>
                  <SelectContent>
                    {printers.map((p) => (
                      <SelectItem key={p.uid} value={p.uid}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="printer-4x6">4x6 Labels (Pallet)</Label>
                <Select value={printer4x6} onValueChange={setPrinter4x6}>
                  <SelectTrigger id="printer-4x6" data-testid="select-printer-4x6">
                    <SelectValue placeholder="Select a printer" />
                  </SelectTrigger>
                  <SelectContent>
                    {printers.map((p) => (
                      <SelectItem key={p.uid} value={p.uid}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)} data-testid="button-cancel-printer-settings">
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={printers.length === 0} data-testid="button-save-printer-settings">
            Save Settings
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
