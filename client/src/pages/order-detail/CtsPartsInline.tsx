import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Scissors, MapPin, Check, X, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { CtsPart, CtsPartConfig } from "@shared/schema";

interface CtsPartWithConfig extends CtsPart {
  config: CtsPartConfig | null;
}

interface Props {
  fileId: number;
}

export function CtsPartsInline({ fileId }: Props) {
  const { toast } = useToast();
  const [editingConfig, setEditingConfig] = useState<{ [partNumber: string]: { rackLocation: string } }>({});

  const { data: ctsParts, isLoading } = useQuery<CtsPartWithConfig[]>({
    queryKey: ["/api/files", fileId, "cts-parts"],
    enabled: fileId > 0,
  });

  const { mutate: saveConfig } = useMutation({
    mutationFn: ({ partNumber, rackLocation }: { partNumber: string; rackLocation: string }) =>
      apiRequest("PUT", `/api/cts-configs/${encodeURIComponent(partNumber)}`, { rackLocation }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/files", fileId, "cts-parts"] });
      toast({ title: "Saved" });
    },
    onError: (e: Error) => toast({ title: "Failed to save", description: e.message, variant: "destructive" }),
  });

  const { mutate: toggleCutStatus } = useMutation({
    mutationFn: ({ partId, isCut }: { partId: number; isCut: boolean }) =>
      apiRequest("PATCH", `/api/cts-parts/${partId}/cut`, { isCut }),
    onMutate: async ({ partId, isCut }) => {
      await queryClient.cancelQueries({ queryKey: ["/api/files", fileId, "cts-parts"] });
      const prev = queryClient.getQueryData<CtsPartWithConfig[]>(["/api/files", fileId, "cts-parts"]);
      if (prev) {
        queryClient.setQueryData(["/api/files", fileId, "cts-parts"], prev.map(p => p.id === partId ? { ...p, isCut } : p));
      }
      return { prev };
    },
    onError: (_, __, context: any) => {
      if (context?.prev) queryClient.setQueryData(["/api/files", fileId, "cts-parts"], context.prev);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["/api/files", fileId, "cts-parts"] }),
  });

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  const parts = ctsParts ?? [];

  if (parts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground">
        <Scissors className="w-12 h-12 opacity-30" />
        <p>No cut-to-size parts for this file.</p>
      </div>
    );
  }

  const totalCut = parts.filter(p => p.isCut).length;
  const totalParts = parts.length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between p-4 rounded-lg border bg-card">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${totalCut === totalParts ? "bg-green-500" : "bg-primary"}`}>
            <Scissors className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className={`font-semibold ${totalCut === totalParts ? "text-green-600 dark:text-green-400" : ""}`}>
              {totalCut === totalParts && totalParts > 0 ? "All Parts Cut!" : "Cut-to-Size Parts"}
            </p>
            <Badge variant={totalCut === totalParts && totalParts > 0 ? "default" : "secondary"} className={totalCut === totalParts && totalParts > 0 ? "bg-green-500" : ""}>
              {totalCut}/{totalParts} cut
            </Badge>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        {parts.map((part) => {
          const isEditing = partNumber => editingConfig[partNumber] !== undefined;
          const rackValue = editingConfig[part.partNumber]?.rackLocation ?? part.config?.rackLocation ?? "";
          const editing = editingConfig[part.partNumber] !== undefined;

          return (
            <Card key={part.id} className={part.isCut ? "bg-green-50 dark:bg-green-950/20 border-green-300 dark:border-green-800" : ""} data-testid={`cts-part-${part.id}`}>
              <CardContent className="p-3">
                <div className="flex items-start gap-3">
                  <Checkbox
                    checked={part.isCut}
                    onCheckedChange={(checked) => toggleCutStatus({ partId: part.id, isCut: !!checked })}
                    className="mt-0.5 flex-shrink-0 data-[state=checked]:bg-green-500 data-[state=checked]:border-green-500"
                    data-testid={`checkbox-cut-${part.id}`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <p className={`font-mono font-semibold ${part.isCut ? "line-through text-muted-foreground" : ""}`}>
                        {part.partNumber}
                      </p>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          {part.quantity} × {(part.cutLength / 25.4).toFixed(2)}"
                        </Badge>
                        <Badge variant="secondary" className="text-xs">
                          {part.cutLength} mm
                        </Badge>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mt-1.5">
                      <MapPin className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                      {editing ? (
                        <div className="flex items-center gap-1">
                          <Input
                            value={rackValue}
                            onChange={(e) => setEditingConfig(prev => ({ ...prev, [part.partNumber]: { rackLocation: e.target.value } }))}
                            className="h-6 text-xs w-32"
                            placeholder="Rack location"
                          />
                          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => {
                            saveConfig({ partNumber: part.partNumber, rackLocation: rackValue });
                            setEditingConfig(prev => { const n = { ...prev }; delete n[part.partNumber]; return n; });
                          }}>
                            <Check className="w-3 h-3" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => {
                            setEditingConfig(prev => { const n = { ...prev }; delete n[part.partNumber]; return n; });
                          }}>
                            <X className="w-3 h-3" />
                          </Button>
                        </div>
                      ) : (
                        <button
                          className="text-xs text-muted-foreground hover:text-foreground"
                          onClick={() => setEditingConfig(prev => ({ ...prev, [part.partNumber]: { rackLocation: part.config?.rackLocation ?? "" } }))}
                        >
                          {part.config?.rackLocation ? part.config.rackLocation : "Set rack location"}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
