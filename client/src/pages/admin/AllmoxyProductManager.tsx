import { useState, useMemo, useCallback } from "react";
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
import { Loader2, Plus, Save, Trash2, Search, Package, ChevronRight, Upload, FileText, X } from "lucide-react";
import type { AllmoxyProduct, ProxyVariable } from "@shared/schema";
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
});

type ProductFormValues = z.infer<typeof productSchema>;

export default function AllmoxyProductManager() {
  const { toast } = useToast();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);

  const form = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      name: "",
      status: "active",
      pricingProxyId: null,
      exportProxyId: null,
    },
  });

  const { data: products, isLoading: isLoadingProducts } = useQuery<AllmoxyProduct[]>({
    queryKey: ["/api/admin/allmoxy-products"],
  });

  const { data: proxyVars } = useQuery<ProxyVariable[]>({
    queryKey: ["/api/admin/proxy-variables"],
  });

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
    form.reset({
      id: product.id,
      name: product.name,
      status: (product.status as "active" | "inactive") ?? "active",
      pricingProxyId: product.pricingProxyId ?? null,
      exportProxyId: product.exportProxyId ?? null,
    });
  };

  const handleNew = () => {
    setEditingId(null);
    form.reset({
      name: "",
      status: "active",
      pricingProxyId: null,
      exportProxyId: null,
    });
  };

  const onSubmit = (values: ProductFormValues) => {
    saveMutation.mutate(values);
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
                <div className="flex gap-1">
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
                            isDragActive ? "border-primary bg-primary/5" : "border-slate-200 hover:border-primary/50",
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
                  <button
                    key={p.id}
                    onClick={() => handleEdit(p)}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2 rounded-md transition-colors text-left group",
                      editingId === p.id ? "bg-primary text-primary-foreground" : "hover:bg-accent"
                    )}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">{p.name}</span>
                        <span className={cn(
                          "text-[10px] uppercase px-1.5 py-0.5 rounded-full font-bold",
                          p.status === "active" 
                            ? (editingId === p.id ? "bg-primary-foreground/20 text-white" : "bg-green-100 text-green-700")
                            : (editingId === p.id ? "bg-primary-foreground/10 text-white/70" : "bg-slate-100 text-slate-500")
                        )}>
                          {p.status}
                        </span>
                      </div>
                    </div>
                    <ChevronRight className={cn(
                      "h-4 w-4 shrink-0 transition-transform",
                      editingId === p.id ? "translate-x-0" : "-translate-x-2 opacity-0 group-hover:opacity-100 group-hover:translate-x-0"
                    )} />
                  </button>
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
                <div className="p-6 space-y-8 flex-1 overflow-y-auto">
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
                  </div>

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
                </div>

                <div className="p-4 border-t flex justify-between bg-muted/30">
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
