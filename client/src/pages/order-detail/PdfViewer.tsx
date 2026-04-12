import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, ExternalLink, FileText, Loader2, AlertCircle } from "lucide-react";

interface PdfViewerProps {
  url: string;
  downloadUrl?: string;
  filename?: string;
  height?: string;
}

export function PdfViewer({ url, downloadUrl, filename, height = "calc(100vh - 260px)" }: PdfViewerProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const handleDownload = () => {
    const a = document.createElement("a");
    a.href = downloadUrl ?? url;
    a.download = filename ?? "document.pdf";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={handleDownload}
          data-testid="button-pdf-download"
        >
          <Download className="w-4 h-4 mr-2" />
          Download PDF
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => window.open(url, "_blank")}
          data-testid="button-pdf-new-tab"
        >
          <ExternalLink className="w-4 h-4 mr-2" />
          Open in New Tab
        </Button>
      </div>
      <div className="relative w-full rounded-md overflow-hidden border bg-muted/30" style={{ height }}>
        {loading && !error && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        )}
        {error ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-muted-foreground">
            <AlertCircle className="w-10 h-10" />
            <p className="text-sm">Could not load PDF preview.</p>
            <Button variant="outline" size="sm" onClick={() => window.open(url, "_blank")}>
              <ExternalLink className="w-4 h-4 mr-2" />
              Open Directly
            </Button>
          </div>
        ) : (
          <iframe
            src={url}
            className="w-full h-full border-0"
            title={filename ?? "PDF Preview"}
            onLoad={() => setLoading(false)}
            onError={() => { setLoading(false); setError(true); }}
            data-testid="iframe-pdf"
          />
        )}
      </div>
    </div>
  );
}
