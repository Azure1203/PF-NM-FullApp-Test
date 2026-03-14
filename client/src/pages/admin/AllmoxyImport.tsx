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
  Loader2, Link, Unlink,
} from "lucide-react";

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

  // Grid import state
  const [gridImportLoading, setGridImportLoading] = useState(false);
  const [gridResults, setGridResults] = useState<any[] | null>(null);

  // Product import state
  const [productStep, setProductStep] = useState<'select' | 'configure' | 'results'>('select');
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [categoryConfigs, setCategoryConfigs] = useState<Record<string, CategoryConfig>>({});
  const [pendingFiles, setPendingFiles] = useState<FileList | null>(null);
  const [loading, setLoading] = useState(false);
  const [productResults, setProductResults] = useState<any[] | null>(null);

  // Handle attribute grid files — import immediately, no config
  const handleGridImport = async (files: FileList) => {
    setGridImportLoading(true);
    setGridResults(null);
    try {
      const formData = new FormData();
      for (let i = 0; i < files.length; i++) {
        formData.append('files', files[i]);
      }
      const res = await fetch('/api/admin/import/batch', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setGridResults(data.results.filter((r: any) => r.type === 'attribute-grid' || r.error));
      queryClient.invalidateQueries({ queryKey: ['/api/admin/attribute-grids'] });
      toast({ title: 'Grids imported', description: `${data.results.filter((r: any) => !r.error).length} grids updated` });
    } catch (e: any) {
      toast({ title: 'Import failed', description: e.message, variant: 'destructive' });
    } finally {
      setGridImportLoading(false);
    }
  };

  // Handle PF product files — analyse first, show config step
  const handleProductPreview = async (files: FileList) => {
    setPreviewLoading(true);
    setPendingFiles(files);
    try {
      const formData = new FormData();
      for (let i = 0; i < files.length; i++) {
        formData.append('files', files[i]);
      }
      const res = await fetch('/api/admin/import/batch/preview', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setPreview(data);
      // Auto-match proxy variables by name
      const defaults: Record<string, CategoryConfig> = {};
      for (const cat of data.categories.filter((c: CategoryPreview) => c.isPFProduct)) {
        const pricingVar = data.availableProxyVars.find((v: any) =>
          v.name === cat.suggestedAlias + '_pricing' ||
          v.name.toLowerCase().includes(cat.suggestedAlias.replace(/_/g, ''))
        );
        const exportVar = data.availableProxyVars.find((v: any) =>
          v.name === cat.suggestedAlias + '_export'
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
      setProductStep('configure');
    } catch (e: any) {
      toast({ title: 'Analysis failed', description: e.message, variant: 'destructive' });
    } finally {
      setPreviewLoading(false);
    }
  };

  // Commit product import with configuration
  const handleProductCommit = async () => {
    if (!pendingFiles) return;
    setLoading(true);
    try {
      const formData = new FormData();
      for (let i = 0; i < pendingFiles.length; i++) {
        formData.append('files', pendingFiles[i]);
      }
      formData.append('config', JSON.stringify(categoryConfigs));
      const res = await fetch('/api/admin/import/batch', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setProductResults(data.results.filter((r: any) => r.type === 'pf-products' || r.error));
      setProductStep('results');
      queryClient.invalidateQueries({ queryKey: ['/api/admin/allmoxy-products'] });
      toast({ title: 'Products imported' });
    } catch (e: any) {
      toast({ title: 'Import failed', description: e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">

      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <FileDown className="h-6 w-6 text-primary" />
          Allmoxy Import
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Import Allmoxy export files in two steps — grids first, then products.
        </p>
      </div>

      {/* ── Step 1: Attribute Grids ── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Step 1 — Import Attribute Grids
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Import pricing data files like{' '}
            <code className="text-xs bg-muted px-1 rounded">Shelves_02202026.csv</code>,{' '}
            <code className="text-xs bg-muted px-1 rounded">Doors_02202026.csv</code> etc.
            These are imported immediately with no configuration needed.
          </p>
          <label
            data-testid="dropzone-grid-import"
            className={`flex flex-col items-center justify-center w-full h-28 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${gridImportLoading ? 'opacity-50 pointer-events-none' : 'hover:border-primary hover:bg-muted/20'}`}
          >
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <Upload className="h-7 w-7" />
              <span className="text-sm font-medium">Click to select attribute grid files</span>
              <span className="text-xs">Do not select PF_ files here</span>
            </div>
            <input
              type="file"
              accept=".csv"
              multiple
              className="hidden"
              disabled={gridImportLoading}
              data-testid="input-grid-files"
              onChange={e => { if (e.target.files?.length) handleGridImport(e.target.files); }}
            />
          </label>
          {gridImportLoading && (
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin" /> Importing grids...
            </div>
          )}
          {gridResults && (
            <div className="space-y-1">
              {gridResults.map((r: any, i: number) => (
                <div key={i} className="flex items-center justify-between text-sm py-1 border-b last:border-0">
                  <div className="flex items-center gap-2">
                    {r.error
                      ? <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                      : <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />}
                    <span className="font-medium">{r.gridName ?? r.file}</span>
                  </div>
                  {r.error
                    ? <span className="text-xs text-destructive">{r.error}</span>
                    : <span className="text-xs text-muted-foreground">{r.rowCount} rows</span>}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Step 2: Products ── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Step 2 — Import Products
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Import product files starting with{' '}
            <code className="text-xs bg-muted px-1 rounded">PF_</code> like{' '}
            <code className="text-xs bg-muted px-1 rounded">PF_Shelf_Products_02202026.csv</code>.
            You will be asked to assign a pricing formula, export formula, and attribute grid
            to each category before importing.
          </p>

          {productStep === 'select' && (
            <label
              data-testid="dropzone-product-import"
              className={`flex flex-col items-center justify-center w-full h-28 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${previewLoading ? 'opacity-50 pointer-events-none' : 'hover:border-primary hover:bg-muted/20'}`}
            >
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <Upload className="h-7 w-7" />
                <span className="text-sm font-medium">Click to select PF_ product files</span>
                <span className="text-xs">Only PF_ files — attribute grids go in Step 1</span>
              </div>
              <input
                type="file"
                accept=".csv"
                multiple
                className="hidden"
                disabled={previewLoading}
                data-testid="input-product-files"
                onChange={e => { if (e.target.files?.length) handleProductPreview(e.target.files); }}
              />
            </label>
          )}

          {previewLoading && (
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin" /> Analysing files...
            </div>
          )}

          {productStep === 'configure' && preview && (
            <div className="space-y-4">
              {preview.categories.filter((c: CategoryPreview) => c.isPFProduct).map((cat: CategoryPreview, i: number) => {
                const config = categoryConfigs[cat.categoryName] ?? {
                  pricingProxyId: null,
                  exportProxyId: null,
                  gridId: cat.matchedGridId,
                  alias: cat.suggestedAlias,
                  lookupColumn: 'MANU_CODE',
                };
                const updateConfig = (updates: Partial<CategoryConfig>) =>
                  setCategoryConfigs(prev => ({ ...prev, [cat.categoryName]: { ...config, ...updates } }));

                return (
                  <div key={i} className="space-y-3 pb-4 border-b last:border-0">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-sm">{cat.categoryName}</p>
                        <p className="text-xs text-muted-foreground">{cat.productCount} products</p>
                      </div>
                      {config.gridId
                        ? <Badge className="text-[10px] bg-green-100 text-green-700 border-green-300"><Link className="h-2.5 w-2.5 mr-1" />grid linked</Badge>
                        : <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300"><Unlink className="h-2.5 w-2.5 mr-1" />no grid match</Badge>
                      }
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-xs font-medium">Pricing Formula</label>
                        <Select
                          value={config.pricingProxyId ? String(config.pricingProxyId) : 'none'}
                          onValueChange={val => updateConfig({ pricingProxyId: val === 'none' ? null : Number(val) })}
                        >
                          <SelectTrigger className="h-8 text-xs" data-testid={`select-pricing-proxy-${i}`}>
                            <SelectValue placeholder="Select…" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">None</SelectItem>
                            {preview.availableProxyVars.filter((v: any) => v.type === 'pricing').map((v: any) => (
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
                            <SelectValue placeholder="Select…" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">None (Skip Export)</SelectItem>
                            {preview.availableProxyVars.filter((v: any) => v.type === 'export').map((v: any) => (
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
                            <SelectValue placeholder="Select…" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">None</SelectItem>
                            {preview.availableGrids.map((g: any) => (
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

              <div className="flex gap-2">
                <Button variant="outline" onClick={() => { setProductStep('select'); setPreview(null); }}>
                  ← Back
                </Button>
                <Button className="flex-1" onClick={handleProductCommit} disabled={loading} data-testid="button-confirm-product-import">
                  {loading
                    ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Importing...</>
                    : <><FileDown className="h-4 w-4 mr-2" />Confirm & Import</>
                  }
                </Button>
              </div>
            </div>
          )}

          {productStep === 'results' && productResults && (
            <div className="space-y-2">
              {productResults.map((r: any, i: number) => (
                <div key={i} className="flex items-center justify-between text-sm py-1 border-b last:border-0">
                  <div className="flex items-center gap-2">
                    {r.error
                      ? <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                      : <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />}
                    <span className="font-medium">{r.categoryName ?? r.file}</span>
                  </div>
                  {r.error
                    ? <span className="text-xs text-destructive">{r.error}</span>
                    : (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{r.productsInserted} products</span>
                        {r.gridMatched && (
                          <Badge className="text-[10px] bg-green-100 text-green-700 border-green-300">linked</Badge>
                        )}
                      </div>
                    )
                  }
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setProductStep('select'); setProductResults(null); }}
                data-testid="button-import-more-products"
              >
                Import more
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

    </div>
  );
}
