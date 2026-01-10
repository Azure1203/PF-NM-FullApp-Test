import { useState } from "react";
import { useLocation } from "wouter";
import { useUploadOrder } from "@/hooks/use-orders";
import { PageHeader } from "@/components/PageHeader";
import { FileUpload } from "@/components/FileUpload";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, Loader2, CheckCircle2 } from "lucide-react";
import { Link } from "wouter";

export default function UploadOrder() {
  const [files, setFiles] = useState<File[]>([]);
  const { mutate: uploadOrder, isPending } = useUploadOrder();
  const [, setLocation] = useLocation();

  const handleUpload = () => {
    if (files.length === 0) return;
    
    const formData = new FormData();
    files.forEach(file => {
      formData.append("files", file);
    });
    
    uploadOrder(formData);
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
                onFilesSelect={setFiles} 
                isUploading={isPending} 
                multiple={true}
              />

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
                >
                  {isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Processing...
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
