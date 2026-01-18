import { useRoute, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Loader2, ArrowLeft } from "lucide-react";
import { HardwarePackingChecklist } from "@/components/HardwarePackingChecklist";

interface FileInfo {
  id: number;
  projectId: number;
  originalFilename: string;
  allmoxyJobNumber: string | null;
}

export default function HardwareChecklist() {
  const [match, params] = useRoute("/files/:fileId/hardware-checklist");
  const fileId = params?.fileId ? parseInt(params.fileId, 10) : null;

  const { data: fileInfo, isLoading: fileLoading } = useQuery<FileInfo>({
    queryKey: [`/api/files/${fileId}`],
    enabled: !!fileId,
  });

  if (!match || !fileId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
        <p className="text-muted-foreground">Invalid file ID</p>
      </div>
    );
  }

  if (fileLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <div className="max-w-4xl mx-auto p-4 space-y-4">
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

        <div className="mb-4">
          <h1 className="text-2xl font-bold">Hardware Packing Checklist</h1>
          <p className="text-muted-foreground">
            {fileInfo?.originalFilename || `File #${fileId}`}
            {fileInfo?.allmoxyJobNumber && (
              <span className="ml-2 text-primary font-medium">
                (Job #{fileInfo.allmoxyJobNumber})
              </span>
            )}
          </p>
        </div>

        <HardwarePackingChecklist 
          fileId={fileId} 
          fileName={fileInfo?.originalFilename || `File #${fileId}`} 
        />
      </div>
    </div>
  );
}
