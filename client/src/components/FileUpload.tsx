import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { UploadCloud, FileType, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface FileUploadProps {
  onFileSelect: (file: File) => void;
  isUploading?: boolean;
}

export function FileUpload({ onFileSelect, isUploading = false }: FileUploadProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      const file = acceptedFiles[0];
      setSelectedFile(file);
      onFileSelect(file);
    }
  }, [onFileSelect]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv'],
      'application/vnd.ms-excel': ['.csv']
    },
    maxFiles: 1,
    disabled: isUploading
  });

  const removeFile = (e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedFile(null);
  };

  return (
    <div className="w-full">
      <div
        {...getRootProps()}
        className={cn(
          "relative group cursor-pointer flex flex-col items-center justify-center w-full h-64 rounded-2xl border-2 border-dashed transition-all duration-300 ease-out bg-slate-50/50 hover:bg-slate-50",
          isDragActive ? "border-primary bg-primary/5 scale-[1.01]" : "border-slate-200 hover:border-primary/50",
          isUploading && "opacity-50 cursor-not-allowed",
          selectedFile ? "border-solid border-primary/20 bg-primary/5" : ""
        )}
      >
        <input {...getInputProps()} />
        
        {selectedFile ? (
          <div className="flex flex-col items-center animate-in fade-in zoom-in duration-300">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4 text-primary shadow-sm">
              <FileType className="w-8 h-8" />
            </div>
            <p className="text-lg font-semibold text-foreground">{selectedFile.name}</p>
            <p className="text-sm text-muted-foreground mt-1">
              {(selectedFile.size / 1024).toFixed(2)} KB
            </p>
            
            {!isUploading && (
              <button 
                onClick={removeFile}
                className="mt-4 p-2 hover:bg-red-50 text-slate-400 hover:text-red-500 rounded-full transition-colors"
                title="Remove file"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center text-center p-6 space-y-4">
            <div className={cn(
              "w-20 h-20 rounded-full flex items-center justify-center transition-all duration-500 shadow-sm",
              isDragActive ? "bg-primary text-white shadow-primary/30 shadow-lg" : "bg-white text-slate-400 shadow-slate-200"
            )}>
              <UploadCloud className="w-10 h-10" />
            </div>
            
            <div className="space-y-1">
              <p className="text-xl font-medium text-foreground">
                {isDragActive ? "Drop CSV here" : "Drag & drop your CSV"}
              </p>
              <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                Upload order files to process automatically. Supports .csv format.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
