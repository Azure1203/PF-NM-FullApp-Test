import { useState, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Upload, ImagePlus, CheckCircle2, XCircle } from "lucide-react";

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

interface UploadResponse {
  saved: SavedResult[];
  unmatched: UnmatchedResult[];
  uploadErrors: UploadErrorResult[];
  total: number;
}

export default function ProductImageUploader() {
  const { toast } = useToast();
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadResult, setUploadResult] = useState<UploadResponse | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files).filter(f =>
      /\.(jpg|jpeg|png|webp)$/i.test(f.name)
    );
    setSelectedFiles(files);
    setUploadResult(null);
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter(f =>
      /\.(jpg|jpeg|png|webp)$/i.test(f.name)
    );
    setSelectedFiles(files);
    setUploadResult(null);
  }, []);

  const uploadMutation = useMutation({
    mutationFn: async () => {
      const formData = new FormData();
      selectedFiles.forEach(f => formData.append('images', f));
      const res = await fetch('/api/admin/products/bulk-upload-images', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Upload failed' }));
        throw new Error(err.message);
      }
      return res.json() as Promise<UploadResponse>;
    },
    onSuccess: (data) => {
      setUploadResult(data);
      queryClient.invalidateQueries({ queryKey: ['/api/admin/allmoxy-products'] });
      queryClient.invalidateQueries({ queryKey: ['/api/products'] });
      const saved = data.saved.length;
      const unmatched = data.unmatched.length + data.uploadErrors.length;
      toast({
        title: `${saved} image${saved !== 1 ? 's' : ''} saved`,
        description: unmatched > 0 ? `${unmatched} file${unmatched !== 1 ? 's' : ''} had no matching product` : 'All images matched successfully',
      });
    },
    onError: (error: Error) => {
      toast({ title: "Upload failed", description: error.message, variant: "destructive" });
    },
  });

  const handleReset = () => {
    setSelectedFiles([]);
    setUploadResult(null);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-page-title">Bulk Product Image Uploader</h1>
        <p className="text-muted-foreground mt-1">
          Upload product images — filenames must match product names exactly (case-insensitive). Matched images are saved automatically.
        </p>
      </div>

      {!uploadResult ? (
        <Card>
          <CardContent className="p-6 space-y-4">
            <div
              data-testid="dropzone"
              className={`border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-colors ${
                isDragOver ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50'
              }`}
              onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={handleDrop}
              onClick={() => document.getElementById('file-input')?.click()}
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

            <div className="flex justify-end">
              <Button
                onClick={() => uploadMutation.mutate()}
                disabled={selectedFiles.length === 0 || uploadMutation.isPending}
                data-testid="button-upload-save"
              >
                {uploadMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Uploading {selectedFiles.length} image{selectedFiles.length !== 1 ? 's' : ''}…
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Upload & Save
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground" data-testid="text-summary">
              {uploadResult.total} file{uploadResult.total !== 1 ? 's' : ''} processed —{' '}
              <span className="text-green-600 font-medium">{uploadResult.saved.length} saved</span>
              {(uploadResult.unmatched.length + uploadResult.uploadErrors.length) > 0 && (
                <>, <span className="text-red-600 font-medium">{uploadResult.unmatched.length + uploadResult.uploadErrors.length} unmatched</ span></>
              )}
            </p>
            <Button variant="outline" size="sm" onClick={handleReset} data-testid="button-upload-more">
              Upload More
            </Button>
          </div>

          {uploadResult.saved.length > 0 && (
            <Card>
              <CardContent className="p-0">
                <div className="px-4 py-3 border-b bg-green-50 dark:bg-green-950/20 rounded-t-lg">
                  <h2 className="text-sm font-semibold text-green-700 dark:text-green-400 flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4" />
                    Saved ({uploadResult.saved.length})
                  </h2>
                </div>
                <div className="divide-y max-h-96 overflow-y-auto">
                  {uploadResult.saved.map((item, idx) => (
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

          {(uploadResult.unmatched.length > 0 || uploadResult.uploadErrors.length > 0) && (
            <Card>
              <CardContent className="p-0">
                <div className="px-4 py-3 border-b bg-red-50 dark:bg-red-950/20 rounded-t-lg">
                  <h2 className="text-sm font-semibold text-red-700 dark:text-red-400 flex items-center gap-2">
                    <XCircle className="h-4 w-4" />
                    No matching product ({uploadResult.unmatched.length + uploadResult.uploadErrors.length})
                  </h2>
                  <p className="text-xs text-red-600 dark:text-red-500 mt-0.5">
                    Rename these files to match a product name exactly, then upload again.
                  </p>
                </div>
                <div className="divide-y max-h-96 overflow-y-auto">
                  {uploadResult.unmatched.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-3 px-4 py-2.5" data-testid={`row-unmatched-${idx}`}>
                      <XCircle className="h-4 w-4 text-red-400 shrink-0" />
                      <span className="font-mono text-xs truncate" data-testid={`text-unmatched-filename-${idx}`}>
                        {item.filename}
                      </span>
                      <span className="text-xs text-muted-foreground ml-auto">No matching product found</span>
                    </div>
                  ))}
                  {uploadResult.uploadErrors.map((item, idx) => (
                    <div key={`err-${idx}`} className="flex items-center gap-3 px-4 py-2.5" data-testid={`row-error-${idx}`}>
                      <XCircle className="h-4 w-4 text-red-400 shrink-0" />
                      <span className="font-mono text-xs truncate">
                        {item.filename}
                      </span>
                      <span className="text-xs text-red-500 ml-auto">{item.error}</span>
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
