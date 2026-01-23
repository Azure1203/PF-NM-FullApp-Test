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
import { Input } from "@/components/ui/input";
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
  const [label4x2Width, setLabel4x2Width] = useState<string>("4");
  const [label4x2Height, setLabel4x2Height] = useState<string>("2");
  const [label4x6Width, setLabel4x6Width] = useState<string>("4");
  const [label4x6Height, setLabel4x6Height] = useState<string>("6");
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
      // Load label sizes
      setLabel4x2Width(String(config.label4x2Size.widthInches));
      setLabel4x2Height(String(config.label4x2Size.heightInches));
      setLabel4x6Width(String(config.label4x6Size.widthInches));
      setLabel4x6Height(String(config.label4x6Size.heightInches));
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
      label4x2Size: {
        widthInches: parseFloat(label4x2Width) || 4,
        heightInches: parseFloat(label4x2Height) || 2,
      },
      label4x6Size: {
        widthInches: parseFloat(label4x6Width) || 4,
        heightInches: parseFloat(label4x6Height) || 6,
      },
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
              <div className="space-y-4 p-3 bg-muted/50 rounded-lg">
                <div className="space-y-2">
                  <Label htmlFor="printer-4x2" className="font-medium">Small Labels (Project, Hardware, CTS)</Label>
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
                <div className="flex gap-3">
                  <div className="flex-1 space-y-1">
                    <Label htmlFor="label-4x2-width" className="text-xs text-muted-foreground">Width (inches)</Label>
                    <Input
                      id="label-4x2-width"
                      type="number"
                      step="0.1"
                      min="1"
                      max="10"
                      value={label4x2Width}
                      onChange={(e) => setLabel4x2Width(e.target.value)}
                      data-testid="input-label-4x2-width"
                    />
                  </div>
                  <div className="flex-1 space-y-1">
                    <Label htmlFor="label-4x2-height" className="text-xs text-muted-foreground">Height (inches)</Label>
                    <Input
                      id="label-4x2-height"
                      type="number"
                      step="0.1"
                      min="1"
                      max="10"
                      value={label4x2Height}
                      onChange={(e) => setLabel4x2Height(e.target.value)}
                      data-testid="input-label-4x2-height"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-4 p-3 bg-muted/50 rounded-lg">
                <div className="space-y-2">
                  <Label htmlFor="printer-4x6" className="font-medium">Large Labels (Pallet)</Label>
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
                <div className="flex gap-3">
                  <div className="flex-1 space-y-1">
                    <Label htmlFor="label-4x6-width" className="text-xs text-muted-foreground">Width (inches)</Label>
                    <Input
                      id="label-4x6-width"
                      type="number"
                      step="0.1"
                      min="1"
                      max="10"
                      value={label4x6Width}
                      onChange={(e) => setLabel4x6Width(e.target.value)}
                      data-testid="input-label-4x6-width"
                    />
                  </div>
                  <div className="flex-1 space-y-1">
                    <Label htmlFor="label-4x6-height" className="text-xs text-muted-foreground">Height (inches)</Label>
                    <Input
                      id="label-4x6-height"
                      type="number"
                      step="0.1"
                      min="1"
                      max="10"
                      value={label4x6Height}
                      onChange={(e) => setLabel4x6Height(e.target.value)}
                      data-testid="input-label-4x6-height"
                    />
                  </div>
                </div>
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
