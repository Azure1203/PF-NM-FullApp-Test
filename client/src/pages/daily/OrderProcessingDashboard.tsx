import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle,
  CardDescription
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { 
  Loader2, 
  Upload, 
  CheckCircle2, 
  AlertCircle, 
  FileText, 
  ArrowRight,
  Download,
  Share2,
  Mail,
  RefreshCw,
  RotateCcw,
  Sheet
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";

interface ProcessedItem {
  SKU: string;
  NAME: string;
  Qty: string | number;
  Width: string | number;
  Height: string | number;
  price: number;
  error?: string;
}

interface ProcessedOrder {
  id: number;
  name: string;
  totalPrice: number;
  ordExport: string;
  items: ProcessedItem[];
}

function formatSyncTime(ts: string | null | undefined): string {
  if (!ts) return "Never synced";
  const d = new Date(ts);
  return d.toLocaleString();
}

export default function OrderProcessingDashboard() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [processedOrder, setProcessedOrder] = useState<ProcessedOrder | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const { data: agentmailStatus } = useQuery<any>({
    queryKey: ['/api/agentmail/status'],
    refetchInterval: 60_000,
  });

  const { data: outlookStatus } = useQuery<any>({
    queryKey: ['/api/outlook/status'],
    refetchInterval: 60_000,
  });

  const { data: backupStatus } = useQuery<any>({
    queryKey: ['/api/backup/status'],
    refetchInterval: 60_000,
  });

  const agentmailFetchMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/agentmail/fetch", {});
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "AgentMail Fetch Complete",
        description: `Processed: ${data.processed ?? 0}, Matched: ${data.matched ?? 0}`,
      });
    },
    onError: (e: Error) => toast({ title: "AgentMail Fetch Failed", description: e.message, variant: "destructive" }),
  });

  const agentmailClearMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/agentmail/clear", {});
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "AgentMail Reset", description: `Cleared ${data.cleared ?? 0} processed records. Emails will be reprocessed on next fetch.` });
    },
    onError: (e: Error) => toast({ title: "Reset Failed", description: e.message, variant: "destructive" }),
  });

  const outlookFetchMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/outlook/fetch", {});
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Outlook Fetch Complete",
        description: `Processed: ${data.processed ?? 0}, Matched: ${data.matched ?? 0}`,
      });
    },
    onError: (e: Error) => toast({ title: "Outlook Fetch Failed", description: e.message, variant: "destructive" }),
  });

  const backupMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/backup/google-sheets", {});
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Backup Complete", description: data.title || "Spreadsheet created successfully" });
      const url = data.url || data.spreadsheetUrl;
      if (url) window.open(url, '_blank');
    },
    onError: (e: Error) => toast({ title: "Backup Failed", description: e.message, variant: "destructive" }),
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("files", file);
      const res = await fetch("/api/orders/upload", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to process order");
      }
      return res.json();
    },
    onSuccess: (data) => {
      setProcessedOrder(data);
      toast({ 
        title: "Order Processed", 
        description: `Successfully analyzed ${data.name}. Ready for sync.` 
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Processing Failed",
        description: error.message,
        variant: "destructive",
      });
    },
    onSettled: () => setIsUploading(false)
  });

  const syncMutation = useMutation({
    mutationFn: async (orderId: number) => {
      const res = await apiRequest("POST", `/api/orders/${orderId}/sync`, {});
      return res.json();
    },
    onSuccess: () => {
      toast({ 
        title: "Asana Synced", 
        description: "Order has been successfully synced to the production board." 
      });
      
      if (processedOrder?.ordExport) {
        const blob = new Blob([processedOrder.ordExport], { type: "text/plain" });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${processedOrder.name}.ord`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Sync Failed",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setIsUploading(true);
      uploadMutation.mutate(acceptedFiles[0]);
    }
  }, [uploadMutation]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "text/csv": [".csv"] },
    multiple: false,
    disabled: isUploading
  });

  return (
    <TooltipProvider>
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Email Sync Controls */}
      <Card className="border border-slate-200">
        <CardHeader className="py-3 px-4 border-b">
          <CardTitle className="text-sm font-semibold flex items-center gap-2 text-muted-foreground uppercase tracking-wide">
            <Mail className="h-4 w-4" />
            Email Sync
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 flex flex-wrap items-center gap-4">
          {/* AgentMail controls */}
          <div className="flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="default"
                  size="sm"
                  className="gap-2"
                  disabled={agentmailFetchMutation.isPending}
                  onClick={() => agentmailFetchMutation.mutate()}
                  data-testid="button-fetch-agentmail"
                >
                  {agentmailFetchMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  Fetch AgentMail
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">Last sync: {formatSyncTime(agentmailStatus?.lastSuccessAt)}</p>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1"
                  disabled={agentmailClearMutation.isPending}
                  onClick={() => agentmailClearMutation.mutate()}
                  data-testid="button-reset-agentmail"
                >
                  {agentmailClearMutation.isPending ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <RotateCcw className="h-3 w-3" />
                  )}
                  Reset
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">Clear processed records so emails are reprocessed</p>
              </TooltipContent>
            </Tooltip>
          </div>

          <div className="h-6 w-px bg-slate-200" />

          {/* Outlook controls (secondary) */}
          <div className="flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 text-muted-foreground"
                  disabled={outlookFetchMutation.isPending}
                  onClick={() => outlookFetchMutation.mutate()}
                  data-testid="button-fetch-outlook"
                >
                  {outlookFetchMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  Fetch Outlook
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">Last sync: {formatSyncTime(outlookStatus?.lastSuccessAt)}</p>
              </TooltipContent>
            </Tooltip>
          </div>

          <div className="h-6 w-px bg-slate-200" />

          {/* Backup to Sheets */}
          <div className="flex flex-col gap-1">
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              disabled={backupMutation.isPending}
              onClick={() => backupMutation.mutate()}
              data-testid="button-backup-to-sheets"
            >
              {backupMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sheet className="h-4 w-4" />
              )}
              {backupMutation.isPending ? "Backing up..." : "Backup to Sheets"}
            </Button>
            {backupStatus?.nextRun && (
              <p className="text-xs text-muted-foreground pl-1">
                Next auto-backup: {new Date(backupStatus.nextRun).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Step 1: Upload */}
      {!processedOrder && (
        <div className="max-w-3xl mx-auto py-12">
          <Card className="border-2 border-dashed border-primary/20 bg-primary/5 hover:border-primary/40 transition-all cursor-pointer">
            <CardContent className="p-0">
              <div 
                {...getRootProps()} 
                className="flex flex-col items-center justify-center gap-6 py-20"
                data-testid="dropzone-order-csv"
              >
                <input {...getInputProps()} />
                <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                  {isUploading ? (
                    <Loader2 className="h-10 w-10 animate-spin" />
                  ) : (
                    <Upload className="h-10 w-10" />
                  )}
                </div>
                <div className="text-center space-y-2">
                  <h2 className="text-2xl font-bold tracking-tight">
                    {isUploading ? "Processing Order..." : "Drop Customer Order CSV Here"}
                  </h2>
                  <p className="text-muted-foreground">
                    e.g. L Litzsinger.csv or J Doe.csv
                  </p>
                </div>
                {!isUploading && (
                  <Button size="lg" className="rounded-full px-8 gap-2">
                    Browse Files <ArrowRight className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Step 2 & 3: Results */}
      {processedOrder && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          <div className="lg:col-span-3 space-y-6">
            <Card className="shadow-lg border-slate-200">
              <CardHeader className="flex flex-row items-center justify-between border-b bg-slate-50/50 py-4">
                <div className="space-y-1">
                  <CardTitle className="text-xl flex items-center gap-2">
                    <FileText className="h-5 w-5 text-primary" />
                    Order Preview: {processedOrder.name}
                  </CardTitle>
                  <CardDescription>Review item pricing and logic before syncing</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button
                    data-testid="button-view-order-detail"
                    variant="outline"
                    size="sm"
                    onClick={() => setLocation(`/orders/${processedOrder.id}`)}
                  >
                    View Order Detail
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setProcessedOrder(null)}>
                    Upload New
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[500px]">
                  <Table>
                    <TableHeader className="sticky top-0 bg-white z-10 shadow-sm">
                      <TableRow>
                        <TableHead className="font-bold">SKU</TableHead>
                        <TableHead className="font-bold">Description</TableHead>
                        <TableHead className="font-bold text-center">Qty</TableHead>
                        <TableHead className="font-bold text-center">Dimensions (W x H)</TableHead>
                        <TableHead className="font-bold text-right">Price</TableHead>
                        <TableHead className="font-bold text-center">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {processedOrder.items?.map((item, idx) => {
                        const hasError = item.price === 0 && item.error;
                        return (
                          <TableRow key={idx} className={cn(idx % 2 === 1 ? "bg-slate-50/30" : "bg-white")}>
                            <TableCell className="font-mono text-xs">{item.SKU}</TableCell>
                            <TableCell className="max-w-[200px] truncate">{item.NAME}</TableCell>
                            <TableCell className="text-center font-medium">{item.Qty}</TableCell>
                            <TableCell className="text-center text-muted-foreground whitespace-nowrap">
                              {item.Width} x {item.Height}
                            </TableCell>
                            <TableCell className="text-right font-bold text-primary">
                              ${item.price.toFixed(2)}
                            </TableCell>
                            <TableCell className="text-center">
                              {hasError ? (
                                <Badge variant="destructive" className="gap-1">
                                  <AlertCircle className="h-3 w-3" /> Error
                                </Badge>
                              ) : (
                                <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-emerald-200 gap-1">
                                  <CheckCircle2 className="h-3 w-3" /> Success
                                </Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-1">
            <div className="sticky top-24 space-y-6">
              <Card className="shadow-xl border-slate-200 overflow-hidden">
                <div className="bg-primary p-6 text-primary-foreground">
                  <p className="text-sm font-medium opacity-80 uppercase tracking-wider">Total Order Price</p>
                  <h3 className="text-4xl font-black mt-1">${processedOrder.totalPrice.toFixed(2)}</h3>
                </div>
                <CardContent className="p-6 space-y-6">
                  <div className="space-y-3">
                    <Button 
                      className="w-full h-14 text-lg font-bold gap-3 shadow-lg"
                      size="lg"
                      disabled={syncMutation.isPending}
                      onClick={() => syncMutation.mutate(processedOrder.id)}
                      data-testid="button-sync-and-download"
                    >
                      {syncMutation.isPending ? (
                        <Loader2 className="h-6 w-6 animate-spin" />
                      ) : (
                        <>
                          <Share2 className="h-6 w-6" />
                          Sync & Download
                        </>
                      )}
                    </Button>
                    <p className="text-xs text-center text-muted-foreground">
                      This will sync to Asana and download the Cabinet Vision .ORD file
                    </p>
                  </div>

                  <div className="pt-6 border-t space-y-4">
                    <h4 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Order Assets</h4>
                    <Button 
                      variant="outline" 
                      className="w-full justify-start gap-3 h-12"
                      onClick={() => {
                        const blob = new Blob([processedOrder.ordExport], { type: "text/plain" });
                        const url = window.URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = `${processedOrder.name}.ord`;
                        document.body.appendChild(a);
                        a.click();
                        window.URL.revokeObjectURL(url);
                        document.body.removeChild(a);
                      }}
                    >
                      <Download className="h-4 w-4" />
                      Download .ORD Only
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex gap-3">
                <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="text-xs text-amber-800 space-y-1">
                  <p className="font-bold">Heads up!</p>
                  <p>Check for items with "Error" status. Prices for those items are likely $0.00 because no pricing formula was found.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
    </TooltipProvider>
  );
}
