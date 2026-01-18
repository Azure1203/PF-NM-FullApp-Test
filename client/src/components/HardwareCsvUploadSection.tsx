import { useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Upload, RefreshCw, Box, AlertTriangle, CheckCircle, XCircle, FileText, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface HardwareCsvUploadSectionProps {
  fileId: number;
  fileName: string;
}

interface HardwareChecklistProgress {
  total: number;
  packed: number;
  buyoutItems: number;
  buyoutArrived: number;
}

interface ValidationError {
  rowIndex: number;
  code: string;
  name: string;
  error: string;
}

interface SkippedRowInfo {
  rowIndex: number;
  code: string;
  name: string;
  reason: string;
}

interface GenerateChecklistResponse {
  success?: boolean;
  items?: any[];
  boStatus?: string;
  totalItems?: number;
  buyoutItems?: number;
  expectedCount?: number;
  insertedCount?: number;
  totalRows?: number;
  skippedRows?: number;
  skippedRowsInfo?: SkippedRowInfo[];
  errors?: ValidationError[];
  message?: string;
  matchedProducts?: number;
  unmatchedProducts?: number;
}

export function HardwareCsvUploadSection({ fileId, fileName }: HardwareCsvUploadSectionProps) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [validationResult, setValidationResult] = useState<GenerateChecklistResponse | null>(null);

  const { data: checklistData } = useQuery<{ items: any[]; progress: HardwareChecklistProgress }>({
    queryKey: ['/api/files', fileId, 'hardware-checklist'],
    enabled: fileId > 0,
  });

  // Generate from order's stored CSV content
  const generateFromOrderMutation = useMutation({
    mutationFn: async (): Promise<GenerateChecklistResponse> => {
      const response = await fetch(`/api/files/${fileId}/generate-hardware-from-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      const data = await response.json();
      if (!response.ok) {
        const error = new Error(data.message || 'Failed to generate checklist') as any;
        error.validationData = data;
        throw error;
      }
      return data;
    },
    onSuccess: (data: GenerateChecklistResponse) => {
      queryClient.invalidateQueries({ queryKey: ['/api/files', fileId, 'hardware-checklist'] });
      setValidationResult(data);
      const skippedInfo = data.skippedRows && data.skippedRows > 0 
        ? ` (${data.skippedRows} rows skipped)`
        : '';
      const matchInfo = data.unmatchedProducts && data.unmatchedProducts > 0 
        ? `, ${data.unmatchedProducts} not in database`
        : '';
      toast({
        title: 'Hardware checklist generated',
        description: `Found ${data.totalItems} hardware items${skippedInfo}${matchInfo}`,
      });
    },
    onError: (error: any) => {
      const errorData: GenerateChecklistResponse | null = error.validationData || null;
      setValidationResult(errorData);
      toast({
        title: 'Error generating checklist',
        description: error.message || 'Failed to extract hardware from order',
        variant: 'destructive',
      });
    },
  });

  // Generate from uploaded CSV file (legacy/Hafele format)
  const generateChecklistMutation = useMutation({
    mutationFn: async (csvContent: string): Promise<GenerateChecklistResponse> => {
      const response = await fetch(`/api/files/${fileId}/generate-hardware-checklist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csvContent }),
        credentials: 'include',
      });
      const data = await response.json();
      if (!response.ok) {
        const error = new Error(data.message || 'Failed to generate checklist') as any;
        error.validationData = data;
        throw error;
      }
      return data;
    },
    onSuccess: (data: GenerateChecklistResponse) => {
      queryClient.invalidateQueries({ queryKey: ['/api/files', fileId, 'hardware-checklist'] });
      setValidationResult(data);
      if (data.errors && data.errors.length > 0) {
        toast({
          title: 'Checklist created with warnings',
          description: `Created ${data.totalItems} items but ${data.errors.length} rows had issues`,
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Hardware checklist generated',
          description: `All ${data.totalItems} items added successfully (${data.buyoutItems} buyout items)`,
        });
      }
    },
    onError: (error: any) => {
      const errorData: GenerateChecklistResponse | null = error.validationData || null;
      setValidationResult(errorData);
      toast({
        title: 'Error generating checklist',
        description: error.message || 'Some items failed to be added',
        variant: 'destructive',
      });
    },
  });

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const text = await file.text();
      await generateChecklistMutation.mutateAsync(text);
    } catch (err: any) {
      console.error('Error reading CSV:', err);
    } finally {
      setIsUploading(false);
      if (inputRef.current) {
        inputRef.current.value = '';
      }
    }
  };

  const hasChecklist = checklistData?.items && checklistData.items.length > 0;
  const hasErrors = validationResult?.errors && validationResult.errors.length > 0;
  const isGenerating = generateFromOrderMutation.isPending || generateChecklistMutation.isPending || isUploading;

  return (
    <div className="mb-4 space-y-2" data-testid="hardware-csv-upload-section">
      <div className="flex items-center gap-2 flex-wrap">
        <Box className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm font-medium text-muted-foreground">Hardware Packing:</span>
        {hasChecklist && (
          <Badge variant="secondary" className="text-xs" data-testid="badge-checklist-count">
            {checklistData.items.length} items
          </Badge>
        )}
        {validationResult?.success && !hasErrors && (
          <Badge className="bg-green-600 text-white text-xs" data-testid="badge-validation-success">
            <CheckCircle className="w-3 h-3 mr-1" />
            Generated
          </Badge>
        )}
        {validationResult?.unmatchedProducts && validationResult.unmatchedProducts > 0 && (
          <Badge variant="outline" className="text-xs text-amber-600 border-amber-300" data-testid="badge-unmatched-products">
            {validationResult.unmatchedProducts} not in database
          </Badge>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          onClick={() => generateFromOrderMutation.mutate()}
          disabled={isGenerating}
          data-testid="button-generate-from-order"
        >
          {generateFromOrderMutation.isPending ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : hasChecklist ? (
            <RefreshCw className="w-4 h-4 mr-2" />
          ) : (
            <Sparkles className="w-4 h-4 mr-2" />
          )}
          {hasChecklist ? 'Regenerate' : 'Generate from Order'}
        </Button>
        <input
          type="file"
          accept=".csv,text/csv"
          ref={inputRef}
          className="hidden"
          onChange={handleFileChange}
          data-testid="input-hardware-csv-upload"
        />
        <Button
          size="sm"
          variant="outline"
          onClick={() => inputRef.current?.click()}
          disabled={isGenerating}
          data-testid="button-upload-hardware-csv"
        >
          {(isUploading || generateChecklistMutation.isPending) ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Upload className="w-4 h-4 mr-2" />
          )}
          Upload CSV
        </Button>
        {(hasErrors || validationResult) && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setValidationResult(null)}
            className="text-muted-foreground"
            data-testid="button-dismiss-result"
          >
            <XCircle className="w-4 h-4" />
          </Button>
        )}
      </div>
      
      {hasErrors && validationResult.errors && (
        <Card className="border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-800" data-testid="card-validation-errors">
          <CardHeader className="pb-2 pt-3">
            <CardTitle className="text-sm flex items-center gap-2 text-red-700 dark:text-red-400">
              <AlertTriangle className="w-4 h-4" />
              {validationResult.errors.length} Row{validationResult.errors.length > 1 ? 's' : ''} Failed Validation
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 pb-3">
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {validationResult.errors.slice(0, 10).map((error, idx) => (
                <div key={idx} className="text-xs text-red-700 dark:text-red-400 flex items-start gap-2" data-testid={`validation-error-${idx}`}>
                  <span className="font-mono bg-red-100 dark:bg-red-900/30 px-1 rounded">Row {error.rowIndex}</span>
                  <span className="font-medium">{error.code || 'No code'}</span>
                  <span className="text-red-600 dark:text-red-500">{error.error}</span>
                </div>
              ))}
              {validationResult.errors.length > 10 && (
                <p className="text-xs text-red-600 dark:text-red-500 italic">
                  ... and {validationResult.errors.length - 10} more errors
                </p>
              )}
            </div>
            {validationResult.totalRows !== undefined && (
              <p className="text-xs text-muted-foreground mt-2" data-testid="text-csv-summary">
                CSV had {validationResult.totalRows} total rows, {validationResult.skippedRows || 0} skipped, {validationResult.insertedCount || 0} added successfully
              </p>
            )}
          </CardContent>
        </Card>
      )}
      
      {validationResult?.success && validationResult.skippedRowsInfo && validationResult.skippedRowsInfo.length > 0 && (
        <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800" data-testid="card-skipped-rows">
          <CardHeader className="pb-2 pt-3">
            <CardTitle className="text-sm flex items-center gap-2 text-amber-700 dark:text-amber-400">
              <AlertTriangle className="w-4 h-4" />
              {validationResult.skippedRowsInfo.length} Hardware Row{validationResult.skippedRowsInfo.length > 1 ? 's' : ''} Skipped
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 pb-3">
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {validationResult.skippedRowsInfo.slice(0, 5).map((row, idx) => (
                <div key={idx} className="text-xs text-amber-700 dark:text-amber-400 flex items-start gap-2" data-testid={`skipped-row-${idx}`}>
                  <span className="font-mono bg-amber-100 dark:bg-amber-900/30 px-1 rounded">Row {row.rowIndex}</span>
                  <span className="font-medium">{row.code}</span>
                  <span className="text-amber-600 dark:text-amber-500">{row.reason}</span>
                </div>
              ))}
              {validationResult.skippedRowsInfo.length > 5 && (
                <p className="text-xs text-amber-600 dark:text-amber-500 italic">
                  ... and {validationResult.skippedRowsInfo.length - 5} more skipped
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}
      
      <p className="text-xs text-muted-foreground" data-testid="text-upload-help">
        {hasChecklist 
          ? "Hardware checklist generated. Items are matched to the product database." 
          : "Click 'Generate from Order' to extract hardware items from the order CSV automatically."}
      </p>
    </div>
  );
}
