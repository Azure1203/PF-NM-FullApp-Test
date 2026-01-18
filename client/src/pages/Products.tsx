import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { 
  Plus, Search, Pencil, Trash2, Loader2, Package, 
  Upload, ArrowLeft, Save, ImageDown 
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
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
import { useAuth } from "@/hooks/use-auth";
import type { Product } from "@shared/schema";

interface ProductFormData {
  code: string;
  name: string;
  supplier: string;
  category: string;
  stockStatus: string;
  weight: string;
  notes: string;
  importRowNumber: string;
}

const emptyFormData: ProductFormData = {
  code: "",
  name: "",
  supplier: "",
  category: "HARDWARE",
  stockStatus: "IN_STOCK",
  weight: "",
  notes: "",
  importRowNumber: "",
};

export default function Products() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [formData, setFormData] = useState<ProductFormData>(emptyFormData);

  const queryUrl = `/api/products?search=${encodeURIComponent(search)}${categoryFilter !== "all" ? `&category=${categoryFilter}` : ""}`;
  
  const { data: products, isLoading } = useQuery<Product[]>({
    queryKey: ['/api/products', search, categoryFilter],
    queryFn: async () => {
      const res = await fetch(queryUrl, { credentials: 'include' });
      if (!res.ok) {
        const error = await res.text();
        throw new Error(error || 'Failed to fetch products');
      }
      return res.json();
    },
  });

  const createProductMutation = useMutation({
    mutationFn: async (data: Partial<Product>) => {
      return apiRequest('POST', '/api/products', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/products'] });
      toast({ title: "Product created successfully" });
      closeDialog();
    },
    onError: (error: Error) => {
      toast({ title: "Failed to create product", description: error.message, variant: "destructive" });
    },
  });

  const updateProductMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<Product> }) => {
      return apiRequest('PATCH', `/api/products/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/products'] });
      toast({ title: "Product updated successfully" });
      closeDialog();
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update product", description: error.message, variant: "destructive" });
    },
  });

  const deleteProductMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest('DELETE', `/api/products/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/products'] });
      toast({ title: "Product deleted" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to delete product", description: error.message, variant: "destructive" });
    },
  });

  const fetchMarathonImagesMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/products/fetch-marathon-images');
      return response.json();
    },
    onSuccess: (data: { updated: number; errors: Array<{ code: string; error: string }>; remaining?: number }) => {
      queryClient.invalidateQueries({ queryKey: ['/api/products'] });
      if (data.updated > 0) {
        const remainingMsg = data.remaining && data.remaining > 0 ? ` (${data.remaining} remaining - click again to continue)` : '';
        toast({ title: `Fetched images for ${data.updated} Marathon products${remainingMsg}` });
      } else {
        toast({ title: "No new images found", description: data.errors.length > 0 ? `${data.errors.length} errors occurred` : "All products already have images" });
      }
    },
    onError: (error: Error) => {
      toast({ title: "Failed to fetch Marathon images", description: error.message, variant: "destructive" });
    },
  });

  const openCreateDialog = () => {
    setEditingProduct(null);
    setFormData(emptyFormData);
    setIsDialogOpen(true);
  };

  const openEditDialog = (product: Product) => {
    setEditingProduct(product);
    setFormData({
      code: product.code,
      name: product.name || "",
      supplier: product.supplier || "",
      category: product.category,
      stockStatus: product.stockStatus || "IN_STOCK",
      weight: product.weight?.toString() || "",
      notes: product.notes || "",
      importRowNumber: product.importRowNumber?.toString() || "",
    });
    setIsDialogOpen(true);
  };

  const closeDialog = () => {
    setIsDialogOpen(false);
    setEditingProduct(null);
    setFormData(emptyFormData);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const productData: Partial<Product> = {
      code: formData.code.trim(),
      name: formData.name.trim() || null,
      supplier: formData.supplier.trim() || null,
      category: formData.category,
      stockStatus: formData.stockStatus as any,
      weight: formData.weight ? parseFloat(formData.weight) : null,
      notes: formData.notes.trim() || null,
      importRowNumber: formData.importRowNumber ? parseInt(formData.importRowNumber) : null,
    };

    if (!productData.code) {
      toast({ title: "Product code is required", variant: "destructive" });
      return;
    }

    if (editingProduct) {
      updateProductMutation.mutate({ id: editingProduct.id, data: productData });
    } else {
      createProductMutation.mutate(productData);
    }
  };

  const isPending = createProductMutation.isPending || updateProductMutation.isPending;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="border-b bg-white shadow-sm">
        <div className="container mx-auto px-4 py-4 max-w-6xl">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button variant="ghost" size="icon" data-testid="button-back-to-dashboard">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <h1 className="text-2xl font-bold">Product Database</h1>
          </div>
        </div>
      </div>
      
      <div className="container mx-auto px-4 py-6 max-w-6xl">
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
            <Input
              data-testid="input-product-search"
              placeholder="Search by product code..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-[180px]" data-testid="select-category-filter">
              <SelectValue placeholder="All Categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              <SelectItem value="HARDWARE">Hardware</SelectItem>
              <SelectItem value="COMPONENT">Component</SelectItem>
            </SelectContent>
          </Select>
          <Link href="/products/import">
            <Button variant="outline" data-testid="button-import-products">
              <Upload className="h-4 w-4 mr-2" />
              Import CSV
            </Button>
          </Link>
          <Button 
            variant="outline" 
            onClick={() => fetchMarathonImagesMutation.mutate()}
            disabled={fetchMarathonImagesMutation.isPending}
            data-testid="button-fetch-marathon-images"
          >
            {fetchMarathonImagesMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <ImageDown className="h-4 w-4 mr-2" />
            )}
            Fetch Marathon Images
          </Button>
          <Button onClick={openCreateDialog} data-testid="button-add-product">
            <Plus className="h-4 w-4 mr-2" />
            Add Product
          </Button>
        </div>

        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className="h-48" />
            ))}
          </div>
        ) : products && products.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {products.map((product) => (
              <Card key={product.id} className="hover-elevate" data-testid={`card-product-${product.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <h3 className="font-mono text-sm font-medium truncate" data-testid={`text-product-code-${product.id}`}>
                        {product.code}
                      </h3>
                      <p className="text-sm text-muted-foreground truncate">
                        {product.name || "No description"}
                      </p>
                      {product.supplier && (
                        <p className="text-xs text-muted-foreground">
                          {product.supplier}
                        </p>
                      )}
                      {product.weight && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {product.weight} g
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col gap-1 items-end flex-shrink-0">
                      <Badge variant={product.category === "HARDWARE" ? "secondary" : "outline"}>
                        {product.category}
                      </Badge>
                      <Badge 
                        variant="outline" 
                        className={product.stockStatus === "BUYOUT" 
                          ? "bg-amber-50 text-amber-700 border-amber-200 text-xs" 
                          : "bg-green-50 text-green-700 border-green-200 text-xs"
                        }
                      >
                        {product.stockStatus === "BUYOUT" ? "Buyout" : "In Stock"}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 mt-4 pt-3 border-t">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => openEditDialog(product)}
                      data-testid={`button-edit-product-${product.id}`}
                    >
                      <Pencil className="h-4 w-4 mr-1" />
                      Edit
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="ghost" className="text-destructive" data-testid={`button-delete-product-${product.id}`}>
                          <Trash2 className="h-4 w-4 mr-1" />
                          Delete
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Product</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to delete "{product.code}"? This action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => deleteProductMutation.mutate(product.id)}
                            className="bg-destructive text-destructive-foreground"
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="py-12 text-center">
              <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No Products Found</h3>
              <p className="text-muted-foreground mb-4">
                {search ? "Try adjusting your search." : "Add your first product to get started."}
              </p>
              {!search && (
                <Button onClick={openCreateDialog}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Product
                </Button>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingProduct ? "Edit Product" : "Add New Product"}</DialogTitle>
            <DialogDescription>
              {editingProduct ? "Update the product details below." : "Enter the product information below."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="code">Product Code *</Label>
                <Input
                  id="code"
                  data-testid="input-product-code"
                  placeholder="e.g. H.111.95.310"
                  value={formData.code}
                  onChange={(e) => setFormData(prev => ({ ...prev, code: e.target.value }))}
                  disabled={!!editingProduct}
                />
              </div>
              
              <div className="grid gap-2">
                <Label htmlFor="name">Name / Description</Label>
                <Input
                  id="name"
                  data-testid="input-product-name"
                  placeholder="Product description"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="supplier">Supplier</Label>
                <Select
                  value={formData.supplier}
                  onValueChange={(v) => setFormData(prev => ({ ...prev, supplier: v }))}
                >
                  <SelectTrigger data-testid="select-product-supplier">
                    <SelectValue placeholder="Select supplier" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Marathon">Marathon</SelectItem>
                    <SelectItem value="Hafele">Hafele</SelectItem>
                    <SelectItem value="Richelieu">Richelieu</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="category">Category</Label>
                  <Select
                    value={formData.category}
                    onValueChange={(v) => setFormData(prev => ({ ...prev, category: v }))}
                  >
                    <SelectTrigger data-testid="select-product-category">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="HARDWARE">Hardware</SelectItem>
                      <SelectItem value="COMPONENT">Component</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="stockStatus">Stock Status</Label>
                  <Select
                    value={formData.stockStatus}
                    onValueChange={(v) => setFormData(prev => ({ ...prev, stockStatus: v }))}
                  >
                    <SelectTrigger data-testid="select-product-stock-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="IN_STOCK">In Stock</SelectItem>
                      <SelectItem value="BUYOUT">Buyout</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="weight">Weight (g)</Label>
                  <Input
                    id="weight"
                    type="number"
                    step="0.01"
                    data-testid="input-product-weight"
                    placeholder="0"
                    value={formData.weight}
                    onChange={(e) => setFormData(prev => ({ ...prev, weight: e.target.value }))}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="importRowNumber">Import Row # (for image linking)</Label>
                  <Input
                    id="importRowNumber"
                    type="number"
                    data-testid="input-product-import-row"
                    placeholder="Row number from CSV"
                    value={formData.importRowNumber}
                    onChange={(e) => setFormData(prev => ({ ...prev, importRowNumber: e.target.value }))}
                  />
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  data-testid="input-product-notes"
                  placeholder="Additional notes..."
                  value={formData.notes}
                  onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeDialog}>
                Cancel
              </Button>
              <Button type="submit" disabled={isPending} data-testid="button-save-product">
                {isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    {editingProduct ? "Update" : "Create"}
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
