import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Loader2,
  RefreshCw,
  RotateCcw,
  Wand2,
  Wrench,
  XCircle,
  Zap,
} from "lucide-react";

type DiagIssue = {
  productId: number;
  productName: string;
  skuPrefix: string | null;
  issue: string;
  severity: "error" | "warning";
};

type DiagStats = {
  totalProducts: number;
  activeProducts: number;
  withSkuPrefix: number;
  withPricingProxy: number;
  withExportProxy: number;
  withBindings: number;
  withNoBindings: number;
  totalBindings: number;
  totalProxyVars: number;
  totalGrids: number;
  pricingProxies: number;
  exportProxies: number;
};

type DiagResult = {
  stats: DiagStats;
  errorCount: number;
  warningCount: number;
  issues: DiagIssue[];
  totalIssues: number;
};

type BindingResult = {
  dryRun: boolean;
  created?: number;
  wouldCreate: number;
  skipped: string[];
  sample: Array<{
    productId: number;
    productName: string;
    gridId: number;
    gridName: string;
    alias: string;
    lookupColumn: string;
  }>;
};

type ProxyFix = {
  productId: number;
  productName: string;
  skuPrefix: string;
  matchedFrom: string;
  pricingProxyId: number;
  exportProxyId: number | null;
  exportType: string | null;
};

type ProxyFixResult = {
  dryRun: boolean;
  wouldFix?: number;
  applied?: number;
  fixes: ProxyFix[];
  noMatch: string[];
};

