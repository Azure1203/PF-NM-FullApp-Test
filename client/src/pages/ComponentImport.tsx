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
  AlertCircle, RefreshCw, Package
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  existingCategory: string | null;
  existingId: number;
}

interface PreviewResult {
  totalParsed: number;
  uniqueItems: number;
  duplicatesSkipped: number;
  newItems: ParsedItem[];
  unchangedItems: ParsedItem[];
  changedItems: ChangedItem[];
}

export default function ComponentImport() {
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [selectedChanges, setSelectedChanges] = useState<Set<number>>(new Set());

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
      
      const response = await fetch('/api/components/import/preview', {
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
      setSelectedChanges(new Set(data.changedItems.map(item => item.existingId)));
      const dupMsg = data.duplicatesSkipped > 0 ? ` (${data.duplicatesSkipped} duplicates skipped)` : '';
      toast({ title: `Parsed ${data.uniqueItems} unique components from CSV${dupMsg}` });
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
      
      const BATCH_SIZE = 200;
      
      if (preview.newItems.length > 0) {
        for (let i = 0; i < preview.newItems.length; i += BATCH_SIZE) {
          const batch = preview.newItems.slice(i, i + BATCH_SIZE);
          const response = await apiRequest('POST', '/api/components/import', {
            items: batch,
          });
          const data = await response.json();
          results.created += data.created?.length || 0;
          results.errors += data.errors?.length || 0;
        }
      }
      
      const itemsToUpdate = preview.changedItems.filter(item => selectedChanges.has(item.existingId));
      if (itemsToUpdate.length > 0) {
        for (let i = 0; i < itemsToUpdate.length; i += BATCH_SIZE) {
          const batch = itemsToUpdate.slice(i, i + BATCH_SIZE);
          const response = await apiRequest('POST', '/api/components/import/update', {
            items: batch,
          });
          const data = await response.json();
          results.updated += data.updated?.length || 0;
          results.errors += data.errors?.length || 0;
        }
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
            <h1 className="text-2xl font-bold">Component Import</h1>
            <Badge variant="secondary">COMPONENT category</Badge>
          </div>
        </div>
      </div>
      
      <div className="container mx-auto px-4 py-6 max-w-6xl space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Upload Component CSV</CardTitle>
            <CardDescription>
              Upload a CSV file with components (doors, drawer boxes, etc.) from external suppliers.
              <br />Format: A = Name/Description, B = Product Code, C = Supplier
              <br />Components are stored with category "COMPONENT" and always marked as "IN_STOCK".
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div
              {...getRootProps()}
              className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                isDragActive ? 'border-primary bg-primary/5' : 'border-slate-300 hover:border-primary'
              }`}
            >
              <input {...getInputProps()} data-testid="input-component-csv-file" />
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
              <Button 
                onClick={handlePreview} 
                disabled={!file || isPending}
                data-testid="button-preview-components"
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

        {preview && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-green-100 rounded-lg">
                      <Package className="h-5 w-5 text-green-600" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{preview.newItems.length}</p>
                      <p className="text-sm text-muted-foreground">New Components</p>
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

            {preview.newItems.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                      {preview.newItems.length}
                    </Badge>
                    New Components to Add
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="max-h-64 overflow-y-auto border rounded-md">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-16">Row</TableHead>
                          <TableHead>Code</TableHead>
                          <TableHead>Name</TableHead>
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
                    Selected items will have their name, supplier, and category updated to COMPONENT
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
                          <TableHead>Current Category</TableHead>
                          <TableHead>Current / New Name</TableHead>
                          <TableHead>Current / New Supplier</TableHead>
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
                            <TableCell>
                              {item.existingCategory === 'HARDWARE' ? (
                                <Badge variant="secondary" className="bg-amber-100 text-amber-800">
                                  HARDWARE (will become COMPONENT)
                                </Badge>
                              ) : (
                                <Badge variant="outline">COMPONENT</Badge>
                              )}
                            </TableCell>
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

            <div className="flex justify-end gap-4">
              <Button
                variant="outline"
                onClick={() => {
                  setPreview(null);
                  setFile(null);
                }}
                disabled={isPending}
              >
                Cancel
              </Button>
              <Button
                onClick={handleImport}
                disabled={isPending || (preview.newItems.length === 0 && selectedChanges.size === 0)}
                data-testid="button-import-components"
              >
                {importMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Importing...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Import {preview.newItems.length + selectedChanges.size} Components
                  </>
                )}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
