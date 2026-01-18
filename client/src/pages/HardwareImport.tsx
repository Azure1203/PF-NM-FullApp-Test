import { useState, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { 
  ArrowLeft, Upload, FileSpreadsheet, Loader2, Check, 
  AlertCircle, RefreshCw, Package, Image as ImageIcon
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useDropzone } from "react-dropzone";

interface ParsedItem {
  rowNumber: number;
  code: string;
  name: string;
  supplier: string;
}

interface ChangedItem extends ParsedItem {
  existingName: string | null;
  existingSupplier: string | null;
  existingId: number;
}

interface PreviewResult {
  totalParsed: number;
  newItems: ParsedItem[];
  unchangedItems: ParsedItem[];
  changedItems: ChangedItem[];
}

export default function HardwareImport() {
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [stockStatus, setStockStatus] = useState<string>("IN_STOCK");
  const [selectedChanges, setSelectedChanges] = useState<Set<number>>(new Set());
  const [isUploading, setIsUploading] = useState(false);
  
  // Image linking state
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageRowNumbers, setImageRowNumbers] = useState<string>("");
  const [isLinkingImage, setIsLinkingImage] = useState(false);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setFile(acceptedFiles[0]);
      setPreview(null);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv'],
      'application/vnd.ms-excel': ['.csv'],
    },
    maxFiles: 1,
  });

  const previewMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await fetch('/api/products/import/preview', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to parse CSV');
      }
      
      return response.json() as Promise<PreviewResult>;
    },
    onSuccess: (data) => {
      setPreview(data);
      // Select all changes by default
      setSelectedChanges(new Set(data.changedItems.map(item => item.existingId)));
      toast({ title: `Parsed ${data.totalParsed} items from CSV` });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to parse CSV", description: error.message, variant: "destructive" });
    },
  });

  const importMutation = useMutation({
    mutationFn: async () => {
      if (!preview) throw new Error('No preview data');
      
      const results: { created: number; updated: number; errors: number } = {
        created: 0,
        updated: 0,
        errors: 0,
      };
      
      // Import new items
      if (preview.newItems.length > 0) {
        const response = await apiRequest('POST', '/api/products/import', {
          items: preview.newItems,
          stockStatus,
        });
        const data = await response.json();
        results.created = data.created?.length || 0;
        results.errors += data.errors?.length || 0;
      }
      
      // Update changed items (only selected ones)
      const itemsToUpdate = preview.changedItems.filter(item => selectedChanges.has(item.existingId));
      if (itemsToUpdate.length > 0) {
        const response = await apiRequest('POST', '/api/products/import/update', {
          items: itemsToUpdate,
        });
        const data = await response.json();
        results.updated = data.updated?.length || 0;
        results.errors += data.errors?.length || 0;
      }
      
      return results;
    },
    onSuccess: (results) => {
      queryClient.invalidateQueries({ queryKey: ['/api/products'] });
      toast({ 
        title: "Import complete", 
        description: `Created ${results.created}, updated ${results.updated}, ${results.errors} errors` 
      });
      setPreview(null);
      setFile(null);
    },
    onError: (error: Error) => {
      toast({ title: "Import failed", description: error.message, variant: "destructive" });
    },
  });

  const handlePreview = () => {
    if (file) {
      previewMutation.mutate(file);
    }
  };

  const handleImport = () => {
    importMutation.mutate();
  };

  const toggleChange = (id: number) => {
    setSelectedChanges(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectAllChanges = () => {
    if (preview) {
      setSelectedChanges(new Set(preview.changedItems.map(item => item.existingId)));
    }
  };

  const deselectAllChanges = () => {
    setSelectedChanges(new Set());
  };

  // Image linking handlers
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
    }
  };

  const parseRowNumbers = (input: string): number[] => {
    const parts = input.split(',').map(s => s.trim());
    const numbers: number[] = [];
    
    for (const part of parts) {
      if (part.includes('-')) {
        const [start, end] = part.split('-').map(s => parseInt(s.trim()));
        if (!isNaN(start) && !isNaN(end)) {
          for (let i = start; i <= end; i++) {
            numbers.push(i);
          }
        }
      } else {
        const num = parseInt(part);
        if (!isNaN(num)) {
          numbers.push(num);
        }
      }
    }
    
    return Array.from(new Set(numbers)).sort((a, b) => a - b);
  };

  const handleLinkImage = async () => {
    if (!imageFile || !imageRowNumbers.trim()) {
      toast({ title: "Please select an image and enter row numbers", variant: "destructive" });
      return;
    }
    
    const rowNumbers = parseRowNumbers(imageRowNumbers);
    if (rowNumbers.length === 0) {
      toast({ title: "Invalid row numbers", variant: "destructive" });
      return;
    }
    
    setIsLinkingImage(true);
    try {
      // First upload the image
      const formData = new FormData();
      formData.append('file', imageFile);
      formData.append('scope', 'public');
      
      const uploadResponse = await fetch('/api/object-storage/upload', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      
      if (!uploadResponse.ok) {
        throw new Error('Failed to upload image');
      }
      
      const uploadResult = await uploadResponse.json();
      const imagePath = uploadResult.url || uploadResult.path;
      
      // Then link it to the products
      const linkResponse = await apiRequest('POST', '/api/products/link-images', {
        imagePath,
        rowNumbers,
      });
      
      const linkResult = await linkResponse.json();
      
      toast({ 
        title: "Image linked", 
        description: `Linked image to ${linkResult.updated?.length || 0} products` 
      });
      
      // Clear form
      setImageFile(null);
      setImageRowNumbers("");
      queryClient.invalidateQueries({ queryKey: ['/api/products'] });
    } catch (error: any) {
      toast({ title: "Failed to link image", description: error.message, variant: "destructive" });
    } finally {
      setIsLinkingImage(false);
    }
  };

  const isPending = previewMutation.isPending || importMutation.isPending;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="border-b bg-white shadow-sm">
        <div className="container mx-auto px-4 py-4 max-w-6xl">
          <div className="flex items-center gap-4">
            <Link href="/products">
              <Button variant="ghost" size="icon" data-testid="button-back-to-products">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <h1 className="text-2xl font-bold">Hardware Import</h1>
          </div>
        </div>
      </div>
      
      <div className="container mx-auto px-4 py-6 max-w-6xl">
        <Tabs defaultValue="import" className="space-y-6">
          <TabsList>
            <TabsTrigger value="import" data-testid="tab-import">
              <FileSpreadsheet className="h-4 w-4 mr-2" />
              Import CSV
            </TabsTrigger>
            <TabsTrigger value="images" data-testid="tab-images">
              <ImageIcon className="h-4 w-4 mr-2" />
              Link Images
            </TabsTrigger>
          </TabsList>

          <TabsContent value="import" className="space-y-6">
            {/* CSV Upload */}
            <Card>
              <CardHeader>
                <CardTitle>Upload Hardware CSV</CardTitle>
                <CardDescription>
                  Upload your hardware master list CSV file. Columns: A = Description, B = Supplier, C = Product Code
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div
                  {...getRootProps()}
                  className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                    isDragActive ? 'border-primary bg-primary/5' : 'border-slate-300 hover:border-primary'
                  }`}
                >
                  <input {...getInputProps()} data-testid="input-csv-file" />
                  <FileSpreadsheet className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  {file ? (
                    <p className="text-sm font-medium">{file.name}</p>
                  ) : isDragActive ? (
                    <p className="text-sm text-muted-foreground">Drop the CSV file here...</p>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Drag & drop a CSV file here, or click to select
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap gap-4 items-center">
                  <div className="flex items-center gap-2">
                    <Label>Default Stock Status:</Label>
                    <Select value={stockStatus} onValueChange={setStockStatus}>
                      <SelectTrigger className="w-[150px]" data-testid="select-stock-status">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="IN_STOCK">In Stock</SelectItem>
                        <SelectItem value="BUYOUT">Buyout</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <Button 
                    onClick={handlePreview} 
                    disabled={!file || isPending}
                    data-testid="button-preview"
                  >
                    {previewMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Parsing...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Preview Import
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Preview Results */}
            {preview && (
              <>
                {/* Summary */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-green-100 rounded-lg">
                          <Package className="h-5 w-5 text-green-600" />
                        </div>
                        <div>
                          <p className="text-2xl font-bold">{preview.newItems.length}</p>
                          <p className="text-sm text-muted-foreground">New Items</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  
                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-amber-100 rounded-lg">
                          <AlertCircle className="h-5 w-5 text-amber-600" />
                        </div>
                        <div>
                          <p className="text-2xl font-bold">{preview.changedItems.length}</p>
                          <p className="text-sm text-muted-foreground">Changed Items</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  
                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-slate-100 rounded-lg">
                          <Check className="h-5 w-5 text-slate-600" />
                        </div>
                        <div>
                          <p className="text-2xl font-bold">{preview.unchangedItems.length}</p>
                          <p className="text-sm text-muted-foreground">Unchanged</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* New Items Table */}
                {preview.newItems.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                          {preview.newItems.length}
                        </Badge>
                        New Items to Add
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="max-h-64 overflow-y-auto border rounded-md">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-16">Row</TableHead>
                              <TableHead>Code</TableHead>
                              <TableHead>Description</TableHead>
                              <TableHead>Supplier</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {preview.newItems.map((item) => (
                              <TableRow key={item.code}>
                                <TableCell className="font-mono text-xs">{item.rowNumber}</TableCell>
                                <TableCell className="font-mono text-sm">{item.code}</TableCell>
                                <TableCell className="text-sm truncate max-w-xs">{item.name}</TableCell>
                                <TableCell className="text-sm">{item.supplier}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Changed Items Table */}
                {preview.changedItems.length > 0 && (
                  <Card>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle className="flex items-center gap-2">
                          <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                            {preview.changedItems.length}
                          </Badge>
                          Changed Items (Approve Updates)
                        </CardTitle>
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" onClick={selectAllChanges}>
                            Select All
                          </Button>
                          <Button size="sm" variant="outline" onClick={deselectAllChanges}>
                            Deselect All
                          </Button>
                        </div>
                      </div>
                      <CardDescription>
                        Selected items will have their description and supplier updated
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="max-h-64 overflow-y-auto border rounded-md">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-12"></TableHead>
                              <TableHead className="w-16">Row</TableHead>
                              <TableHead>Code</TableHead>
                              <TableHead>Current → New Description</TableHead>
                              <TableHead>Current → New Supplier</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {preview.changedItems.map((item) => (
                              <TableRow key={item.code}>
                                <TableCell>
                                  <Checkbox
                                    checked={selectedChanges.has(item.existingId)}
                                    onCheckedChange={() => toggleChange(item.existingId)}
                                    data-testid={`checkbox-change-${item.code}`}
                                  />
                                </TableCell>
                                <TableCell className="font-mono text-xs">{item.rowNumber}</TableCell>
                                <TableCell className="font-mono text-sm">{item.code}</TableCell>
                                <TableCell className="text-sm">
                                  {item.existingName !== item.name ? (
                                    <div className="space-y-1">
                                      <span className="text-muted-foreground line-through text-xs">
                                        {item.existingName || "(empty)"}
                                      </span>
                                      <br />
                                      <span className="text-green-700">{item.name || "(empty)"}</span>
                                    </div>
                                  ) : (
                                    <span className="text-muted-foreground">{item.name}</span>
                                  )}
                                </TableCell>
                                <TableCell className="text-sm">
                                  {item.existingSupplier !== item.supplier ? (
                                    <div className="space-y-1">
                                      <span className="text-muted-foreground line-through text-xs">
                                        {item.existingSupplier || "(empty)"}
                                      </span>
                                      <br />
                                      <span className="text-green-700">{item.supplier || "(empty)"}</span>
                                    </div>
                                  ) : (
                                    <span className="text-muted-foreground">{item.supplier}</span>
                                  )}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Import Button */}
                <div className="flex justify-end">
                  <Button 
                    onClick={handleImport} 
                    disabled={isPending || (preview.newItems.length === 0 && selectedChanges.size === 0)}
                    size="lg"
                    data-testid="button-import"
                  >
                    {importMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Importing...
                      </>
                    ) : (
                      <>
                        <Upload className="h-4 w-4 mr-2" />
                        Import {preview.newItems.length} New
                        {selectedChanges.size > 0 && ` + Update ${selectedChanges.size} Changed`}
                      </>
                    )}
                  </Button>
                </div>
              </>
            )}
          </TabsContent>

          <TabsContent value="images" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Link Images to Products</CardTitle>
                <CardDescription>
                  Upload an image and enter the row numbers from your CSV that this image applies to.
                  Use commas for multiple rows (e.g., "7, 8, 9") or ranges (e.g., "32-35").
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Product Image</Label>
                    <Input
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      disabled={isLinkingImage}
                      data-testid="input-image-file"
                    />
                    {imageFile && (
                      <p className="text-sm text-muted-foreground">Selected: {imageFile.name}</p>
                    )}
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Row Numbers</Label>
                    <Input
                      placeholder="e.g., 7, 8, 9 or 32-35"
                      value={imageRowNumbers}
                      onChange={(e) => setImageRowNumbers(e.target.value)}
                      disabled={isLinkingImage}
                      data-testid="input-row-numbers"
                    />
                    {imageRowNumbers && (
                      <p className="text-sm text-muted-foreground">
                        Will link to rows: {parseRowNumbers(imageRowNumbers).join(', ') || 'none'}
                      </p>
                    )}
                  </div>
                </div>

                <Button 
                  onClick={handleLinkImage}
                  disabled={isLinkingImage || !imageFile || !imageRowNumbers.trim()}
                  data-testid="button-link-image"
                >
                  {isLinkingImage ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Linking...
                    </>
                  ) : (
                    <>
                      <ImageIcon className="h-4 w-4 mr-2" />
                      Upload & Link Image
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