function StatCard({ label, value, sub, color }: { label: string; value: number | string; sub?: string; color?: string }) {
  return (
    <div className="rounded-lg border bg-card p-4 flex flex-col gap-1">
      <span className="text-xs text-muted-foreground font-medium">{label}</span>
      <span className={`text-2xl font-bold ${color ?? "text-foreground"}`}>{value}</span>
      {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
    </div>
  );
}

export default function PricingDiagnostic() {
  const { toast } = useToast();
  const [diagResult, setDiagResult] = useState<DiagResult | null>(null);
  const [bindingResult, setBindingResult] = useState<BindingResult | null>(null);
  const [proxyFixResult, setProxyFixResult] = useState<ProxyFixResult | null>(null);
  const [proxyFixOpen, setProxyFixOpen] = useState(true);
  const [issuesOpen, setIssuesOpen] = useState(true);
  const [sampleOpen, setSampleOpen] = useState(true);
  const [skippedOpen, setSkippedOpen] = useState(false);
  const [severityFilter, setSeverityFilter] = useState<"all" | "error" | "warning">("all");

  const diagMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/pricing-diagnostic");
      if (!res.ok) throw new Error(await res.text());
      return res.json() as Promise<DiagResult>;
    },
    onSuccess: (data) => {
      setDiagResult(data);
      setBindingResult(null);
      toast({ title: "Diagnostic complete", description: `${data.errorCount} errors, ${data.warningCount} warnings` });
    },
    onError: (e: Error) => toast({ title: "Diagnostic failed", description: e.message, variant: "destructive" }),
  });

  const dryRunMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/auto-create-bindings", { dryRun: true });
      return res.json() as Promise<BindingResult>;
    },
    onSuccess: (data) => {
      setBindingResult(data);
      toast({ title: "Dry run complete", description: `Would create ${data.wouldCreate} bindings` });
    },
    onError: (e: Error) => toast({ title: "Dry run failed", description: e.message, variant: "destructive" }),
  });

  const applyMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/auto-create-bindings", { dryRun: false });
      return res.json() as Promise<BindingResult & { deleted?: number }>;
    },
    onSuccess: (data) => {
      setBindingResult(data);
      toast({ title: "Bindings created", description: `Created ${data.created} bindings`, variant: "default" });
    },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const resetMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/auto-create-bindings", { dryRun: false, reset: true });
      return res.json() as Promise<BindingResult & { deleted?: number }>;
    },
    onSuccess: (data) => {
      setBindingResult(data);
      const d = (data as any).deleted ?? 0;
      toast({ title: "Reset & Recreate complete", description: `Deleted ${d} old bindings, created ${data.created} new bindings` });
    },
    onError: (e: Error) => toast({ title: "Reset failed", description: e.message, variant: "destructive" }),
  });

  const fixProxiesDryRunMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/products/fix-missing-proxies", { dryRun: true });
      return res.json() as Promise<ProxyFixResult>;
    },
    onSuccess: (data) => {
      setProxyFixResult(data);
      toast({ title: "Proxy scan complete", description: `Found ${data.wouldFix ?? 0} products that can be auto-fixed` });
    },
    onError: (e: Error) => toast({ title: "Scan failed", description: e.message, variant: "destructive" }),
  });

  const fixProxiesApplyMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/products/fix-missing-proxies", { dryRun: false });
      return res.json() as Promise<ProxyFixResult>;
    },
    onSuccess: (data) => {
      setProxyFixResult(data);
      toast({ title: "Proxies assigned", description: `Fixed ${data.applied ?? 0} products — now run Reset & Recreate Bindings` });
    },
    onError: (e: Error) => toast({ title: "Fix failed", description: e.message, variant: "destructive" }),
  });

  const filteredIssues = diagResult?.issues.filter(i =>
    severityFilter === "all" ? true : i.severity === severityFilter
  ) ?? [];

  const readyCount = diagResult
    ? diagResult.stats.withPricingProxy - (diagResult.issues.filter(i => i.severity === "error").length)
    : 0;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto p-6 space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Zap className="h-6 w-6 text-primary" />
              Pricing Diagnostic
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Identifies misconfigured products — missing SKU prefixes, unassigned formulas, and absent grid bindings.
            </p>
          </div>
          <Button
            data-testid="button-run-diagnostic"
            onClick={() => diagMutation.mutate()}
            disabled={diagMutation.isPending}
          >
            {diagMutation.isPending
              ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              : <RefreshCw className="h-4 w-4 mr-2" />}
            Run Diagnostic
          </Button>
        </div>

        {/* Stats grid */}
        {diagResult && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
              <StatCard label="Total Products" value={diagResult.stats.totalProducts} />
              <StatCard label="Active" value={diagResult.stats.activeProducts} />
              <StatCard label="Have SKU Prefix" value={diagResult.stats.withSkuPrefix} />
              <StatCard label="Have Pricing Formula" value={diagResult.stats.withPricingProxy}
                color={diagResult.stats.withPricingProxy === 0 ? "text-red-500" : undefined} />
              <StatCard label="Have Grid Bindings" value={diagResult.stats.withBindings}
                color={diagResult.stats.withBindings === 0 ? "text-red-500" : undefined} />
              <StatCard label="Total Bindings" value={diagResult.stats.totalBindings} />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard label="Proxy Variables" value={diagResult.stats.totalProxyVars}
                sub={`${diagResult.stats.pricingProxies} pricing, ${diagResult.stats.exportProxies} export`} />
              <StatCard label="Attribute Grids" value={diagResult.stats.totalGrids} />
              <StatCard label="Errors" value={diagResult.errorCount} color={diagResult.errorCount > 0 ? "text-red-500" : "text-green-600"} />
              <StatCard label="Warnings" value={diagResult.warningCount} color={diagResult.warningCount > 0 ? "text-amber-500" : "text-green-600"} />
            </div>

            {/* Summary callout */}
            <div className={`rounded-lg border p-4 flex items-start gap-3 ${diagResult.errorCount === 0 ? "border-green-300 bg-green-50 dark:bg-green-950/20" : "border-amber-300 bg-amber-50 dark:bg-amber-950/20"}`}>
              {diagResult.errorCount === 0
                ? <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
                : <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />}
              <div className="text-sm">
                <p className="font-semibold">
                  {diagResult.errorCount === 0
                    ? `All ${diagResult.stats.withPricingProxy} configured products look ready for pricing.`
                    : `${diagResult.errorCount} issues found across active products.`}
                </p>
                {diagResult.stats.withNoBindings > 0 && (
                  <p className="text-muted-foreground mt-0.5">
                    {diagResult.stats.withNoBindings} product{diagResult.stats.withNoBindings !== 1 ? "s" : ""} have no grid bindings — use Auto-Create Bindings below to fix this automatically.
                  </p>
                )}
              </div>
            </div>
          </>
        )}

        {/* Auto-Create Bindings panel */}
        {diagResult && (
          <div className="rounded-lg border p-5 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="font-semibold flex items-center gap-2">
                  <Wand2 className="h-4 w-4 text-primary" />
                  Auto-Create Missing Bindings
                </h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Analyzes each product's formula and automatically creates the required grid bindings.
                  Runs a dry-run first so you can review before committing.
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                <Button
                  data-testid="button-dry-run"
                  variant="outline"
                  onClick={() => dryRunMutation.mutate()}
                  disabled={dryRunMutation.isPending || applyMutation.isPending}
                >
                  {dryRunMutation.isPending
                    ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    : <RefreshCw className="h-4 w-4 mr-2" />}
                  Dry Run
                </Button>
                {bindingResult?.dryRun && bindingResult.wouldCreate > 0 && (
                  <Button
                    data-testid="button-apply-bindings"
                    onClick={() => applyMutation.mutate()}
                    disabled={applyMutation.isPending || resetMutation.isPending}
                  >
                    {applyMutation.isPending
                      ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      : <CheckCircle2 className="h-4 w-4 mr-2" />}
                    Create {bindingResult.wouldCreate} Bindings
                  </Button>
                )}
                <Button
                  data-testid="button-reset-recreate"
                  variant="destructive"
                  onClick={() => resetMutation.mutate()}
                  disabled={resetMutation.isPending || applyMutation.isPending || dryRunMutation.isPending}
                  title="Delete all auto-created bindings and recreate them fresh. Fixes wrong-grid matches."
                >
                  {resetMutation.isPending
                    ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    : <RotateCcw className="h-4 w-4 mr-2" />}
                  Reset & Recreate
                </Button>
              </div>
            </div>

            {/* Binding result */}
            {bindingResult && (
              <div className="space-y-3">
                <div className={`rounded-md p-3 text-sm flex items-center gap-2 ${bindingResult.dryRun ? "bg-blue-50 dark:bg-blue-950/20 border border-blue-200" : "bg-green-50 dark:bg-green-950/20 border border-green-200"}`}>
                  {bindingResult.dryRun
                    ? <><RefreshCw className="h-4 w-4 text-blue-500 shrink-0" /> <span><strong>Dry run:</strong> Would create {bindingResult.wouldCreate} bindings. Click "Create {bindingResult.wouldCreate} Bindings" to apply.</span></>
                    : <><CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" /> <span><strong>Done:</strong>{(bindingResult as any).deleted ? ` Deleted ${(bindingResult as any).deleted} old bindings,` : ''} Created {bindingResult.created} new bindings successfully.</span></>}
                </div>

                {/* Sample table */}
                {bindingResult.sample.length > 0 && (
                  <Collapsible open={sampleOpen} onOpenChange={setSampleOpen}>
                    <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium w-full text-left">
                      Sample ({bindingResult.sample.length} of {bindingResult.wouldCreate})
                      {sampleOpen ? <ChevronDown className="h-4 w-4 ml-auto text-muted-foreground" /> : <ChevronRight className="h-4 w-4 ml-auto text-muted-foreground" />}
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="rounded-md border overflow-hidden mt-2">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-xs">Product</TableHead>
                              <TableHead className="text-xs">Alias</TableHead>
                              <TableHead className="text-xs">Grid</TableHead>
                              <TableHead className="text-xs">Lookup Col</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {bindingResult.sample.map((s, i) => (
                              <TableRow key={i} data-testid={`row-binding-sample-${i}`}>
                                <TableCell className="text-xs font-medium">{s.productName}</TableCell>
                                <TableCell className="text-xs font-mono">{s.alias}</TableCell>
                                <TableCell className="text-xs text-muted-foreground">{s.gridName}</TableCell>
                                <TableCell className="text-xs font-mono">{s.lookupColumn}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                )}

                {/* Skipped items */}
                {bindingResult.skipped.length > 0 && (
                  <Collapsible open={skippedOpen} onOpenChange={setSkippedOpen}>
                    <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium text-amber-600 w-full text-left">
                      <AlertTriangle className="h-4 w-4 shrink-0" />
                      {bindingResult.skipped.length} items skipped (no matching grid found)
                      {skippedOpen ? <ChevronDown className="h-4 w-4 ml-auto text-muted-foreground" /> : <ChevronRight className="h-4 w-4 ml-auto text-muted-foreground" />}
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="mt-2 max-h-40 overflow-y-auto rounded-md border bg-amber-50 dark:bg-amber-950/20 p-3 space-y-0.5">
                        {bindingResult.skipped.map((s, i) => (
                          <p key={i} className="text-xs text-amber-700 dark:text-amber-400 font-mono">{s}</p>
                        ))}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                )}
              </div>
            )}
          </div>
        )}

        {/* Fix Missing Proxies panel */}
        {diagResult && diagResult.stats.withPricingProxy < diagResult.stats.activeProducts && (
          <div className="rounded-lg border p-5 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="font-semibold flex items-center gap-2">
                  <Wrench className="h-4 w-4 text-primary" />
                  Fix Missing Proxy Assignments
                </h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Finds active products with no pricing formula and copies proxy assignments from the
                  closest SKU-stem match. E.g. <code className="text-xs bg-muted px-1 py-0.5 rounded">LDRTFL90SHA</code> inherits
                  from <code className="text-xs bg-muted px-1 py-0.5 rounded">LDRTFL90SHAGD</code>. After applying, run Reset &amp; Recreate Bindings above.
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                <Button
                  data-testid="button-proxy-fix-scan"
                  variant="outline"
                  onClick={() => fixProxiesDryRunMutation.mutate()}
                  disabled={fixProxiesDryRunMutation.isPending || fixProxiesApplyMutation.isPending}
                >
                  {fixProxiesDryRunMutation.isPending
                    ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    : <RefreshCw className="h-4 w-4 mr-2" />}
                  Scan
                </Button>
                {proxyFixResult?.dryRun && (proxyFixResult.wouldFix ?? 0) > 0 && (
                  <Button
                    data-testid="button-proxy-fix-apply"
                    onClick={() => fixProxiesApplyMutation.mutate()}
                    disabled={fixProxiesApplyMutation.isPending}
                  >
                    {fixProxiesApplyMutation.isPending
                      ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      : <CheckCircle2 className="h-4 w-4 mr-2" />}
                    Fix {proxyFixResult.wouldFix} Products
                  </Button>
                )}
              </div>
            </div>

            {proxyFixResult && (
              <div className="space-y-3">
                <div className={`rounded-md p-3 text-sm flex items-center gap-2 ${proxyFixResult.dryRun ? "bg-blue-50 dark:bg-blue-950/20 border border-blue-200" : "bg-green-50 dark:bg-green-950/20 border border-green-200"}`}>
                  {proxyFixResult.dryRun
                    ? <><RefreshCw className="h-4 w-4 text-blue-500 shrink-0" /><span><strong>Scan result:</strong> {proxyFixResult.wouldFix} products can be auto-fixed. {proxyFixResult.noMatch.length > 0 ? `${proxyFixResult.noMatch.length} have no match.` : ''} Click "Fix {proxyFixResult.wouldFix} Products" to apply.</span></>
                    : <><CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" /><span><strong>Done:</strong> Applied proxy assignments to {proxyFixResult.applied} products. Now run Reset &amp; Recreate Bindings above.</span></>}
                </div>

                {proxyFixResult.fixes.length > 0 && (
                  <Collapsible open={proxyFixOpen} onOpenChange={setProxyFixOpen}>
                    <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium w-full text-left">
                      {proxyFixResult.dryRun ? "Would fix" : "Fixed"} ({proxyFixResult.fixes.length} products)
                      {proxyFixOpen ? <ChevronDown className="h-4 w-4 ml-auto text-muted-foreground" /> : <ChevronRight className="h-4 w-4 ml-auto text-muted-foreground" />}
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="rounded-md border overflow-hidden mt-2">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-xs">Product</TableHead>
                              <TableHead className="text-xs">SKU Prefix</TableHead>
                              <TableHead className="text-xs">Copied From</TableHead>
                              <TableHead className="text-xs">Export Type</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {proxyFixResult.fixes.map((f, i) => (
                              <TableRow key={i} data-testid={`row-proxy-fix-${i}`}>
                                <TableCell className="text-xs font-medium">{f.productName}</TableCell>
                                <TableCell className="text-xs font-mono">{f.skuPrefix}</TableCell>
                                <TableCell className="text-xs font-mono text-muted-foreground">{f.matchedFrom}</TableCell>
                                <TableCell className="text-xs">{f.exportType ?? "—"}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                )}

                {proxyFixResult.noMatch.length > 0 && (
                  <div className="max-h-28 overflow-y-auto rounded-md border bg-amber-50 dark:bg-amber-950/20 p-3 space-y-0.5">
                    <p className="text-xs font-medium text-amber-700 mb-1">{proxyFixResult.noMatch.length} products with no stem match — assign manually:</p>
                    {proxyFixResult.noMatch.map((s, i) => (
                      <p key={i} className="text-xs text-amber-700 dark:text-amber-400 font-mono">{s}</p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Issues table */}
        {diagResult && diagResult.issues.length > 0 && (
          <Collapsible open={issuesOpen} onOpenChange={setIssuesOpen}>
            <CollapsibleTrigger className="flex items-center gap-2 w-full text-left font-semibold">
              Issues
              <Badge variant="outline" className="text-xs">{diagResult.totalIssues}</Badge>
              {issuesOpen
                ? <ChevronDown className="h-4 w-4 ml-auto text-muted-foreground" />
                : <ChevronRight className="h-4 w-4 ml-auto text-muted-foreground" />}
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-3 space-y-3">
              {/* Severity filter */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Filter:</span>
                {(["all", "error", "warning"] as const).map(f => (
                  <Button
                    key={f}
                    variant={severityFilter === f ? "default" : "outline"}
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setSeverityFilter(f)}
                    data-testid={`button-filter-${f}`}
                  >
                    {f === "all" ? `All (${diagResult.totalIssues})` : f === "error" ? `Errors (${diagResult.errorCount})` : `Warnings (${diagResult.warningCount})`}
                  </Button>
                ))}
              </div>

              <ScrollArea className="h-[420px] rounded-md border">
                <Table>
                  <TableHeader className="sticky top-0 bg-background z-10">
                    <TableRow>
                      <TableHead className="text-xs w-12"></TableHead>
                      <TableHead className="text-xs">Product</TableHead>
                      <TableHead className="text-xs w-28">SKU Prefix</TableHead>
                      <TableHead className="text-xs">Issue</TableHead>
                      <TableHead className="text-xs w-16"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredIssues.map((issue, i) => (
                      <TableRow
                        key={i}
                        data-testid={`row-issue-${i}`}
                        className={issue.severity === "error" ? "bg-red-50/40 dark:bg-red-950/10" : "bg-amber-50/40 dark:bg-amber-950/10"}
                      >
                        <TableCell className="py-2">
                          {issue.severity === "error"
                            ? <XCircle className="h-4 w-4 text-red-500" />
                            : <AlertTriangle className="h-4 w-4 text-amber-500" />}
                        </TableCell>
                        <TableCell className="text-xs font-medium py-2">{issue.productName}</TableCell>
                        <TableCell className="text-xs font-mono py-2">{issue.skuPrefix ?? "—"}</TableCell>
                        <TableCell className="text-xs py-2">{issue.issue}</TableCell>
                        <TableCell className="py-2">
                          <a
                            href={`/admin/allmoxy-products`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-0.5 text-xs text-primary hover:underline"
                          >
                            Fix <ExternalLink className="h-3 w-3" />
                          </a>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
              {diagResult.totalIssues > 300 && (
                <p className="text-xs text-muted-foreground">
                  Showing first 300 of {diagResult.totalIssues} issues. Run Auto-Create Bindings to resolve the most common ones at once.
                </p>
              )}
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Empty state */}
        {!diagResult && !diagMutation.isPending && (
          <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
            <Zap className="h-12 w-12 mb-4 opacity-20" />
            <p className="text-sm">Click <span className="font-medium text-foreground">Run Diagnostic</span> to analyse your product configuration.</p>
          </div>
        )}
      </div>
    </div>
  );
}
