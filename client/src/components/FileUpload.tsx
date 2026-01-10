import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { UploadCloud, FileType, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface FileUploadProps {
  onFilesSelect: (files: File[]) => void;
  isUploading?: boolean;
  multiple?: boolean;
}

export function FileUpload({ onFilesSelect, isUploading = false, multiple = false }: FileUploadProps) {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      const newFiles = multiple ? [...selectedFiles, ...acceptedFiles] : [acceptedFiles[0]];
      setSelectedFiles(newFiles);
      onFilesSelect(newFiles);
    }
  }, [onFilesSelect, selectedFiles, multiple]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv'],
      'application/vnd.ms-excel': ['.csv']
    },
    multiple,
    disabled: isUploading
  });

  const removeFile = (index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const newFiles = selectedFiles.filter((_, i) => i !== index);
    setSelectedFiles(newFiles);
    onFilesSelect(newFiles);
  };

  return (
    <div className="w-full">
      <div
        {...getRootProps()}
        className={cn(
          "relative group cursor-pointer flex flex-col items-center justify-center w-full min-h-64 rounded-2xl border-2 border-dashed transition-all duration-300 ease-out bg-slate-50/50 hover:bg-slate-50 p-6",
          isDragActive ? "border-primary bg-primary/5 scale-[1.01]" : "border-slate-200 hover:border-primary/50",
          isUploading && "opacity-50 cursor-not-allowed",
          selectedFiles.length > 0 ? "border-solid border-primary/20 bg-primary/5" : ""
        )}
      >
        <input {...getInputProps()} />
        
        {selectedFiles.length > 0 ? (
          <div className="w-full space-y-4 animate-in fade-in zoom-in duration-300">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {selectedFiles.map((file, index) => (
                <div key={`${file.name}-${index}`} className="flex items-center gap-3 bg-white p-3 rounded-xl border border-slate-100 shadow-sm">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
                    <FileType className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{file.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {(file.size / 1024).toFixed(2)} KB
                    </p>
                  </div>
                  {!isUploading && (
                    <button 
                      onClick={(e) => removeFile(index, e)}
                      className="p-1.5 hover:bg-red-50 text-slate-400 hover:text-red-500 rounded-full transition-colors"
                      title="Remove file"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            {!multiple && selectedFiles.length > 0 && (
              <p className="text-center text-xs text-muted-foreground italic">Click or drag to replace</p>
            )}
            {multiple && !isUploading && (
              <div className="flex justify-center pt-2">
                <p className="text-sm text-primary font-medium">+ Add more files</p>
              </div>
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
                {isDragActive ? "Drop CSVs here" : "Drag & drop your CSVs"}
              </p>
              <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                {multiple ? "Upload multiple order files to process them all at once." : "Upload an order file to process automatically."} Supports .csv format.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
