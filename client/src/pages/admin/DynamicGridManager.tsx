import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useDropzone } from "react-dropzone";
import { useToast } from "@/hooks/use-toast";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Upload, Database, Search, Trash2, Download,
  ChevronDown, ChevronUp, FileText, Loader2, AlertTriangle, X,
} from "lucide-react";
import type { AttributeGrid, AttributeGridRow } from "@shared/schema";
import { cn } from "@/lib/utils";

export default function DynamicGridManager() {
  const { toast } = useToast();

  const [selectedGridId, setSelectedGridId] = useState<number | null>(null);
  const [editingCell, setEditingCell] = useState<{ rowId: number; col: string } | null>(null);
  const [editingValue, setEditingValue] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [newRowData, setNewRowData] = useState<Record<string, string>>({});
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadName, setUploadName] = useState('');
  const [confirmDeleteGrid, setConfirmDeleteGrid] = useState(false);
  const [editingGridName, setEditingGridName] = useState(false);
  const [editingGridNameValue, setEditingGridNameValue] = useState('');
  const [editingKeyColumn, setEditingKeyColumn] = useState(false);

  const { data: grids = [] } = useQuery<AttributeGrid[]>({
    queryKey: ['/api/admin/attribute-grids'],
  });

  const { data: rows = [], isLoading: isLoadingRows } = useQuery<AttributeGridRow[]>({
    queryKey: ['/api/admin/attribute-grids', selectedGridId, 'rows'],
    enabled: selectedGridId !== null,
    queryFn: () =>
      fetch(`/api/admin/attribute-grids/${selectedGridId}/rows`).then(r => r.json()),
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

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!uploadFile || !uploadName.trim()) throw new Error('Name and file required');
      const formData = new FormData();
      formData.append('name', uploadName.trim());
      formData.append('file', uploadFile);
      const res = await fetch('/api/admin/upload-dynamic-grid', { method: 'POST', body: formData });
      if (!res.ok) { const e = await res.json(); throw new Error(e.message); }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/attribute-grids'] });
      setUploadFile(null);
      setUploadName('');
      setUploadOpen(false);
      setSelectedGridId(data.gridId);
      toast({ title: 'Grid uploaded', description: `${data.rowCount} rows synced` });
    },
    onError: (e: Error) => toast({ title: 'Upload failed', description: e.message, variant: 'destructive' }),
  });

  const onDrop = useCallback((accepted: File[]) => {
    if (accepted[0]) {
      setUploadFile(accepted[0]);
      if (!uploadName.trim()) {
        setUploadName(accepted[0].name.replace(/\.csv$/i, ''));
      }
    }
  }, [uploadName]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'text/csv': ['.csv'] },
    maxFiles: 1,
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
                  setSelectedGridId(grid.id);
                  setConfirmDeleteGrid(false);
                  setSearchQuery('');
                  setEditingCell(null);
                  setNewRowData({});
                }}
                className={cn(
                  "rounded-md border p-3 cursor-pointer transition-colors",
                  selectedGridId === grid.id
                    ? "border-l-4 border-l-primary bg-primary/5"
                    : "hover:bg-muted/40"
                )}
              >
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
            ))}
          </div>

          {/* Upload collapsible */}
          <div className="border-t shrink-0">
            <button
              className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium hover:bg-muted/40 transition-colors"
              onClick={() => setUploadOpen(o => !o)}
              data-testid="button-toggle-upload"
            >
              <span className="flex items-center gap-2">
                <Upload className="w-4 h-4" />
                Upload New Grid
              </span>
              {uploadOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            {uploadOpen && (
              <div className="px-3 pb-3 space-y-2">
                <Input
                  placeholder="Grid name"
                  value={uploadName}
                  onChange={e => setUploadName(e.target.value)}
                  className="text-sm"
                  data-testid="input-upload-name"
                />
                <div
                  {...getRootProps()}
                  className={cn(
                    "border-2 border-dashed rounded-md p-3 text-center cursor-pointer text-xs text-muted-foreground transition-colors",
                    isDragActive ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                  )}
                  data-testid="dropzone-grid-csv"
                >
                  <input {...getInputProps()} />
                  {uploadFile ? (
                    <span className="text-foreground font-medium flex items-center justify-center gap-1">
                      <FileText className="w-3.5 h-3.5" />{uploadFile.name}
                    </span>
                  ) : (
                    <span>Drop CSV here or click to browse</span>
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Uploading to an existing grid name replaces all rows.
                </p>
                <Button
                  size="sm"
                  className="w-full"
                  onClick={() => uploadMutation.mutate()}
                  disabled={uploadMutation.isPending || !uploadFile || !uploadName.trim()}
                  data-testid="button-upload-grid"
                >
                  {uploadMutation.isPending
                    ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Uploading…</>
                    : <><Upload className="w-3.5 h-3.5 mr-1.5" />Upload &amp; Sync</>
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

              {/* Data table */}
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
            </>
          )}
        </div>
      </div>
    </div>
  );
}
