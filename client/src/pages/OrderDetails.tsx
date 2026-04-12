import { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useOrder, useUpdateOrder, useSyncOrder, useDeleteOrder } from "@/hooks/use-orders";
import { useIsAdmin } from "@/hooks/use-admin";
import { api, type ProjectWithFiles } from "@shared/routes";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, ArrowLeft, RefreshCw, DollarSign, FileText, Package, Settings2, Trash2, ExternalLink, ChevronDown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { FileSidebar, type FileSummaryItem, type ShippingFileSummaryItem } from "./order-detail/FileSidebar";
import { DocumentsView } from "./order-detail/DocumentsView";
import { ShippingView } from "./order-detail/ShippingView";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";

type Section = "documents" | "shipping";

function fmtCurrency(v: number) {
  return `$${v.toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function OrderDetails() {
  const [, params] = useRoute("/orders/:id");
  const id = parseInt(params?.id || "0");
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [section, setSection] = useState<Section>("documents");
  const [selectedFileId, setSelectedFileId] = useState<number | null>(null);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [productionStatusOpen, setProductionStatusOpen] = useState(false);

  const orderQueryKey = [api.orders.get.path, id];

  const { data: project, isLoading } = useOrder(id) as { data: ProjectWithFiles | undefined; isLoading: boolean };
  const { mutate: syncProject, isPending: isSyncing } = useSyncOrder();
  const { mutate: deleteProject, isPending: isDeleting } = useDeleteOrder();
  const { data: adminStatus } = useIsAdmin();
  const isAdmin = adminStatus?.isAdmin === true;

  const { data: fileSummary = [] } = useQuery<FileSummaryItem[]>({
    queryKey: ["/api/orders", id, "file-summary"],
    enabled: id > 0,
    refetchInterval: 60000,
  });

  const { data: shippingSummary = [] } = useQuery<ShippingFileSummaryItem[]>({
    queryKey: ["/api/orders", id, "shipping-summary"],
    enabled: id > 0 && section === "shipping",
    refetchInterval: 30000,
  });

  const repriceMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/orders/${id}/reprice`);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders", id, "file-summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders", id, "items"] });
      toast({ title: "Pricing updated", description: `${data.items?.length ?? 0} items repriced` });
    },
    onError: (e: Error) => toast({ title: "Reprice failed", description: e.message, variant: "destructive" }),
  });

  const syncAsanaMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/orders/${id}/sync-asana-status`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: orderQueryKey });
      toast({ title: "Status synced from Asana" });
    },
    onError: (e: Error) => toast({ title: "Sync failed", description: e.message, variant: "destructive" }),
  });

  const regenerateChecklistsMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/orders/${id}/regenerate-checklists`);
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: orderQueryKey });
      toast({ title: "Checklists regenerated", description: `${data.totalHardwareItems ?? 0} hardware, ${data.totalPackingItems ?? 0} packing items` });
    },
    onError: (e: Error) => toast({ title: "Regenerate failed", description: e.message, variant: "destructive" }),
  });

  const updateProductionStatusMutation = useMutation({
    mutationFn: (pfProductionStatus: string[]) => apiRequest("PATCH", `/api/orders/${id}/production-status`, { pfProductionStatus }),
    onMutate: async (newStatus) => {
      await queryClient.cancelQueries({ queryKey: orderQueryKey });
      const prev = queryClient.getQueryData(orderQueryKey);
      queryClient.setQueryData(orderQueryKey, (old: any) => old ? { ...old, pfProductionStatus: newStatus } : old);
      return { prev };
    },
    onError: (e: Error, _, ctx: any) => {
      if (ctx?.prev) queryClient.setQueryData(orderQueryKey, ctx.prev);
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: orderQueryKey }),
  });

  useEffect(() => {
    if (fileSummary.length > 0 && selectedFileId === null) {
      setSelectedFileId(fileSummary[0].fileId);
    }
  }, [fileSummary, selectedFileId]);

  const selectedFileSummary = fileSummary.find(f => f.fileId === selectedFileId) ?? null;
  const effectiveFileId = selectedFileId ?? fileSummary[0]?.fileId ?? 0;

  const totalPrice = fileSummary.reduce((s, f) => s + f.subtotal, 0);

  const PRODUCTION_STATUS_OPTIONS = [
    "SENT TO SHOP",
    "CNC DONE",
    "CTS PARTS DONE",
    "5 PIECE DONE",
    "GLASS DONE",
    "HARDWARE PACKAGED",
    "READY TO SHIP",
    "SHIPPED",
  ];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-2 text-muted-foreground">
        <p>Order not found.</p>
        <Button variant="link" onClick={() => setLocation("/orders")}>← Back to orders</Button>
      </div>
    );
  }

  const multiFile = fileSummary.length > 1;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* ─── Project Header Bar ─── */}
      <div className="sticky top-0 z-20 bg-background border-b shadow-sm">
        <div className="flex items-center gap-2 px-4 py-2.5 flex-wrap">
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0 h-8 w-8"
            onClick={() => setLocation("/orders")}
            data-testid="button-back"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="font-semibold text-base truncate" data-testid="text-project-name">
                {project.name || "Untitled Order"}
              </h1>
              {project.status && <StatusBadge status={project.status} />}
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5 flex-wrap">
              {project.dealer && <span data-testid="text-dealer">{project.dealer}</span>}
              <span>{fileSummary.length} file{fileSummary.length !== 1 ? "s" : ""}</span>
              {totalPrice > 0 && (
                <span className="font-medium text-foreground" data-testid="text-total-price">
                  {fmtCurrency(totalPrice)}
                </span>
              )}
              {project.date && <span>{new Date(project.date).toLocaleDateString("en-CA")}</span>}
            </div>
          </div>

          {/* Section Toggle */}
          <div className="flex items-center gap-0.5 rounded-md border p-0.5 bg-muted/50">
            <Button
              size="sm"
              variant={section === "documents" ? "default" : "ghost"}
              className="h-7 text-xs gap-1.5"
              onClick={() => setSection("documents")}
              data-testid="button-section-documents"
            >
              <FileText className="w-3.5 h-3.5" />
              Documents
            </Button>
            <Button
              size="sm"
              variant={section === "shipping" ? "default" : "ghost"}
              className="h-7 text-xs gap-1.5"
              onClick={() => setSection("shipping")}
              data-testid="button-section-shipping"
            >
              <Package className="w-3.5 h-3.5" />
              Packing & Shipping
            </Button>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs gap-1.5"
              onClick={() => repriceMutation.mutate()}
              disabled={repriceMutation.isPending}
              data-testid="button-reprice"
            >
              {repriceMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <DollarSign className="w-3.5 h-3.5" />}
              Re-price
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" className="h-8 w-8 p-0" data-testid="button-more-actions">
                  <Settings2 className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem onClick={() => setDetailsDialogOpen(true)}>
                  Project Details
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setProductionStatusOpen(true)}>
                  Production Status
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {project.asanaTaskId && (
                  <DropdownMenuItem onClick={() => syncAsanaMutation.mutate()} disabled={syncAsanaMutation.isPending}>
                    {syncAsanaMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                    Sync Asana Status
                  </DropdownMenuItem>
                )}
                {project.asanaTaskId && (
                  <DropdownMenuItem asChild>
                    <a href={`https://app.asana.com/0/0/${project.asanaTaskId}`} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="w-4 h-4 mr-2" />
                      Open in Asana
                    </a>
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => regenerateChecklistsMutation.mutate()} disabled={regenerateChecklistsMutation.isPending}>
                  Regenerate Checklists
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {isAdmin && (
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => {
                      if (confirm(`Delete "${project.name}"? This cannot be undone.`)) {
                        deleteProject(id, { onSuccess: () => setLocation("/orders") });
                      }
                    }}
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete Order
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* ─── Body ─── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* File Sidebar — only when multiple files */}
        {multiFile && (
          <div className="w-56 shrink-0 border-r overflow-y-auto px-2 bg-muted/20">
            <FileSidebar
              mode={section}
              files={fileSummary}
              shippingFiles={section === "shipping" ? shippingSummary : undefined}
              selectedFileId={selectedFileId}
              onSelectFile={setSelectedFileId}
            />
          </div>
        )}

        {/* Main Content */}
        <div className="flex-1 min-w-0 overflow-y-auto p-4">
          {effectiveFileId > 0 ? (
            section === "documents" ? (
              <DocumentsView
                orderId={id}
                fileId={effectiveFileId}
                fileSummary={selectedFileSummary}
              />
            ) : (
              <ShippingView
                orderId={id}
                fileId={effectiveFileId}
                fileSummary={selectedFileSummary}
              />
            )
          ) : (
            <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-2">
              <FileText className="w-10 h-10 opacity-30" />
              <p>No files uploaded yet.</p>
            </div>
          )}
        </div>
      </div>

      {/* ─── Project Details Dialog ─── */}
      <ProjectDetailsDialog
        project={project}
        open={detailsDialogOpen}
        onClose={() => setDetailsDialogOpen(false)}
        orderId={id}
        orderQueryKey={orderQueryKey}
      />

      {/* ─── Production Status Dialog ─── */}
      <ProductionStatusDialog
        open={productionStatusOpen}
        onClose={() => setProductionStatusOpen(false)}
        options={PRODUCTION_STATUS_OPTIONS}
        current={project.pfProductionStatus || []}
        onToggle={(option, checked) => {
          const current = project.pfProductionStatus || [];
          const next = checked ? [...current, option] : current.filter(s => s !== option);
          updateProductionStatusMutation.mutate(next);
        }}
      />
    </div>
  );
}

