import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  FileDown, Upload, CheckCircle2, AlertTriangle,
  Loader2, X, Link, Unlink
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

export default function AllmoxyImport() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<ImportResult[] | null>(null);

  const handleFiles = async (files: FileList) => {
    setLoading(true);
    setResults(null);
    try {
      const formData = new FormData();
      for (let i = 0; i < files.length; i++) {
        formData.append('files', files[i]);
      }
      const res = await fetch('/api/admin/import/batch', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setResults(data.results);
      queryClient.invalidateQueries({ queryKey: ['/api/admin/allmoxy-products'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/attribute-grids'] });
      const errors = data.results.filter((r: ImportResult) => r.error).length;
      toast({
        title: 'Import complete',
        description: `${data.totalFiles} files processed${errors ? `, ${errors} errors` : ''}`,
        variant: errors ? 'destructive' : 'default',
      });
    } catch (e: any) {
      toast({ title: 'Import failed', description: e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
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
            Products are automatically linked to their matching attribute grid.
          </p>
          <p>
            <strong className="text-foreground">After import</strong> — assign a Pricing Proxy Variable
            and Export Proxy Variable to one product per category, then use the Formula Tester to verify
            pricing is correct before applying to all products in that category.
          </p>
        </CardContent>
      </Card>

      <label
        data-testid="dropzone-allmoxy-import"
        className={`flex flex-col items-center justify-center w-full h-40 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${loading ? 'opacity-50 pointer-events-none' : 'hover:border-primary hover:bg-muted/20'}`}
      >
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Upload className="h-10 w-10" />
          <div className="text-center">
            <p className="text-sm font-medium text-foreground">Click to select Allmoxy export files</p>
            <p className="text-xs mt-1">Select any mix of PF Product files and Attribute Grid files</p>
            <p className="text-xs text-muted-foreground/70 mt-1">All selected files will be processed together</p>
          </div>
        </div>
        <input
          type="file"
          accept=".csv"
          multiple
          className="hidden"
          disabled={loading}
          data-testid="input-allmoxy-files"
          onChange={e => { if (e.target.files?.length) handleFiles(e.target.files); }}
        />
      </label>

      {loading && (
        <div className="flex items-center justify-center gap-2 text-muted-foreground py-4">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Processing files — attribute grids first, then products...</span>
        </div>
      )}

      {results && !loading && (
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
              <p>1. Go to <strong>Products</strong> and assign a Pricing Proxy Variable and Export Proxy Variable to one product from each category.</p>
              <p>2. Use the <strong>Formula Tester</strong> to verify that product prices correctly — enter a MANU_CODE from the grid and check the result.</p>
              <p>3. Once verified, you can bulk-assign the same proxy variables to all products in that category.</p>
            </CardContent>
          </Card>

        </div>
      )}
    </div>
  );
}
