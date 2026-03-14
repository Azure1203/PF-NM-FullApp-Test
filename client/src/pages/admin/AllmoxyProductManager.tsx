import { useState, useMemo, useCallback, useEffect } from "react";
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
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Save, Trash2, Search, Package, ChevronRight, Upload, FileText, Link2, CheckSquare } from "lucide-react";
import type { AllmoxyProduct, ProxyVariable, AttributeGrid, ProductGridBinding } from "@shared/schema";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { useDropzone } from "react-dropzone";

const productSchema = z.object({
  id: z.number().optional(),
  name: z.string().min(1, "Name is required"),
  status: z.enum(["active", "inactive"]),
  pricingProxyId: z.number().nullable(),
  exportProxyId: z.number().nullable(),
  skuPrefix: z.string().nullable(),
  description: z.string().nullable(),
  notes: z.string().nullable(),
});

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
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
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

  const importMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/admin/upload-allmoxy-products", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error("Failed to import products");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/allmoxy-products"] });
      toast({ title: "Imported", description: `Successfully imported ${data.count} products` });
      setIsImportModalOpen(false);
      setImportFile(null);
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

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setImportFile(acceptedFiles[0]);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "text/csv": [".csv"] },
    multiple: false,
  });

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

                  <Dialog open={isImportModalOpen} onOpenChange={setIsImportModalOpen}>
                    <DialogTrigger asChild>
                      <Button size="icon" variant="ghost" title="Bulk Import">
                        <Upload className="h-4 w-4" />
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Bulk Import Products</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4 pt-4">
                        <div
                          {...getRootProps()}
                          className={cn(
                            "border-2 border-dashed rounded-lg p-8 transition-all cursor-pointer flex flex-col items-center justify-center gap-3 text-center",
                            isDragActive ? "border-primary bg-primary/5" : "border-border hover:border-primary/50",
                            importFile ? "border-green-500/50 bg-green-50/20" : ""
                          )}
                        >
                          <input {...getInputProps()} />
                          <div className={cn(
                            "h-12 w-12 rounded-full flex items-center justify-center",
                            importFile ? "bg-green-100 text-green-600" : "bg-primary/10 text-primary"
                          )}>
                            {importFile ? <FileText className="h-6 w-6" /> : <Upload className="h-6 w-6" />}
                          </div>
                          {importFile ? (
                            <p className="text-sm font-medium">{importFile.name}</p>
                          ) : (
                            <p className="text-sm text-muted-foreground">Click or drag Allmoxy CSV here</p>
                          )}
                        </div>
                        <Button
                          className="w-full"
                          disabled={!importFile || importMutation.isPending}
                          onClick={() => importFile && importMutation.mutate(importFile)}
                        >
                          {importMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                          Start Import
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
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
    </div>
  );
}
