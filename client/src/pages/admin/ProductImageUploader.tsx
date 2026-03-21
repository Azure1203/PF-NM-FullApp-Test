import { useState, useCallback, useRef } from "react";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Upload, ImagePlus, CheckCircle2, XCircle, X } from "lucide-react";

const BATCH_SIZE = 25;

interface SavedResult {
  filename: string;
  productName: string;
  storagePath: string;
}

interface UnmatchedResult {
  filename: string;
}

interface UploadErrorResult {
  filename: string;
  error: string;
}

interface BatchResponse {
  saved: SavedResult[];
  unmatched: UnmatchedResult[];
  uploadErrors: UploadErrorResult[];
  total: number;
}

interface AccumulatedResult {
  saved: SavedResult[];
  unmatched: UnmatchedResult[];
  uploadErrors: UploadErrorResult[];
  total: number;
}

export default function ProductImageUploader() {
  const { toast } = useToast();
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [processed, setProcessed] = useState(0);
  const [liveResult, setLiveResult] = useState<AccumulatedResult | null>(null);
  const [finalResult, setFinalResult] = useState<AccumulatedResult | null>(null);
  const cancelledRef = useRef(false);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files).filter(f =>
      /\.(jpg|jpeg|png|webp)$/i.test(f.name)
    );
    setSelectedFiles(files);
    setFinalResult(null);
    setLiveResult(null);
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter(f =>
      /\.(jpg|jpeg|png|webp)$/i.test(f.name)
    );
    setSelectedFiles(files);
    setFinalResult(null);
    setLiveResult(null);
    e.target.value = '';
  }, []);

  const handleUpload = async () => {
    if (selectedFiles.length === 0 || isUploading) return;

    cancelledRef.current = false;
    setIsUploading(true);
    setProcessed(0);
    setLiveResult({ saved: [], unmatched: [], uploadErrors: [], total: selectedFiles.length });
    setFinalResult(null);

    const accumulated: AccumulatedResult = {
      saved: [],
      unmatched: [],
      uploadErrors: [],
      total: selectedFiles.length,
    };

    const chunks: File[][] = [];
    for (let i = 0; i < selectedFiles.length; i += BATCH_SIZE) {
      chunks.push(selectedFiles.slice(i, i + BATCH_SIZE));
    }

    for (const chunk of chunks) {
      if (cancelledRef.current) break;

      const formData = new FormData();
      chunk.forEach(f => formData.append('images', f));

      try {
        const res = await fetch('/api/admin/products/bulk-upload-images', {
          method: 'POST',
          body: formData,
          credentials: 'include',
        });
        if (res.ok) {
          const data: BatchResponse = await res.json();
          accumulated.saved.push(...data.saved);
          accumulated.unmatched.push(...data.unmatched);
          accumulated.uploadErrors.push(...data.uploadErrors);
        } else {
          const err = await res.json().catch(() => ({ message: 'Batch failed' }));
          chunk.forEach(f => accumulated.uploadErrors.push({ filename: f.name, error: err.message || 'Batch failed' }));
        }
      } catch (e: any) {
        chunk.forEach(f => accumulated.uploadErrors.push({ filename: f.name, error: 'Network error' }));
      }

      setProcessed(prev => prev + chunk.length);
      setLiveResult({ ...accumulated });
    }

    setIsUploading(false);
    setFinalResult({ ...accumulated });
    setLiveResult(null);

    queryClient.invalidateQueries({ queryKey: ['/api/admin/allmoxy-products'] });
    queryClient.invalidateQueries({ queryKey: ['/api/products'] });

    const wasCancelled = cancelledRef.current;
    const saved = accumulated.saved.length;
    const failed = accumulated.unmatched.length + accumulated.uploadErrors.length;

    toast({
      title: wasCancelled
        ? `Cancelled — ${saved} image${saved !== 1 ? 's' : ''} saved before stop`
        : `${saved} image${saved !== 1 ? 's' : ''} saved`,
      description: failed > 0
        ? `${failed} file${failed !== 1 ? 's' : ''} had no matching product or failed`
        : saved > 0 ? 'All images matched and saved successfully' : 'No matching products found',
    });
  };

  const handleCancel = () => {
    cancelledRef.current = true;
  };

  const handleReset = () => {
    setSelectedFiles([]);
    setFinalResult(null);
    setLiveResult(null);
    setProcessed(0);
  };

  const result = finalResult ?? liveResult;
  const progressPct = selectedFiles.length > 0 ? Math.round((processed / selectedFiles.length) * 100) : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-page-title">Bulk Product Image Uploader</h1>
        <p className="text-muted-foreground mt-1">
          Upload product images — filenames must match product names exactly (case-insensitive). Matched images are saved automatically.
        </p>
      </div>

      {!finalResult ? (
        <Card>
          <CardContent className="p-6 space-y-4">
            <div
              data-testid="dropzone"
              className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors ${
                isUploading ? 'opacity-50 pointer-events-none border-muted-foreground/25' :
                isDragOver ? 'border-primary bg-primary/5 cursor-pointer' : 'border-muted-foreground/25 hover:border-primary/50 cursor-pointer'
              }`}
              onDragOver={(e) => { if (!isUploading) { e.preventDefault(); setIsDragOver(true); } }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={handleDrop}
              onClick={() => !isUploading && document.getElementById('file-input')?.click()}
            >
              <ImagePlus className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-lg font-medium">
                {selectedFiles.length > 0
                  ? `${selectedFiles.length} image${selectedFiles.length !== 1 ? 's' : ''} selected`
                  : 'Drop images here or click to browse'}
              </p>
              <p className="text-sm text-muted-foreground mt-1">Supports .jpg, .jpeg, .png, .webp — any quantity</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-3"
                disabled={isUploading}
                onClick={(e) => { e.stopPropagation(); document.getElementById('file-input')?.click(); }}
                data-testid="button-browse-files"
              >
                Browse Files
              </Button>
              <input
                id="file-input"
                type="file"
                multiple
                accept=".jpg,.jpeg,.png,.webp"
                className="hidden"
                onChange={handleFileSelect}
                data-testid="input-file"
              />
            </div>

            {isUploading && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    Processing {processed} / {selectedFiles.length} images…
                  </span>
                  {result && (
                    <span className="text-muted-foreground">
                      <span className="text-green-600 font-medium">{result.saved.length} saved</span>
                      {result.unmatched.length > 0 && <>, <span className="text-red-600 font-medium">{result.unmatched.length} unmatched</span></>}
                      {result.uploadErrors.length > 0 && <>, <span className="text-orange-600 font-medium">{result.uploadErrors.length} failed</span></>}
                    </span>
                  )}
                </div>
                <Progress value={progressPct} className="h-2" data-testid="progress-upload" />
              </div>
            )}

            <div className="flex justify-end gap-2">
              {isUploading ? (
                <Button
                  variant="outline"
                  onClick={handleCancel}
                  data-testid="button-cancel-upload"
                >
                  <X className="h-4 w-4 mr-2" />
                  Cancel
                </Button>
              ) : (
                <Button
                  onClick={handleUpload}
                  disabled={selectedFiles.length === 0}
                  data-testid="button-upload-save"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Upload & Save
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground" data-testid="text-summary">
              {finalResult.total} file{finalResult.total !== 1 ? 's' : ''} processed —{' '}
              <span className="text-green-600 font-medium">{finalResult.saved.length} saved</span>
              {finalResult.unmatched.length > 0 && (
                <>, <span className="text-red-600 font-medium">{finalResult.unmatched.length} unmatched</span></>
              )}
              {finalResult.uploadErrors.length > 0 && (
                <>, <span className="text-orange-600 font-medium">{finalResult.uploadErrors.length} failed</span></>
              )}
            </p>
            <Button variant="outline" size="sm" onClick={handleReset} data-testid="button-upload-more">
              Upload More
            </Button>
          </div>

          {finalResult.saved.length > 0 && (
            <Card>
              <CardContent className="p-0">
                <div className="px-4 py-3 border-b bg-green-50 dark:bg-green-950/20 rounded-t-lg">
                  <h2 className="text-sm font-semibold text-green-700 dark:text-green-400 flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4" />
                    Saved ({finalResult.saved.length})
                  </h2>
                </div>
                <div className="divide-y max-h-96 overflow-y-auto">
                  {finalResult.saved.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-3 px-4 py-2.5" data-testid={`row-saved-${idx}`}>
                      <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                      <span className="font-mono text-xs text-muted-foreground truncate flex-1" data-testid={`text-saved-filename-${idx}`}>
                        {item.filename}
                      </span>
                      <span className="text-xs text-muted-foreground">→</span>
                      <span className="text-sm font-medium truncate flex-1" data-testid={`text-saved-product-${idx}`}>
                        {item.productName}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {finalResult.unmatched.length > 0 && (
            <Card>
              <CardContent className="p-0">
                <div className="px-4 py-3 border-b bg-red-50 dark:bg-red-950/20 rounded-t-lg">
                  <h2 className="text-sm font-semibold text-red-700 dark:text-red-400 flex items-center gap-2">
                    <XCircle className="h-4 w-4" />
                    No matching product ({finalResult.unmatched.length})
                  </h2>
                  <p className="text-xs text-red-600 dark:text-red-500 mt-0.5">
                    Rename these files to match a product name exactly, then upload again.
                  </p>
                </div>
                <div className="divide-y max-h-96 overflow-y-auto">
                  {finalResult.unmatched.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-3 px-4 py-2.5" data-testid={`row-unmatched-${idx}`}>
                      <XCircle className="h-4 w-4 text-red-400 shrink-0" />
                      <span className="font-mono text-xs truncate" data-testid={`text-unmatched-filename-${idx}`}>
                        {item.filename}
                      </span>
                      <span className="text-xs text-muted-foreground ml-auto">No matching product found</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {finalResult.uploadErrors.length > 0 && (
            <Card>
              <CardContent className="p-0">
                <div className="px-4 py-3 border-b bg-orange-50 dark:bg-orange-950/20 rounded-t-lg">
                  <h2 className="text-sm font-semibold text-orange-700 dark:text-orange-400 flex items-center gap-2">
                    <XCircle className="h-4 w-4" />
                    Upload failed ({finalResult.uploadErrors.length})
                  </h2>
                  <p className="text-xs text-orange-600 dark:text-orange-500 mt-0.5">
                    Product matched but the file could not be saved. Try uploading again.
                  </p>
                </div>
                <div className="divide-y max-h-96 overflow-y-auto">
                  {finalResult.uploadErrors.map((item, idx) => (
                    <div key={`err-${idx}`} className="flex items-center gap-3 px-4 py-2.5" data-testid={`row-error-${idx}`}>
                      <XCircle className="h-4 w-4 text-orange-400 shrink-0" />
                      <span className="font-mono text-xs truncate" data-testid={`text-error-filename-${idx}`}>
                        {item.filename}
                      </span>
                      <span className="text-xs text-orange-600 ml-auto" data-testid={`text-error-message-${idx}`}>{item.error}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
