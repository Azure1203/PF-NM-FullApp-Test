import { useState, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Upload, ImagePlus, Check, Search, Package } from "lucide-react";

interface MatchResult {
  filename: string;
  storagePath: string;
  matchedProduct: string | null;
  targetTable: 'allmoxy' | 'hardware' | null;
  productId: number | null;
  confidence: 'exact' | 'prefix' | 'partial' | 'none';
}

interface UploadResponse {
  results: MatchResult[];
  summary: {
    total: number;
    exact: number;
    prefix: number;
    partial: number;
    unmatched: number;
  };
}

interface SearchResult {
  id: number;
  name: string;
  table: 'allmoxy' | 'hardware';
}

const confidenceColors: Record<string, string> = {
  exact: 'bg-green-100 text-green-800 border-green-200',
  prefix: 'bg-blue-100 text-blue-800 border-blue-200',
  partial: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  none: 'bg-red-100 text-red-800 border-red-200',
};

const confidenceLabels: Record<string, string> = {
  exact: 'Exact',
  prefix: 'Prefix',
  partial: 'Partial',
  none: 'None',
};

export default function ProductImageUploader() {
  const { toast } = useToast();
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [targetTable, setTargetTable] = useState('both');
  const [uploadResults, setUploadResults] = useState<UploadResponse | null>(null);
  const [checkedRows, setCheckedRows] = useState<Set<number>>(new Set());
  const [manualAssignments, setManualAssignments] = useState<Record<number, { productId: number; targetTable: 'allmoxy' | 'hardware'; productName: string }>>({}); 
  const [searchQueries, setSearchQueries] = useState<Record<number, string>>({});
  const [searchResults, setSearchResults] = useState<Record<number, SearchResult[]>>({});
  const [searchingIdx, setSearchingIdx] = useState<number | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files).filter(f => 
      /\.(jpg|jpeg|png|webp)$/i.test(f.name)
    );
    setSelectedFiles(files);
    setUploadResults(null);
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter(f => 
      /\.(jpg|jpeg|png|webp)$/i.test(f.name)
    );
    setSelectedFiles(files);
    setUploadResults(null);
  }, []);

  const uploadMutation = useMutation({
    mutationFn: async () => {
      const formData = new FormData();
      selectedFiles.forEach(f => formData.append('images', f));
      formData.append('targetTable', targetTable);
      
      const res = await fetch('/api/admin/products/bulk-upload-images', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Upload failed' }));
        throw new Error(err.message);
      }
      return res.json() as Promise<UploadResponse>;
    },
    onSuccess: (data) => {
      setUploadResults(data);
      const autoChecked = new Set<number>();
      data.results.forEach((r, idx) => {
        if (r.confidence === 'exact' || r.confidence === 'prefix') {
          autoChecked.add(idx);
        }
      });
      setCheckedRows(autoChecked);
      setManualAssignments({});
      toast({ title: `Uploaded ${data.summary.total} images`, description: `${data.summary.exact} exact, ${data.summary.prefix} prefix, ${data.summary.partial} partial, ${data.summary.unmatched} unmatched` });
    },
    onError: (error: Error) => {
      toast({ title: "Upload failed", description: error.message, variant: "destructive" });
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!uploadResults) return;
      const assignments = Array.from(checkedRows).map(idx => {
        const result = uploadResults.results[idx];
        const manual = manualAssignments[idx];
        return {
          storagePath: result.storagePath,
          targetTable: manual?.targetTable || result.targetTable,
          productId: manual?.productId || result.productId,
        };
      }).filter(a => a.targetTable && a.productId);

      const res = await fetch('/api/admin/products/confirm-image-assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignments }),
        credentials: 'include',
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Save failed' }));
        throw new Error(err.message);
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/products'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/allmoxy-products'] });
      toast({ title: `Saved ${data.updated} image assignments` });
      setSelectedFiles([]);
      setUploadResults(null);
      setCheckedRows(new Set());
      setManualAssignments({});
    },
    onError: (error: Error) => {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
    },
  });

  const searchProducts = async (query: string, idx: number) => {
    if (query.length < 2) {
      setSearchResults(prev => ({ ...prev, [idx]: [] }));
      return;
    }
    setSearchingIdx(idx);
    try {
      const res = await fetch(`/api/admin/products/search-all?q=${encodeURIComponent(query)}`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setSearchResults(prev => ({ ...prev, [idx]: data }));
      }
    } finally {
      setSearchingIdx(null);
    }
  };

  const checkedCount = checkedRows.size;

  const getImageSrc = (result: MatchResult) => {
    if (result.storagePath.startsWith('product-images/')) {
      return `/api/product-images/${encodeURIComponent(result.storagePath.replace('product-images/', ''))}`;
    }
    return result.storagePath;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-page-title">Bulk Product Image Uploader</h1>
        <p className="text-muted-foreground mt-1">Upload product images and match them to products by filename</p>
      </div>

      {!uploadResults ? (
        <Card>
          <CardContent className="p-6 space-y-4">
            <div
              data-testid="dropzone"
              className={`border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-colors ${
                isDragOver ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50'
              }`}
              onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={handleDrop}
              onClick={() => document.getElementById('file-input')?.click()}
            >
              <ImagePlus className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-lg font-medium">
                {selectedFiles.length > 0
                  ? `${selectedFiles.length} image${selectedFiles.length !== 1 ? 's' : ''} selected`
                  : 'Drop images here or click to browse'}
              </p>
              <p className="text-sm text-muted-foreground mt-1">Supports .jpg, .jpeg, .png, .webp</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={(e) => { e.stopPropagation(); document.getElementById('file-input')?.click(); }}
                data-testid="button-browse-files"
              >
                Browse Files
              </Button>
              <input
                id="file-input"
                type="file"
                multiple
                accept=".jpg,.jpeg,.png,.webp"
                className="hidden"
                onChange={handleFileSelect}
                data-testid="input-file"
              />
            </div>

            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">Target Table:</span>
                <Select value={targetTable} onValueChange={setTargetTable}>
                  <SelectTrigger className="w-[180px]" data-testid="select-target-table">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="both">Both</SelectItem>
                    <SelectItem value="allmoxy">Allmoxy Only</SelectItem>
                    <SelectItem value="hardware">Hardware Only</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button
                onClick={() => uploadMutation.mutate()}
                disabled={selectedFiles.length === 0 || uploadMutation.isPending}
                data-testid="button-upload-match"
              >
                {uploadMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4 mr-2" />
                )}
                Upload & Match
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground" data-testid="text-summary">
              {uploadResults.summary.total} images: {' '}
              <Badge variant="outline" className={confidenceColors.exact}>{uploadResults.summary.exact} exact</Badge>{' '}
              <Badge variant="outline" className={confidenceColors.prefix}>{uploadResults.summary.prefix} prefix</Badge>{' '}
              <Badge variant="outline" className={confidenceColors.partial}>{uploadResults.summary.partial} partial</Badge>{' '}
              <Badge variant="outline" className={confidenceColors.none}>{uploadResults.summary.unmatched} unmatched</Badge>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setUploadResults(null); setSelectedFiles([]); }}
              data-testid="button-start-over"
            >
              Start Over
            </Button>
          </div>

          <div className="border rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="p-2 w-10 text-center">
                      <input
                        type="checkbox"
                        checked={checkedRows.size === uploadResults.results.length}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setCheckedRows(new Set(uploadResults.results.map((_, i) => i)));
                          } else {
                            setCheckedRows(new Set());
                          }
                        }}
                        data-testid="checkbox-select-all"
                      />
                    </th>
                    <th className="p-2 w-16">Preview</th>
                    <th className="p-2 text-left">Filename</th>
                    <th className="p-2 text-left">Matched Product</th>
                    <th className="p-2 text-center">Table</th>
                    <th className="p-2 text-center">Confidence</th>
                  </tr>
                </thead>
                <tbody>
                  {uploadResults.results.map((result, idx) => {
                    const manual = manualAssignments[idx];
                    const displayProduct = manual?.productName || result.matchedProduct;
                    const displayTable = manual?.targetTable || result.targetTable;

                    return (
                      <tr key={idx} className="border-t hover:bg-muted/30" data-testid={`row-result-${idx}`}>
                        <td className="p-2 text-center">
                          <input
                            type="checkbox"
                            checked={checkedRows.has(idx)}
                            onChange={(e) => {
                              const next = new Set(checkedRows);
                              if (e.target.checked) next.add(idx);
                              else next.delete(idx);
                              setCheckedRows(next);
                            }}
                            data-testid={`checkbox-row-${idx}`}
                          />
                        </td>
                        <td className="p-2">
                          <img
                            src={getImageSrc(result)}
                            alt={result.filename}
                            className="w-10 h-10 object-cover rounded border"
                            onError={(e) => { e.currentTarget.style.display = 'none'; }}
                            data-testid={`img-thumbnail-${idx}`}
                          />
                        </td>
                        <td className="p-2 font-mono text-xs" data-testid={`text-filename-${idx}`}>
                          {result.filename}
                        </td>
                        <td className="p-2">
                          <div className="space-y-1">
                            {displayProduct && !searchQueries[idx] && (
                              <div className="flex items-center gap-1">
                                <span className="text-xs flex-1" data-testid={`text-matched-product-${idx}`}>
                                  {displayProduct}
                                </span>
                                <button
                                  type="button"
                                  className="text-[10px] text-muted-foreground hover:text-foreground underline shrink-0"
                                  onClick={() => setSearchQueries(prev => ({ ...prev, [idx]: ' ' }))}
                                  data-testid={`button-change-product-${idx}`}
                                >
                                  change
                                </button>
                              </div>
                            )}
                            {(!displayProduct || searchQueries[idx]) && (
                              <>
                                <div className="relative">
                                  <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
                                  <Input
                                    placeholder="Search products..."
                                    className="h-8 pl-7 text-xs"
                                    value={searchQueries[idx]?.trim() || ''}
                                    onChange={(e) => {
                                      setSearchQueries(prev => ({ ...prev, [idx]: e.target.value }));
                                      searchProducts(e.target.value, idx);
                                    }}
                                    data-testid={`input-search-product-${idx}`}
                                  />
                                  {searchingIdx === idx && <Loader2 className="absolute right-2 top-2 h-3.5 w-3.5 animate-spin" />}
                                  {displayProduct && (
                                    <button
                                      type="button"
                                      className="absolute right-2 top-2 text-[10px] text-muted-foreground hover:text-foreground"
                                      onClick={() => setSearchQueries(prev => { const next = { ...prev }; delete next[idx]; return next; })}
                                    >
                                      cancel
                                    </button>
                                  )}
                                </div>
                                {(searchResults[idx] || []).length > 0 && (
                                  <div className="border rounded max-h-32 overflow-y-auto">
                                    {searchResults[idx].map((sr) => (
                                      <button
                                        key={`${sr.table}-${sr.id}`}
                                        type="button"
                                        className="w-full text-left px-2 py-1 text-xs hover:bg-muted/50 flex items-center gap-2"
                                        onClick={() => {
                                          setManualAssignments(prev => ({
                                            ...prev,
                                            [idx]: { productId: sr.id, targetTable: sr.table, productName: sr.name }
                                          }));
                                          setSearchQueries(prev => { const next = { ...prev }; delete next[idx]; return next; });
                                          setSearchResults(prev => ({ ...prev, [idx]: [] }));
                                          setCheckedRows(prev => new Set([...prev, idx]));
                                        }}
                                        data-testid={`button-select-product-${idx}-${sr.id}`}
                                      >
                                        <Badge variant="outline" className="text-[10px] px-1">
                                          {sr.table === 'hardware' ? 'HW' : 'AM'}
                                        </Badge>
                                        <span className="truncate">{sr.name}</span>
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                        <td className="p-2 text-center">
                          {displayTable && (
                            <Badge variant="outline" className="text-xs" data-testid={`badge-table-${idx}`}>
                              {displayTable === 'hardware' ? 'Hardware' : 'Allmoxy'}
                            </Badge>
                          )}
                        </td>
                        <td className="p-2 text-center">
                          <Badge
                            variant="outline"
                            className={confidenceColors[manual ? 'exact' : result.confidence]}
                            data-testid={`badge-confidence-${idx}`}
                          >
                            {manual ? 'Manual' : confidenceLabels[result.confidence]}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex justify-end">
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={checkedCount === 0 || saveMutation.isPending}
              data-testid="button-save-assignments"
            >
              {saveMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Check className="h-4 w-4 mr-2" />
              )}
              Save {checkedCount} Image Assignment{checkedCount !== 1 ? 's' : ''}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
