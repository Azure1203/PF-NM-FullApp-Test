import { useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Upload, FileSpreadsheet, RefreshCw, Box } from "lucide-react";
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

export function HardwareCsvUploadSection({ fileId, fileName }: HardwareCsvUploadSectionProps) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  const { data: checklistData } = useQuery<{ items: any[]; progress: HardwareChecklistProgress }>({
    queryKey: ['/api/files', fileId, 'hardware-checklist'],
    enabled: fileId > 0,
  });

  const generateChecklistMutation = useMutation({
    mutationFn: async (csvContent: string) => {
      return await apiRequest('POST', `/api/files/${fileId}/generate-hardware-checklist`, { csvContent });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/files', fileId, 'hardware-checklist'] });
      toast({
        title: 'Hardware checklist generated',
        description: `Created ${data.totalItems} items (${data.buyoutItems} buyout items)`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
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

  return (
    <div className="mb-4 space-y-2" data-testid="hardware-csv-upload-section">
      <div className="flex items-center gap-2">
        <Box className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm font-medium text-muted-foreground">Hardware CSV:</span>
        {hasChecklist && (
          <Badge variant="secondary" className="text-xs">
            {checklistData.items.length} items
          </Badge>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
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
          disabled={isUploading || generateChecklistMutation.isPending}
          data-testid="button-upload-hardware-csv"
        >
          {(isUploading || generateChecklistMutation.isPending) ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : hasChecklist ? (
            <RefreshCw className="w-4 h-4 mr-2" />
          ) : (
            <Upload className="w-4 h-4 mr-2" />
          )}
          {hasChecklist ? 'Replace CSV' : 'Upload Hardware CSV'}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        {hasChecklist 
          ? "Hardware checklist generated. Items are matched to the product database." 
          : "Upload a hardware CSV file to generate a packing checklist. Items will be matched to your product database."}
      </p>
    </div>
  );
}
