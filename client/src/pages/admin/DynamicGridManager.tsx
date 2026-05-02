import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useDropzone } from "react-dropzone";
import { useToast } from "@/hooks/use-toast";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Upload, Database, Search, Trash2, Download,
  ChevronDown, ChevronUp, FileText, Loader2, AlertTriangle, X, CheckSquare, Square,
  Link2, Check, PlusCircle,
} from "lucide-react";
import type { AttributeGrid, AttributeGridRow, AllmoxyProduct } from "@shared/schema";
import { cn } from "@/lib/utils";

type BindingWithProductInfo = {
  id: number;
  productId: number;
  productName: string;
  skuPrefix: string | null;
  alias: string;
  lookupColumn: string;
  gridId: number;
};

export default function DynamicGridManager() {
  const { toast } = useToast();

  const [selectedGridId, setSelectedGridId] = useState<number | null>(null);
  const [editingCell, setEditingCell] = useState<{ rowId: number; col: string } | null>(null);
  const [editingValue, setEditingValue] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [newRowData, setNewRowData] = useState<Record<string, string>>({});
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadResults, setUploadResults] = useState<{ filename: string; gridName: string; rowCount?: number; error?: string }[] | null>(null);
  const [confirmDeleteGrid, setConfirmDeleteGrid] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedGridIds, setSelectedGridIds] = useState<Set<number>>(new Set());
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [editingGridName, setEditingGridName] = useState(false);
  const [editingGridNameValue, setEditingGridNameValue] = useState('');
  const [editingKeyColumn, setEditingKeyColumn] = useState(false);

  // Bindings tab
  const [activeTab, setActiveTab] = useState<'rows' | 'bindings'>('rows');
  const [editingBindingId, setEditingBindingId] = useState<number | null>(null);
  const [editingBindingField, setEditingBindingField] = useState<'alias' | 'lookupColumn' | null>(null);
  const [editingBindingValue, setEditingBindingValue] = useState('');
  const [savedBindingId, setSavedBindingId] = useState<number | null>(null);

  // Bulk Update Alias dialog
  const [bulkAliasOpen, setBulkAliasOpen] = useState(false);
  const [bulkAliasValue, setBulkAliasValue] = useState('');

  // Bulk Add Binding dialog
  const [bulkAddOpen, setBulkAddOpen] = useState(false);
  const [bulkAddAlias, setBulkAddAlias] = useState('');
  const [bulkAddLookupColumn, setBulkAddLookupColumn] = useState('');
  const [bulkAddMode, setBulkAddMode] = useState<'formula-contains' | 'explicit'>('formula-contains');
  const [bulkAddFragment, setBulkAddFragment] = useState('');
  const [bulkAddSelectedProducts, setBulkAddSelectedProducts] = useState<Set<number>>(new Set());
  const [bulkAddProductSearch, setBulkAddProductSearch] = useState('');
  const [bulkAddPreview, setBulkAddPreview] = useState<{ will: number; skip: number } | null>(null);

  const { data: grids = [] } = useQuery<AttributeGrid[]>({
    queryKey: ['/api/admin/attribute-grids'],
  });

  const { data: rows = [], isLoading: isLoadingRows } = useQuery<AttributeGridRow[]>({
    queryKey: ['/api/admin/attribute-grids', selectedGridId, 'rows'],
    enabled: selectedGridId !== null,
    queryFn: () =>
      fetch(`/api/admin/attribute-grids/${selectedGridId}/rows`).then(r => r.json()),
  });

  const { data: gridBindings = [], isLoading: isLoadingBindings } = useQuery<BindingWithProductInfo[]>({
    queryKey: ['/api/admin/attribute-grids', selectedGridId, 'bindings'],
    enabled: selectedGridId !== null,
    queryFn: () =>
      fetch(`/api/admin/attribute-grids/${selectedGridId}/bindings`).then(r => r.json()),
  });

  const { data: allProducts = [] } = useQuery<AllmoxyProduct[]>({
    queryKey: ['/api/admin/allmoxy-products'],
  });

  const selectedGrid = grids.find(g => g.id === selectedGridId) ?? null;

  const filteredRows = useMemo(() => {
    if (!searchQuery.trim()) return rows;
    const q = searchQuery.toLowerCase();
    return rows.filter(row =>
      Object.values(row.rowData as Record<string, any>).some(v =>
        String(v).toLowerCase().includes(q)
      )
    );
  }, [rows, searchQuery]);

  const updateRowMutation = useMutation({
    mutationFn: async ({ rowId, rowData }: { rowId: number; rowData: Record<string, any> }) => {
      const res = await fetch(`/api/admin/attribute-grids/rows/${rowId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rowData }),
      });
      if (!res.ok) throw new Error('Failed to save');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/attribute-grids', selectedGridId, 'rows'] });
      toast({ title: 'Row updated' });
    },
    onError: (e: Error) => toast({ title: 'Save failed', description: e.message, variant: 'destructive' }),
  });

  const deleteRowMutation = useMutation({
    mutationFn: async (rowId: number) => {
      const res = await fetch(`/api/admin/attribute-grids/rows/${rowId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete row');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/attribute-grids', selectedGridId, 'rows'] });
      toast({ title: 'Row deleted' });
    },
    onError: (e: Error) => toast({ title: 'Delete failed', description: e.message, variant: 'destructive' }),
  });

  const addRowMutation = useMutation({
    mutationFn: async (rowData: Record<string, any>) => {
      const res = await fetch(`/api/admin/attribute-grids/${selectedGridId}/rows`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rowData }),
      });
      if (!res.ok) throw new Error('Failed to add row');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/attribute-grids', selectedGridId, 'rows'] });
      setNewRowData({});
      toast({ title: 'Row added' });
    },
    onError: (e: Error) => toast({ title: 'Add failed', description: e.message, variant: 'destructive' }),
  });

  const deleteGridMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/admin/attribute-grids/${selectedGridId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete grid');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/attribute-grids'] });
      setSelectedGridId(null);
      setConfirmDeleteGrid(false);
      toast({ title: 'Grid deleted' });
    },
    onError: (e: Error) => toast({ title: 'Delete failed', description: e.message, variant: 'destructive' }),
  });

  const updateBindingMutation = useMutation({
    mutationFn: async ({ id, alias, lookupColumn }: { id: number; alias?: string; lookupColumn?: string }) => {
      const res = await apiRequest('PATCH', `/api/admin/attribute-grids/${selectedGridId}/bindings/${id}`, { alias, lookupColumn });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/attribute-grids', selectedGridId, 'bindings'] });
      setEditingBindingId(null);
      setEditingBindingField(null);
      setSavedBindingId(data.id);
      setTimeout(() => setSavedBindingId(null), 2000);
    },
    onError: (e: Error) => toast({ title: 'Save failed', description: e.message, variant: 'destructive' }),
  });

  const bulkAliasMutation = useMutation({
    mutationFn: async (alias: string) => {
      const res = await apiRequest('PATCH', `/api/admin/attribute-grids/${selectedGridId}/bindings/bulk-alias`, { alias });
      return res.json() as Promise<{ updated: number }>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/attribute-grids', selectedGridId, 'bindings'] });
      setBulkAliasOpen(false);
      toast({ title: 'Alias updated', description: `Updated ${data.updated} binding(s)` });
    },
    onError: (e: Error) => toast({ title: 'Bulk alias failed', description: e.message, variant: 'destructive' }),
  });

  const bulkAddMutation = useMutation({
    mutationFn: async () => {
      const body: any = { alias: bulkAddAlias.trim(), lookupColumn: bulkAddLookupColumn.trim(), mode: bulkAddMode };
      if (bulkAddMode === 'formula-contains') body.formulaFragment = bulkAddFragment.trim();
      else body.productIds = [...bulkAddSelectedProducts];
      const res = await apiRequest('POST', `/api/admin/attribute-grids/${selectedGridId}/bindings/bulk-add`, body);
      return res.json() as Promise<{ inserted: number; skipped: number }>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/attribute-grids', selectedGridId, 'bindings'] });
      setBulkAddOpen(false);
      setBulkAddAlias(''); setBulkAddLookupColumn(''); setBulkAddFragment('');
      setBulkAddSelectedProducts(new Set()); setBulkAddPreview(null);
      toast({ title: 'Bindings added', description: `Added ${data.inserted} product(s). ${data.skipped} already had a binding and were skipped.` });
    },
    onError: (e: Error) => toast({ title: 'Bulk add failed', description: e.message, variant: 'destructive' }),
  });

  const removeBindingMutation = useMutation({
    mutationFn: async (binding: BindingWithProductInfo) => {
      const currentBindings = await fetch(`/api/admin/allmoxy-products/${binding.productId}/grid-bindings`).then(r => r.json()) as Array<{ gridId: number; alias: string; lookupColumn: string }>;
      const remaining = currentBindings.filter((b) => b.gridId !== binding.gridId);
      const res = await apiRequest('POST', `/api/admin/allmoxy-products/${binding.productId}/grid-bindings`, { bindings: remaining });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/attribute-grids', selectedGridId, 'bindings'] });
      toast({ title: 'Binding removed' });
    },
    onError: (e: Error) => toast({ title: 'Remove failed', description: e.message, variant: 'destructive' }),
  });

  const updateGridMutation = useMutation({
    mutationFn: async (updates: { name?: string; keyColumn?: string }) => {
      const res = await fetch(`/api/admin/attribute-grids/${selectedGridId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error('Failed to update grid');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/attribute-grids'] });
      toast({ title: 'Grid updated' });
    },
    onError: (e: Error) => toast({ title: 'Update failed', description: e.message, variant: 'destructive' }),
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      const res = await fetch('/api/admin/attribute-grids/bulk', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) throw new Error('Failed to delete grids');
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/attribute-grids'] });
      if (selectedGridId && selectedGridIds.has(selectedGridId)) setSelectedGridId(null);
      setSelectedGridIds(new Set());
      setSelectMode(false);
      setConfirmBulkDelete(false);
      toast({ title: 'Grids deleted', description: `${data.deleted} grid(s) removed` });
    },
    onError: (e: Error) => toast({ title: 'Bulk delete failed', description: e.message, variant: 'destructive' }),
  });

  async function handleBulkUpload() {
    if (uploadFiles.length === 0) return;
    setUploadLoading(true);
    setUploadResults(null);
    try {
      const formData = new FormData();
      uploadFiles.forEach(f => formData.append('files', f));
      const res = await fetch('/api/admin/upload-dynamic-grids-bulk', { method: 'POST', body: formData });
      if (!res.ok) { const e = await res.json(); throw new Error(e.message); }
      const data = await res.json();
      setUploadResults(data.results);
      setUploadFiles([]);
      queryClient.invalidateQueries({ queryKey: ['/api/admin/attribute-grids'] });
      const successes = data.results.filter((r: any) => !r.error);
      if (successes.length > 0) {
        toast({ title: 'Upload complete', description: `${successes.length} of ${data.totalFiles} grid(s) synced` });
      }
    } catch (e: any) {
      toast({ title: 'Upload failed', description: e.message, variant: 'destructive' });
    } finally {
      setUploadLoading(false);
    }
  }

  function toggleGridSelection(id: number) {
    setSelectedGridIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const onDrop = useCallback((accepted: File[]) => {
    setUploadFiles(prev => [...prev, ...accepted]);
    setUploadResults(null);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'text/csv': ['.csv'] },
    multiple: true,
  });

  function startEdit(rowId: number, col: string, currentValue: string) {
    setEditingCell({ rowId, col });
    setEditingValue(currentValue);
  }

  function commitEdit(row: AttributeGridRow) {
    if (!editingCell) return;
    const updatedRowData = { ...(row.rowData as Record<string, any>), [editingCell.col]: editingValue };
    updateRowMutation.mutate({ rowId: row.id, rowData: updatedRowData });
    setEditingCell(null);
  }

  function cancelEdit() {
    setEditingCell(null);
    setEditingValue('');
  }

  return (
    <>
    <div className="flex flex-col h-screen">
      <div className="px-6 pt-6 pb-4 border-b shrink-0">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Database className="w-6 h-6 text-primary" />
          Attribute Grid Manager
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage lookup grids used in pricing and export formulas
        </p>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* ── LEFT PANEL ── */}
        <div className="w-72 shrink-0 flex flex-col border-r overflow-hidden">
          <div className="shrink-0 px-3 pt-3 pb-1 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Button
                size="sm"
                variant={selectMode ? "default" : "outline"}
                className="h-7 text-xs"
                onClick={() => { setSelectMode(m => !m); setSelectedGridIds(new Set()); setConfirmBulkDelete(false); }}
                data-testid="button-toggle-select-mode"
              >
                {selectMode ? <><CheckSquare className="w-3.5 h-3.5 mr-1" />Done</> : <><Square className="w-3.5 h-3.5 mr-1" />Select</>}
              </Button>
              {selectMode && grids.length > 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  onClick={() => {
                    if (selectedGridIds.size === grids.length) {
                      setSelectedGridIds(new Set());
                    } else {
                      setSelectedGridIds(new Set(grids.map(g => g.id)));
                    }
                    setConfirmBulkDelete(false);
                  }}
                  data-testid="button-select-all"
                >
                  {selectedGridIds.size === grids.length ? 'Clear All' : 'All'}
                </Button>
              )}
            </div>
            {selectMode && selectedGridIds.size > 0 && !confirmBulkDelete && (
              <Button
                size="sm"
                variant="destructive"
                className="h-7 text-xs"
                onClick={() => setConfirmBulkDelete(true)}
                data-testid="button-bulk-delete"
              >
                <Trash2 className="w-3.5 h-3.5 mr-1" />
                Delete {selectedGridIds.size}
              </Button>
            )}
            {confirmBulkDelete && (
              <div className="flex items-center gap-1">
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setConfirmBulkDelete(false)} data-testid="button-cancel-bulk-delete">
                  Cancel
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  className="h-7 text-xs"
                  onClick={() => bulkDeleteMutation.mutate([...selectedGridIds])}
                  disabled={bulkDeleteMutation.isPending}
                  data-testid="button-confirm-bulk-delete"
                >
                  {bulkDeleteMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : `Delete ${selectedGridIds.size}`}
                </Button>
              </div>
            )}
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {grids.length === 0 && (
              <div className="text-center py-8 text-muted-foreground text-sm">
                <Database className="w-8 h-8 mx-auto mb-2 opacity-30" />
                No grids yet. Upload a CSV below.
              </div>
            )}
            {grids.map(grid => (
              <div
                key={grid.id}
                data-testid={`card-grid-${grid.id}`}
                onClick={() => {
                  if (selectMode) {
                    toggleGridSelection(grid.id);
                  } else {
                    setSelectedGridId(grid.id);
                    setConfirmDeleteGrid(false);
                    setSearchQuery('');
                    setEditingCell(null);
                    setNewRowData({});
                  }
                }}
                className={cn(
                  "rounded-md border p-3 cursor-pointer transition-colors flex items-start gap-2",
                  selectMode && selectedGridIds.has(grid.id)
                    ? "border-primary bg-primary/10"
                    : selectedGridId === grid.id && !selectMode
                    ? "border-l-4 border-l-primary bg-primary/5"
                    : "hover:bg-muted/40"
                )}
              >
                {selectMode && (
                  <div className="shrink-0 mt-0.5" data-testid={`checkbox-grid-${grid.id}`}>
                    {selectedGridIds.has(grid.id) ? <CheckSquare className="w-4 h-4 text-primary" /> : <Square className="w-4 h-4 text-muted-foreground" />}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-sm truncate">{grid.name}</div>
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    <Badge variant="secondary" className="text-[10px]">
                      key: {grid.keyColumn}
                    </Badge>
                    <Badge variant="outline" className="text-[10px]">
                      {grid.columns?.length ?? 0} cols
                    </Badge>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Upload collapsible */}
          <div className="border-t shrink-0">
            <button
              className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium hover:bg-muted/40 transition-colors"
              onClick={() => { setUploadOpen(o => !o); setUploadResults(null); }}
              data-testid="button-toggle-upload"
            >
              <span className="flex items-center gap-2">
                <Upload className="w-4 h-4" />
                Upload Grids
              </span>
              {uploadOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            {uploadOpen && (
              <div className="px-3 pb-3 space-y-2">
                <div
                  {...getRootProps()}
                  className={cn(
                    "border-2 border-dashed rounded-md p-3 text-center cursor-pointer text-xs text-muted-foreground transition-colors",
                    isDragActive ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                  )}
                  data-testid="dropzone-grid-csv"
                >
                  <input {...getInputProps()} />
                  <span>Drop CSV files here or click to browse</span>
                </div>
                {uploadFiles.length > 0 && (
                  <div className="space-y-1 max-h-32 overflow-y-auto" data-testid="upload-file-queue">
                    {uploadFiles.map((f, i) => (
                      <div key={i} className="flex items-center gap-1.5 text-xs border rounded px-2 py-1.5">
                        <FileText className="w-3 h-3 text-muted-foreground shrink-0" />
                        <span className="truncate flex-1 font-medium">{f.name.replace(/\.csv$/i, '')}</span>
                        <button
                          className="text-muted-foreground hover:text-destructive shrink-0"
                          onClick={(e) => { e.stopPropagation(); setUploadFiles(prev => prev.filter((_, j) => j !== i)); }}
                          data-testid={`button-remove-file-${i}`}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {uploadResults && (
                  <div className="space-y-1 max-h-32 overflow-y-auto border rounded p-2 bg-muted/20" data-testid="upload-results">
                    {uploadResults.map((r, i) => (
                      <div key={i} className={cn("text-[11px] flex items-center gap-1.5", r.error ? "text-destructive" : "text-green-600 dark:text-green-400")}>
                        {r.error ? <AlertTriangle className="w-3 h-3 shrink-0" /> : <FileText className="w-3 h-3 shrink-0" />}
                        <span className="truncate font-medium">{r.gridName}</span>
                        <span className="ml-auto shrink-0">{r.error || `${r.rowCount} rows`}</span>
                      </div>
                    ))}
                  </div>
                )}
                <p className="text-[10px] text-muted-foreground">
                  Grid name derived from filename. Existing grids will have rows replaced.
                </p>
                <Button
                  size="sm"
                  className="w-full"
                  onClick={handleBulkUpload}
                  disabled={uploadLoading || uploadFiles.length === 0}
                  data-testid="button-upload-grid"
                >
                  {uploadLoading
                    ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Uploading {uploadFiles.length} file(s)…</>
                    : <><Upload className="w-3.5 h-3.5 mr-1.5" />Upload {uploadFiles.length > 0 ? `${uploadFiles.length} File(s)` : 'All'}</>
                  }
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT PANEL ── */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {!selectedGrid ? (
            <div className="flex flex-col items-center justify-center flex-1 text-muted-foreground gap-3">
              <Database className="w-16 h-16 opacity-20" />
              <p className="text-lg font-medium">Select a grid from the left to view and edit its data</p>
            </div>
          ) : (
            <>
              {/* Toolbar */}
              <div className="px-4 py-3 border-b flex flex-wrap items-center gap-3 shrink-0">
                {/* Grid name — inline editable */}
                {editingGridName ? (
                  <input
                    autoFocus
                    className="text-lg font-bold bg-primary/5 border-2 border-primary rounded px-2 py-0.5 outline-none"
                    value={editingGridNameValue}
                    onChange={e => setEditingGridNameValue(e.target.value)}
                    onBlur={() => {
                      if (editingGridNameValue.trim() && editingGridNameValue !== selectedGrid.name) {
                        updateGridMutation.mutate({ name: editingGridNameValue.trim() });
                      }
                      setEditingGridName(false);
                    }}
                    onKeyDown={e => {
                      if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                      if (e.key === 'Escape') setEditingGridName(false);
                    }}
                    data-testid="input-grid-name"
                  />
                ) : (
                  <h2
                    className="text-lg font-bold cursor-pointer hover:text-primary transition-colors"
                    onClick={() => { setEditingGridName(true); setEditingGridNameValue(selectedGrid.name); }}
                    title="Click to rename"
                    data-testid="text-grid-name"
                  >
                    {selectedGrid.name}
                  </h2>
                )}

                {/* Key column selector */}
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <span className="text-xs">key:</span>
                  {editingKeyColumn ? (
                    <select
                      autoFocus
                      className="text-sm border rounded px-1 py-0.5 bg-background"
                      value={selectedGrid.keyColumn}
                      onChange={e => {
                        updateGridMutation.mutate({ keyColumn: e.target.value });
                        setEditingKeyColumn(false);
                      }}
                      onBlur={() => setEditingKeyColumn(false)}
                      data-testid="select-key-column"
                    >
                      {selectedGrid.columns?.map(col => (
                        <option key={col} value={col}>{col}</option>
                      ))}
                    </select>
                  ) : (
                    <Badge
                      variant="outline"
                      className="cursor-pointer hover:border-primary text-xs"
                      onClick={() => setEditingKeyColumn(true)}
                      data-testid="badge-key-column"
                    >
                      {selectedGrid.keyColumn}
                    </Badge>
                  )}
                </div>

                <div className="flex-1" />

                {/* Search */}
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                  <Input
                    placeholder="Search rows…"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="pl-8 pr-7 h-8 text-sm w-48"
                    data-testid="input-search-rows"
                  />
                  {searchQuery && (
                    <button
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      onClick={() => setSearchQuery('')}
                      data-testid="button-clear-search"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs"
                  onClick={() => window.open(`/api/admin/attribute-grids/${selectedGridId}/export`)}
                  data-testid="button-export-csv"
                >
                  <Download className="w-3.5 h-3.5 mr-1.5" />
                  Export CSV
                </Button>

                {/* Delete grid */}
                {confirmDeleteGrid ? (
                  <div className="flex items-center gap-1.5 bg-destructive/10 border border-destructive/30 rounded-md px-2 py-1">
                    <AlertTriangle className="w-3.5 h-3.5 text-destructive shrink-0" />
                    <span className="text-xs text-destructive font-medium whitespace-nowrap">
                      Delete &ldquo;{selectedGrid.name}&rdquo; and all {rows.length} rows?
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 text-xs px-2"
                      onClick={() => setConfirmDeleteGrid(false)}
                      data-testid="button-cancel-delete-grid"
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      className="h-6 text-xs px-2"
                      onClick={() => deleteGridMutation.mutate()}
                      disabled={deleteGridMutation.isPending}
                      data-testid="button-confirm-delete-grid"
                    >
                      {deleteGridMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Delete'}
                    </Button>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                    onClick={() => setConfirmDeleteGrid(true)}
                    data-testid="button-delete-grid"
                  >
                    <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                    Delete Grid
                  </Button>
                )}
              </div>

              {/* Tab bar */}
              <div className="px-4 flex items-center gap-1 border-b shrink-0 bg-muted/10">
                <button
                  onClick={() => setActiveTab('rows')}
                  className={cn(
                    "px-4 py-2.5 text-sm font-medium border-b-2 transition-colors",
                    activeTab === 'rows'
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  )}
                  data-testid="tab-rows"
                >
                  Rows ({rows.length})
                </button>
                <button
                  onClick={() => setActiveTab('bindings')}
                  className={cn(
                    "px-4 py-2.5 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5",
                    activeTab === 'bindings'
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  )}
                  data-testid="tab-bindings"
                >
                  <Link2 className="w-3.5 h-3.5" />
                  Bindings ({gridBindings.length})
                </button>
              </div>

              {/* ── BINDINGS TAB ── */}
              {activeTab === 'bindings' && (
                <div className="flex-1 overflow-hidden flex flex-col">
                  <div className="px-4 py-2 border-b flex items-center gap-2 shrink-0 bg-muted/5">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs"
                      onClick={() => {
                        const sharedAlias = gridBindings.length > 0 && gridBindings.every(b => b.alias === gridBindings[0].alias) ? gridBindings[0].alias : '';
                        setBulkAliasValue(sharedAlias);
                        setBulkAliasOpen(true);
                      }}
                      disabled={gridBindings.length === 0}
                      data-testid="button-bulk-alias"
                    >
                      Bulk Update Alias
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs"
                      onClick={() => {
                        setBulkAddAlias(''); setBulkAddLookupColumn(''); setBulkAddFragment('');
                        setBulkAddSelectedProducts(new Set()); setBulkAddPreview(null);
                        setBulkAddMode('formula-contains');
                        setBulkAddOpen(true);
                      }}
                      data-testid="button-bulk-add"
                    >
                      <PlusCircle className="w-3.5 h-3.5 mr-1" />
                      Bulk Add Binding
                    </Button>
                  </div>
                  {isLoadingBindings ? (
                    <div className="flex items-center justify-center flex-1 text-muted-foreground">
                      <Loader2 className="w-6 h-6 animate-spin mr-2" />
                      Loading…
                    </div>
                  ) : gridBindings.length === 0 ? (
                    <div className="flex flex-col items-center justify-center flex-1 text-center text-muted-foreground px-8">
                      <Link2 className="w-12 h-12 opacity-20 mb-4" />
                      <p className="text-sm font-medium">No products are bound to this grid yet.</p>
                      <p className="text-xs mt-1">Use <strong>Bulk Add Binding</strong> to add many at once, or manage bindings per-product in the Product Manager.</p>
                    </div>
                  ) : (
                    <div className="overflow-auto flex-1">
                      <Table>
                        <TableHeader style={{ position: 'sticky', top: 0, zIndex: 10, backgroundColor: 'hsl(var(--background))' }}>
                          <TableRow>
                            <TableHead className="text-xs">Product Name</TableHead>
                            <TableHead className="text-xs w-28">SKU Prefix</TableHead>
                            <TableHead className="text-xs w-36">Alias</TableHead>
                            <TableHead className="text-xs w-36">Lookup Column</TableHead>
                            <TableHead className="text-xs w-16" />
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {gridBindings.map(binding => {
                            const isEditingAlias = editingBindingId === binding.id && editingBindingField === 'alias';
                            const isEditingLookup = editingBindingId === binding.id && editingBindingField === 'lookupColumn';
                            const isSaved = savedBindingId === binding.id;
                            const commitBinding = (field: 'alias' | 'lookupColumn') => {
                              if (!editingBindingValue.trim()) { setEditingBindingId(null); setEditingBindingField(null); return; }
                              updateBindingMutation.mutate({ id: binding.id, [field]: editingBindingValue.trim() });
                            };
                            return (
                              <TableRow key={binding.id} data-testid={`row-binding-${binding.id}`}>
                                <TableCell className="text-sm font-medium">{binding.productName}</TableCell>
                                <TableCell>
                                  {binding.skuPrefix
                                    ? <Badge variant="secondary" className="font-mono text-xs">{binding.skuPrefix}</Badge>
                                    : <span className="text-muted-foreground text-xs">—</span>
                                  }
                                </TableCell>
                                <TableCell>
                                  {isEditingAlias ? (
                                    <input
                                      autoFocus
                                      className="w-full px-2 py-0.5 text-sm bg-primary/5 border-2 border-primary rounded outline-none"
                                      value={editingBindingValue}
                                      onChange={e => setEditingBindingValue(e.target.value)}
                                      onBlur={() => commitBinding('alias')}
                                      onKeyDown={e => { if (e.key === 'Enter') commitBinding('alias'); if (e.key === 'Escape') { setEditingBindingId(null); setEditingBindingField(null); } }}
                                    />
                                  ) : (
                                    <div
                                      className="flex items-center gap-1.5 cursor-pointer group"
                                      onClick={() => { setEditingBindingId(binding.id); setEditingBindingField('alias'); setEditingBindingValue(binding.alias); }}
                                      title="Click to edit alias"
                                    >
                                      <span className="font-mono text-xs group-hover:text-primary">{binding.alias}</span>
                                      {isSaved && <Check className="w-3 h-3 text-green-500" />}
                                    </div>
                                  )}
                                </TableCell>
                                <TableCell>
                                  {isEditingLookup ? (
                                    <input
                                      autoFocus
                                      className="w-full px-2 py-0.5 text-sm bg-primary/5 border-2 border-primary rounded outline-none"
                                      value={editingBindingValue}
                                      onChange={e => setEditingBindingValue(e.target.value)}
                                      onBlur={() => commitBinding('lookupColumn')}
                                      onKeyDown={e => { if (e.key === 'Enter') commitBinding('lookupColumn'); if (e.key === 'Escape') { setEditingBindingId(null); setEditingBindingField(null); } }}
                                    />
                                  ) : (
                                    <div
                                      className="flex items-center gap-1.5 cursor-pointer group"
                                      onClick={() => { setEditingBindingId(binding.id); setEditingBindingField('lookupColumn'); setEditingBindingValue(binding.lookupColumn); }}
                                      title="Click to edit lookup column"
                                    >
                                      <span className="font-mono text-xs group-hover:text-primary">{binding.lookupColumn}</span>
                                    </div>
                                  )}
                                </TableCell>
                                <TableCell className="px-2">
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                    onClick={() => {
                                      if (confirm(`Remove ${binding.productName} from this grid?`)) {
                                        removeBindingMutation.mutate(binding);
                                      }
                                    }}
                                    data-testid={`button-remove-binding-${binding.id}`}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                  <div className="shrink-0 px-4 py-2 border-t text-xs text-muted-foreground bg-muted/20">
                    {gridBindings.length} binding(s) · click Alias or Lookup Column to edit inline
                  </div>
                </div>
              )}

              {/* ── ROWS TAB ── */}
              {activeTab === 'rows' && (
              <div className="flex-1 overflow-hidden flex flex-col">
                {isLoadingRows ? (
                  <div className="flex items-center justify-center flex-1 text-muted-foreground">
                    <Loader2 className="w-6 h-6 animate-spin mr-2" />
                    Loading rows…
                  </div>
                ) : (
                  <>
                    {/* Raw overflow — NO ScrollArea (clips horizontal content) */}
                    <div className="overflow-x-auto" style={{ flex: 1, overflowY: 'auto', maxHeight: 'calc(100vh - 280px)' }}>
                      <div style={{ minWidth: 'max-content' }}>
                        <Table>
                          <TableHeader style={{ position: 'sticky', top: 0, zIndex: 10, backgroundColor: 'hsl(var(--background))' }}>
                            <TableRow>
                              {selectedGrid.columns?.map(col => (
                                <TableHead
                                  key={col}
                                  className="whitespace-nowrap px-3 py-2 text-xs font-semibold border-r last:border-0"
                                >
                                  {col}
                                  {col === selectedGrid.keyColumn && (
                                    <Badge className="ml-1 text-[9px] py-0 px-1" variant="secondary">key</Badge>
                                  )}
                                </TableHead>
                              ))}
                              <TableHead className="px-2 py-2 w-10 text-xs font-semibold" />
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {filteredRows.length === 0 && (
                              <TableRow>
                                <TableCell
                                  colSpan={(selectedGrid.columns?.length ?? 0) + 1}
                                  className="text-center py-10 text-muted-foreground text-sm"
                                >
                                  {searchQuery
                                    ? `No rows match "${searchQuery}"`
                                    : 'This grid has no rows. Use the Add Row form above or re-upload a CSV.'
                                  }
                                </TableCell>
                              </TableRow>
                            )}
                            {filteredRows.map((row, rowIdx) => {
                              const rd = row.rowData as Record<string, any>;
                              const isHeader = rd['SELECTABLE'] === 'Header';
                              const missingKey = !rd[selectedGrid.keyColumn ?? ''];
                              return (
                                <TableRow
                                  key={row.id}
                                  data-testid={`row-grid-${row.id}`}
                                  className={cn(
                                    isHeader
                                      ? 'bg-muted font-medium italic text-muted-foreground'
                                      : missingKey
                                      ? 'bg-yellow-50 dark:bg-yellow-950/20'
                                      : rowIdx % 2 === 0
                                      ? 'bg-background'
                                      : 'bg-muted/20'
                                  )}
                                >
                                  {selectedGrid.columns?.map(col => {
                                    const isEditing = editingCell?.rowId === row.id && editingCell?.col === col;
                                    if (isEditing) {
                                      return (
                                        <TableCell key={col} className="p-0 border-r">
                                          <input
                                            autoFocus
                                            className="w-full h-full px-3 py-2 text-sm bg-primary/5 border-2 border-primary outline-none min-w-[120px]"
                                            value={editingValue}
                                            onChange={e => setEditingValue(e.target.value)}
                                            onBlur={() => commitEdit(row)}
                                            onKeyDown={e => {
                                              if (e.key === 'Enter') commitEdit(row);
                                              if (e.key === 'Escape') cancelEdit();
                                            }}
                                          />
                                        </TableCell>
                                      );
                                    }
                                    return (
                                      <TableCell
                                        key={col}
                                        className="whitespace-nowrap px-3 py-2 text-sm cursor-pointer hover:bg-primary/5 border-r last:border-0 max-w-[220px] overflow-hidden text-ellipsis"
                                        title={String(rd[col] ?? '')}
                                        onClick={() => startEdit(row.id, col, String(rd[col] ?? ''))}
                                        data-testid={`cell-${row.id}-${col}`}
                                      >
                                        {String(rd[col] ?? '')}
                                      </TableCell>
                                    );
                                  })}
                                  <TableCell className="px-2 py-1">
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                      onClick={() => {
                                        if (confirm('Delete this row?')) deleteRowMutation.mutate(row.id);
                                      }}
                                      data-testid={`button-delete-row-${row.id}`}
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              );
                            })}

                            {/* Add-row input row — pinned at bottom */}
                            <TableRow className="bg-green-50/40 dark:bg-green-950/10 border-t-2 border-green-200 dark:border-green-800">
                              {selectedGrid.columns?.map(col => (
                                <TableCell key={col} className="p-1 border-r">
                                  <input
                                    className="w-full px-2 py-1 text-sm bg-white dark:bg-background border border-border rounded min-w-[100px]"
                                    placeholder={col === selectedGrid.keyColumn ? `${col} (key)` : col}
                                    value={newRowData[col] ?? ''}
                                    onChange={e => setNewRowData(prev => ({ ...prev, [col]: e.target.value }))}
                                    data-testid={`input-new-row-${col}`}
                                  />
                                </TableCell>
                              ))}
                              <TableCell className="px-2 py-1">
                                <Button
                                  size="sm"
                                  className="h-7 text-xs"
                                  onClick={() => {
                                    const filledData: Record<string, any> = {};
                                    selectedGrid.columns?.forEach(col => { filledData[col] = newRowData[col] ?? ''; });
                                    addRowMutation.mutate(filledData);
                                  }}
                                  disabled={addRowMutation.isPending || !newRowData[selectedGrid.keyColumn ?? '']}
                                  data-testid="button-add-row"
                                >
                                  {addRowMutation.isPending
                                    ? <Loader2 className="h-3 w-3 animate-spin" />
                                    : '+ Add'
                                  }
                                </Button>
                              </TableCell>
                            </TableRow>
                          </TableBody>
                        </Table>
                      </div>
                    </div>

                    {/* Footer bar */}
                    <div className="shrink-0 px-4 py-2 border-t text-xs text-muted-foreground flex gap-4 bg-muted/20">
                      <span>
                        Showing <strong>{filteredRows.length}</strong>
                        {searchQuery ? ` of ${rows.length}` : ''} rows
                      </span>
                      <span>key: <strong>{selectedGrid.keyColumn}</strong></span>
                      <span>Grid ID: <strong>{selectedGrid.id}</strong></span>
                      <span>{selectedGrid.columns?.length ?? 0} columns</span>
                    </div>
                  </>
                )}
              </div>
            )}
            </>
          )}
        </div>
      </div>
    </div>

    {/* ── Bulk Update Alias Dialog ── */}
    <Dialog open={bulkAliasOpen} onOpenChange={setBulkAliasOpen}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Bulk Update Alias</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Update alias for all <strong>{gridBindings.length}</strong> products bound to{' '}
          <strong>{selectedGrid?.name}</strong>.
        </p>
        <div className="space-y-1.5">
          <Label htmlFor="bulk-alias-input">New Alias</Label>
          <Input
            id="bulk-alias-input"
            data-testid="input-bulk-alias"
            placeholder="e.g. product_parts"
            value={bulkAliasValue}
            onChange={e => setBulkAliasValue(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && bulkAliasValue.trim()) bulkAliasMutation.mutate(bulkAliasValue.trim()); }}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setBulkAliasOpen(false)}>Cancel</Button>
          <Button
            onClick={() => bulkAliasMutation.mutate(bulkAliasValue.trim())}
            disabled={!bulkAliasValue.trim() || bulkAliasMutation.isPending}
            data-testid="button-bulk-alias-confirm"
          >
            {bulkAliasMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Apply to All {gridBindings.length} Products
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* ── Bulk Add Binding Dialog ── */}
    <Dialog open={bulkAddOpen} onOpenChange={setBulkAddOpen}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Bulk Add Binding</DialogTitle>
        </DialogHeader>
        <div className="space-y-5">
          {/* Binding details */}
          <div className="space-y-3">
            <p className="text-sm font-medium">Binding Details</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="bulk-add-alias">Alias</Label>
                <Input
                  id="bulk-add-alias"
                  data-testid="input-bulk-add-alias"
                  placeholder="e.g. color"
                  value={bulkAddAlias}
                  onChange={e => { setBulkAddAlias(e.target.value); setBulkAddPreview(null); }}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="bulk-add-lookup">Lookup Column</Label>
                <Input
                  id="bulk-add-lookup"
                  data-testid="input-bulk-add-lookup"
                  placeholder="e.g. Material"
                  value={bulkAddLookupColumn}
                  onChange={e => { setBulkAddLookupColumn(e.target.value); setBulkAddPreview(null); }}
                />
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Lookup Column must match a column name in your order CSV exactly — e.g. Material, MANU_CODE, Color
            </p>
          </div>

          {/* Which products */}
          <div className="space-y-3">
            <p className="text-sm font-medium">Which Products</p>
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  checked={bulkAddMode === 'formula-contains'}
                  onChange={() => { setBulkAddMode('formula-contains'); setBulkAddPreview(null); }}
                />
                Products whose pricing formula contains:
              </label>
              {bulkAddMode === 'formula-contains' && (
                <div className="ml-5 space-y-1">
                  <Input
                    data-testid="input-bulk-add-fragment"
                    placeholder="e.g. color."
                    value={bulkAddFragment}
                    onChange={e => { setBulkAddFragment(e.target.value); setBulkAddPreview(null); }}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Matches all products whose assigned pricing formula contains this text. Use &ldquo;color.&rdquo; to find everything that needs a color binding.
                  </p>
                </div>
              )}
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  checked={bulkAddMode === 'explicit'}
                  onChange={() => { setBulkAddMode('explicit'); setBulkAddPreview(null); }}
                />
                Choose products manually
              </label>
              {bulkAddMode === 'explicit' && (
                <div className="ml-5 space-y-2">
                  <Input
                    placeholder="Search products…"
                    value={bulkAddProductSearch}
                    onChange={e => setBulkAddProductSearch(e.target.value)}
                    data-testid="input-bulk-add-product-search"
                  />
                  <div className="border rounded-md overflow-y-auto max-h-48">
                    {allProducts
                      .filter(p => {
                        const q = bulkAddProductSearch.toLowerCase();
                        return !q || p.name.toLowerCase().includes(q) || (p.skuPrefix ?? '').toLowerCase().includes(q);
                      })
                      .map(p => (
                        <label
                          key={p.id}
                          className="flex items-center gap-2 px-3 py-1.5 hover:bg-muted/40 cursor-pointer text-sm border-b last:border-0"
                        >
                          <input
                            type="checkbox"
                            checked={bulkAddSelectedProducts.has(p.id)}
                            onChange={e => {
                              setBulkAddSelectedProducts(prev => {
                                const next = new Set(prev);
                                if (e.target.checked) next.add(p.id);
                                else next.delete(p.id);
                                return next;
                              });
                              setBulkAddPreview(null);
                            }}
                          />
                          <span className="flex-1 truncate">{p.name}</span>
                          {p.skuPrefix && <Badge variant="secondary" className="text-[10px] font-mono shrink-0">{p.skuPrefix}</Badge>}
                        </label>
                      ))
                    }
                  </div>
                  <p className="text-[11px] text-muted-foreground">{bulkAddSelectedProducts.size} selected</p>
                </div>
              )}
            </div>
          </div>

          {bulkAddPreview && (
            <div className="rounded-md border bg-muted/30 px-4 py-3 text-sm space-y-1">
              <p><strong>{bulkAddPreview.will}</strong> products will get a new binding.</p>
              <p className="text-muted-foreground"><strong>{bulkAddPreview.skip}</strong> already have a binding to this grid and will be skipped.</p>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 flex-wrap">
          <Button variant="outline" onClick={() => setBulkAddOpen(false)}>Cancel</Button>
          <Button
            variant="secondary"
            onClick={async () => {
              if (!bulkAddAlias.trim() || !bulkAddLookupColumn.trim()) {
                toast({ title: 'Alias and Lookup Column are required', variant: 'destructive' }); return;
              }
              try {
                const body: any = { alias: bulkAddAlias.trim(), lookupColumn: bulkAddLookupColumn.trim(), mode: bulkAddMode };
                if (bulkAddMode === 'formula-contains') body.formulaFragment = bulkAddFragment.trim();
                else body.productIds = [...bulkAddSelectedProducts];
                const res = await fetch(`/api/admin/attribute-grids/${selectedGridId}/bindings/bulk-add`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ ...body, dryRun: true }),
                });
                const data = await res.json();
                if (data.inserted !== undefined) setBulkAddPreview({ will: data.inserted, skip: data.skipped });
                else setBulkAddPreview({ will: data.will ?? 0, skip: data.skip ?? 0 });
              } catch { setBulkAddPreview(null); }
            }}
            data-testid="button-bulk-add-preview"
          >
            Preview
          </Button>
          <Button
            onClick={() => bulkAddMutation.mutate()}
            disabled={
              !bulkAddAlias.trim() || !bulkAddLookupColumn.trim() ||
              (bulkAddMode === 'formula-contains' && !bulkAddFragment.trim()) ||
              (bulkAddMode === 'explicit' && bulkAddSelectedProducts.size === 0) ||
              bulkAddMutation.isPending
            }
            data-testid="button-bulk-add-confirm"
          >
            {bulkAddMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Add Bindings
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
