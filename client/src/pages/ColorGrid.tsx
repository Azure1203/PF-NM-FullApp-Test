import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Loader2, Palette, Upload, FileText, Save, Settings } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ColorGridEntry } from "@shared/schema";

export default function ColorGrid() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [headerTemplate, setHeaderTemplate] = useState('');
  const [headerTemplateLoaded, setHeaderTemplateLoaded] = useState(false);

  const { data: entries, isLoading } = useQuery<ColorGridEntry[]>({
    queryKey: ['/api/color-grid'],
  });

  const { data: headerSetting, isLoading: isLoadingHeader } = useQuery<{ value: string }>({
    queryKey: ['/api/admin/settings', 'ord_header_template'],
    queryFn: async () => {
      const res = await fetch('/api/admin/settings/ord_header_template', { credentials: 'include' });
      if (!res.ok) return { value: '' };
      return res.json();
    },
  });

  useEffect(() => {
    if (headerSetting?.value && !headerTemplateLoaded) {
      setHeaderTemplate(headerSetting.value);
      setHeaderTemplateLoaded(true);
    }
  }, [headerSetting, headerTemplateLoaded]);

  const saveHeaderMutation = useMutation({
    mutationFn: async (value: string) => {
      return apiRequest('PUT', '/api/admin/settings/ord_header_template', { value });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/settings', 'ord_header_template'] });
      toast({ title: 'ORD Header Template saved' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to save template', description: error.message, variant: 'destructive' });
    },
  });

  const importMutation = useMutation({
    mutationFn: async (file: File) => {
      setIsUploading(true);
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/color-grid/import', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Failed to import color grid');
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/color-grid'] });
      toast({ title: `Imported ${data.count} color entries` });
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
    onError: (error: any) => {
      toast({
        title: "Import failed",
        description: error.message,
        variant: "destructive"
      });
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      importMutation.mutate(file);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <Link href="/">
                <Button variant="ghost" size="icon" data-testid="button-back">
                  <ArrowLeft className="h-5 w-5" />
                </Button>
              </Link>
              <div className="flex items-center gap-2">
                <Palette className="h-6 w-6 text-primary" />
                <h1 className="text-xl font-semibold">Color Grid</h1>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={handleFileChange}
                data-testid="input-color-grid-csv"
              />
              <Button
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                data-testid="button-import-color-grid"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Importing...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Import CSV
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-3 sm:px-6 py-4 sm:py-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 flex-wrap">
              <FileText className="h-5 w-5" />
              Material Colors
              {entries && (
                <Badge variant="secondary" data-testid="color-grid-count">{entries.length} entries</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : entries && entries.length > 0 ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Code</TableHead>
                      <TableHead>Description</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {entries.map((entry) => (
                      <TableRow key={entry.id} data-testid={`row-color-${entry.id}`}>
                        <TableCell className="font-medium" data-testid={`color-code-${entry.id}`}>
                          {entry.code}
                        </TableCell>
                        <TableCell data-testid={`color-desc-${entry.id}`}>
                          {entry.description}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <Palette className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No color entries have been added yet.</p>
                <p className="text-sm mt-1">Import a CSV file with color codes and descriptions.</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="mt-4">
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">
              The color grid is used to identify material types in imported order CSV files. Each entry maps a color code (column B in the CSV) to its full material description. Importing a new CSV will replace all existing entries.
            </p>
          </CardContent>
        </Card>

        <Card className="mt-4" data-testid="card-ord-header-template">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              ORD Header Template
            </CardTitle>
            <CardDescription>
              Template for the [Header] block prepended to each file in .ORD exports.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingHeader ? (
              <Skeleton className="h-48 w-full" />
            ) : (
              <div className="space-y-4">
                <Textarea
                  value={headerTemplate}
                  onChange={(e) => setHeaderTemplate(e.target.value)}
                  rows={10}
                  className="font-mono text-sm"
                  placeholder={`[Header]\nVersion=4\nUnit=1\nName={{design_name}}\nDescription=\nPurchaseOrder={{po_number}}\nComment=\nCustomer=\nAddress1=`}
                  data-testid="textarea-ord-header-template"
                />
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" data-testid="badge-design-name">{`{{design_name}}`}</Badge>
                  <Badge variant="outline" data-testid="badge-po-number">{`{{po_number}}`}</Badge>
                  <span className="text-xs text-muted-foreground ml-2">Available placeholders</span>
                </div>
                <Button
                  onClick={() => saveHeaderMutation.mutate(headerTemplate)}
                  disabled={saveHeaderMutation.isPending}
                  data-testid="button-save-ord-header"
                >
                  {saveHeaderMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      Save Template
                    </>
                  )}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
