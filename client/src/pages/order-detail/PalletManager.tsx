import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Archive, Plus, Edit2, Trash2, ChevronDown, ChevronRight, Loader2, StickyNote, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { PALLET_SIZES, type PalletSize, type PalletPackagingStatus, type PalletPackagingMetric, defaultPackagingStatus } from "@shared/schema";

interface AssignmentInfo {
  id: number;
  fileId: number;
  hardwarePackaged: boolean;
  hardwarePackedBy: string | null;
  buyoutHardwareStatuses: string[];
}

interface PalletWithFiles {
  id: number;
  projectId: number;
  palletNumber: number;
  size: string;
  customSize: string | null;
  notes: string | null;
  packagingStatus: PalletPackagingStatus | null;
  hardwarePackaged: boolean | null;
  finalSize: string | null;
  createdAt: Date;
  fileIds: number[];
  assignments: AssignmentInfo[];
}

interface FileInfo {
  id: number;
  originalFilename: string;
  poNumber: string | null;
  allmoxyJobNumber: string | null;
}

interface Props {
  orderId: number;
}

export function PalletManager({ orderId }: Props) {
  const { toast } = useToast();
  const [expandedPallets, setExpandedPallets] = useState<Set<number>>(new Set());
  const [palletDialogOpen, setPalletDialogOpen] = useState(false);
  const [editingPallet, setEditingPallet] = useState<PalletWithFiles | null>(null);
  const [palletSize, setPalletSize] = useState<PalletSize>('34" Wide Cut to Size');
  const [palletCustomSize, setPalletCustomSize] = useState("");
  const [palletNotes, setPalletNotes] = useState("");
  const [palletFileIds, setPalletFileIds] = useState<number[]>([]);

  const palletsQueryKey = ["/api/orders", orderId, "pallets"];

  const { data: pallets = [], isLoading: isLoadingPallets } = useQuery<PalletWithFiles[]>({
    queryKey: palletsQueryKey,
    enabled: orderId > 0,
    refetchInterval: 60000,
  });

  const { data: preview } = useQuery<any>({
    queryKey: ["/api/orders", orderId, "preview"],
    enabled: orderId > 0,
  });

  const { data: projectData } = useQuery<any>({
    queryKey: ["/api/orders", orderId],
    queryFn: async () => {
      const res = await fetch(`/api/orders/${orderId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load project");
      return res.json();
    },
    enabled: orderId > 0,
  });
  const projectFiles: FileInfo[] = projectData?.files ?? [];

  const { mutate: createPallet, isPending: isCreatingPallet } = useMutation({
    mutationFn: (data: { size: string; customSize?: string; notes?: string; fileIds: number[] }) =>
      apiRequest("POST", `/api/orders/${orderId}/pallets`, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: palletsQueryKey }); toast({ title: "Pallet created" }); closePalletDialog(); },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const { mutate: updatePallet, isPending: isUpdatingPallet } = useMutation({
    mutationFn: ({ palletId, ...data }: { palletId: number; size?: string; customSize?: string; notes?: string; fileIds?: number[] }) =>
      apiRequest("PATCH", `/api/pallets/${palletId}`, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: palletsQueryKey }); toast({ title: "Pallet updated" }); closePalletDialog(); },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const { mutate: deletePallet } = useMutation({
    mutationFn: (palletId: number) => apiRequest("DELETE", `/api/pallets/${palletId}`, {}),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: palletsQueryKey }); toast({ title: "Pallet deleted" }); },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const { mutate: updatePackagingStatus } = useMutation({
    mutationFn: ({ palletId, packagingStatus }: { palletId: number; packagingStatus: PalletPackagingStatus }) =>
      apiRequest("PATCH", `/api/pallets/${palletId}/packaging-status`, { packagingStatus }),
    onMutate: async ({ palletId, packagingStatus }) => {
      await queryClient.cancelQueries({ queryKey: palletsQueryKey });
      const prev = queryClient.getQueryData<PalletWithFiles[]>(palletsQueryKey);
      queryClient.setQueryData<PalletWithFiles[]>(palletsQueryKey, old => old?.map(p => p.id === palletId ? { ...p, packagingStatus } : p));
      return { prev };
    },
    onError: (e: Error, _, ctx: any) => {
      if (ctx?.prev) queryClient.setQueryData(palletsQueryKey, ctx.prev);
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: palletsQueryKey }),
  });

  const togglePackagingMetric = (pallet: PalletWithFiles, metric: PalletPackagingMetric) => {
    const current = pallet.packagingStatus || defaultPackagingStatus;
    updatePackagingStatus({ palletId: pallet.id, packagingStatus: { ...current, [metric]: !current[metric] } });
  };

  const closePalletDialog = () => {
    setPalletDialogOpen(false);
    setEditingPallet(null);
    setPalletSize('34" Wide Cut to Size');
    setPalletCustomSize("");
    setPalletNotes("");
    setPalletFileIds([]);
  };

  const openAdd = () => {
    setEditingPallet(null);
    setPalletSize('34" Wide Cut to Size');
    setPalletCustomSize("");
    setPalletNotes("");
    setPalletFileIds([]);
    setPalletDialogOpen(true);
  };

  const openEdit = (pallet: PalletWithFiles) => {
    setEditingPallet(pallet);
    setPalletSize(pallet.size as PalletSize);
    setPalletCustomSize(pallet.customSize || "");
    setPalletNotes(pallet.notes || "");
    setPalletFileIds(pallet.fileIds);
    setPalletDialogOpen(true);
  };

  const handleSave = () => {
    const data = {
      size: palletSize,
      customSize: palletSize === "Custom" || palletSize === '34" Wide Cut to Size' ? palletCustomSize : undefined,
      notes: palletNotes || undefined,
      fileIds: palletFileIds,
    };
    if (editingPallet) updatePallet({ palletId: editingPallet.id, ...data });
    else createPallet(data);
  };

  const togglePalletExpanded = (id: number) => {
    setExpandedPallets(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const getSizeBadge = (pallet: PalletWithFiles) => {
    if (pallet.size === "Custom" && pallet.customSize) return pallet.customSize;
    if (pallet.size === '34" Wide Cut to Size' && pallet.customSize) return `34" Wide Cut to Size - ${pallet.customSize}`;
    return pallet.size;
  };

  const getFileLabel = (file: FileInfo) => {
    if (file.poNumber) {
      const m = file.poNumber.match(/\(([^)]+)\)/);
      return m ? m[1] : file.poNumber;
    }
    return file.originalFilename.replace(/\.csv$/i, "");
  };

  const getPreviewForFile = (fileId: number) => {
    const idx = projectFiles.findIndex(f => f.id === fileId);
    return idx >= 0 ? preview?.fileBreakdowns?.[idx] : undefined;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Archive className="w-5 h-5 text-primary" />
          <h3 className="font-semibold">
            {pallets.length === 1 && pallets[0].size === "Courier Package"
              ? "Courier Package"
              : `Pallets (${pallets.length})`}
          </h3>
        </div>
        <Button size="sm" onClick={openAdd} data-testid="button-add-pallet">
          <Plus className="w-4 h-4 mr-1" /> Add Pallet
        </Button>
      </div>

      {isLoadingPallets ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin mr-2 text-muted-foreground" />
          <span className="text-muted-foreground text-sm">Loading pallets...</span>
        </div>
      ) : pallets.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 gap-2 text-muted-foreground">
          <Archive className="w-12 h-12 opacity-30" />
          <p>No pallets created yet.</p>
          <p className="text-sm">Click "Add Pallet" to get started.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {pallets.map((pallet) => {
            const isExpanded = expandedPallets.has(pallet.id);
            const assignedFiles = projectFiles.filter(f => pallet.fileIds.includes(f.id));
            const previewFiles = assignedFiles.map(f => getPreviewForFile(f.id)).filter(Boolean);
            const palletWeight = previewFiles.reduce((s, f: any) => s + (f.weightLbs || 0), 0);
            const palletParts = previewFiles.reduce((s, f: any) => s + (f.coreParts || 0), 0);

            return (
              <div
                key={pallet.id}
                id={`pallet-${pallet.id}`}
                className="border rounded-lg overflow-hidden"
                data-testid={`pallet-card-${pallet.id}`}
              >
                <div
                  className="flex items-center justify-between p-3 bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => togglePalletExpanded(pallet.id)}
                >
                  <div className="flex items-center gap-3 flex-wrap">
                    {isExpanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">Pallet #{pallet.palletNumber}</span>
                        <Badge variant="outline">{getSizeBadge(pallet)}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {assignedFiles.length} order{assignedFiles.length !== 1 ? "s" : ""} · {palletParts} parts · {Math.round(palletWeight)} lbs
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <Button size="icon" variant="ghost" onClick={() => openEdit(pallet)} data-testid={`button-edit-pallet-${pallet.id}`}>
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="icon" variant="ghost" data-testid={`button-delete-pallet-${pallet.id}`}>
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Pallet #{pallet.palletNumber}?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This removes the pallet and its file assignments. Files will not be deleted.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => deletePallet(pallet.id)} className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>

                {pallet.notes && (
                  <div className="flex items-start gap-2 px-4 py-2 border-t border-l-4 border-l-[#CDAB4A] bg-amber-50 dark:bg-amber-950/30">
                    <StickyNote className="w-4 h-4 mt-0.5 shrink-0 text-[#CDAB4A]" />
                    <p className="text-sm text-amber-900 dark:text-amber-200">
                      <span className="font-bold">Notes: </span>{pallet.notes}
                    </p>
                  </div>
                )}

                {isExpanded && (
                  <div className="p-4 border-t space-y-4">
                    {assignedFiles.length === 0 ? (
                      <p className="text-sm text-muted-foreground italic">No files assigned to this pallet.</p>
                    ) : (
                      <>
                        <PackagingMetricsGrid pallet={pallet} previewFiles={previewFiles} onToggle={togglePackagingMetric} />

                        <div className="space-y-2">
                          <p className="text-sm font-medium text-muted-foreground">Orders on this pallet</p>
                          {assignedFiles.map(file => {
                            const fp = getPreviewForFile(file.id) as any;
                            return (
                              <div key={file.id} className="bg-muted/20 rounded-lg p-3">
                                <p className="font-medium text-sm">{fp?.name || getFileLabel(file)}</p>
                                {file.allmoxyJobNumber && (
                                  <p className="text-xs text-primary font-medium">Allmoxy Job #{file.allmoxyJobNumber}</p>
                                )}
                                {fp && (
                                  <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5 mt-2">
                                    {[
                                      { v: fp.coreParts, l: "Parts" },
                                      { v: fp.dovetails, l: "Dovetails" },
                                      { v: fp.assembledDrawers, l: "Assembled" },
                                      { v: fp.fivePieceDoors, l: "5-Piece" },
                                      { v: Math.round(fp.weightLbs), l: "lbs" },
                                      { v: fp.maxLength, l: "mm Max" },
                                    ].map(({ v, l }) => (
                                      <div key={l} className={`text-center p-1.5 rounded text-xs ${(v || 0) === 0 ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300" : "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300"}`}>
                                        <p className="font-bold text-sm">{v ?? 0}</p>
                                        <p className="opacity-70 text-[10px]">{l}</p>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={palletDialogOpen} onOpenChange={(open) => { if (!open) closePalletDialog(); }}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{editingPallet ? `Edit Pallet #${editingPallet.palletNumber}` : "Add New Pallet"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Pallet Size</Label>
              <Select value={palletSize} onValueChange={(v) => setPalletSize(v as PalletSize)}>
                <SelectTrigger data-testid="select-pallet-size">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PALLET_SIZES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {(palletSize === "Custom" || palletSize === '34" Wide Cut to Size') && (
              <div className="space-y-2">
                <Label>{palletSize === "Custom" ? "Custom Size" : "Actual Size"}</Label>
                <Input
                  value={palletCustomSize}
                  onChange={(e) => setPalletCustomSize(e.target.value)}
                  placeholder={palletSize === "Custom" ? "e.g. 48×40" : 'e.g. 34" × 48"'}
                  data-testid="input-pallet-custom-size"
                />
              </div>
            )}
            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Input
                value={palletNotes}
                onChange={(e) => setPalletNotes(e.target.value)}
                placeholder="Notes about this pallet"
                data-testid="input-pallet-notes"
              />
            </div>
            {projectFiles.length > 0 && (
              <div className="space-y-2">
                <Label>Assigned Files</Label>
                <div className="border rounded-md divide-y max-h-48 overflow-y-auto">
                  {projectFiles.map(file => (
                    <label key={file.id} className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-muted/50">
                      <Checkbox
                        checked={palletFileIds.includes(file.id)}
                        onCheckedChange={(checked) => {
                          setPalletFileIds(prev => checked ? [...prev, file.id] : prev.filter(id => id !== file.id));
                        }}
                        data-testid={`checkbox-pallet-file-${file.id}`}
                      />
                      <span className="text-sm">{getFileLabel(file)}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closePalletDialog}>Cancel</Button>
            <Button onClick={handleSave} disabled={isCreatingPallet || isUpdatingPallet} data-testid="button-save-pallet">
              {(isCreatingPallet || isUpdatingPallet) && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editingPallet ? "Save Changes" : "Create Pallet"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PackagingMetricsGrid({
  pallet,
  previewFiles,
  onToggle,
}: {
  pallet: PalletWithFiles;
  previewFiles: any[];
  onToggle: (pallet: PalletWithFiles, metric: PalletPackagingMetric) => void;
}) {
  const status = pallet.packagingStatus || defaultPackagingStatus;

  const metrics: { key: PalletPackagingMetric; value: number; label: string; infoOnly?: boolean }[] = [
    { key: "orders", value: previewFiles.length, label: "Orders" },
    { key: "parts", value: previewFiles.reduce((s: number, f: any) => s + (f.coreParts || 0), 0), label: "Parts Overall" },
    { key: "dovetails", value: previewFiles.reduce((s: number, f: any) => s + (f.dovetails || 0), 0), label: "Dovetails" },
    { key: "assembled", value: previewFiles.reduce((s: number, f: any) => s + (f.assembledDrawers || 0), 0), label: "Assembled Drawers" },
    { key: "fivePiece", value: previewFiles.reduce((s: number, f: any) => s + (f.fivePieceDoors || 0), 0), label: "5 Piece Shaker" },
    { key: "glassInserts", value: previewFiles.reduce((s: number, f: any) => s + (f.glassInserts || 0), 0), label: "Glass Inserts" },
    { key: "glassShelves", value: previewFiles.reduce((s: number, f: any) => s + (f.glassShelves || 0), 0), label: "Glass Shelves" },
    { key: "mjDoors", value: previewFiles.reduce((s: number, f: any) => s + (f.mjDoorsCount || 0), 0), label: "M&J Doors" },
    { key: "cts", value: previewFiles.reduce((s: number, f: any) => s + (f.ctsPartsCount || 0), 0), label: "Cut to Size" },
    { key: "weight", value: Math.round(previewFiles.reduce((s: number, f: any) => s + (f.weightLbs || 0), 0)), label: "lbs", infoOnly: true },
    { key: "maxLength", value: Math.max(0, ...previewFiles.map((f: any) => f.maxLength || 0)), label: "mm Max Length", infoOnly: true },
  ];

  return (
    <div>
      <p className="text-sm font-medium text-muted-foreground mb-2">Pallet Totals — Click When Packed</p>
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2">
        {metrics.map(({ key, value, label, infoOnly }) => {
          const isPackaged = status[key];
          const isNA = value === 0;
          const showGreen = isPackaged || isNA || infoOnly;
          return (
            <button
              key={key}
              onClick={() => !infoOnly && !isNA && onToggle(pallet, key)}
              className={`text-center p-2 rounded-md border-2 transition-colors ${infoOnly || isNA ? "cursor-default" : "cursor-pointer"} ${
                showGreen
                  ? "bg-green-100 dark:bg-green-900/30 border-green-500 text-green-700 dark:text-green-300"
                  : "bg-red-100 dark:bg-red-900/30 border-red-500 text-red-700 dark:text-red-300"
              }`}
              data-testid={`button-metric-${key}-${pallet.id}`}
              disabled={infoOnly}
            >
              <p className="text-xl font-bold">{value}</p>
              <p className="text-xs opacity-80">{label}</p>
              {!infoOnly && <p className="text-[10px] mt-0.5">{isNA ? "N/A" : isPackaged ? "✓ Packed" : "Click when packed"}</p>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
