import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Save, Trash2, X } from "lucide-react";
import type { AllmoxyProduct, ProxyVariable } from "@shared/schema";

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
  const [isFormOpen, setIsFormOpen] = useState(false);

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

  const pricingProxies = proxyVars?.filter((v) => v.type === "pricing") ?? [];
  const exportProxies = proxyVars?.filter((v) => v.type === "export") ?? [];

  const saveMutation = useMutation({
    mutationFn: async (values: ProductFormValues) => {
      const res = await apiRequest("POST", "/api/admin/allmoxy-products", values);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/allmoxy-products"] });
      toast({ title: "Success", description: "Product saved" });
      handleCancel();
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
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleEdit = (product: AllmoxyProduct) => {
    setEditingId(product.id);
    setIsFormOpen(true);
    form.reset({
      id: product.id,
      name: product.name,
      status: (product.status as "active" | "inactive") ?? "active",
      pricingProxyId: product.pricingProxyId ?? null,
      exportProxyId: product.exportProxyId ?? null,
    });
  };

  const handleCancel = () => {
    setEditingId(null);
    setIsFormOpen(false);
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

  const getProxyName = (id: number | null, list: ProxyVariable[]) => {
    if (!id) return <span className="text-muted-foreground italic">None</span>;
    const found = list.find((v) => v.id === id);
    return found ? <span className="font-mono text-sm">{found.name}</span> : <span className="text-muted-foreground italic">Unknown</span>;
  };

  return (
    <div className="container mx-auto py-10 space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Allmoxy Products</h1>
        {!isFormOpen && (
          <Button onClick={() => setIsFormOpen(true)} data-testid="button-new-product">
            <Plus className="mr-2 h-4 w-4" />
            New Product
          </Button>
        )}
      </div>

      {isFormOpen && (
        <Card>
          <CardHeader>
            <CardTitle>{editingId ? "Edit Product" : "Create Product"}</CardTitle>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Product Name</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="e.g. Slab Door" data-testid="input-product-name" />
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
                            <SelectTrigger data-testid="select-product-status">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="active">Active</SelectItem>
                            <SelectItem value="inactive">Inactive</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="pricingProxyId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Pricing Proxy</FormLabel>
                        <Select
                          onValueChange={(val) => field.onChange(val === "none" ? null : Number(val))}
                          value={field.value != null ? String(field.value) : "none"}
                        >
                          <FormControl>
                            <SelectTrigger data-testid="select-pricing-proxy">
                              <SelectValue placeholder="None" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="none">None</SelectItem>
                            {pricingProxies.map((v) => (
                              <SelectItem key={v.id} value={String(v.id)}>
                                {v.name}
                              </SelectItem>
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
                        <FormLabel>Export Proxy</FormLabel>
                        <Select
                          onValueChange={(val) => field.onChange(val === "none" ? null : Number(val))}
                          value={field.value != null ? String(field.value) : "none"}
                        >
                          <FormControl>
                            <SelectTrigger data-testid="select-export-proxy">
                              <SelectValue placeholder="None" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="none">None</SelectItem>
                            {exportProxies.map((v) => (
                              <SelectItem key={v.id} value={String(v.id)}>
                                {v.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="flex gap-2">
                  <Button type="submit" disabled={saveMutation.isPending} data-testid="button-save-product">
                    {saveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    <Save className="mr-2 h-4 w-4" />
                    Save Product
                  </Button>
                  <Button type="button" variant="outline" onClick={handleCancel} data-testid="button-cancel-product">
                    <X className="mr-2 h-4 w-4" />
                    Cancel
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>All Products</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoadingProducts ? (
            <div className="flex justify-center p-10">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : !products?.length ? (
            <div className="text-center p-10 text-muted-foreground">
              No products yet. Click "New Product" to add one.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Pricing Proxy</TableHead>
                  <TableHead>Export Proxy</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((product) => (
                  <TableRow key={product.id} data-testid={`row-product-${product.id}`}>
                    <TableCell className="font-medium">{product.name}</TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          product.status === "active"
                            ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                            : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                        }`}
                      >
                        {product.status ?? "active"}
                      </span>
                    </TableCell>
                    <TableCell>{getProxyName(product.pricingProxyId, pricingProxies)}</TableCell>
                    <TableCell>{getProxyName(product.exportProxyId, exportProxies)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(product)}
                          data-testid={`button-edit-product-${product.id}`}
                        >
                          Edit
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive"
                              data-testid={`button-delete-product-${product.id}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete Product</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to delete "{product.name}"? This cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => deleteMutation.mutate(product.id)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
