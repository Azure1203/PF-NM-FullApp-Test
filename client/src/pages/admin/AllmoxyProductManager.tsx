import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Save, Trash2, Search, Package, ChevronRight, Upload, Link2, CheckSquare, CheckCircle2 } from "lucide-react";
import type { AllmoxyProduct, ProxyVariable, AttributeGrid, ProductGridBinding } from "@shared/schema";
import { EXPORT_TYPE_OPTIONS, SUPPLY_TYPE_OPTIONS, type ExportType } from "@shared/schema";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";

const productSchema = z.object({
  id: z.number().optional(),
  name: z.string().min(1, "Name is required"),
  status: z.enum(["active", "inactive"]),
  pricingProxyId: z.number().nullable(),
  exportProxyId: z.number().nullable(),
  skuPrefix: z.string().nullable(),
  description: z.string().nullable(),
  notes: z.string().nullable(),
  exportType: z.string().default('ORD'),
  supplyType: z.string().nullable().default('STOCK'),
});

const EXPORT_TYPE_COLORS: Record<string, string> = {
  ORD: 'bg-blue-100 text-blue-700',
  HARDWARE: 'bg-gray-100 text-gray-700',
  ELIAS: 'bg-green-100 text-green-700',
  MJ: 'bg-purple-100 text-purple-700',
  CTS: 'bg-orange-100 text-orange-700',
  GLASS: 'bg-cyan-100 text-cyan-700',
};

type ProductFormValues = z.infer<typeof productSchema>;

type LocalBinding = {
  gridId: number | null;
  alias: string;
  lookupColumn: string;
};