// ─── Project Details Dialog ───────────────────────────────────────────
function ProjectDetailsDialog({
  project,
  open,
  onClose,
  orderId,
  orderQueryKey,
}: {
  project: ProjectWithFiles;
  open: boolean;
  onClose: () => void;
  orderId: number;
  orderQueryKey: any[];
}) {
  const { toast } = useToast();
  const { mutate: updateProject, isPending: isUpdating } = useUpdateOrder();
  const [form, setForm] = useState({
    name: project.name || "",
    date: project.date || "",
    dealer: project.dealer || "",
    shippingAddress: project.shippingAddress || "",
    phone: project.phone || "",
    taxId: project.taxId || "",
    orderId: project.orderId || "",
    powerTailgate: project.powerTailgate || false,
    phoneAppointment: project.phoneAppointment || false,
  });

  useEffect(() => {
    if (open) {
      setForm({
        name: project.name || "",
        date: project.date || "",
        dealer: project.dealer || "",
        shippingAddress: project.shippingAddress || "",
        phone: project.phone || "",
        taxId: project.taxId || "",
        orderId: project.orderId || "",
        powerTailgate: project.powerTailgate || false,
        phoneAppointment: project.phoneAppointment || false,
      });
    }
  }, [open, project]);

  const handleSave = () => {
    updateProject({ id: orderId, ...form }, {
      onSuccess: () => onClose(),
    });
  };

  const fields: { key: keyof typeof form; label: string; type?: string }[] = [
    { key: "name", label: "Project Name" },
    { key: "date", label: "Date", type: "date" },
    { key: "dealer", label: "Dealer" },
    { key: "shippingAddress", label: "Shipping Address" },
    { key: "phone", label: "Phone" },
    { key: "taxId", label: "Tax ID" },
    { key: "orderId", label: "Order ID" },
  ];

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader><DialogTitle>Project Details</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2 max-h-[60vh] overflow-y-auto">
          {fields.map(({ key, label, type }) => (
            <div key={key} className="space-y-1">
              <Label>{label}</Label>
              <Input
                type={type ?? "text"}
                value={String(form[key] ?? "")}
                onChange={(e) => setForm(prev => ({ ...prev, [key]: e.target.value }))}
                data-testid={`input-${key}`}
              />
            </div>
          ))}
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                checked={form.powerTailgate}
                onCheckedChange={(c) => setForm(prev => ({ ...prev, powerTailgate: !!c }))}
                data-testid="checkbox-power-tailgate"
              />
              <span className="text-sm">Power Tailgate</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                checked={form.phoneAppointment}
                onCheckedChange={(c) => setForm(prev => ({ ...prev, phoneAppointment: !!c }))}
                data-testid="checkbox-phone-appointment"
              />
              <span className="text-sm">Phone Appointment</span>
            </label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={isUpdating} data-testid="button-save-project">
            {isUpdating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Production Status Dialog ─────────────────────────────────────────
function ProductionStatusDialog({
  open,
  onClose,
  options,
  current,
  onToggle,
}: {
  open: boolean;
  onClose: () => void;
  options: string[];
  current: string[];
  onToggle: (option: string, checked: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>Production Status</DialogTitle></DialogHeader>
        <div className="space-y-2 py-2">
          {options.map(option => (
            <label key={option} className="flex items-center gap-3 cursor-pointer p-2 rounded-md hover:bg-muted/50">
              <Checkbox
                checked={current.includes(option)}
                onCheckedChange={(c) => onToggle(option, !!c)}
                data-testid={`checkbox-status-${option.toLowerCase().replace(/\s+/g, "-")}`}
              />
              <span className="text-sm">{option}</span>
            </label>
          ))}
        </div>
        <DialogFooter>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
