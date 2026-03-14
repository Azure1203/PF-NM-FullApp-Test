import { useState, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import {
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronRight,
  Loader2,
  FlaskConical,
  AlertTriangle,
  Info,
} from "lucide-react";
import type { AllmoxyProduct, ProductGridBinding } from "@shared/schema";

type TestResult = {
  productName: string;
  skuPrefix: string | null;
  pricingFormulaName: string | null;
  exportFormulaName: string | null;
  finalScope: Record<string, any>;
  gridLookupResults: Array<{
    alias: string;
    gridName: string;
    lookupColumn: string;
    lookupValue: string;
    matched: boolean;
    rowData: any | null;
  }>;
  unitPrice: number;
  totalPrice: number;
  pricingError: string | null;
  exportText: string | null;
  exportError: string | null;
};

export default function FormulaTester() {
  const { toast } = useToast();
  const resultsRef = useRef<HTMLDivElement>(null);

  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);
  const [width, setWidth] = useState("300");
  const [height, setHeight] = useState("600");
  const [length, setLength] = useState("19");
  const [quantity, setQuantity] = useState("1");
  const [lookupInputs, setLookupInputs] = useState<Record<string, string>>({});
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [scopeOpen, setScopeOpen] = useState(false);
  const [lookupsOpen, setLookupsOpen] = useState(true);
  const [result, setResult] = useState<TestResult | null>(null);

  const { data: products } = useQuery<AllmoxyProduct[]>({
    queryKey: ["/api/admin/allmoxy-products"],
  });

  const { data: bindings } = useQuery<ProductGridBinding[]>({
    queryKey: ["/api/admin/allmoxy-products", selectedProductId, "grid-bindings"],
    queryFn: async () => {
      const res = await fetch(`/api/admin/allmoxy-products/${selectedProductId}/grid-bindings`);
      if (!res.ok) throw new Error("Failed to fetch bindings");
      return res.json();
    },
    enabled: selectedProductId !== null,
  });

  const selectedProduct = products?.find(p => p.id === selectedProductId) ?? null;

  const testMutation = useMutation({
    mutationFn: async () => {
      // Auto-populate lookup inputs from the product's own name (which is the MANU_CODE)
      // for any binding where the user hasn't manually provided a value
      const autoLookups: Record<string, string> = {};
      if (selectedProduct && bindings) {
        for (const binding of bindings) {
          if (!lookupInputs[binding.lookupColumn] && selectedProduct.name) {
            autoLookups[binding.lookupColumn] = selectedProduct.name;
          }
        }
      }

      console.log('[FormulaTester] autoLookups:', autoLookups, 'selectedProduct:', selectedProduct?.name, 'bindings:', bindings);

      const inputs: Record<string, any> = {
        width: parseFloat(width) || 0,
        height: parseFloat(height) || 0,
        length: parseFloat(length) || 0,
        depth: parseFloat(length) || 0,
        quantity: parseInt(quantity) || 1,
        ...autoLookups,
        ...lookupInputs, // manual entries still override auto ones
      };
      const res = await apiRequest("POST", "/api/admin/formula-test", {
        productId: selectedProductId,
        inputs,
      });
      return res.json() as Promise<TestResult>;
    },
    onSuccess: (data) => {
      setResult(data);
      setLookupsOpen(true);
      setScopeOpen(false);
      setTimeout(() => {
        resultsRef.current?.scrollTo({ top: 0, behavior: "smooth" });
      }, 50);
    },
    onError: (err: Error) => {
      toast({ title: "Test failed", description: err.message, variant: "destructive" });
    },
  });

  const runTest = useCallback(() => {
    if (!selectedProductId) return;
    testMutation.mutate();
  }, [selectedProductId, testMutation]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") runTest();
  };

  const toggleRowExpand = (alias: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(alias)) next.delete(alias);
      else next.add(alias);
      return next;
    });
  };

  const formatCurrency = (n: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);

  return (
    <div className="h-[calc(100vh-120px)] flex gap-0 border rounded-lg overflow-hidden bg-card">
      {/* ── Left column — Inputs ──────────────────────────────────── */}
      <div className="w-[38%] shrink-0 flex flex-col border-r">
        <div className="p-5 border-b bg-muted/20">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-primary" />
            Test Inputs
          </h3>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-5 space-y-6">
            {/* Product selector */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Product</label>
              <Select
                value={selectedProductId !== null ? String(selectedProductId) : ""}
                onValueChange={(val) => {
                  setSelectedProductId(Number(val));
                  setLookupInputs({});
                  setResult(null);
                }}
              >
                <SelectTrigger data-testid="select-product">
                  <SelectValue placeholder="Select a product…" />
                </SelectTrigger>
                <SelectContent>
                  {(products ?? []).map(p => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.skuPrefix ? `${p.skuPrefix} — ${p.name}` : p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {selectedProduct && !selectedProduct.pricingProxyId && (
                <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/20 p-3 text-sm text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  This product has no pricing formula assigned. Assign a Pricing Proxy Variable first.
                </div>
              )}
            </div>

            {/* Dimensions */}
            <div className="space-y-3">
              <label className="text-sm font-medium">Dimensions</label>
              <div className="grid grid-cols-2 gap-3">
                {([
                  { label: "Width (mm)", val: width, set: setWidth, id: "input-width" },
                  { label: "Height (mm)", val: height, set: setHeight, id: "input-height" },
                  { label: "Length (mm)", val: length, set: setLength, id: "input-length" },
                  { label: "Quantity", val: quantity, set: setQuantity, id: "input-quantity" },
                ] as const).map(({ label, val, set, id }) => (
                  <div key={id} className="space-y-1">
                    <label className="text-xs text-muted-foreground">{label}</label>
                    <Input
                      data-testid={id}
                      type="number"
                      value={val}
                      onChange={e => (set as (v: string) => void)(e.target.value)}
                      onKeyDown={handleKeyDown}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Grid binding auto-lookup note */}
            {bindings && bindings.length > 0 && bindings.some(b => !lookupInputs[b.lookupColumn]) && (
              <div className="space-y-1 rounded-md bg-muted/40 border px-3 py-2 text-xs text-muted-foreground">
                <p>
                  Lookup: using product SKU <span className="font-mono text-foreground">{selectedProduct?.name}</span> automatically
                </p>
              </div>
            )}

            {/* Run button */}
            <Button
              data-testid="button-run-test"
              className="w-full"
              onClick={runTest}
              disabled={!selectedProductId || testMutation.isPending}
            >
              {testMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <FlaskConical className="mr-2 h-4 w-4" />
              )}
              Run Pricing Test
            </Button>

            {/* Info box */}
            <div className="flex items-start gap-2 rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
              <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              This tester simulates exactly what happens when an order CSV is processed. Enter the same values you&apos;d see in an actual CSV row to verify the price is calculated correctly.
            </div>
          </div>
        </ScrollArea>
      </div>

      {/* ── Right column — Results ────────────────────────────────── */}
      <ScrollArea className="flex-1" ref={resultsRef}>
        <div className="p-6 space-y-6">
          {/* Product info card — shown as soon as a product is selected */}
          {selectedProduct && (
            <div className="rounded-lg border bg-muted/20 p-4 space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm">{selectedProduct.name}</span>
                {selectedProduct.skuPrefix && (
                  <Badge variant="secondary" className="font-mono text-xs">{selectedProduct.skuPrefix}</Badge>
                )}
                <Badge
                  variant={selectedProduct.status === "active" ? "default" : "secondary"}
                  className="text-[10px] uppercase ml-auto"
                >
                  {selectedProduct.status}
                </Badge>
              </div>
              {selectedProduct.description && (
                <p className="text-sm text-muted-foreground">{selectedProduct.description}</p>
              )}
              {selectedProduct.notes && (
                <p className="text-xs text-muted-foreground border-t pt-1.5 mt-1.5 italic">{selectedProduct.notes}</p>
              )}
            </div>
          )}

          {/* Empty state */}
          {!result && !testMutation.isPending && (
            <div className="flex flex-col items-center justify-center py-20 text-center text-muted-foreground">
              <FlaskConical className="h-12 w-12 mb-4 opacity-20" />
              <p className="text-sm">Select a product and enter dimensions,</p>
              <p className="text-sm">then click <span className="font-medium text-foreground">Run Pricing Test</span>.</p>
            </div>
          )}

          {testMutation.isPending && (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          )}

          {result && !testMutation.isPending && (
            <>
              {/* Section 1 — Price Result */}
              <div className={cn(
                "rounded-xl border p-5",
                result.pricingError
                  ? "border-red-300 bg-red-50 dark:bg-red-950/20"
                  : "border-green-300 bg-green-50 dark:bg-green-950/20"
              )}>
                {result.pricingError ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-red-600 dark:text-red-400 font-semibold">
                      <XCircle className="h-5 w-5" />
                      Pricing Error
                    </div>
                    <p className="text-sm text-red-600 dark:text-red-400 font-mono bg-red-100 dark:bg-red-950/40 rounded p-2">
                      {result.pricingError}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <div className="flex items-baseline gap-3">
                      <span
                        data-testid="text-unit-price"
                        className="text-3xl font-bold text-green-700 dark:text-green-400"
                      >
                        {formatCurrency(result.unitPrice)}
                      </span>
                      <span className="text-sm text-muted-foreground">per unit</span>
                    </div>
                    <div
                      data-testid="text-total-price"
                      className="text-sm text-muted-foreground"
                    >
                      Total (qty {result.finalScope.quantity ?? 1}): <strong className="text-foreground">{formatCurrency(result.totalPrice)}</strong>
                    </div>
                    {result.pricingFormulaName && (
                      <p className="text-xs text-muted-foreground pt-1">
                        Evaluated using: <span className="font-medium text-foreground">{result.pricingFormulaName}</span>
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Section 2 — Grid Lookup Results */}
              {result.gridLookupResults.length > 0 && (
                <Collapsible open={lookupsOpen} onOpenChange={setLookupsOpen}>
                  <CollapsibleTrigger className="flex items-center gap-2 w-full text-left">
                    <span className="font-semibold text-sm">Grid Lookups</span>
                    <Badge variant="outline" className="text-xs">{result.gridLookupResults.length}</Badge>
                    {lookupsOpen ? <ChevronDown className="h-4 w-4 ml-auto text-muted-foreground" /> : <ChevronRight className="h-4 w-4 ml-auto text-muted-foreground" />}
                  </CollapsibleTrigger>
                  <CollapsibleContent className="space-y-2 pt-2">
                    {result.gridLookupResults.map(lr => (
                      <div key={lr.alias} className="rounded-lg border bg-background overflow-hidden">
                        <div className="flex items-center gap-3 px-4 py-3">
                          {lr.matched
                            ? <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                            : <XCircle className="h-4 w-4 text-red-400 shrink-0" />
                          }
                          <Badge variant="outline" className="font-mono text-xs shrink-0">{lr.alias}</Badge>
                          <span className="text-sm text-muted-foreground truncate">
                            {lr.gridName} · <span className="font-mono">{lr.lookupColumn}</span> = &quot;{lr.lookupValue || <em>empty</em>}&quot;
                          </span>
                          {lr.matched && (
                            <button
                              className="ml-auto text-xs text-primary hover:underline shrink-0"
                              onClick={() => toggleRowExpand(lr.alias)}
                            >
                              {expandedRows.has(lr.alias) ? "Hide" : "View Row Data"}
                            </button>
                          )}
                        </div>
                        {!lr.matched && (
                          <div className="px-4 pb-3 text-xs text-amber-600 dark:text-amber-400">
                            No row found in &quot;{lr.gridName}&quot; for {lr.lookupColumn} = &quot;{lr.lookupValue}&quot;
                          </div>
                        )}
                        {lr.matched && expandedRows.has(lr.alias) && (
                          <pre className="px-4 pb-4 text-xs overflow-x-auto text-green-400 bg-slate-900 font-mono leading-relaxed">
                            {JSON.stringify(lr.rowData, null, 2)}
                          </pre>
                        )}
                      </div>
                    ))}
                  </CollapsibleContent>
                </Collapsible>
              )}

              {/* Section 3 — Full Scope Dump */}
              <Collapsible open={scopeOpen} onOpenChange={setScopeOpen}>
                <CollapsibleTrigger className="flex items-center gap-2 w-full text-left">
                  <span className="font-semibold text-sm">Full Formula Scope</span>
                  <span className="text-xs text-muted-foreground">(everything the formula can see)</span>
                  {scopeOpen ? <ChevronDown className="h-4 w-4 ml-auto text-muted-foreground" /> : <ChevronRight className="h-4 w-4 ml-auto text-muted-foreground" />}
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-2">
                  <pre
                    data-testid="text-scope-dump"
                    className="rounded-lg bg-slate-900 text-green-400 font-mono text-xs p-4 overflow-x-auto leading-relaxed"
                  >
                    {JSON.stringify(result.finalScope, null, 2)}
                  </pre>
                </CollapsibleContent>
              </Collapsible>

              {/* Section 4 — Export Text */}
              {(result.exportText || result.exportError) && (
                <div className="space-y-2">
                  <p className="font-semibold text-sm">Cabinet Vision Export Block</p>
                  {result.exportError ? (
                    <div className="rounded-lg border border-red-300 bg-red-50 dark:bg-red-950/20 p-3 text-sm text-red-600 dark:text-red-400 font-mono">
                      {result.exportError}
                    </div>
                  ) : (
                    <pre
                      data-testid="text-export-block"
                      className="rounded-lg border bg-muted/30 font-mono text-xs p-4 overflow-x-auto leading-relaxed whitespace-pre-wrap"
                    >
                      {result.exportText}
                    </pre>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
