import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { queryClient, apiRequest } from "@/lib/queryClient";
import Editor from "@monaco-editor/react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Save, Trash2, Search, Code, ChevronRight, CheckSquare, Upload, FileText } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ProxyVariable } from "@shared/schema";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const proxyVariableSchema = z.object({
  name: z.string().min(1, "Name is required"),
  type: z.enum(["pricing", "export"]),
  formula: z.string().min(1, "Formula is required"),
});

type ProxyVariableValues = z.infer<typeof proxyVariableSchema>;

export default function ProxyVariableManager() {
  const { toast } = useToast();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [selectMode, setSelectMode] = useState(false);

  const form = useForm<ProxyVariableValues>({
    resolver: zodResolver(proxyVariableSchema),
    defaultValues: {
      name: "",
      type: "pricing",
      formula: "// Enter your formula here\n",
    },
  });

  const [importOpen, setImportOpen] = useState(false);
  const [importRows, setImportRows] = useState<Array<{ name: string; type: "pricing" | "export"; formula: string }>>([]);

  const { data: variables, isLoading } = useQuery<ProxyVariable[]>({
    queryKey: ["/api/admin/proxy-variables"],
  });

  const existingNames = useMemo(() => new Set((variables || []).map(v => v.name)), [variables]);

  const filteredVariables = useMemo(() => {
    if (!variables) return [];
    return variables.filter(v =>
      v.name.toLowerCase().includes(search.toLowerCase())
    );
  }, [variables, search]);

  const saveMutation = useMutation({
    mutationFn: async (values: ProxyVariableValues) => {
      const res = await apiRequest("POST", "/api/admin/proxy-variables", values);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/proxy-variables"] });
      toast({ title: "Success", description: "Proxy variable saved" });
      if (!editingId) {
        setEditingId(data.id);
      }
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/admin/proxy-variables/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/proxy-variables"] });
      toast({ title: "Deleted", description: "Proxy variable removed" });
      setEditingId(null);
      form.reset({
        name: "",
        type: "pricing",
        formula: "// Enter your formula here\n",
      });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      await Promise.all(ids.map(id =>
        apiRequest("DELETE", `/api/admin/proxy-variables/${id}`)
      ));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/proxy-variables"] });
      const count = selectedIds.size;
      setSelectedIds(new Set());
      setSelectMode(false);
      setEditingId(null);
      form.reset({
        name: "",
        type: "pricing",
        formula: "// Enter your formula here\n",
      });
      toast({ title: "Deleted", description: `${count} variable${count !== 1 ? 's' : ''} deleted` });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const bulkImportMutation = useMutation({
    mutationFn: async (items: Array<{ name: string; type: string; formula: string }>) => {
      const res = await apiRequest("POST", "/api/admin/proxy-variables/bulk-import", { items });
      return res.json();
    },
    onSuccess: (data: { created: number; updated: number; results: Array<{ name: string; action: string }>; errors: Array<{ name: string; error: string }> }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/proxy-variables"] });
      const total = data.created + data.updated;
      const parts = [];
      if (data.created > 0) parts.push(`${data.created} created`);
      if (data.updated > 0) parts.push(`${data.updated} updated`);
      if (data.errors?.length > 0) parts.push(`${data.errors.length} failed`);
      toast({ title: `${total} variable${total !== 1 ? "s" : ""} imported`, description: parts.join(", ") });
      setImportOpen(false);
      setImportRows([]);
    },
    onError: (error: Error) => {
      toast({ title: "Import failed", description: error.message, variant: "destructive" });
    },
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    const readers = files.map(
      file =>
        new Promise<{ name: string; type: "pricing" | "export"; formula: string }>(resolve => {
          const reader = new FileReader();
          reader.onload = ev => {
            const name = file.name.replace(/\.txt$/i, "");
            const formula = (ev.target?.result as string) || "";
            resolve({ name, type: "pricing", formula });
          };
          reader.readAsText(file);
        })
    );
    Promise.all(readers).then(rows => {
      setImportRows(rows);
      setImportOpen(true);
    });
    e.target.value = "";
  };

  const onSubmit = (values: ProxyVariableValues) => {
    saveMutation.mutate(values);
  };

  const handleEdit = (v: ProxyVariable) => {
    setEditingId(v.id);
    form.reset({
      name: v.name,
      type: v.type as "pricing" | "export",
      formula: v.formula,
    });
  };

  const handleNew = () => {
    setEditingId(null);
    form.reset({
      name: "",
      type: "pricing",
      formula: "// Enter your formula here\n",
    });
  };

  return (
    <>
    <div className="h-[calc(100vh-120px)] border rounded-lg bg-card overflow-hidden">
      <ResizablePanelGroup direction="horizontal">
        {/* Left Pane: List View */}
        <ResizablePanel defaultSize={30} minSize={20}>
          <div className="h-full flex flex-col border-r">
            <div className="p-4 space-y-3 border-b">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold flex items-center gap-2">
                  <Code className="h-4 w-4" />
                  Variables
                  {variables && (
                    <Badge variant="secondary" className="text-[10px] px-1.5 h-4">
                      {variables.length}
                    </Badge>
                  )}
                </h2>
                <div className="flex items-center gap-1">
                  {!selectMode ? (
                    <>
                      <Button size="icon" variant="ghost" onClick={() => setSelectMode(true)} title="Select multiple" data-testid="button-toggle-select-mode">
                        <CheckSquare className="h-4 w-4" />
                      </Button>
                      <label title="Import .txt files" className="cursor-pointer">
                        <Button size="icon" variant="ghost" asChild data-testid="button-import-variables">
                          <span><Upload className="h-4 w-4" /></span>
                        </Button>
                        <input
                          type="file"
                          accept=".txt"
                          multiple
                          className="hidden"
                          onChange={handleFileSelect}
                          data-testid="input-import-files"
                        />
                      </label>
                      <Button size="icon" variant="ghost" onClick={handleNew} title="New Variable" data-testid="button-new-variable">
                        <Plus className="h-4 w-4" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        data-testid="button-select-all"
                        onClick={() => {
                          if (selectedIds.size === filteredVariables.length) {
                            setSelectedIds(new Set());
                          } else {
                            setSelectedIds(new Set(filteredVariables.map(v => v.id)));
                          }
                        }}
                      >
                        {selectedIds.size === filteredVariables.length ? 'Clear All' : 'All'}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        data-testid="button-cancel-select"
                        onClick={() => {
                          setSelectMode(false);
                          setSelectedIds(new Set());
                        }}
                      >
                        Cancel
                      </Button>
                    </>
                  )}
                </div>
              </div>

              {selectMode && selectedIds.size > 0 && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" size="sm" className="w-full h-8 text-xs" data-testid="button-bulk-delete">
                      <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                      Delete {selectedIds.size} variable{selectedIds.size !== 1 ? 's' : ''}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete {selectedIds.size} proxy variable{selectedIds.size !== 1 ? 's' : ''}?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently delete {selectedIds.size} selected variable{selectedIds.size !== 1 ? 's' : ''}. Any products referencing these as pricing or export formulas will lose their assignment. This cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        onClick={() => bulkDeleteMutation.mutate(Array.from(selectedIds))}
                        data-testid="button-confirm-bulk-delete"
                      >
                        {bulkDeleteMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        ) : null}
                        Delete {selectedIds.size} variable{selectedIds.size !== 1 ? 's' : ''}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}

              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search variables..."
                  className="pl-8"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  data-testid="input-search-variables"
                />
              </div>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-2 space-y-1">
                {isLoading ? (
                  <div className="flex justify-center p-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : filteredVariables.length === 0 ? (
                  <div className="text-center p-8 text-muted-foreground text-sm">
                    No variables found
                  </div>
                ) : (
                  filteredVariables.map((v) => (
                    <button
                      key={v.id}
                      data-testid={`button-variable-${v.id}`}
                      onClick={() => {
                        if (selectMode) {
                          setSelectedIds(prev => {
                            const next = new Set(prev);
                            if (next.has(v.id)) next.delete(v.id);
                            else next.add(v.id);
                            return next;
                          });
                        } else {
                          handleEdit(v);
                        }
                      }}
                      className={cn(
                        "w-full flex items-center gap-3 px-3 py-2 rounded-md transition-colors text-left group",
                        selectMode
                          ? selectedIds.has(v.id)
                            ? "bg-primary/10 border border-primary/30"
                            : "hover:bg-accent text-foreground"
                          : editingId === v.id
                            ? "bg-primary text-primary-foreground"
                            : "hover:bg-accent text-foreground"
                      )}
                    >
                      {selectMode && (
                        <input
                          type="checkbox"
                          checked={selectedIds.has(v.id)}
                          onChange={() => {}}
                          className="h-4 w-4 rounded border-gray-300 accent-primary shrink-0"
                          data-testid={`checkbox-variable-${v.id}`}
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium truncate">{v.name}</span>
                          <Badge
                            variant={editingId === v.id && !selectMode ? "outline" : "secondary"}
                            className={cn(
                              "text-[10px] uppercase px-1 py-0 h-4",
                              editingId === v.id && !selectMode && "border-primary-foreground/20 text-primary-foreground"
                            )}
                          >
                            {v.type}
                          </Badge>
                        </div>
                      </div>
                      {!selectMode && (
                        <ChevronRight className={cn(
                          "h-4 w-4 shrink-0 transition-transform",
                          editingId === v.id ? "translate-x-0" : "-translate-x-2 opacity-0 group-hover:opacity-100 group-hover:translate-x-0"
                        )} />
                      )}
                    </button>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* Right Pane: Editor View */}
        <ResizablePanel defaultSize={70}>
          <div className="h-full flex flex-col">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="h-full flex flex-col">
                <div className="p-4 border-b bg-muted/30">
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem className="space-y-1">
                          <FormLabel className="text-xs uppercase text-muted-foreground font-bold">Name</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="variable.name" className="h-8 bg-background" data-testid="input-variable-name" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="type"
                      render={({ field }) => (
                        <FormItem className="space-y-1">
                          <FormLabel className="text-xs uppercase text-muted-foreground font-bold">Type</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger className="h-8 bg-background" data-testid="select-variable-type">
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="pricing">Pricing</SelectItem>
                              <SelectItem value="export">Export</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                <div className="flex-1 relative min-h-0 bg-[#1e1e1e]">
                  <FormField
                    control={form.control}
                    name="formula"
                    render={({ field }) => (
                      <div className="absolute inset-0">
                        <Editor
                          height="100%"
                          language="javascript"
                          theme="vs-dark"
                          value={field.value}
                          onChange={(val) => field.onChange(val || "")}
                          options={{
                            minimap: { enabled: false },
                            formatOnPaste: true,
                            bracketPairColorization: { enabled: true },
                            lineNumbers: "on",
                            fontSize: 14,
                            padding: { top: 10 },
                            scrollBeyondLastLine: false,
                            automaticLayout: true,
                          }}
                        />
                      </div>
                    )}
                  />
                </div>

                <div className="p-4 border-t flex justify-between bg-muted/30">
                  <div className="flex gap-2">
                    <Button type="submit" size="sm" disabled={saveMutation.isPending} data-testid="button-save-variable">
                      {saveMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                      {editingId ? "Save Changes" : "Create Variable"}
                    </Button>
                  </div>
                  {editingId && (
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      data-testid="button-delete-variable"
                      onClick={() => {
                        if (confirm("Are you sure you want to delete this variable?")) {
                          deleteMutation.mutate(editingId);
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete
                    </Button>
                  )}
                </div>
              </form>
            </Form>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>

    <Dialog open={importOpen} onOpenChange={open => { if (!open) { setImportOpen(false); setImportRows([]); } }}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-4 w-4" />
            Import Variables from Files
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-2 py-2 border-b">
          <span className="text-sm text-muted-foreground mr-1">Set all to:</span>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            data-testid="button-set-all-pricing"
            onClick={() => setImportRows(rows => rows.map(r => ({ ...r, type: "pricing" as const })))}
          >
            Pricing
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            data-testid="button-set-all-export"
            onClick={() => setImportRows(rows => rows.map(r => ({ ...r, type: "export" as const })))}
          >
            Export
          </Button>
          <span className="ml-auto text-xs text-muted-foreground">{importRows.length} file{importRows.length !== 1 ? "s" : ""} selected</span>
        </div>

        <ScrollArea className="flex-1 min-h-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[220px]">Variable Name</TableHead>
                <TableHead className="w-[130px]">Type</TableHead>
                <TableHead>Formula Preview</TableHead>
                <TableHead className="w-[110px]">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {importRows.map((row, i) => (
                <TableRow key={i} data-testid={`import-row-${i}`}>
                  <TableCell className="font-mono text-xs font-medium">
                    <div className="flex items-center gap-1.5">
                      <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      {row.name}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Select
                      value={row.type}
                      onValueChange={(val: "pricing" | "export") =>
                        setImportRows(rows => rows.map((r, j) => j === i ? { ...r, type: val } : r))
                      }
                    >
                      <SelectTrigger className="h-7 text-xs w-[110px]" data-testid={`select-import-type-${i}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pricing">Pricing</SelectItem>
                        <SelectItem value="export">Export</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground max-w-[260px]">
                    <span className="truncate block">{row.formula.slice(0, 90)}{row.formula.length > 90 ? "…" : ""}</span>
                  </TableCell>
                  <TableCell>
                    {existingNames.has(row.name) ? (
                      <Badge variant="outline" className="text-xs text-amber-600 border-amber-300 bg-amber-50 dark:bg-amber-950/30">
                        Will Update
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs text-green-600 border-green-300 bg-green-50 dark:bg-green-950/30">
                        New
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ScrollArea>

        <DialogFooter className="pt-2 border-t">
          <Button variant="outline" onClick={() => { setImportOpen(false); setImportRows([]); }}>
            Cancel
          </Button>
          <Button
            onClick={() => bulkImportMutation.mutate(importRows)}
            disabled={bulkImportMutation.isPending || importRows.length === 0}
            data-testid="button-confirm-import"
          >
            {bulkImportMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Upload className="mr-2 h-4 w-4" />
            )}
            Import {importRows.length} variable{importRows.length !== 1 ? "s" : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
