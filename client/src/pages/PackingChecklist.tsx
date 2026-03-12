import { useRoute, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Loader2, Package, CheckCircle, ArrowLeft, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ProductInfo {
  id: number;
  name: string | null;
  imagePath: string | null;
  notes: string | null;
}

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
  productInfo: ProductInfo | null;
  ctsCutLength?: number;
}

interface ChecklistData {
  items: PackingSlipItem[];
  progress: {
    total: number;
    checked: number;
    percentage: number;
  };
}

interface FileInfo {
  id: number;
  projectId: number;
  originalFilename: string;
  allmoxyJobNumber: string | null;
}

export default function PackingChecklist() {
  const [match, params] = useRoute("/files/:fileId/checklist");
  const fileId = params?.fileId ? parseInt(params.fileId, 10) : null;
  const { toast } = useToast();

  const { data: fileInfo, isLoading: fileLoading } = useQuery<FileInfo>({
    queryKey: [`/api/files/${fileId}`],
    enabled: !!fileId,
  });

  const { data, isLoading, error } = useQuery<ChecklistData>({
    queryKey: [`/api/files/${fileId}/checklist`],
    enabled: !!fileId,
  });

  const reparseMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('POST', `/api/files/${fileId}/reparse-packing-slip`);
    },
    onSuccess: async (response) => {
      const result = await response.json();
      toast({ 
        title: 'Packing slip parsed successfully',
        description: `Created ${result.itemsCreated} checklist items.`
      });
      queryClient.invalidateQueries({ queryKey: [`/api/files/${fileId}/checklist`] });
    },
    onError: (err: any) => {
      toast({ 
        title: 'Failed to parse packing slip',
        description: err.message || 'Unknown error',
        variant: 'destructive'
      });
    }
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ itemId, isChecked }: { itemId: number; isChecked: boolean }) => {
      return await apiRequest('PATCH', `/api/checklist/${itemId}/toggle`, { isChecked });
    },
    onMutate: async ({ itemId, isChecked }) => {
      await queryClient.cancelQueries({ queryKey: [`/api/files/${fileId}/checklist`] });
      
      const previousData = queryClient.getQueryData<ChecklistData>([`/api/files/${fileId}/checklist`]);
      
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
      if (context?.previousData) {
        queryClient.setQueryData([`/api/files/${fileId}/checklist`], context.previousData);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/files/${fileId}/checklist`] });
    },
  });

  if (!match || !fileId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/40 dark:bg-slate-900">
        <p className="text-muted-foreground">Invalid file ID</p>
      </div>
    );
  }

  if (isLoading || fileLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/40 dark:bg-slate-900">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-muted/40 dark:bg-slate-900 gap-4">
        <p className="text-muted-foreground">No checklist available for this file.</p>
        <p className="text-sm text-muted-foreground">This file may not have a packing checklist generated yet.</p>
        {fileInfo && (
          <Link href={`/orders/${fileInfo.projectId}`}>
            <Button variant="outline">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Order
            </Button>
          </Link>
        )}
      </div>
    );
  }

  const { items, progress } = data;
  const isComplete = progress.percentage === 100;

  return (
    <div className="min-h-screen bg-muted/40 dark:bg-slate-900">
      <div className="max-w-4xl mx-auto px-3 sm:px-4 py-3 sm:py-4 space-y-3 sm:space-y-4">
        <div className="flex items-center justify-between">
          {fileInfo && (
            <Link href={`/orders/${fileInfo.projectId}`}>
              <Button variant="ghost" size="sm" data-testid="button-back-to-order">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Order
              </Button>
            </Link>
          )}
        </div>

        <Card>
          <CardHeader className="pb-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
              <div className="flex items-center gap-3">
                <div className={`p-2 sm:p-3 rounded-lg ${isComplete ? 'bg-green-500' : 'bg-primary'}`}>
                  {isComplete ? (
                    <CheckCircle className="w-6 h-6 text-white" />
                  ) : (
                    <Package className="w-6 h-6 text-white" />
                  )}
                </div>
                <div>
                  <CardTitle className={isComplete ? 'text-green-700 dark:text-green-400' : ''}>
                    Packaging Checklist
                  </CardTitle>
                  <p className="text-xs sm:text-sm text-muted-foreground mt-1 break-all">
                    {fileInfo?.originalFilename || `File #${fileId}`}
                    {fileInfo?.allmoxyJobNumber && (
                      <span className="ml-2 text-primary font-medium">
                        (Job #{fileInfo.allmoxyJobNumber})
                      </span>
                    )}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 w-full sm:w-auto">
                <div className="w-full sm:w-40">
                  <Progress value={progress.percentage} className="h-3" />
                </div>
                <Badge 
                  variant="secondary" 
                  className={`text-base sm:text-lg px-3 py-1 flex-shrink-0 ${isComplete ? 'bg-green-500 text-white' : ''}`}
                >
                  {progress.checked} / {progress.total}
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {items.length === 0 ? (
              <div className="text-center py-8 space-y-4">
                <p className="text-muted-foreground">
                  No items found in checklist.
                </p>
                <p className="text-sm text-muted-foreground">
                  The checklist may not have been generated yet. Click below to regenerate from CSV.
                </p>
                <Button
                  onClick={() => reparseMutation.mutate()}
                  disabled={reparseMutation.isPending}
                  data-testid="button-reparse-packing-slip"
                >
                  {reparseMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <RefreshCw className="w-4 h-4 mr-2" />
                  )}
                  Regenerate Checklist
                </Button>
              </div>
            ) : (
              items.map((item) => (
                <div 
                  key={item.id}
                  className={`flex flex-col sm:flex-row items-start gap-3 sm:gap-4 p-3 sm:p-4 rounded-lg border transition-colors ${
                    item.isChecked 
                      ? 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800' 
                      : 'bg-background border-border hover-elevate'
                  }`}
                  data-testid={`checklist-item-${item.id}`}
                >
                  <div className="flex items-start gap-3 sm:contents">
                  <Checkbox
                    checked={item.isChecked}
                    onCheckedChange={(checked) => {
                      toggleMutation.mutate({ 
                        itemId: item.id, 
                        isChecked: checked === true 
                      });
                    }}
                    disabled={toggleMutation.isPending}
                    className="mt-1 w-6 h-6 sm:w-4 sm:h-4 flex-shrink-0"
                    data-testid={`checkbox-item-${item.id}`}
                  />
                  
                  {/* Show product database image if available, otherwise packing slip image, otherwise placeholder */}
                  {item.productInfo?.imagePath ? (
                    <div className="w-16 h-16 sm:w-24 sm:h-24 flex-shrink-0 rounded-md overflow-hidden border bg-muted border-primary/20">
                      <img 
                        src={item.productInfo.imagePath}
                        alt={item.partCode}
                        className="w-full h-full object-contain"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    </div>
                  ) : item.imagePath ? (
                    <div className="w-16 h-16 sm:w-24 sm:h-24 flex-shrink-0 rounded-md overflow-hidden border bg-muted">
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
                    <div className="w-14 h-14 sm:w-20 sm:h-20 flex-shrink-0 rounded-md bg-muted flex items-center justify-center">
                      <Package className="w-6 h-6 sm:w-8 sm:h-8 text-muted-foreground/50" />
                    </div>
                  )
                  }
                  </div>
                  
                  <div className="flex-1 min-w-0 w-full sm:w-auto">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className={`font-mono text-base sm:text-lg font-semibold break-all ${item.isChecked ? 'line-through text-muted-foreground' : ''}`}>
                          {item.partCode}
                        </p>
                        {/* Show product name if available from database, otherwise show parsed description */}
                        {(item.productInfo?.name || item.description) && (
                          <p className={`text-sm mt-1 ${item.isChecked ? 'line-through text-muted-foreground' : 'text-muted-foreground'}`}>
                            {item.productInfo?.name || item.description}
                          </p>
                        )}
                        {item.productInfo?.notes && (
                          <p className="text-xs mt-0.5 text-primary/70 italic">
                            {item.productInfo.notes}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1 flex-shrink-0">
                        <Badge 
                          variant={item.isChecked ? "outline" : "default"} 
                          className="flex-shrink-0 text-sm sm:text-base px-2 sm:px-3"
                        >
                          Qty: {item.quantity}
                        </Badge>
                        {item.ctsCutLength !== undefined && (
                          <Badge 
                            variant="secondary" 
                            className="flex-shrink-0 text-sm px-2 bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
                          >
                            Cut: {Number(item.ctsCutLength).toFixed(1)} mm
                          </Badge>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex flex-wrap gap-2 mt-3">
                      {item.color && (
                        <Badge variant="outline" className="text-sm">
                          Color: {item.color}
                        </Badge>
                      )}
                      {item.height && (
                        <Badge variant="outline" className="text-sm">
                          H: {item.height}
                        </Badge>
                      )}
                      {item.width && (
                        <Badge variant="outline" className="text-sm">
                          W: {item.width}
                        </Badge>
                      )}
                      {item.length && (
                        <Badge variant="outline" className="text-sm">
                          L: {item.length}
                        </Badge>
                      )}
                      {item.thickness && (
                        <Badge variant="outline" className="text-sm">
                          T: {item.thickness}
                        </Badge>
                      )}
                    </div>
                    
                    {item.isChecked && item.checkedAt && (
                      <p className="text-sm text-green-600 dark:text-green-400 mt-2 flex items-center gap-1">
                        <CheckCircle className="w-4 h-4" />
                        Checked {new Date(item.checkedAt).toLocaleString()}
                        {item.checkedBy && ` by ${item.checkedBy}`}
                      </p>
                    )}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
