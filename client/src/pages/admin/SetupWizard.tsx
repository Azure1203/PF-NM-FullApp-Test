import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Rocket,
  Database,
  Tags,
  Link2,
  Loader2,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";

export default function SetupWizard() {
  const { toast } = useToast();
  const [overwrite, setOverwrite] = useState(false);

  const seedMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/seed-formulas", {});
      return res.json() as Promise<{ created: number; updated: number; total: number }>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/proxy-variables"] });
      toast({
        title: "Formulas seeded",
        description: `${data.created} created, ${data.updated} updated (${data.total} total)`,
      });
    },
    onError: (err: Error) => {
      toast({ title: "Seed failed", description: err.message, variant: "destructive" });
    },
  });

  const classifyMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/products/auto-classify-export-types", {});
      return res.json() as Promise<{ total: number; classified: Record<string, number> }>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/allmoxy-products"] });
      const counts = Object.entries(data.classified)
        .filter(([, n]) => n > 0)
        .map(([k, n]) => `${k}: ${n}`)
        .join(", ");
      toast({
        title: "Products classified",
        description: `${data.total} products — ${counts || "none classified"}`,
      });
    },
    onError: (err: Error) => {
      toast({ title: "Classification failed", description: err.message, variant: "destructive" });
    },
  });

  const assignMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/products/auto-assign-formulas", {
        overwrite,
      });
      return res.json() as Promise<{
        formulasAssigned: number;
        bindingsCreated: number;
        skipped: number;
        errors: string[];
      }>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/allmoxy-products"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/proxy-variables"] });
      toast({
        title: "Formulas & bindings assigned",
        description: `${data.formulasAssigned} assigned, ${data.bindingsCreated} bindings, ${data.skipped} skipped`,
      });
    },
    onError: (err: Error) => {
      toast({ title: "Assignment failed", description: err.message, variant: "destructive" });
    },
  });

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold flex items-center gap-2" data-testid="text-wizard-title">
          <Rocket className="h-5 w-5 text-primary" />
          Setup Wizard
        </h2>
        <p className="text-sm text-muted-foreground">
          Run these three steps in order to configure all pricing formulas, export templates, and product assignments in bulk.
        </p>
      </div>

      {/* Card 1: Seed Formulas */}
      <div className="rounded-xl border bg-card p-6 space-y-4" data-testid="card-seed-formulas">
        <div className="flex items-start gap-3">
          <div className="rounded-full bg-primary/10 p-2.5">
            <Database className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 space-y-1">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold">Step 1: Seed Formulas</h3>
              <Badge variant="outline" className="text-xs">~50 variables</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Creates or updates all pricing formulas and export templates as proxy variables. Existing variables with the same name will be updated with the latest formula text.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button
            data-testid="button-seed-formulas"
            onClick={() => seedMutation.mutate()}
            disabled={seedMutation.isPending}
          >
            {seedMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Database className="mr-2 h-4 w-4" />
            )}
            Seed Formulas
          </Button>
          {seedMutation.isSuccess && seedMutation.data && (
            <span className="flex items-center gap-1.5 text-sm text-green-600">
              <CheckCircle2 className="h-4 w-4" />
              {seedMutation.data.created} created, {seedMutation.data.updated} updated
            </span>
          )}
        </div>
      </div>

      {/* Card 2: Auto-Classify */}
      <div className="rounded-xl border bg-card p-6 space-y-4" data-testid="card-auto-classify">
        <div className="flex items-start gap-3">
          <div className="rounded-full bg-amber-500/10 p-2.5">
            <Tags className="h-5 w-5 text-amber-600" />
          </div>
          <div className="flex-1 space-y-1">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold">Step 2: Auto-Classify Products</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Automatically classifies each product's export type based on its SKU prefix pattern. This helps the system determine which export template to use for each product category.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button
            data-testid="button-auto-classify"
            onClick={() => classifyMutation.mutate()}
            disabled={classifyMutation.isPending}
            variant="outline"
          >
            {classifyMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Tags className="mr-2 h-4 w-4" />
            )}
            Auto-Classify
          </Button>
          {classifyMutation.isSuccess && classifyMutation.data && (
            <span className="flex items-center gap-1.5 text-sm text-green-600">
              <CheckCircle2 className="h-4 w-4" />
              {classifyMutation.data.total} products — {Object.entries(classifyMutation.data.classified).filter(([,n])=>n>0).map(([k,n])=>`${k}: ${n}`).join(", ") || "none classified"}
            </span>
          )}
          {classifyMutation.isError && (
            <span className="flex items-center gap-1.5 text-sm text-amber-600">
              <AlertTriangle className="h-4 w-4" />
              Route not available yet (Task #8)
            </span>
          )}
        </div>
      </div>

      {/* Card 3: Auto-Assign Formulas & Grid Bindings */}
      <div className="rounded-xl border bg-card p-6 space-y-4" data-testid="card-auto-assign">
        <div className="flex items-start gap-3">
          <div className="rounded-full bg-green-500/10 p-2.5">
            <Link2 className="h-5 w-5 text-green-600" />
          </div>
          <div className="flex-1 space-y-1">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold">Step 3: Auto-Assign Formulas & Grid Bindings</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Assigns the correct pricing and export formula to each product based on its SKU prefix pattern, then creates the appropriate attribute grid bindings using fuzzy name matching.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 pl-1">
          <Checkbox
            id="overwrite"
            data-testid="checkbox-overwrite"
            checked={overwrite}
            onCheckedChange={(checked) => setOverwrite(checked === true)}
          />
          <label htmlFor="overwrite" className="text-sm text-muted-foreground cursor-pointer select-none">
            Overwrite existing assignments
          </label>
        </div>
        <div className="flex items-center gap-3">
          <Button
            data-testid="button-auto-assign"
            onClick={() => assignMutation.mutate()}
            disabled={assignMutation.isPending}
            variant="outline"
          >
            {assignMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Link2 className="mr-2 h-4 w-4" />
            )}
            Auto-Assign Formulas & Grid Bindings
          </Button>
        </div>
        {assignMutation.isSuccess && assignMutation.data && (
          <div className="space-y-2 pt-1">
            <span className="flex items-center gap-1.5 text-sm text-green-600">
              <CheckCircle2 className="h-4 w-4" />
              {assignMutation.data.formulasAssigned} assigned, {assignMutation.data.bindingsCreated} bindings created, {assignMutation.data.skipped} skipped
            </span>
            {assignMutation.data.errors.length > 0 && (
              <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/20 p-3 space-y-1">
                <p className="text-sm font-medium text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                  <AlertTriangle className="h-4 w-4" />
                  {assignMutation.data.errors.length} issue{assignMutation.data.errors.length !== 1 ? 's' : ''}
                </p>
                <ul className="text-xs text-amber-600 dark:text-amber-400 space-y-0.5 max-h-40 overflow-y-auto">
                  {assignMutation.data.errors.map((err, i) => (
                    <li key={i} className="font-mono">{err}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