export default function AllmoxyProductManager() {
  const { toast } = useToast();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importResult, setImportResult] = useState<{ categoryName: string; productsInserted: number; bindingsCreated: number } | null>(null);
  const [importPricingProxyId, setImportPricingProxyId] = useState<string>("none");
  const [importExportProxyId, setImportExportProxyId] = useState<string>("none");
  const [importGridId, setImportGridId] = useState<string>("none");
  const [importAlias, setImportAlias] = useState("");
  const [importLookupColumn, setImportLookupColumn] = useState("MANU_CODE");
  const [bindings, setBindings] = useState<LocalBinding[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [selectMode, setSelectMode] = useState(false);

  const form = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      name: "",
      status: "active",
      pricingProxyId: null,
      exportProxyId: null,
      skuPrefix: null,
      description: null,
      notes: null,
      exportType: "ORD",
      supplyType: "STOCK",
    },
  });

  const { data: products, isLoading: isLoadingProducts } = useQuery<AllmoxyProduct[]>({
    queryKey: ["/api/admin/allmoxy-products"],
  });

  const { data: proxyVars } = useQuery<ProxyVariable[]>({
    queryKey: ["/api/admin/proxy-variables"],
  });

  const { data: attributeGrids } = useQuery<AttributeGrid[]>({
    queryKey: ["/api/admin/attribute-grids"],
  });

  const { data: fetchedBindings } = useQuery<ProductGridBinding[]>({
    queryKey: ["/api/admin/allmoxy-products", editingId, "grid-bindings"],
    queryFn: async () => {
      const res = await fetch(`/api/admin/allmoxy-products/${editingId}/grid-bindings`);
      if (!res.ok) throw new Error("Failed to fetch bindings");
      return res.json();
    },
    enabled: editingId !== null,
  });

  useEffect(() => {
    if (fetchedBindings) {
      setBindings(fetchedBindings.map(b => ({
        gridId: b.gridId,
        alias: b.alias,
        lookupColumn: b.lookupColumn,
      })));
    }
  }, [fetchedBindings]);

  const filteredProducts = useMemo(() => {
    if (!products) return [];
    return products.filter(p =>
      p.name.toLowerCase().includes(search.toLowerCase())
    );
  }, [products, search]);

  const pricingProxies = proxyVars?.filter((v) => v.type === "pricing") ?? [];
  const exportProxies = proxyVars?.filter((v) => v.type === "export") ?? [];

  const saveMutation = useMutation({
    mutationFn: async (values: ProductFormValues) => {
      const res = await apiRequest("POST", "/api/admin/allmoxy-products", values);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/allmoxy-products"] });
      toast({ title: "Success", description: "Product saved" });
      if (!editingId) {
        setEditingId(data.id);
      }
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/admin/allmoxy-products/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/allmoxy-products"] });
      toast({ title: "Deleted", description: "Product removed" });
      handleNew();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const saveBindingsMutation = useMutation({
    mutationFn: async () => {
      const validBindings = bindings.filter(b => b.gridId !== null);
      const res = await apiRequest("POST", `/api/admin/allmoxy-products/${editingId}/grid-bindings`, {
        bindings: validBindings,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/allmoxy-products", editingId, "grid-bindings"] });
      toast({ title: "Grid bindings saved" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      await Promise.all(ids.map(id =>
        apiRequest("DELETE", `/api/admin/allmoxy-products/${id}`)
      ));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/allmoxy-products"] });
      setSelectedIds(new Set());
      setSelectMode(false);
      setEditingId(null);
      toast({ title: "Deleted", description: `${selectedIds.size} products deleted` });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleImport = async () => {
    if (!importFile) return;
    setImportLoading(true);
    setImportResult(null);
    try {
      const formData = new FormData();
      formData.append("file", importFile);
      if (importPricingProxyId !== "none") formData.append("pricingProxyId", importPricingProxyId);
      if (importExportProxyId !== "none") formData.append("exportProxyId", importExportProxyId);
      if (importGridId !== "none") formData.append("gridId", importGridId);
      if (importAlias.trim()) formData.append("alias", importAlias.trim());
      if (importLookupColumn.trim()) formData.append("lookupColumn", importLookupColumn.trim());
      const res = await fetch("/api/admin/allmoxy-products/import-csv", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Import failed" }));
        throw new Error(err.message ?? "Import failed");
      }
      const data = await res.json();
      setImportResult(data);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/allmoxy-products"] });
    } catch (e: any) {
      toast({ title: "Import error", description: e.message, variant: "destructive" });
    } finally {
      setImportLoading(false);
    }
  };

  const handleEdit = (product: AllmoxyProduct) => {
    setEditingId(product.id);
    setBindings([]);
    form.reset({
      id: product.id,
      name: product.name,
      status: (product.status as "active" | "inactive") ?? "active",
      pricingProxyId: product.pricingProxyId ?? null,
      exportProxyId: product.exportProxyId ?? null,
      skuPrefix: product.skuPrefix ?? null,
      description: product.description ?? null,
      notes: product.notes ?? null,
      exportType: product.exportType ?? "ORD",
      supplyType: product.supplyType ?? "STOCK",
    });
  };

  const handleNew = () => {
    setEditingId(null);
    setBindings([]);
    form.reset({
      name: "",
      status: "active",
      pricingProxyId: null,
      exportProxyId: null,
      skuPrefix: null,
      description: null,
      notes: null,
      exportType: "ORD",
      supplyType: "STOCK",
    });
  };

  const onSubmit = (values: ProductFormValues) => {
    saveMutation.mutate(values);
  };

  const updateBinding = (index: number, patch: Partial<LocalBinding>) => {
    setBindings(prev => prev.map((b, i) => i === index ? { ...b, ...patch } : b));
  };

  const removeBinding = (index: number) => {
    setBindings(prev => prev.filter((_, i) => i !== index));
  };

  const addBinding = () => {
    setBindings(prev => [...prev, { gridId: null, alias: "", lookupColumn: "" }]);
  };

  return (
    <div className="h-[calc(100vh-120px)] border rounded-lg bg-card overflow-hidden">
      <ResizablePanelGroup direction="horizontal">
        <ResizablePanel defaultSize={30} minSize={20}>
          <div className="h-full flex flex-col border-r">
            <div className="p-4 space-y-4 border-b">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold flex items-center gap-2">
                  <Package className="h-4 w-4" />
                  Products
                </h2>
                <div className="flex gap-1 items-center flex-wrap">
                  {!selectMode ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectMode(true)}
                    >
                      <CheckSquare className="h-4 w-4 mr-2" />
                      Select
                    </Button>
                  ) : (
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          if (selectedIds.size === (products?.length ?? 0)) {
                            setSelectedIds(new Set());
                          } else {
                            setSelectedIds(new Set(products?.map((p: any) => p.id) ?? []));
                          }
                        }}
                      >
                        {selectedIds.size === (products?.length ?? 0) ? 'Deselect All' : 'Select All'}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectMode(false);
                          setSelectedIds(new Set());
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  )}

                  {selectMode && selectedIds.size > 0 && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="destructive" size="sm">
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete {selectedIds.size}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete {selectedIds.size} products?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will permanently delete {selectedIds.size} selected product{selectedIds.size !== 1 ? 's' : ''} and all their grid bindings. This cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={() => bulkDeleteMutation.mutate(Array.from(selectedIds))}
                          >
                            {bulkDeleteMutation.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            ) : null}
                            Delete {selectedIds.size} products
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}

                  <Button
                    size="icon"
                    variant="ghost"
                    title="Import Products CSV"
                    data-testid="button-import-csv"
                    onClick={() => { setImportModalOpen(true); setImportFile(null); setImportResult(null); }}
                  >
                    <Upload className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={handleNew} title="New Product">
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search products..."
                  className="pl-8"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-2 space-y-1">
                {isLoadingProducts ? (
                  <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
                ) : filteredProducts.map((p) => (
                  <div
                    key={p.id}
                    data-testid={`product-row-${p.id}`}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2 cursor-pointer rounded-md transition-colors",
                      selectMode
                        ? selectedIds.has(p.id)
                          ? "bg-primary/10 border border-primary/30"
                          : "hover:bg-muted/50"
                        : editingId === p.id
                          ? "bg-primary text-primary-foreground"
                          : "hover:bg-accent"
                    )}
                    onClick={() => {
                      if (selectMode) {
                        setSelectedIds(prev => {
                          const next = new Set(prev);
                          if (next.has(p.id)) next.delete(p.id);
                          else next.add(p.id);
                          return next;
                        });
                      } else {
                        handleEdit(p);
                      }
                    }}
                  >
                    {selectMode && (
                      <input
                        type="checkbox"
                        checked={selectedIds.has(p.id)}
                        onChange={() => {}}
                        className="h-4 w-4 rounded border-gray-300 accent-primary shrink-0"
                      />
                    )}
                    {p.imagePath ? (
                      <img
                        src={p.imagePath.startsWith('product-images/') ? `/api/product-images/${encodeURIComponent(p.imagePath.replace('product-images/', ''))}` : p.imagePath}
                        alt={p.name}
                        className="w-8 h-8 object-cover rounded border shrink-0"
                        onError={(e) => { e.currentTarget.style.display = 'none'; }}
                      />
                    ) : (
                      <Package className="w-8 h-8 text-muted-foreground/30 shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">{p.name}</span>
                        <span className={cn(
                          "text-[10px] uppercase px-1.5 py-0.5 rounded-full font-bold",
                          p.status === "active"
                            ? (editingId === p.id && !selectMode ? "bg-primary-foreground/20 text-white" : "bg-green-100 text-green-700")
                            : (editingId === p.id && !selectMode ? "bg-primary-foreground/10 text-white/70" : "bg-muted text-muted-foreground")
                        )}>
                          {p.status}
                        </span>
                      </div>
                      {p.skuPrefix && (
                        <div className="flex items-center gap-1 mt-0.5">
                          <span className={cn(
                            "text-[10px] font-mono",
                            editingId === p.id && !selectMode ? "text-primary-foreground/70" : "text-muted-foreground"
                          )}>
                            {p.skuPrefix}
                          </span>
                          {p.exportType && p.exportType !== 'NONE' && (
                            <span
                              data-testid={`badge-export-type-${p.id}`}
                              className={cn(
                                "text-[9px] uppercase px-1 py-0.5 rounded font-bold shrink-0",
                                editingId === p.id && !selectMode
                                  ? "bg-primary-foreground/20 text-white"
                                  : EXPORT_TYPE_COLORS[p.exportType] || 'bg-muted text-muted-foreground'
                              )}
                            >
                              {p.exportType}
                            </span>
                          )}
                          {p.supplyType === 'BUYOUT' && (
                            <Badge
                              variant="outline"
                              data-testid={`badge-supply-type-${p.id}`}
                              className={cn(
                                "text-[10px] px-1 py-0 h-4 shrink-0",
                                editingId === p.id && !selectMode
                                  ? "border-amber-300 text-amber-200"
                                  : "border-amber-400 text-amber-600"
                              )}
                            >
                              Buyout
                            </Badge>
                          )}
                        </div>
                      )}
                    </div>
                    {!selectMode && (
                      <ChevronRight className={cn(
                        "h-4 w-4 shrink-0 transition-transform",
                        editingId === p.id ? "translate-x-0" : "-translate-x-2 opacity-0"
                      )} />
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle />

        <ResizablePanel defaultSize={70}>
          <div className="h-full flex flex-col bg-background">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="h-full flex flex-col">
                <ScrollArea className="flex-1">
                  <div className="p-6 space-y-8">
                    {editingId && (() => {
                      const currentProduct = products?.find(p => p.id === editingId);
                      if (!currentProduct) return null;
                      if (!currentProduct.imagePath) {
                        return (
                          <div className="flex justify-center">
                            <Package className="w-16 h-16 text-muted-foreground/20" />
                          </div>
                        );
                      }
                      const imgSrc = currentProduct.imagePath.startsWith('product-images/')
                        ? `/api/product-images/${encodeURIComponent(currentProduct.imagePath.replace('product-images/', ''))}`
                        : currentProduct.imagePath;
                      return (
                        <div className="flex justify-center">
                          <img
                            src={imgSrc}
                            alt={currentProduct.name}
                            className="w-16 h-16 object-cover rounded-lg border shadow-sm"
                            onError={(e) => { e.currentTarget.style.display = 'none'; }}
                            data-testid="img-product-edit-thumbnail"
                          />
                        </div>
                      );
                    })()}
                    {/* Basic Information */}
                    <div className="space-y-4">
                      <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground border-b pb-2">Basic Information</h3>
                      <div className="grid grid-cols-2 gap-6">
                        <FormField
                          control={form.control}
                          name="name"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Product Name</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="e.g. Slab Door" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="status"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Status</FormLabel>
                              <Select onValueChange={field.onChange} value={field.value}>
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="active">Active</SelectItem>
                                  <SelectItem value="inactive">Discontinued</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <FormField
                        control={form.control}
                        name="skuPrefix"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>SKU Prefix</FormLabel>
                            <FormControl>
                              <Input {...field} value={field.value ?? ""} placeholder="e.g. 34SHFF" />
                            </FormControl>
                            <p className="text-xs text-muted-foreground">
                              The prefix used to match CSV line items to this product. E.g. if a line item SKU starts with &quot;34SHFF&quot;, enter &quot;34SHFF&quot; here. Leave blank if this product is not matched by SKU.
                            </p>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="description"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Description</FormLabel>
                            <FormControl>
                              <Textarea
                                {...field}
                                value={field.value ?? ""}
                                rows={3}
                                placeholder="Plain-language description of this product."
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="notes"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Internal Notes</FormLabel>
                            <FormControl>
                              <Textarea
                                {...field}
                                value={field.value ?? ""}
                                rows={3}
                                placeholder="Notes about pricing logic, special handling, edge cases, etc."
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    {/* Logic Binding */}
                    <div className="space-y-4">
                      <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground border-b pb-2">Logic Binding</h3>
                      <div className="grid grid-cols-2 gap-6">
                        <FormField
                          control={form.control}
                          name="pricingProxyId"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Pricing Proxy Variable</FormLabel>
                              <Select
                                onValueChange={(val) => field.onChange(val === "none" ? null : Number(val))}
                                value={field.value != null ? String(field.value) : "none"}
                              >
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="None" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="none">None (Zero Price)</SelectItem>
                                  {pricingProxies.map((v) => (
                                    <SelectItem key={v.id} value={String(v.id)}>{v.name}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="exportProxyId"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Export Proxy Variable</FormLabel>
                              <Select
                                onValueChange={(val) => field.onChange(val === "none" ? null : Number(val))}
                                value={field.value != null ? String(field.value) : "none"}
                              >
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="None" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="none">None (Skip Export)</SelectItem>
                                  {exportProxies.map((v) => (
                                    <SelectItem key={v.id} value={String(v.id)}>{v.name}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      <FormField
                        control={form.control}
                        name="exportType"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Export Type</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value || 'ORD'}>
                              <FormControl>
                                <SelectTrigger data-testid="select-export-type">
                                  <SelectValue />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {EXPORT_TYPE_OPTIONS.map((t) => (
                                  <SelectItem key={t} value={t}>{t}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">
                              Determines which output file this product belongs to during exports.
                            </p>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="supplyType"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Supply Type</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value || 'STOCK'}>
                              <FormControl>
                                <SelectTrigger data-testid="select-supply-type">
                                  <SelectValue />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="STOCK">Stock — We hold inventory</SelectItem>
                                <SelectItem value="BUYOUT">Buyout — Ordered per job from supplier</SelectItem>
                              </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">
                              Stock items are held in inventory; Buyout items are ordered from a supplier per job.
                            </p>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    {/* Grid Bindings */}
                    <div className="space-y-4">
                      <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground border-b pb-2 flex items-center gap-2">
                        <Link2 className="h-3.5 w-3.5" />
                        Grid Bindings
                      </h3>

                      {editingId === null ? (
                        <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground bg-muted/20">
                          Save the product first to manage grid bindings.
                        </div>
                      ) : (
                        <div className="rounded-lg border bg-muted/20 p-4 space-y-3">
                          {bindings.length === 0 && (
                            <p className="text-sm text-muted-foreground text-center py-2">No grid bindings yet. Add one below.</p>
                          )}

                          {bindings.map((binding, idx) => (
                            <div key={idx} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-3 items-start p-3 rounded-md border bg-background">
                              <div className="space-y-1">
                                <p className="text-xs font-medium text-muted-foreground">Grid</p>
                                <Select
                                  value={binding.gridId !== null ? String(binding.gridId) : "none"}
                                  onValueChange={(val) => {
                                    const gridId = val === "none" ? null : Number(val);
                                    const grid = attributeGrids?.find(g => g.id === gridId);
                                    const autoAlias = (!binding.alias && grid) ? grid.name.toLowerCase().replace(/\s+/g, "_") : binding.alias;
                                    updateBinding(idx, { gridId, alias: autoAlias });
                                  }}
                                >
                                  <SelectTrigger className="h-8 text-sm">
                                    <SelectValue placeholder="Select grid…" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="none">— select —</SelectItem>
                                    {(attributeGrids ?? []).map(g => (
                                      <SelectItem key={g.id} value={String(g.id)}>{g.name}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>

                              <div className="space-y-1">
                                <p className="text-xs font-medium text-muted-foreground">Alias</p>
                                <Input
                                  className="h-8 text-sm"
                                  placeholder="color"
                                  value={binding.alias}
                                  onChange={(e) => updateBinding(idx, { alias: e.target.value })}
                                />
                                <p className="text-[10px] text-muted-foreground leading-tight">Variable name in formula (e.g. color.SQFT_PRICE)</p>
                              </div>

                              <div className="space-y-1">
                                <p className="text-xs font-medium text-muted-foreground">CSV Column</p>
                                <Input
                                  className="h-8 text-sm"
                                  placeholder="Color"
                                  value={binding.lookupColumn}
                                  onChange={(e) => updateBinding(idx, { lookupColumn: e.target.value })}
                                />
                                <p className="text-[10px] text-muted-foreground leading-tight">Column in the order CSV used as the lookup key</p>
                              </div>

                              <div className="pt-5">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                  onClick={() => removeBinding(idx)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          ))}

                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="w-full"
                            onClick={addBinding}
                          >
                            <Plus className="h-4 w-4 mr-2" />
                            Add Grid Binding
                          </Button>

                          <Button
                            type="button"
                            className="w-full"
                            onClick={() => saveBindingsMutation.mutate()}
                            disabled={saveBindingsMutation.isPending}
                          >
                            {saveBindingsMutation.isPending
                              ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              : <Save className="mr-2 h-4 w-4" />
                            }
                            Save Bindings
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </ScrollArea>

                <div className="p-4 border-t flex justify-between bg-muted/30 shrink-0">
                  <Button type="submit" disabled={saveMutation.isPending}>
                    {saveMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    {editingId ? "Save Product" : "Create Product"}
                  </Button>
                  {editingId && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="destructive">
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete Product
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Product?</AlertDialogTitle>
                          <AlertDialogDescription>This will permanently remove the product from the system.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => deleteMutation.mutate(editingId)} className="bg-destructive">Delete</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </div>
              </form>
            </Form>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>

      {/* Import Products CSV Modal */}
      <Dialog
        open={importModalOpen}
        onOpenChange={(open) => {
          if (!open) { setImportFile(null); setImportResult(null); }
          setImportModalOpen(open);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Import Products CSV</DialogTitle>
            <DialogDescription>
              Upload a PF_*_Products CSV file. Existing products in the same category will be replaced.
            </DialogDescription>
          </DialogHeader>

          {importResult ? (
            <div className="space-y-4 py-2">
              <div className="flex flex-col items-center gap-3 py-4 text-center">
                <CheckCircle2 className="h-12 w-12 text-green-500" />
                <p className="font-semibold text-lg">Import complete</p>
                <p className="text-sm text-muted-foreground">
                  Category: <span className="font-medium text-foreground">{importResult.categoryName}</span>
                </p>
                <p className="text-sm text-muted-foreground">
                  {importResult.productsInserted} products imported
                  {importResult.bindingsCreated > 0 && `, ${importResult.bindingsCreated} grid bindings created`}
                </p>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setImportResult(null); setImportFile(null); }}>Import another</Button>
                <Button onClick={() => { setImportModalOpen(false); setImportResult(null); setImportFile(null); }}>Done</Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4 py-2">
              {/* File picker */}
              <div>
                <label className="text-sm font-medium block mb-1.5">CSV File</label>
                <label
                  data-testid="input-import-file"
                  className={cn(
                    "flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-lg p-6 cursor-pointer text-center transition-colors",
                    importFile ? "border-green-500/60 bg-green-50/10" : "border-border hover:border-primary/50"
                  )}
                >
                  <input
                    type="file"
                    accept=".csv"
                    className="hidden"
                    onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
                  />
                  <Upload className={cn("h-6 w-6", importFile ? "text-green-600" : "text-muted-foreground")} />
                  <span className="text-sm text-muted-foreground">
                    {importFile ? importFile.name : "Click to select a PF_*_Products.csv file"}
                  </span>
                </label>
              </div>

              {/* Pricing Proxy */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium block mb-1.5">Pricing Proxy</label>
                  <Select value={importPricingProxyId} onValueChange={setImportPricingProxyId}>
                    <SelectTrigger data-testid="select-import-pricing-proxy">
                      <SelectValue placeholder="None" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {pricingProxies.map(v => (
                        <SelectItem key={v.id} value={String(v.id)}>{v.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium block mb-1.5">Export Proxy</label>
                  <Select value={importExportProxyId} onValueChange={setImportExportProxyId}>
                    <SelectTrigger data-testid="select-import-export-proxy">
                      <SelectValue placeholder="None" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {exportProxies.map(v => (
                        <SelectItem key={v.id} value={String(v.id)}>{v.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Grid Binding */}
              <div>
                <label className="text-sm font-medium block mb-1.5">Attribute Grid</label>
                <Select value={importGridId} onValueChange={(val) => {
                  setImportGridId(val);
                  if (val !== "none" && !importAlias) {
                    const grid = (attributeGrids ?? []).find(g => String(g.id) === val);
                    if (grid) setImportAlias(grid.name.toLowerCase().replace(/\s+/g, "_"));
                  }
                }}>
                  <SelectTrigger data-testid="select-import-grid">
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {(attributeGrids ?? []).map(g => (
                      <SelectItem key={g.id} value={String(g.id)}>{g.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {importGridId !== "none" && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-medium block mb-1.5">Grid Alias</label>
                    <Input
                      data-testid="input-import-alias"
                      placeholder="e.g. color"
                      value={importAlias}
                      onChange={(e) => setImportAlias(e.target.value)}
                    />
                    <p className="text-[10px] text-muted-foreground mt-1">Variable name in formula</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium block mb-1.5">CSV Lookup Column</label>
                    <Input
                      data-testid="input-import-lookup-column"
                      placeholder="MANU_CODE"
                      value={importLookupColumn}
                      onChange={(e) => setImportLookupColumn(e.target.value)}
                    />
                    <p className="text-[10px] text-muted-foreground mt-1">Column in order CSV for lookup</p>
                  </div>
                </div>
              )}

              <DialogFooter>
                <Button variant="outline" onClick={() => setImportModalOpen(false)}>Cancel</Button>
                <Button
                  data-testid="button-run-import"
                  disabled={!importFile || importLoading}
                  onClick={handleImport}
                >
                  {importLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Import
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
