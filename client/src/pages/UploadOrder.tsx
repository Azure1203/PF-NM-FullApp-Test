import { useState } from "react";
import { useLocation } from "wouter";
import { useUploadOrder } from "@/hooks/use-orders";
import { PageHeader } from "@/components/PageHeader";
import { FileUpload } from "@/components/FileUpload";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, Loader2, CheckCircle2, FileText, Upload, Cog } from "lucide-react";
import { Link } from "wouter";

type UploadStatus = "idle" | "uploading" | "processing" | "success" | "error";

export default function UploadOrder() {
  const [files, setFiles] = useState<File[]>([]);
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const { mutate: uploadOrder, isPending } = useUploadOrder();
  const [, setLocation] = useLocation();

  const handleUpload = () => {
    if (files.length === 0) return;
    
    setUploadStatus("uploading");
    setStatusMessage(`Uploading ${files.length} file${files.length > 1 ? 's' : ''}...`);
    
    const formData = new FormData();
    files.forEach(file => {
      formData.append("files", file);
    });
    
    // Short delay to show uploading state, then switch to processing
    setTimeout(() => {
      if (uploadStatus === "uploading") {
        setUploadStatus("processing");
        setStatusMessage("Processing orders and calculating parts...");
      }
    }, 500);
    
    uploadOrder(formData, {
      onSuccess: () => {
        setUploadStatus("success");
        setStatusMessage("Orders processed successfully!");
      },
      onError: (error) => {
        setUploadStatus("error");
        setStatusMessage(error.message || "Upload failed");
      }
    });
  };

  return (
    <div className="min-h-screen bg-slate-50/50 pb-20">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        
        <Link href="/">
          <Button variant="ghost" className="mb-6 pl-0 text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Dashboard
          </Button>
        </Link>

        <PageHeader 
          title="Upload New Orders" 
          description="Upload multiple CSV files to extract order details automatically."
        />

        <Card className="border-none shadow-lg shadow-slate-200/50 overflow-hidden">
          <CardContent className="p-8">
            <div className="space-y-8">
              <FileUpload 
                onFilesSelect={(newFiles) => {
                  setFiles(newFiles);
                  setUploadStatus("idle");
                  setStatusMessage("");
                }} 
                isUploading={isPending} 
                multiple={true}
              />

              {/* Upload Progress Section */}
              {uploadStatus !== "idle" && (
                <div className={`rounded-xl p-4 border ${
                  uploadStatus === "error" 
                    ? "bg-red-50/50 border-red-200" 
                    : uploadStatus === "success"
                    ? "bg-green-50/50 border-green-200"
                    : "bg-orange-50/50 border-orange-200"
                }`}>
                  <div className="flex items-center gap-3">
                    {uploadStatus === "uploading" && (
                      <Upload className="w-5 h-5 text-orange-600 animate-pulse" />
                    )}
                    {uploadStatus === "processing" && (
                      <Cog className="w-5 h-5 text-orange-600 animate-spin" />
                    )}
                    {uploadStatus === "success" && (
                      <CheckCircle2 className="w-5 h-5 text-green-600" />
                    )}
                    {uploadStatus === "error" && (
                      <div className="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center text-white text-xs font-bold">!</div>
                    )}
                    <div className="flex-1">
                      <p className={`font-medium ${
                        uploadStatus === "error" ? "text-red-800" : 
                        uploadStatus === "success" ? "text-green-800" : "text-orange-800"
                      }`}>
                        {statusMessage}
                      </p>
                      {(uploadStatus === "uploading" || uploadStatus === "processing") && (
                        <div className="mt-2">
                          <Progress value={uploadStatus === "uploading" ? 30 : 70} className="h-2" />
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {/* Show file list during upload */}
                  {(uploadStatus === "uploading" || uploadStatus === "processing") && files.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-orange-200/50">
                      <p className="text-xs text-orange-700 mb-2">Files being processed:</p>
                      <div className="space-y-1">
                        {files.map((file, idx) => (
                          <div key={idx} className="flex items-center gap-2 text-sm text-orange-800">
                            <FileText className="w-3 h-3" />
                            <span className="truncate">{file.name}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-4 text-sm text-blue-800">
                <p className="font-semibold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  Auto-Extraction Enabled
                </p>
                <p className="mt-1 opacity-80 pl-6">
                  We'll automatically identify Dealer, Address, Phone, Tax ID, and other key fields from your CSV.
                </p>
              </div>

              <div className="flex justify-end pt-4">
                <Button 
                  size="lg" 
                  onClick={handleUpload}
                  disabled={files.length === 0 || isPending}
                  className="btn-primary w-full sm:w-auto min-w-[150px]"
                  data-testid="button-process-orders"
                >
                  {isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      {uploadStatus === "uploading" ? "Uploading..." : "Processing..."}
                    </>
                  ) : (
                    "Process Orders"
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
