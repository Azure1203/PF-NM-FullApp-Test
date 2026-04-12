import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Loader2, Package, CheckCircle, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface PackingSlipItem {
  id: number;
  fileId: number;
  partCode: string;
  color: string | null;
  quantity: number;
  height: string | null;
  width: string | null;
  length: string | null;
  thickness: string | null;
  description: string | null;
  imagePath: string | null;
  isChecked: boolean;
  checkedAt: string | null;
  checkedBy: string | null;
  sortOrder: number;
  productInfo: { id: number; name: string | null; imagePath: string | null; notes: string | null } | null;
  ctsCutLength?: number;
}

interface ChecklistData {
  items: PackingSlipItem[];
  progress: { total: number; checked: number; percentage: number };
}

interface Props {
  fileId: number;
}

export function PackingChecklistInline({ fileId }: Props) {
  const { toast } = useToast();

  const { data, isLoading, error } = useQuery<ChecklistData>({
    queryKey: [`/api/files/${fileId}/checklist`],
    enabled: fileId > 0,
  });

  const reparseMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/files/${fileId}/reparse-packing-slip`),
    onSuccess: async (response) => {
      const result = await response.json();
      toast({ title: "Checklist regenerated", description: `${result.itemsCreated} items created.` });
      queryClient.invalidateQueries({ queryKey: [`/api/files/${fileId}/checklist`] });
    },
    onError: (err: any) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ itemId, isChecked }: { itemId: number; isChecked: boolean }) =>
      apiRequest("PATCH", `/api/checklist/${itemId}/toggle`, { isChecked }),
    onMutate: async ({ itemId, isChecked }) => {
      await queryClient.cancelQueries({ queryKey: [`/api/files/${fileId}/checklist`] });
      const prev = queryClient.getQueryData<ChecklistData>([`/api/files/${fileId}/checklist`]);
      if (prev) {
        const updatedItems = prev.items.map(i => i.id === itemId ? { ...i, isChecked, checkedAt: isChecked ? new Date().toISOString() : null } : i);
        const checked = updatedItems.filter(i => i.isChecked).length;
        queryClient.setQueryData<ChecklistData>([`/api/files/${fileId}/checklist`], {
          items: updatedItems,
          progress: { total: updatedItems.length, checked, percentage: updatedItems.length > 0 ? Math.round((checked / updatedItems.length) * 100) : 0 },
        });
      }
      return { prev };
    },
    onError: (_, __, context: any) => {
      if (context?.prev) queryClient.setQueryData([`/api/files/${fileId}/checklist`], context.prev);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: [`/api/files/${fileId}/checklist`] }),
  });

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-4">
        <p className="text-muted-foreground">No packing checklist available for this file.</p>
        <Button onClick={() => reparseMutation.mutate()} disabled={reparseMutation.isPending} variant="outline">
          {reparseMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
          Generate Checklist
        </Button>
      </div>
    );
  }

  const { items, progress } = data;
  const isComplete = progress.percentage === 100;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between p-4 rounded-lg border bg-card">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${isComplete ? "bg-green-500" : "bg-primary"}`}>
            {isComplete ? <CheckCircle className="w-5 h-5 text-white" /> : <Package className="w-5 h-5 text-white" />}
          </div>
          <div>
            <p className={`font-semibold ${isComplete ? "text-green-600 dark:text-green-400" : ""}`}>
              {isComplete ? "All Items Checked!" : "Packaging Checklist"}
            </p>
            <Badge variant="secondary" className={isComplete ? "bg-green-500 text-white" : ""}>
              {progress.checked} / {progress.total}
            </Badge>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-32">
            <Progress value={progress.percentage} className="h-2" />
          </div>
          <Button variant="ghost" size="sm" onClick={() => reparseMutation.mutate()} disabled={reparseMutation.isPending}>
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 gap-4 text-muted-foreground">
          <Package className="w-12 h-12 opacity-30" />
          <p>No checklist items yet.</p>
          <Button onClick={() => reparseMutation.mutate()} disabled={reparseMutation.isPending}>
            {reparseMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
            Generate from CSV
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div
              key={item.id}
              className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
                item.isChecked ? "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800" : "bg-card border-border"
              }`}
              data-testid={`checklist-item-${item.id}`}
            >
              <Checkbox
                checked={item.isChecked}
                onCheckedChange={(checked) => toggleMutation.mutate({ itemId: item.id, isChecked: checked === true })}
                disabled={toggleMutation.isPending}
                className="mt-1 flex-shrink-0"
                data-testid={`checkbox-item-${item.id}`}
              />
              {(item.productInfo?.imagePath || item.imagePath) && (
                <div className="w-14 h-14 flex-shrink-0 rounded border overflow-hidden bg-muted">
                  <img
                    src={item.productInfo?.imagePath ?? `/api/packing-slip-images/${encodeURIComponent(item.imagePath!)}`}
                    alt={item.partCode}
                    className="w-full h-full object-contain"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className={`font-mono font-semibold ${item.isChecked ? "line-through text-muted-foreground" : ""}`}>
                      {item.partCode}
                    </p>
                    {(item.productInfo?.name || item.description) && (
                      <p className={`text-sm ${item.isChecked ? "text-muted-foreground line-through" : "text-muted-foreground"}`}>
                        {item.productInfo?.name || item.description}
                      </p>
                    )}
                    {item.productInfo?.notes && (
                      <p className="text-xs text-primary/70 italic">{item.productInfo.notes}</p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <Badge variant={item.isChecked ? "outline" : "default"}>Qty: {item.quantity}</Badge>
                    {item.ctsCutLength !== undefined && (
                      <Badge variant="secondary" className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 text-xs">
                        Cut: {Number(item.ctsCutLength).toFixed(1)} mm
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-1 mt-2">
                  {item.color && <Badge variant="outline" className="text-xs">Color: {item.color}</Badge>}
                  {item.height && <Badge variant="outline" className="text-xs">H: {item.height}</Badge>}
                  {item.width && <Badge variant="outline" className="text-xs">W: {item.width}</Badge>}
                  {item.length && <Badge variant="outline" className="text-xs">L: {item.length}</Badge>}
                </div>
                {item.isChecked && item.checkedAt && (
                  <p className="text-xs text-green-600 dark:text-green-400 mt-1 flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" />
                    {new Date(item.checkedAt).toLocaleString()}{item.checkedBy && ` by ${item.checkedBy}`}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
