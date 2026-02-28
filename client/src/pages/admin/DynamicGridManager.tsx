import { useState, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useDropzone } from "react-dropzone";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Upload, FileText, Database, Search } from "lucide-react";
import type { AttributeGrid, AttributeGridRow } from "@shared/schema";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";

const uploadSchema = z.object({
  name: z.string().min(1, "Grid name is required"),
});

type UploadFormValues = z.infer<typeof uploadSchema>;

export default function DynamicGridManager() {
  const { toast } = useToast();
  const [selectedGridId, setSelectedGridId] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);

  const form = useForm<UploadFormValues>({
    resolver: zodResolver(uploadSchema),
    defaultValues: {
      name: "",
    },
  });

  const { data: grids, isLoading: isLoadingGrids } = useQuery<AttributeGrid[]>({
    queryKey: ["/api/admin/attribute-grids"],
  });

  const { data: rows, isLoading: isLoadingRows } = useQuery<AttributeGridRow[]>({
    queryKey: ["/api/admin/attribute-grids", selectedGridId, "rows"],
    enabled: !!selectedGridId,
  });

  const selectedGrid = grids?.find((g) => g.id.toString() === selectedGridId);

  const uploadMutation = useMutation({
    mutationFn: async (values: { name: string; file: File }) => {
      const formData = new FormData();
      formData.append("name", values.name);
      formData.append("file", values.file);
      const res = await fetch("/api/admin/upload-dynamic-grid", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to upload grid");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/attribute-grids"] });
      toast({ title: "Success", description: "Grid uploaded and synced successfully" });
      form.reset();
      setFile(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Upload Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setFile(acceptedFiles[0]);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "text/csv": [".csv"] },
    multiple: false,
  });

  const onSubmit = (values: UploadFormValues) => {
    if (!file) {
      toast({
        title: "No File",
        description: "Please select or drop a CSV file first",
        variant: "destructive",
      });
      return;
    }
    uploadMutation.mutate({ name: values.name, file });
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Importer */}
        <Card className="lg:col-span-1 shadow-sm border-slate-200">
          <CardHeader className="pb-4 border-b bg-slate-50/50">
            <CardTitle className="text-lg flex items-center gap-2">
              <Upload className="h-5 w-5 text-primary" />
              Grid Importer
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Grid Name</FormLabel>
                      <FormControl>
                        <Input 
                          {...field} 
                          placeholder="e.g. MJ Doors" 
                          data-testid="input-grid-name"
                          className="bg-background"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="space-y-2">
                  <FormLabel>CSV File</FormLabel>
                  <div
                    {...getRootProps()}
                    className={cn(
                      "border-2 border-dashed rounded-lg p-6 transition-all cursor-pointer flex flex-col items-center justify-center gap-3 text-center",
                      isDragActive ? "border-primary bg-primary/5 scale-[0.99]" : "border-slate-200 hover:border-primary/50 hover:bg-slate-50",
                      file ? "border-green-500/50 bg-green-50/20" : ""
                    )}
                    data-testid="dropzone-csv"
                  >
                    <input {...getInputProps()} id="csv-file" data-testid="input-csv-file" />
                    <div className={cn(
                      "h-12 w-12 rounded-full flex items-center justify-center",
                      file ? "bg-green-100 text-green-600" : "bg-primary/10 text-primary"
                    )}>
                      {file ? <FileText className="h-6 w-6" /> : <Upload className="h-6 w-6" />}
                    </div>
                    {file ? (
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-slate-900 truncate max-w-[200px]">{file.name}</p>
                        <p className="text-xs text-green-600 font-medium">File ready</p>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-slate-700">
                          {isDragActive ? "Drop here" : "Click or drag CSV"}
                        </p>
                        <p className="text-xs text-slate-500 italic">Only .csv files supported</p>
                      </div>
                    )}
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full shadow-sm"
                  disabled={uploadMutation.isPending}
                  data-testid="button-upload-grid"
                >
                  {uploadMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Database className="mr-2 h-4 w-4" />
                  )}
                  Upload & Sync Grid
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>

        {/* Right Column: Viewer */}
        <Card className="lg:col-span-2 shadow-sm border-slate-200 flex flex-col">
          <CardHeader className="pb-4 border-b bg-slate-50/50 flex flex-row items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Search className="h-5 w-5 text-primary" />
              Data Viewer
            </CardTitle>
            <div className="w-64">
              <Select
                value={selectedGridId || ""}
                onValueChange={setSelectedGridId}
              >
                <SelectTrigger data-testid="select-grid" className="h-9 bg-background">
                  <SelectValue placeholder="Select a grid to view" />
                </SelectTrigger>
                <SelectContent>
                  {isLoadingGrids ? (
                    <div className="flex items-center justify-center p-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                    </div>
                  ) : (
                    grids?.map((grid) => (
                      <SelectItem
                        key={grid.id}
                        value={grid.id.toString()}
                        data-testid={`select-item-grid-${grid.id}`}
                      >
                        {grid.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="p-0 flex-1 flex flex-col min-h-0">
            {isLoadingRows ? (
              <div className="flex flex-col items-center justify-center py-20 gap-4">
                <Loader2 className="h-10 w-10 animate-spin text-primary/40" />
                <p className="text-sm text-slate-500 font-medium">Loading grid records...</p>
              </div>
            ) : rows && selectedGrid ? (
              <div className="flex-1 overflow-hidden flex flex-col">
                <ScrollArea className="flex-1 w-full">
                  <div className="min-w-full inline-block align-middle">
                    <Table>
                      <TableHeader className="sticky top-0 z-10 bg-white shadow-sm ring-1 ring-slate-200">
                        <TableRow className="hover:bg-transparent">
                          {selectedGrid.columns.map((col) => (
                            <TableHead 
                              key={col} 
                              className="whitespace-nowrap font-bold text-slate-900 bg-slate-50 px-4 h-11 border-r last:border-0"
                            >
                              {col}
                            </TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rows.length === 0 ? (
                          <TableRow>
                            <TableCell 
                              colSpan={selectedGrid.columns.length} 
                              className="h-32 text-center text-slate-500 italic"
                            >
                              This grid has no rows of data.
                            </TableCell>
                          </TableRow>
                        ) : (
                          rows.map((row, idx) => (
                            <TableRow 
                              key={row.id} 
                              className={cn(
                                "transition-colors border-b",
                                idx % 2 === 1 ? "bg-slate-50/50" : "bg-white"
                              )}
                            >
                              {selectedGrid.columns.map((col) => (
                                <TableCell 
                                  key={col} 
                                  className="whitespace-nowrap px-4 py-2.5 text-slate-600 text-sm border-r last:border-0"
                                >
                                  {String((row.rowData as any)[col] ?? "")}
                                </TableCell>
                              ))}
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </ScrollArea>
                <div className="p-3 bg-slate-50 border-t text-xs text-slate-500 flex justify-between items-center px-6">
                   <span>Showing {rows.length} records</span>
                   <span className="font-mono uppercase tracking-tighter opacity-70">Grid ID: {selectedGridId}</span>
                </div>
              </div>
            ) : selectedGridId ? (
              <div className="text-center py-32 flex flex-col items-center gap-3">
                <Database className="h-10 w-10 text-slate-200" />
                <p className="text-slate-500 font-medium">No records found for this grid.</p>
              </div>
            ) : (
              <div className="text-center py-32 flex flex-col items-center gap-4">
                <div className="h-16 w-16 bg-slate-100 rounded-full flex items-center justify-center text-slate-400">
                  <Database className="h-8 w-8" />
                </div>
                <div className="space-y-1">
                  <p className="text-slate-900 font-semibold">No grid selected</p>
                  <p className="text-slate-500 text-sm max-w-[250px] mx-auto">Select a grid from the dropdown above to view and manage its data records.</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
