import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  FileDown, Upload, CheckCircle2, AlertTriangle,
  Loader2, X, Link, Unlink,
} from "lucide-react";

type ImportResult = {
  file: string;
  type?: 'pf-products' | 'attribute-grid';
  error?: string;
  categoryName?: string;
  productsInserted?: number;
  gridMatched?: boolean;
  matchedGridName?: string;
  gridName?: string;
  rowCount?: number;
  keyColumn?: string;
};

type CategoryPreview = {
  filename: string;
  categoryName: string;
  isPFProduct: boolean;
  productCount: number;
  pairedGridName: string | null;
  matchedGridId: number | null;
  matchedGridName: string | null;
  suggestedAlias: string;
};

type CategoryConfig = {
  pricingProxyId: number | null;
  exportProxyId: number | null;
  gridId: number | null;
  alias: string;
  lookupColumn: string;
};

type PreviewResult = {
  categories: CategoryPreview[];
  availableProxyVars: { id: number; name: string; type: string }[];
  availableGrids: { id: number; name: string }[];
};

export default function AllmoxyImport() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<ImportResult[] | null>(null);
  const [step, setStep] = useState<'select' | 'configure' | 'results'>('select');
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [categoryConfigs, setCategoryConfigs] = useState<Record<string, CategoryConfig>>({});
  const [pendingFiles, setPendingFiles] = useState<FileList | null>(null);

  // Phase 1 — analyse files, show configuration step
  const handleFiles = async (files: FileList) => {
    setPreviewLoading(true);
    setPendingFiles(files);
    try {
      const formData = new FormData();
      for (let i = 0; i < files.length; i++) {
        formData.append('files', files[i]);
      }
      const res = await fetch('/api/admin/import/batch/preview', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setPreview(data);

      // Pre-populate configs with smart defaults
      const defaults: Record<string, CategoryConfig> = {};
      for (const cat of data.categories.filter((c: CategoryPreview) => c.isPFProduct)) {
        const pricingVar = data.availableProxyVars.find((v: any) =>
          v.name.toLowerCase() === cat.suggestedAlias + '_pricing' ||
          v.name.toLowerCase().includes(cat.suggestedAlias)
        );
        const exportVar = data.availableProxyVars.find((v: any) =>
          v.name.toLowerCase() === cat.suggestedAlias + '_export'
        );
        defaults[cat.categoryName] = {
          pricingProxyId: pricingVar?.id ?? null,
          exportProxyId: exportVar?.id ?? null,
          gridId: cat.matchedGridId,
          alias: cat.suggestedAlias,
          lookupColumn: 'MANU_CODE',
        };
      }
      setCategoryConfigs(defaults);
      setStep('configure');
    } catch (e: any) {
      toast({ title: 'Analysis failed', description: e.message, variant: 'destructive' });
    } finally {
      setPreviewLoading(false);
    }
  };

  // Phase 2 — commit with configuration
  const handleCommit = async () => {
    if (!pendingFiles) return;
    setLoading(true);
    setResults(null);
    try {
      const formData = new FormData();
      for (let i = 0; i < pendingFiles.length; i++) {
        formData.append('files', pendingFiles[i]);
      }
      formData.append('config', JSON.stringify(categoryConfigs));
      const res = await fetch('/api/admin/import/batch', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setResults(data.results);
      setStep('results');
      queryClient.invalidateQueries({ queryKey: ['/api/admin/allmoxy-products'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/attribute-grids'] });
      toast({ title: 'Import complete', description: `${data.totalFiles} files processed` });
    } catch (e: any) {
      toast({ title: 'Import failed', description: e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const resetToSelect = () => {
    setStep('select');
    setPreview(null);
    setResults(null);
    setPendingFiles(null);
    setCategoryConfigs({});
  };

  const pfResults = results?.filter(r => r.type === 'pf-products') ?? [];
  const gridResults = results?.filter(r => r.type === 'attribute-grid') ?? [];
  const errorResults = results?.filter(r => r.error) ?? [];

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">

      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <FileDown className="h-6 w-6 text-primary" />
          Allmoxy Import
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Import PF Product files and Attribute Grid files exported from Allmoxy.
          Select all files at once — the system will detect each file type automatically,
          process attribute grids first, then link products to their matching grids.
        </p>
      </div>

      {step === 'select' && (
        <>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                How it works
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-2">
              <p>
                <strong className="text-foreground">Attribute grid files</strong> — files like{' '}
                <code className="text-xs bg-muted px-1 rounded">Shelves_02202026.csv</code>,{' '}
                <code className="text-xs bg-muted px-1 rounded">Doors_02202026.csv</code> etc.
                These contain the pricing data (BASE_PRICE, SQ_FT_PRICE, MARGIN). Existing grid data is wiped and replaced.
              </p>
              <p>
                <strong className="text-foreground">PF Product files</strong> — files starting with{' '}
                <code className="text-xs bg-muted px-1 rounded">PF_</code> like{' '}
                <code className="text-xs bg-muted px-1 rounded">PF_Shelf_Products_02202026.csv</code>.
                Each row becomes one product record. Existing products in that category are wiped and replaced.
                After upload you can assign a Pricing Formula, Export Formula, and Attribute Grid per category.
              </p>
            </CardContent>
          </Card>

          <label
            data-testid="dropzone-allmoxy-import"
            className={`flex flex-col items-center justify-center w-full h-40 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${previewLoading ? 'opacity-50 pointer-events-none' : 'hover:border-primary hover:bg-muted/20'}`}
          >
            <div className="flex flex-col items-center gap-3 text-muted-foreground">
              {previewLoading ? (
                <Loader2 className="h-10 w-10 animate-spin" />
              ) : (
                <Upload className="h-10 w-10" />
              )}
              <div className="text-center">
                <p className="text-sm font-medium text-foreground">
                  {previewLoading ? 'Analysing files…' : 'Click to select Allmoxy export files'}
                </p>
                <p className="text-xs mt-1">Select any mix of PF Product files and Attribute Grid files</p>
                <p className="text-xs text-muted-foreground/70 mt-1">All selected files will be processed together</p>
              </div>
            </div>
            <input
              type="file"
              accept=".csv"
              multiple
              className="hidden"
              disabled={previewLoading}
              data-testid="input-allmoxy-files"
              onChange={e => { if (e.target.files?.length) handleFiles(e.target.files); }}
            />
          </label>
        </>
      )}

      {step === 'configure' && preview && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold">Configure Import</h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                Set pricing formula and grid binding for each product category.
                These will be applied to all products in that category.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={resetToSelect}>
              ← Back
            </Button>
          </div>

          {preview.categories.filter(c => !c.isPFProduct).length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Attribute Grids — will be imported as-is</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                {preview.categories.filter(c => !c.isPFProduct).map((cat, i) => (
                  <div key={i} className="flex items-center justify-between text-sm py-1 border-b last:border-0">
                    <span className="font-medium">{cat.categoryName}</span>
                    <span className="text-xs text-muted-foreground">{cat.productCount} rows · {cat.filename}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {preview.categories.filter(c => c.isPFProduct).length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Product Categories — configure below</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {preview.categories.filter(c => c.isPFProduct).map((cat, i) => {
                  const config = categoryConfigs[cat.categoryName] ?? {
                    pricingProxyId: null,
                    exportProxyId: null,
                    gridId: cat.matchedGridId,
                    alias: cat.suggestedAlias,
                    lookupColumn: 'MANU_CODE',
                  };
                  const updateConfig = (updates: Partial<CategoryConfig>) => {
                    setCategoryConfigs(prev => ({
                      ...prev,
                      [cat.categoryName]: { ...config, ...updates },
                    }));
                  };

                  return (
                    <div key={i} className="space-y-3 pb-4 border-b last:border-0">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-semibold text-sm">{cat.categoryName}</p>
                          <p className="text-xs text-muted-foreground">{cat.productCount} products · {cat.filename}</p>
                        </div>
                        {config.gridId ? (
                          <Badge className="text-[10px] bg-green-100 text-green-700 border-green-300">
                            <Link className="h-2.5 w-2.5 mr-1" />
                            grid linked
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300">
                            <Unlink className="h-2.5 w-2.5 mr-1" />
                            no grid match
                          </Badge>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-xs font-medium">Pricing Formula</label>
                          <Select
                            value={config.pricingProxyId ? String(config.pricingProxyId) : 'none'}
                            onValueChange={val => updateConfig({ pricingProxyId: val === 'none' ? null : Number(val) })}
                          >
                            <SelectTrigger className="h-8 text-xs" data-testid={`select-pricing-proxy-${i}`}>
                              <SelectValue placeholder="Select pricing formula…" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">None</SelectItem>
                              {preview.availableProxyVars
                                .filter(v => v.type === 'pricing')
                                .map(v => (
                                  <SelectItem key={v.id} value={String(v.id)}>{v.name}</SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-1">
                          <label className="text-xs font-medium">Export Formula</label>
                          <Select
                            value={config.exportProxyId ? String(config.exportProxyId) : 'none'}
                            onValueChange={val => updateConfig({ exportProxyId: val === 'none' ? null : Number(val) })}
                          >
                            <SelectTrigger className="h-8 text-xs" data-testid={`select-export-proxy-${i}`}>
                              <SelectValue placeholder="Select export formula…" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">None (Skip Export)</SelectItem>
                              {preview.availableProxyVars
                                .filter(v => v.type === 'export')
                                .map(v => (
                                  <SelectItem key={v.id} value={String(v.id)}>{v.name}</SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-1">
                          <label className="text-xs font-medium">Attribute Grid</label>
                          <Select
                            value={config.gridId ? String(config.gridId) : 'none'}
                            onValueChange={val => updateConfig({ gridId: val === 'none' ? null : Number(val) })}
                          >
                            <SelectTrigger className="h-8 text-xs" data-testid={`select-grid-${i}`}>
                              <SelectValue placeholder="Select grid…" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">None</SelectItem>
                              {preview.availableGrids.map(g => (
                                <SelectItem key={g.id} value={String(g.id)}>{g.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-1">
                          <label className="text-xs font-medium">Formula Alias</label>
                          <Input
                            className="h-8 text-xs font-mono"
                            value={config.alias}
                            onChange={e => updateConfig({ alias: e.target.value })}
                            placeholder="e.g. closet_rod"
                            data-testid={`input-alias-${i}`}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}

          <Button
            className="w-full"
            onClick={handleCommit}
            disabled={loading}
            data-testid="button-confirm-import"
          >
            {loading
              ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Importing...</>
              : <><FileDown className="h-4 w-4 mr-2" />Confirm & Import All</>
            }
          </Button>
        </div>
      )}

      {step === 'results' && results && (
        <div className="space-y-4">

          <div className="flex flex-wrap gap-3 text-sm">
            {gridResults.length > 0 && (
              <span className="flex items-center gap-1.5 text-blue-600 font-medium">
                <CheckCircle2 className="h-4 w-4" />
                {gridResults.length} attribute grid{gridResults.length !== 1 ? 's' : ''} imported
              </span>
            )}
            {pfResults.length > 0 && (
              <span className="flex items-center gap-1.5 text-green-600 font-medium">
                <CheckCircle2 className="h-4 w-4" />
                {pfResults.reduce((sum, r) => sum + (r.productsInserted ?? 0), 0)} products imported
                across {pfResults.length} categor{pfResults.length !== 1 ? 'ies' : 'y'}
              </span>
            )}
            {pfResults.filter(r => r.gridMatched).length > 0 && (
              <span className="flex items-center gap-1.5 text-green-600 font-medium">
                <Link className="h-4 w-4" />
                {pfResults.filter(r => r.gridMatched).length} auto-linked to grids
              </span>
            )}
            {pfResults.filter(r => !r.gridMatched).length > 0 && (
              <span className="flex items-center gap-1.5 text-amber-600 font-medium">
                <Unlink className="h-4 w-4" />
                {pfResults.filter(r => !r.gridMatched).length} not linked (grid not found)
              </span>
            )}
            {errorResults.length > 0 && (
              <span className="flex items-center gap-1.5 text-destructive font-medium">
                <X className="h-4 w-4" />
                {errorResults.length} error{errorResults.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          {gridResults.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Attribute Grids</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5">
                {gridResults.map((r, i) => (
                  <div key={i} className="flex items-center justify-between text-sm py-1 border-b last:border-0">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
                      <span className="font-medium">{r.gridName}</span>
                      <span className="text-xs text-muted-foreground font-mono">{r.file}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{r.rowCount} rows</span>
                      <Badge variant="outline" className="text-[10px]">key: {r.keyColumn}</Badge>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {pfResults.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Products</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5">
                {pfResults.map((r, i) => (
                  <div key={i} className="flex items-center justify-between text-sm py-1 border-b last:border-0">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
                      <span className="font-medium">{r.categoryName}</span>
                      <span className="text-xs text-muted-foreground font-mono">{r.file}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-muted-foreground">{r.productsInserted} products</span>
                      {r.gridMatched ? (
                        <Badge className="text-[10px] bg-green-100 text-green-700 border-green-300">
                          <Link className="h-2.5 w-2.5 mr-1" />
                          linked → {r.matchedGridName}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300">
                          <Unlink className="h-2.5 w-2.5 mr-1" />
                          no grid match
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {errorResults.length > 0 && (
            <Card className="border-destructive/30">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-destructive">Errors</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5">
                {errorResults.map((r, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm py-1 border-b last:border-0">
                    <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />
                    <div>
                      <span className="font-mono text-xs text-muted-foreground">{r.file}</span>
                      <p className="text-destructive text-xs mt-0.5">{r.error}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <Card className="bg-muted/30">
            <CardContent className="pt-4 text-sm text-muted-foreground space-y-1">
              <p className="font-medium text-foreground">Next steps</p>
              <p>1. Use the <strong>Formula Tester</strong> to verify that pricing is correct for a product from each category.</p>
              <p>2. If proxy variables were not assigned during import, go to <strong>Products</strong> and assign them per category.</p>
            </CardContent>
          </Card>

          <Button
            variant="outline"
            className="w-full"
            onClick={resetToSelect}
            data-testid="button-import-more"
          >
            <Upload className="h-4 w-4 mr-2" />
            Import More Files
          </Button>

        </div>
      )}
    </div>
  );
}
