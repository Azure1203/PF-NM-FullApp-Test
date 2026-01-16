import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Loader2, Package, CheckCircle, AlertCircle } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";

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
}

interface ChecklistData {
  items: PackingSlipItem[];
  progress: {
    total: number;
    checked: number;
    percentage: number;
  };
}

interface PackingSlipChecklistProps {
  fileId: number;
  fileName: string;
}

export function PackingSlipChecklist({ fileId, fileName }: PackingSlipChecklistProps) {
  const [isOpen, setIsOpen] = useState(false);

  const { data, isLoading, error } = useQuery<ChecklistData>({
    queryKey: [`/api/files/${fileId}/checklist`],
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ itemId, isChecked }: { itemId: number; isChecked: boolean }) => {
      return await apiRequest('PATCH', `/api/checklist/${itemId}/toggle`, { isChecked });
    },
    onMutate: async ({ itemId, isChecked }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: [`/api/files/${fileId}/checklist`] });
      
      // Snapshot previous value
      const previousData = queryClient.getQueryData<ChecklistData>([`/api/files/${fileId}/checklist`]);
      
      // Optimistically update cache
      if (previousData) {
        const updatedItems = previousData.items.map(item => 
          item.id === itemId 
            ? { ...item, isChecked, checkedAt: isChecked ? new Date().toISOString() : null }
            : item
        );
        const checked = updatedItems.filter(item => item.isChecked).length;
        const total = updatedItems.length;
        
        queryClient.setQueryData<ChecklistData>([`/api/files/${fileId}/checklist`], {
          items: updatedItems,
          progress: { total, checked, percentage: total > 0 ? Math.round((checked / total) * 100) : 0 }
        });
      }
      
      return { previousData };
    },
    onError: (err, variables, context) => {
      // Rollback on error
      if (context?.previousData) {
        queryClient.setQueryData([`/api/files/${fileId}/checklist`], context.previousData);
      }
    },
    onSettled: () => {
      // Refetch to ensure consistency
      queryClient.invalidateQueries({ queryKey: [`/api/files/${fileId}/checklist`] });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-4">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        <span className="text-sm text-muted-foreground">Loading checklist...</span>
      </div>
    );
  }

  if (error || !data || data.items.length === 0) {
    return null;
  }

  const { items, progress } = data;
  const isComplete = progress.percentage === 100;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="mb-4">
      <div 
        className={`border rounded-lg transition-colors ${
          isComplete 
            ? 'bg-green-50 dark:bg-green-950/20 border-green-300 dark:border-green-800' 
            : 'bg-primary/5 border-primary/20'
        }`}
        data-testid="packing-checklist-container"
      >
        <CollapsibleTrigger asChild>
          <div 
            className="flex items-center justify-between p-4 cursor-pointer hover-elevate rounded-t-lg"
            data-testid="packing-checklist-trigger"
          >
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${isComplete ? 'bg-green-500' : 'bg-primary/20'}`}>
                {isComplete ? (
                  <CheckCircle className="w-5 h-5 text-white" />
                ) : (
                  <Package className="w-5 h-5 text-primary" />
                )}
              </div>
              <div>
                <p className={`font-semibold ${isComplete ? 'text-green-700 dark:text-green-400' : 'text-primary'}`}>
                  Packaging Checklist
                </p>
                <p className="text-sm text-muted-foreground">
                  {isComplete ? 'All items packaged!' : `${progress.checked} of ${progress.total} items checked`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-32">
                <Progress value={progress.percentage} className="h-2" />
              </div>
              <Badge 
                variant="secondary" 
                className={isComplete ? 'bg-green-500 text-white' : ''}
              >
                {progress.percentage}%
              </Badge>
              {isOpen ? (
                <ChevronUp className="w-5 h-5 text-muted-foreground" />
              ) : (
                <ChevronDown className="w-5 h-5 text-muted-foreground" />
              )}
            </div>
          </div>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="p-4 pt-0 space-y-3" data-testid="packing-checklist-items">
            {items.map((item) => (
              <div 
                key={item.id}
                className={`flex items-start gap-4 p-3 rounded-lg border transition-colors ${
                  item.isChecked 
                    ? 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800' 
                    : 'bg-background border-border'
                }`}
                data-testid={`checklist-item-${item.id}`}
              >
                <Checkbox
                  checked={item.isChecked}
                  onCheckedChange={(checked) => {
                    toggleMutation.mutate({ 
                      itemId: item.id, 
                      isChecked: checked === true 
                    });
                  }}
                  disabled={toggleMutation.isPending}
                  className="mt-1"
                  data-testid={`checkbox-item-${item.id}`}
                />
                
                {item.imagePath ? (
                  <div className="w-20 h-20 flex-shrink-0 rounded-md overflow-hidden border bg-muted">
                    <img 
                      src={`/api/packing-slip-images/${encodeURIComponent(item.imagePath)}`}
                      alt={item.partCode}
                      className="w-full h-full object-contain"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  </div>
                ) : (
                  <div className="w-16 h-16 flex-shrink-0 rounded-md bg-muted flex items-center justify-center">
                    <Package className="w-6 h-6 text-muted-foreground/50" />
                  </div>
                )}
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className={`font-mono font-semibold ${item.isChecked ? 'line-through text-muted-foreground' : ''}`}>
                        {item.partCode}
                      </p>
                      {item.description && (
                        <p className={`text-sm ${item.isChecked ? 'line-through text-muted-foreground' : 'text-muted-foreground'}`}>
                          {item.description}
                        </p>
                      )}
                    </div>
                    <Badge variant={item.isChecked ? "outline" : "secondary"} className="flex-shrink-0">
                      Qty: {item.quantity}
                    </Badge>
                  </div>
                  
                  <div className="flex flex-wrap gap-2 mt-2">
                    {item.color && (
                      <Badge variant="outline" className="text-xs">
                        Color: {item.color}
                      </Badge>
                    )}
                    {item.height && (
                      <Badge variant="outline" className="text-xs">
                        H: {item.height}
                      </Badge>
                    )}
                    {item.width && (
                      <Badge variant="outline" className="text-xs">
                        W: {item.width}
                      </Badge>
                    )}
                    {item.length && (
                      <Badge variant="outline" className="text-xs">
                        L: {item.length}
                      </Badge>
                    )}
                    {item.thickness && (
                      <Badge variant="outline" className="text-xs">
                        T: {item.thickness}
                      </Badge>
                    )}
                  </div>
                  
                  {item.isChecked && item.checkedAt && (
                    <p className="text-xs text-muted-foreground mt-2">
                      Checked {new Date(item.checkedAt).toLocaleString()}
                      {item.checkedBy && ` by ${item.checkedBy}`}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
