import { useState, useCallback } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useUploadOrder } from "@/hooks/use-orders";
import { PageHeader } from "@/components/PageHeader";
import { FileUpload } from "@/components/FileUpload";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Loader2, CheckCircle2, FileText, Upload, Cog, FolderOpen, AlertTriangle, LayoutDashboard } from "lucide-react";
import { Link } from "wouter";

type UploadStatus = "idle" | "uploading" | "processing" | "success" | "error";

interface UploadResult {
  name: string;
  totalPrice: number;
  items: Array<{ SKU: string; NAME: string; Qty: number; price: number; error: string | null; productMatched: boolean }>;
}

function formatFilenameToProjectName(filename: string): string {
  let name = filename.replace(/\.[^/.]+$/, "");
  name = name.replace(/[#\-]/g, ' ').replace(/\s+/g, ' ').trim();
  return name;
}

function findCommonPrefix(names: string[]): string | null {
  if (names.length === 0) return null;
  if (names.length === 1) return names[0];
  
  const basenames = names.map(n => {
    const parenIndex = n.indexOf('(');
    return parenIndex > 0 ? n.substring(0, parenIndex).trim() : n;
  });
  
  const first = basenames[0];
  let commonLength = first.length;
  
  for (let i = 1; i < basenames.length; i++) {
    let j = 0;
    while (j < commonLength && j < basenames[i].length && first[j] === basenames[i][j]) {
      j++;
    }
    commonLength = j;
  }
  
  if (commonLength > 5) {
    return first.substring(0, commonLength).trim();
  }
  
  return null;
}

export default function UploadOrder() {
  const [files, setFiles] = useState<File[]>([]);
  const [projectName, setProjectName] = useState("");
  const [userEditedName, setUserEditedName] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const { mutate: uploadOrder, isPending } = useUploadOrder();
  const [, setLocation] = useLocation();

  const { data: readiness } = useQuery({
    queryKey: ['import-readiness'],
    queryFn: () => fetch('/api/admin/import-readiness', { credentials: 'include' }).then(r => r.json()),
    staleTime: 60_000,
  });

  const generateProjectName = useCallback((selectedFiles: File[]): string => {
    if (selectedFiles.length === 0) return "";
    const formattedNames = selectedFiles.map(f => formatFilenameToProjectName(f.name));
    if (selectedFiles.length === 1) return formattedNames[0];
    const commonPrefix = findCommonPrefix(formattedNames);
    return commonPrefix || formattedNames[0];
  }, []);

  const handleFilesSelect = useCallback((newFiles: File[]) => {
    setFiles(newFiles);
    setUploadStatus("idle");
    setStatusMessage("");
    setUploadResult(null);
    if (!userEditedName) {
      setProjectName(generateProjectName(newFiles));
    }
  }, [userEditedName, generateProjectName]);

  const handleProjectNameChange = (value: string) => {
    setProjectName(value);
    setUserEditedName(true);
  };

  const handleUpload = () => {
    if (files.length === 0) return;
    
    setUploadStatus("uploading");
    setStatusMessage(`Uploading ${files.length} file${files.length > 1 ? 's' : ''}...`);
    
    const formData = new FormData();
    files.forEach(file => {
      formData.append("files", file);
    });
    
    if (projectName.trim()) {
      formData.append("projectName", projectName.trim());
    }
    
    setTimeout(() => {
      if (uploadStatus === "uploading") {
        setUploadStatus("processing");
        setStatusMessage("Processing orders and calculating parts...");
      }
    }, 500);
    
    uploadOrder(formData, {
      onSuccess: (data) => {
        setUploadStatus("success");
        setStatusMessage("Orders processed successfully!");
        setUploadResult(data as UploadResult);
      },
      onError: (error) => {
        setUploadStatus("error");
        setStatusMessage(error.message || "Upload failed");
      }
    });
  };

  const totalItems = uploadResult?.items?.length ?? 0;
  const matchedItems = uploadResult?.items?.filter(i => i.productMatched).length ?? 0;
  const errorItems = uploadResult?.items?.filter(i => i.error).length ?? 0;
  const pricedItems = uploadResult?.items?.filter(i => i.price > 0).length ?? 0;

  return (
    <div className="min-h-screen bg-muted/30 pb-20">
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

        {/* Readiness Banner */}
        {readiness && !readiness.ready && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6 dark:bg-amber-950/30 dark:border-amber-800">
            <h3 className="font-semibold text-amber-800 dark:text-amber-300 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              System not ready for order import
            </h3>
            <ul className="mt-2 text-sm text-amber-700 dark:text-amber-400 space-y-1">
              {readiness.issues.map((issue: string, i: number) => (
                <li key={i}>• {issue}</li>
              ))}
            </ul>
            <p className="mt-2 text-sm text-amber-600 dark:text-amber-500">
              Products with SKU prefix: {readiness.products.activeWithSkuPrefix} · 
              With pricing formula: {readiness.products.activeWithPricingFormula} · 
              Grid bindings: {readiness.bindings.total}
            </p>
          </div>
        )}

        {readiness?.ready && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-6 text-sm text-green-700 dark:bg-green-950/30 dark:border-green-800 dark:text-green-400">
            ✅ Ready: {readiness.products.activeWithPricingFormula} products with pricing · {readiness.bindings.total} grid bindings · {readiness.proxyVariables.total} formulas
          </div>
        )}

        <Card className="border-none shadow-lg shadow-slate-200/50 overflow-hidden">
          <CardContent className="p-4 sm:p-8">
            <div className="space-y-8">
              <FileUpload 
                onFilesSelect={handleFilesSelect} 
                isUploading={isPending} 
                multiple={true}
              />

              {/* Project Name Input */}
              {files.length > 0 && uploadStatus === "idle" && (
                <div className="space-y-2">
                  <Label htmlFor="projectName" className="flex items-center gap-2 text-base font-medium">
                    <FolderOpen className="w-4 h-4" />
                    Project Name
                  </Label>
                  <Input
                    id="projectName"
                    placeholder="Enter project name"
                    value={projectName}
                    onChange={(e) => handleProjectNameChange(e.target.value)}
                    className="h-12 text-base"
                    data-testid="input-project-name"
                  />
                  <p className="text-sm text-muted-foreground">
                    Auto-generated from filename. Edit to customize before processing.
                  </p>
                </div>
              )}

              {/* Upload Progress / Status Section */}
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
                  
                  {/* File list during upload */}
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

                  {/* Import results summary */}
                  {uploadStatus === "success" && uploadResult && (
                    <div className="mt-4 pt-4 border-t border-green-200">
                      <p className="text-sm font-semibold text-green-800 mb-2">
                        Project: {uploadResult.name}
                      </p>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div className="text-green-700">
                          <span className="font-medium">{totalItems}</span> line items processed
                        </div>
                        <div className="text-green-700">
                          Total: <span className="font-medium">${(uploadResult.totalPrice ?? 0).toFixed(2)}</span>
                        </div>
                        <div className="text-green-700">
                          ✅ <span className="font-medium">{matchedItems}</span> matched to products
                        </div>
                        <div className={errorItems > 0 ? "text-amber-700" : "text-green-700"}>
                          {errorItems > 0 ? "⚠" : "✅"} <span className="font-medium">{errorItems}</span> pricing errors
                        </div>
                        <div className="text-green-700">
                          💰 <span className="font-medium">{pricedItems}</span> priced successfully
                        </div>
                        <div className={totalItems - matchedItems > 0 ? "text-amber-700" : "text-green-700"}>
                          {totalItems - matchedItems > 0 ? "❌" : "✅"} <span className="font-medium">{totalItems - matchedItems}</span> unmatched SKUs
                        </div>
                      </div>
                      <Button
                        className="mt-4 w-full"
                        onClick={() => setLocation("/")}
                        data-testid="button-go-to-dashboard"
                      >
                        <LayoutDashboard className="w-4 h-4 mr-2" />
                        Go to Dashboard
                      </Button>
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

              {uploadStatus !== "success" && (
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
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
