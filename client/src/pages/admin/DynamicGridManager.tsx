import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { queryClient, apiRequest } from "@/lib/queryClient";
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
import { Loader2, Upload } from "lucide-react";
import type { AttributeGrid, AttributeGridRow } from "@shared/schema";

const uploadSchema = z.object({
  name: z.string().min(1, "Grid name is required"),
  file: z.any(),
});

type UploadFormValues = z.infer<typeof uploadSchema>;

export default function DynamicGridManager() {
  const { toast } = useToast();
  const [selectedGridId, setSelectedGridId] = useState<string | null>(null);

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
      toast({ title: "Success", description: "Grid uploaded successfully" });
      form.reset();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (values: UploadFormValues) => {
    const fileInput = document.getElementById("csv-file") as HTMLInputElement;
    const file = fileInput?.files?.[0];
    if (!file) {
      toast({
        title: "Error",
        description: "Please select a CSV file",
        variant: "destructive",
      });
      return;
    }
    uploadMutation.mutate({ name: values.name, file });
  };

  return (
    <div className="container mx-auto py-10 space-y-8">
      <Card>
        <CardHeader>
          <CardTitle>Upload Attribute Grid</CardTitle>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Grid Name (e.g., MJ Doors)</FormLabel>
                    <FormControl>
                      <Input {...field} data-testid="input-grid-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="space-y-2">
                <FormLabel>CSV File</FormLabel>
                <Input
                  id="csv-file"
                  type="file"
                  accept=".csv"
                  data-testid="input-csv-file"
                />
              </div>
              <Button
                type="submit"
                disabled={uploadMutation.isPending}
                data-testid="button-upload-grid"
              >
                {uploadMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="mr-2 h-4 w-4" />
                )}
                Upload Grid
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>View Attribute Grids</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="w-full max-w-xs">
            <Select
              value={selectedGridId || ""}
              onValueChange={setSelectedGridId}
            >
              <SelectTrigger data-testid="select-grid">
                <SelectValue placeholder="Select a grid to view" />
              </SelectTrigger>
              <SelectContent>
                {grids?.map((grid) => (
                  <SelectItem
                    key={grid.id}
                    value={grid.id.toString()}
                    data-testid={`select-item-grid-${grid.id}`}
                  >
                    {grid.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isLoadingRows ? (
            <div className="flex justify-center p-10">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : rows && selectedGrid ? (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {selectedGrid.columns.map((col) => (
                      <TableHead key={col} className="whitespace-nowrap">
                        {col}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.id}>
                      {selectedGrid.columns.map((col) => (
                        <TableCell key={col} className="whitespace-nowrap">
                          {String((row.rowData as any)[col] || "")}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : selectedGridId ? (
            <div className="text-center p-10 text-muted-foreground">
              No data found for this grid.
            </div>
          ) : (
            <div className="text-center p-10 text-muted-foreground">
              Select a grid above to view its content.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
