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
  Plus, Search, Pencil, Trash2, Loader2, X, Package, 
  Image as ImageIcon, Upload, ArrowLeft, Save 
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
  category: string;
  length: string;
  width: string;
  height: string;
  notes: string;
  imagePath: string;
}

const emptyFormData: ProductFormData = {
  code: "",
  name: "",
  category: "HARDWARE",
  length: "",
  width: "",
  height: "",
  notes: "",
  imagePath: "",
};

export default function Products() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [formData, setFormData] = useState<ProductFormData>(emptyFormData);
  const [isUploading, setIsUploading] = useState(false);

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
      category: product.category,
      length: product.length?.toString() || "",
      width: product.width?.toString() || "",
      height: product.height?.toString() || "",
      notes: product.notes || "",
      imagePath: product.imagePath || "",
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
      category: formData.category,
      length: formData.length ? parseFloat(formData.length) : null,
      width: formData.width ? parseFloat(formData.width) : null,
      height: formData.height ? parseFloat(formData.height) : null,
      notes: formData.notes.trim() || null,
      imagePath: formData.imagePath || null,
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

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const formDataUpload = new FormData();
      formDataUpload.append('file', file);
      formDataUpload.append('scope', 'public');

      const response = await fetch('/api/object-storage/upload', {
        method: 'POST',
        body: formDataUpload,
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to upload image');
      }

      const result = await response.json();
      setFormData(prev => ({ ...prev, imagePath: result.url || result.path }));
      toast({ title: "Image uploaded successfully" });
    } catch (error: any) {
      toast({ title: "Failed to upload image", description: error.message, variant: "destructive" });
    } finally {
      setIsUploading(false);
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
                  <div className="flex gap-4">
                    <div className="w-20 h-20 flex-shrink-0 bg-muted rounded-md flex items-center justify-center overflow-hidden">
                      {product.imagePath ? (
                        <img
                          src={product.imagePath}
                          alt={product.code}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Package className="h-8 w-8 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h3 className="font-mono text-sm font-medium truncate" data-testid={`text-product-code-${product.id}`}>
                            {product.code}
                          </h3>
                          <p className="text-sm text-muted-foreground truncate">
                            {product.name || "No description"}
                          </p>
                        </div>
                        <Badge variant={product.category === "HARDWARE" ? "secondary" : "outline"}>
                          {product.category}
                        </Badge>
                      </div>
                      {(product.length || product.width || product.height) && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {[product.length, product.width, product.height].filter(Boolean).join(" x ")} mm
                        </p>
                      )}
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

              <div className="grid grid-cols-3 gap-3">
                <div className="grid gap-2">
                  <Label htmlFor="length">Length (mm)</Label>
                  <Input
                    id="length"
                    type="number"
                    step="0.01"
                    data-testid="input-product-length"
                    placeholder="0"
                    value={formData.length}
                    onChange={(e) => setFormData(prev => ({ ...prev, length: e.target.value }))}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="width">Width (mm)</Label>
                  <Input
                    id="width"
                    type="number"
                    step="0.01"
                    data-testid="input-product-width"
                    placeholder="0"
                    value={formData.width}
                    onChange={(e) => setFormData(prev => ({ ...prev, width: e.target.value }))}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="height">Height (mm)</Label>
                  <Input
                    id="height"
                    type="number"
                    step="0.01"
                    data-testid="input-product-height"
                    placeholder="0"
                    value={formData.height}
                    onChange={(e) => setFormData(prev => ({ ...prev, height: e.target.value }))}
                  />
                </div>
              </div>

              <div className="grid gap-2">
                <Label>Product Image</Label>
                <div className="flex gap-3 items-center">
                  <div className="w-16 h-16 bg-muted rounded-md flex items-center justify-center overflow-hidden flex-shrink-0">
                    {formData.imagePath ? (
                      <img src={formData.imagePath} alt="Product" className="w-full h-full object-cover" />
                    ) : (
                      <ImageIcon className="h-6 w-6 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1">
                    <Input
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      disabled={isUploading}
                      data-testid="input-product-image"
                    />
                    {isUploading && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Uploading...
                      </div>
                    )}
                  </div>
                  {formData.imagePath && (
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      onClick={() => setFormData(prev => ({ ...prev, imagePath: "" }))}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
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
