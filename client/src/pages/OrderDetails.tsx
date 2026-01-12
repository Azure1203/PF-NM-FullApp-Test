import { useEffect, useState } from "react";
import { useRoute, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { insertProjectSchema } from "@shared/schema";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";

import { useOrder, useUpdateOrder, useSyncOrder, useDeleteOrder } from "@/hooks/use-orders";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { ArrowLeft, RefreshCw, Save, Send, FileText, Loader2, ExternalLink, Trash2, FolderOpen, Download, CheckCircle, ChevronDown, ChevronUp, ChevronRight, Package, Layers, Weight, Ruler, Truck, AlertTriangle, Scissors, ClipboardList, Check, X } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { api, type ProjectWithFiles, type SyncPreview } from "@shared/routes";
import { Badge } from "@/components/ui/badge";

const formSchema = insertProjectSchema.pick({
  name: true,
  date: true,
  dealer: true,
  shippingAddress: true,
  phone: true,
  taxId: true,
  powerTailgate: true,
  phoneAppointment: true,
  orderId: true,
});

type FormValues = z.infer<typeof formSchema>;

export default function OrderDetails() {
  const [, params] = useRoute("/orders/:id");
  const id = parseInt(params?.id || "0");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [expandedFiles, setExpandedFiles] = useState<Set<number>>(new Set());
  const [selectedFileIndex, setSelectedFileIndex] = useState<number | null>(null);
  const [editingNotes, setEditingNotes] = useState<{ [fileId: number]: string }>({});
  const [editingFileAllmoxyJob, setEditingFileAllmoxyJob] = useState<{ [fileId: number]: string }>({});
  const [editingPackagingLink, setEditingPackagingLink] = useState<{ [fileId: number]: string }>({});

  // All PF PRODUCTION STATUS options
  const productionStatusOptions = [
    "EVERYTHING PACKAGED", "HARDWARE PACKED", "CLOSET RODS NOT CUT",
    "WAITING FOR NETLEY SHAKER DOORS", "DOUBLE UP PARTS AT CUSTOM", "WAITING FOR DOVETAIL",
    "WAITING FOR BO HARDWARE", "WAITING FOR NETLEY ASSEMBLED DRAWERS", "WAITING FOR MARATHON HARDWARE",
    "WAITING FOR GLASS FOR DOORS", "GARAGE PANELS TO DRILL", "WAITING FOR GLASS SHELVES",
    "BO HARDWARE ARRIVED", "DOVETAILS ARRIVED", "NETLEY SHAKER DOORS DONE",
    "DOUBLE UP PARTS DONE", "GLASS ARRIVED", "CUSTOM DOWELING PIECES DONE",
    "WARRANTY JOB", "SAMPLE ORDER", "COURIER PACKAGE",
    "HARDWARE ONLY", "BARCODE SCANNING", "PICKUP BY CARRIER"
  ];

  const toggleFileExpanded = (fileId: number) => {
    setExpandedFiles(prev => {
      const next = new Set(prev);
      if (next.has(fileId)) {
        next.delete(fileId);
      } else {
        next.add(fileId);
      }
      return next;
    });
  };

  const { data: project, isLoading } = useOrder(id) as { data: ProjectWithFiles | undefined; isLoading: boolean };
  const { mutate: updateProject, isPending: isUpdating } = useUpdateOrder();
  const { mutate: syncProject, isPending: isSyncing } = useSyncOrder();
  const { mutate: deleteProject, isPending: isDeleting } = useDeleteOrder();
  
  // Query key used by useOrder hook - defined early for use in all mutations
  const orderQueryKey = [api.orders.get.path, id];
  
  // Mutation for updating file notes
  const { mutate: updateFileNotes, isPending: isSavingNotes } = useMutation({
    mutationFn: async ({ fileId, notes }: { fileId: number; notes: string }) => {
      return apiRequest('PATCH', `/api/files/${fileId}/notes`, { notes });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: orderQueryKey });
      toast({ title: "Notes saved" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to save notes", description: error.message, variant: "destructive" });
    }
  });

  // Mutation for updating file-level ALLMOXY JOB #
  const { mutate: updateFileAllmoxyJob, isPending: isSavingFileAllmoxyJob } = useMutation({
    mutationFn: async ({ fileId, allmoxyJobNumber }: { fileId: number; allmoxyJobNumber: string }) => {
      return apiRequest('PATCH', `/api/files/${fileId}/allmoxy-job`, { allmoxyJobNumber });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: orderQueryKey });
      toast({ title: "ALLMOXY JOB # saved" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to save ALLMOXY JOB #", description: error.message, variant: "destructive" });
    }
  });

  // Mutation for updating file-level Packaging Link
  const { mutate: updatePackagingLink, isPending: isSavingPackagingLink } = useMutation({
    mutationFn: async ({ fileId, packagingLink }: { fileId: number; packagingLink: string }) => {
      return apiRequest('PATCH', `/api/files/${fileId}/packaging-link`, { packagingLink });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: orderQueryKey });
      toast({ title: "Packaging Link saved" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to save Packaging Link", description: error.message, variant: "destructive" });
    }
  });

  // Mutation for syncing Asana status
  const { mutate: syncAsanaStatus, isPending: isSyncingAsanaStatus } = useMutation({
    mutationFn: async () => {
      return apiRequest('POST', `/api/orders/${id}/sync-asana-status`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: orderQueryKey });
      toast({ title: "Status synced from Asana" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to sync from Asana", description: error.message, variant: "destructive" });
    }
  });

  // Mutation for updating PF PRODUCTION STATUS with optimistic updates
  const { mutate: updateProductionStatus, isPending: isUpdatingProductionStatus } = useMutation({
    mutationFn: async (pfProductionStatus: string[]) => {
      return apiRequest('PATCH', `/api/orders/${id}/production-status`, { pfProductionStatus });
    },
    onMutate: async (newStatus: string[]) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: orderQueryKey });
      
      // Snapshot the previous value
      const previousProject = queryClient.getQueryData(orderQueryKey);
      
      // Optimistically update to the new value
      queryClient.setQueryData(orderQueryKey, (old: any) => {
        if (!old) return old;
        return { ...old, pfProductionStatus: newStatus };
      });
      
      return { previousProject };
    },
    onError: (error: Error, _newStatus, context) => {
      // Roll back to the previous value on error
      if (context?.previousProject) {
        queryClient.setQueryData(orderQueryKey, context.previousProject);
      }
      toast({ title: "Failed to update status", description: error.message, variant: "destructive" });
    },
    onSettled: () => {
      // Always refetch after error or success
      queryClient.invalidateQueries({ queryKey: orderQueryKey });
    }
  });
  
  // Fetch sync preview data
  const { data: preview, isLoading: isLoadingPreview } = useQuery<SyncPreview>({
    queryKey: ['/api/orders', id, 'preview'],
    enabled: !!id && id > 0,
  });
  
  // Get the selected file's ID for CTS status query
  const selectedFileId = project?.files?.[selectedFileIndex ?? -1]?.id;
  
  // Fetch CTS cut status for the selected file
  const { data: ctsCutStatus } = useQuery<{ total: number; cut: number; allCut: boolean }>({
    queryKey: ['/api/files', selectedFileId, 'cts-status'],
    enabled: !!selectedFileId && selectedFileId > 0,
    staleTime: 0,
  });

  // Auto-select first file when preview loads
  useEffect(() => {
    if (preview && preview.fileBreakdowns.length > 0 && selectedFileIndex === null) {
      setSelectedFileIndex(0);
    }
  }, [preview, selectedFileIndex]);

  // Clear editing states when switching files to avoid showing wrong file's data
  useEffect(() => {
    if (selectedFileIndex !== null && project?.files?.[selectedFileIndex]) {
      const fileId = project.files[selectedFileIndex].id;
      // Reset editing states to show saved values from the current file
      setEditingFileAllmoxyJob({});
      setEditingPackagingLink({});
    }
  }, [selectedFileIndex]);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      powerTailgate: false,
      phoneAppointment: false,
    }
  });

  useEffect(() => {
    if (project) {
      form.reset({
        name: project.name || "",
        date: project.date || "",
        dealer: project.dealer || "",
        shippingAddress: project.shippingAddress || "",
        phone: project.phone || "",
        taxId: project.taxId || "",
        orderId: project.orderId || "",
        powerTailgate: project.powerTailgate || false,
        phoneAppointment: project.phoneAppointment || false,
      });
    }
  }, [project, form]);

  // Handle production status checkbox toggle
  const handleProductionStatusToggle = (option: string, checked: boolean) => {
    const currentStatus = project?.pfProductionStatus || [];
    let newStatus: string[];
    if (checked) {
      newStatus = [...currentStatus, option];
    } else {
      newStatus = currentStatus.filter(s => s !== option);
    }
    updateProductionStatus(newStatus);
  };

  const onSubmit = (data: FormValues) => {
    updateProject({ id, ...data });
  };

  const handleSync = () => {
    form.handleSubmit((data) => {
      updateProject({ id, ...data }, {
        onSuccess: () => syncProject(id)
      });
    })();
  };

  const handleDelete = () => {
    deleteProject(id, {
      onSuccess: () => setLocation("/")
    });
  };

  const downloadFile = (file: { rawContent?: string | null; originalFilename: string }) => {
    if (!file.rawContent) return;
    const blob = new Blob([file.rawContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.originalFilename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50/50">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50/50 p-4">
        <h2 className="text-2xl font-bold mb-2">Project Not Found</h2>
        <p className="text-muted-foreground mb-6">The project you are looking for doesn't exist.</p>
        <Link href="/">
          <Button variant="outline">Back to Dashboard</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50/50 pb-20">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        
        <div className="mb-6 flex justify-between items-center">
          <Link href="/">
            <Button variant="ghost" className="pl-0 text-muted-foreground hover:text-foreground">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Dashboard
            </Button>
          </Link>
          
          <div className="flex gap-2">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" className="text-destructive hover:bg-destructive/10">
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete Project
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This action cannot be undone. This will permanently delete the project
                    and all its files from the database.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
                    {isDeleting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Trash2 className="w-4 h-4 mr-2" />}
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            
            {project.status === 'synced' && project.asanaTaskId && (
              <Button 
                variant="outline"
                className="text-blue-600 border-blue-200 hover:bg-blue-50"
                onClick={() => window.open(`https://app.asana.com/0/0/${project.asanaTaskId}`, '_blank')}
              >
                <ExternalLink className="w-4 h-4 mr-2" />
                View in Asana
              </Button>
            )}
          </div>
        </div>

        <PageHeader 
          title={project.name} 
          description={`${project.files?.length || 0} file(s) in this project`}
          actions={
            <div className="flex items-center gap-4">
              <StatusBadge status={project.status as any} />
              <Button 
                onClick={handleSync}
                disabled={isSyncing || isUpdating}
                className="btn-primary gap-2"
              >
                {isSyncing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Syncing...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    {project.status === 'synced' ? 'Sync Again' : 'Sync to Asana'}
                  </>
                )}
              </Button>
            </div>
          }
        />

        {/* PF PRODUCTION SECTION, PF ORDER STATUS, PF PRODUCTION STATUS Section */}
        <Card className="mb-6 border-none shadow-md" data-testid="order-status-card">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-lg">
                <ClipboardList className="w-5 h-5 text-primary" />
                Order Status & Tracking
              </CardTitle>
              {project.status === 'synced' && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => syncAsanaStatus()}
                  disabled={isSyncingAsanaStatus}
                  data-testid="button-sync-asana-status"
                >
                  {isSyncingAsanaStatus ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-1" />
                  ) : (
                    <RefreshCw className="w-4 h-4 mr-1" />
                  )}
                  Refresh from Asana
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* PF PRODUCTION SECTION */}
            <div className="space-y-2">
              <label className="text-sm font-medium">PF PRODUCTION SECTION</label>
              {project.status === 'synced' ? (
                <div className="flex items-center gap-2">
                  <Badge 
                    variant="outline"
                    className="text-base px-3 py-1"
                    data-testid="badge-pf-production-section"
                  >
                    {project.asanaSection || 'No section'}
                  </Badge>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Sync to Asana to see section</p>
              )}
            </div>

            {/* PF ORDER STATUS */}
            <div className="space-y-2">
              <label className="text-sm font-medium">PF ORDER STATUS</label>
              {project.status === 'synced' ? (
                <div className="flex items-center gap-2">
                  <Badge 
                    variant="default"
                    className={
                      project.pfOrderStatus === 'SUBMIT SALES ORDER' 
                        ? 'bg-red-500 hover:bg-red-600 text-white' 
                        : (project.pfOrderStatus === 'SALES ORDER SUBMITTED' || project.pfOrderStatus === 'ORDER CONFIRMED')
                          ? 'bg-green-500 hover:bg-green-600 text-white'
                          : ''
                    }
                    data-testid="badge-pf-order-status"
                  >
                    {project.pfOrderStatus || 'Not set'}
                  </Badge>
                  {project.lastAsanaSyncAt && (
                    <span className="text-xs text-muted-foreground">
                      Last synced: {new Date(project.lastAsanaSyncAt).toLocaleString()}
                    </span>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Sync to Asana to see status</p>
              )}
            </div>

            {/* PF PRODUCTION STATUS */}
            <div className="space-y-2">
              <label className="text-sm font-medium">PF PRODUCTION STATUS</label>
              {project.status === 'synced' ? (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                  {productionStatusOptions.map((option) => {
                    const isChecked = (project.pfProductionStatus || []).includes(option);
                    return (
                      <div 
                        key={option} 
                        className={`flex items-center gap-2 p-2 rounded-md cursor-pointer transition-colors ${
                          isChecked 
                            ? 'bg-green-500 text-white hover:bg-green-600' 
                            : 'bg-muted/20 hover-elevate'
                        }`}
                        onClick={() => handleProductionStatusToggle(option, !isChecked)}
                        data-testid={`checkbox-status-${option.toLowerCase().replace(/\s+/g, '-')}`}
                      >
                        <Checkbox
                          checked={isChecked}
                          onCheckedChange={(checked) => handleProductionStatusToggle(option, checked as boolean)}
                          disabled={isUpdatingProductionStatus}
                          className={isChecked ? 'border-white data-[state=checked]:bg-white data-[state=checked]:text-green-600' : ''}
                        />
                        <span className="text-xs leading-tight">{option}</span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Sync to Asana to manage production status</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Project Totals Summary - compact header */}
        {preview && (
          <Card className="mb-6 border-none shadow-md" data-testid="project-totals-card">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Truck className="w-5 h-5 text-primary" />
                  Project Totals
                </CardTitle>
                {preview.palletSize && (
                  <Badge variant="outline" className="text-sm" data-testid="text-pallet-size">
                    {preview.palletSize}
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-10 gap-3">
                <div className="text-center p-2 bg-muted/30 rounded-md">
                  <p className="text-2xl font-bold" data-testid="text-total-parts">{preview.totals.parts}</p>
                  <p className="text-xs text-muted-foreground">Parts Overall</p>
                </div>
                <div className="text-center p-2 bg-muted/30 rounded-md">
                  <p className="text-2xl font-bold" data-testid="text-total-dovetails">{preview.totals.dovetails}</p>
                  <p className="text-xs text-muted-foreground">Dovetails</p>
                </div>
                <div className="text-center p-2 bg-muted/30 rounded-md">
                  <p className="text-2xl font-bold" data-testid="text-total-assembled">{preview.totals.assembledDrawers}</p>
                  <p className="text-xs text-muted-foreground">Assembled Drawers</p>
                </div>
                <div className="text-center p-2 bg-muted/30 rounded-md">
                  <p className="text-2xl font-bold" data-testid="text-total-fivepiece">{preview.totals.fivePieceDoors}</p>
                  <p className="text-xs text-muted-foreground">5 Piece Shaker</p>
                </div>
                <div className="text-center p-2 bg-muted/30 rounded-md">
                  <p className="text-2xl font-bold" data-testid="text-total-glass-inserts">{preview.totals.glassInserts}</p>
                  <p className="text-xs text-muted-foreground">Glass Inserts</p>
                </div>
                <div className="text-center p-2 bg-muted/30 rounded-md">
                  <p className="text-2xl font-bold" data-testid="text-total-glass-shelves">{preview.totals.glassShelves}</p>
                  <p className="text-xs text-muted-foreground">Glass Shelves</p>
                </div>
                <div className="text-center p-2 bg-muted/30 rounded-md">
                  <p className="text-2xl font-bold" data-testid="text-total-mj-doors">{preview.totals.mjDoors}</p>
                  <p className="text-xs text-muted-foreground">M&J Doors</p>
                </div>
                <div className="text-center p-2 bg-muted/30 rounded-md">
                  <p className="text-2xl font-bold" data-testid="text-total-richelieu">{preview.totals.richelieuDoors}</p>
                  <p className="text-xs text-muted-foreground">Richelieu Doors</p>
                </div>
                <div className="text-center p-2 bg-muted/30 rounded-md">
                  <p className="text-2xl font-bold" data-testid="text-total-doublethick">{preview.totals.doubleThick}</p>
                  <p className="text-xs text-muted-foreground">Double Thick Parts</p>
                </div>
                <div className="text-center p-2 bg-muted/30 rounded-md">
                  <p className="text-2xl font-bold" data-testid="text-total-cts">{preview.totals.ctsPartsCount}</p>
                  <p className="text-xs text-muted-foreground">Cut to Size Parts</p>
                </div>
                <div className="text-center p-2 bg-muted/30 rounded-md">
                  <p className="text-2xl font-bold" data-testid="text-total-weight">{preview.totals.weightLbs}</p>
                  <p className="text-xs text-muted-foreground">lbs</p>
                </div>
                <div className="text-center p-2 bg-muted/30 rounded-md">
                  <p className="text-2xl font-bold" data-testid="text-max-length">{preview.totals.maxLength}</p>
                  <p className="text-xs text-muted-foreground">mm max</p>
                </div>
              </div>
              
              {/* Special Parts Flags */}
              {(preview.flags.hasMJDoors || preview.flags.hasRichelieuDoors || preview.flags.hasDoubleThick || preview.flags.hasShakerDoors) && (
                <div className="flex flex-wrap gap-2 mt-4 pt-3 border-t">
                  {preview.flags.hasMJDoors && <Badge variant="secondary"><AlertTriangle className="w-3 h-3 mr-1" />M&J Doors</Badge>}
                  {preview.flags.hasRichelieuDoors && <Badge variant="secondary"><AlertTriangle className="w-3 h-3 mr-1" />Richelieu Doors</Badge>}
                  {preview.flags.hasDoubleThick && <Badge variant="secondary"><AlertTriangle className="w-3 h-3 mr-1" />Double Thick</Badge>}
                  {preview.flags.hasShakerDoors && <Badge variant="secondary">Shaker Doors</Badge>}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {isLoadingPreview && (
          <Card className="mb-6 border-none shadow-md">
            <CardContent className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground mr-2" />
              <span className="text-muted-foreground">Calculating order details...</span>
            </CardContent>
          </Card>
        )}

        {/* CSV Files Section - Selectable with Details */}
        {preview && preview.fileBreakdowns.length > 0 && (
          <Card className="mb-6 border-none shadow-md" data-testid="files-section-card">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-lg">
                <FolderOpen className="w-5 h-5 text-primary" />
                CSV Files ({preview.fileBreakdowns.length})
              </CardTitle>
              <CardDescription>
                Click on a file to view its computed order details
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* File List */}
                <div className="space-y-2">
                  {preview.fileBreakdowns.map((file, idx) => {
                    const isSelected = selectedFileIndex === idx;
                    const projectFile = project.files?.[idx];
                    return (
                      <div
                        key={idx}
                        onClick={() => setSelectedFileIndex(isSelected ? null : idx)}
                        className={`p-4 rounded-lg border cursor-pointer transition-all ${
                          isSelected 
                            ? 'border-primary bg-primary/5 ring-1 ring-primary' 
                            : 'hover-elevate'
                        }`}
                        data-testid={`file-item-${idx}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <FileText className={`w-5 h-5 shrink-0 ${isSelected ? 'text-primary' : 'text-muted-foreground'}`} />
                            <div className="min-w-0">
                              <p className="font-medium text-sm truncate">{file.name}</p>
                              {projectFile?.allmoxyJobNumber && (
                                <p className="text-xs text-primary font-medium">Job #{projectFile.allmoxyJobNumber}</p>
                              )}
                              <p className="text-xs text-muted-foreground">
                                {file.coreParts} parts, {file.dovetails} dovetails, {Math.round(file.weightLbs)} lbs
                              </p>
                            </div>
                          </div>
                          {projectFile && (
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={(e) => { e.stopPropagation(); downloadFile(projectFile); }}
                              data-testid={`button-download-file-${idx}`}
                            >
                              <Download className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Selected File Details */}
                <div className="lg:border-l lg:pl-4">
                  {selectedFileIndex !== null && preview.fileBreakdowns[selectedFileIndex] ? (
                    <div data-testid="selected-file-details">
                      <h4 className="font-semibold text-lg mb-2 flex items-center gap-2">
                        <FileText className="w-5 h-5 text-primary" />
                        {preview.fileBreakdowns[selectedFileIndex].name}
                      </h4>
                      
                      {/* ALLMOXY JOB # for this file */}
                      {project.files?.[selectedFileIndex] && (
                        <div className="flex items-center gap-2 mb-4" data-testid="file-allmoxy-job-section">
                          <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">ALLMOXY JOB #:</span>
                          <Input
                            placeholder="Enter job number..."
                            value={editingFileAllmoxyJob[project.files[selectedFileIndex].id] ?? project.files[selectedFileIndex].allmoxyJobNumber ?? ""}
                            onChange={(e) => setEditingFileAllmoxyJob(prev => ({
                              ...prev,
                              [project.files![selectedFileIndex].id]: e.target.value
                            }))}
                            className="h-8 max-w-[200px]"
                            data-testid="input-file-allmoxy-job"
                          />
                          <Button
                            size="sm"
                            onClick={() => {
                              const fileId = project.files![selectedFileIndex].id;
                              const value = editingFileAllmoxyJob[fileId] ?? project.files![selectedFileIndex].allmoxyJobNumber ?? "";
                              updateFileAllmoxyJob({ fileId, allmoxyJobNumber: value });
                            }}
                            disabled={isSavingFileAllmoxyJob}
                            data-testid="button-save-file-allmoxy-job"
                          >
                            {isSavingFileAllmoxyJob ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Save className="w-4 h-4" />
                            )}
                          </Button>
                          {(project.files[selectedFileIndex].allmoxyJobNumber || editingFileAllmoxyJob[project.files[selectedFileIndex].id]) && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                const fileId = project.files![selectedFileIndex].id;
                                setEditingFileAllmoxyJob(prev => ({ ...prev, [fileId]: "" }));
                                updateFileAllmoxyJob({ fileId, allmoxyJobNumber: "" });
                              }}
                              disabled={isSavingFileAllmoxyJob}
                              data-testid="button-clear-file-allmoxy-job"
                            >
                              <X className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      )}
                      
                      {/* Packaging Link for this file */}
                      {project.files?.[selectedFileIndex] && (
                        <div className="space-y-2 mb-4" data-testid="file-packaging-link-section">
                          <span className="text-sm font-medium text-muted-foreground">Packaging Link:</span>
                          <div className="flex items-center gap-2">
                            <Input
                              placeholder="Paste Adobe Acrobat link..."
                              value={editingPackagingLink[project.files[selectedFileIndex].id] ?? project.files[selectedFileIndex].packagingLink ?? ""}
                              onChange={(e) => setEditingPackagingLink(prev => ({
                                ...prev,
                                [project.files![selectedFileIndex].id]: e.target.value
                              }))}
                              className="h-8 flex-1"
                              data-testid="input-file-packaging-link"
                            />
                            <Button
                              size="sm"
                              onClick={() => {
                                const fileId = project.files![selectedFileIndex].id;
                                const value = editingPackagingLink[fileId] ?? project.files![selectedFileIndex].packagingLink ?? "";
                                updatePackagingLink({ fileId, packagingLink: value });
                              }}
                              disabled={isSavingPackagingLink}
                              data-testid="button-save-packaging-link"
                            >
                              {isSavingPackagingLink ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Save className="w-4 h-4" />
                              )}
                            </Button>
                            {project.files[selectedFileIndex].packagingLink && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  const link = project.files![selectedFileIndex].packagingLink;
                                  if (link) window.open(link, '_blank');
                                }}
                                data-testid="button-open-packaging-link"
                              >
                                <ExternalLink className="w-4 h-4 mr-1" />
                                Open
                              </Button>
                            )}
                            {(project.files[selectedFileIndex].packagingLink || editingPackagingLink[project.files[selectedFileIndex].id]) && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  const fileId = project.files![selectedFileIndex].id;
                                  setEditingPackagingLink(prev => ({ ...prev, [fileId]: "" }));
                                  updatePackagingLink({ fileId, packagingLink: "" });
                                }}
                                disabled={isSavingPackagingLink}
                                data-testid="button-clear-packaging-link"
                              >
                                <X className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                      )}
                      
                      {/* Prominent CTS Parts Link */}
                      {preview.fileBreakdowns[selectedFileIndex].ctsPartsCount > 0 && project.files?.[selectedFileIndex] && (
                        <Link href={`/files/${project.files[selectedFileIndex].id}/cts`}>
                          <div className={`flex items-center justify-between p-4 mb-4 border rounded-lg hover-elevate cursor-pointer group ${ctsCutStatus?.allCut ? 'bg-green-50 dark:bg-green-950/20 border-green-300 dark:border-green-800' : 'bg-primary/10 border-primary/20'}`} data-testid="button-cts-link">
                            <div className="flex items-center gap-3">
                              <div className={`p-2 rounded-lg ${ctsCutStatus?.allCut ? 'bg-green-500' : 'bg-primary/20'}`}>
                                {ctsCutStatus?.allCut ? (
                                  <CheckCircle className="w-5 h-5 text-white" />
                                ) : (
                                  <Scissors className="w-5 h-5 text-primary" />
                                )}
                              </div>
                              <div>
                                <p className={`font-semibold ${ctsCutStatus?.allCut ? 'text-green-700 dark:text-green-400' : 'text-primary'}`}>
                                  {ctsCutStatus?.allCut ? 'All CTS Parts Cut' : 'View Cut To Size Parts'}
                                </p>
                                <p className="text-sm text-muted-foreground">
                                  {ctsCutStatus?.allCut ? 'All parts have been cut for this file' : 'Parts that need custom cutting for this file'}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant="secondary" className={ctsCutStatus?.allCut ? 'bg-green-500 text-white' : 'bg-primary text-primary-foreground'}>
                                {ctsCutStatus?.allCut ? 'Complete' : `${preview.fileBreakdowns[selectedFileIndex].ctsPartsCount} parts`}
                              </Badge>
                              <ChevronRight className={`w-5 h-5 group-hover:translate-x-1 transition-transform ${ctsCutStatus?.allCut ? 'text-green-600' : 'text-primary'}`} />
                            </div>
                          </div>
                        </Link>
                      )}
                      
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                        <div className="bg-muted/30 rounded-lg p-4 text-center">
                          <p className="text-3xl font-bold text-primary" data-testid="text-file-parts">{preview.fileBreakdowns[selectedFileIndex].coreParts}</p>
                          <p className="text-sm text-muted-foreground">Parts Overall</p>
                        </div>
                        <div className="bg-muted/30 rounded-lg p-4 text-center">
                          <p className="text-3xl font-bold" data-testid="text-file-dovetails">{preview.fileBreakdowns[selectedFileIndex].dovetails}</p>
                          <p className="text-sm text-muted-foreground">Dovetails</p>
                        </div>
                        <div className="bg-muted/30 rounded-lg p-4 text-center">
                          <p className="text-3xl font-bold" data-testid="text-file-assembled">{preview.fileBreakdowns[selectedFileIndex].assembledDrawers}</p>
                          <p className="text-sm text-muted-foreground">Assembled Drawers</p>
                        </div>
                        <div className="bg-muted/30 rounded-lg p-4 text-center">
                          <p className="text-3xl font-bold" data-testid="text-file-fivepiece">{preview.fileBreakdowns[selectedFileIndex].fivePieceDoors}</p>
                          <p className="text-sm text-muted-foreground">5 Piece Shaker</p>
                        </div>
                        <div className="bg-muted/30 rounded-lg p-4 text-center">
                          <p className="text-3xl font-bold" data-testid="text-file-glass-inserts">{preview.fileBreakdowns[selectedFileIndex].glassInserts}</p>
                          <p className="text-sm text-muted-foreground">Glass Inserts</p>
                        </div>
                        <div className="bg-muted/30 rounded-lg p-4 text-center">
                          <p className="text-3xl font-bold" data-testid="text-file-glass-shelves">{preview.fileBreakdowns[selectedFileIndex].glassShelves}</p>
                          <p className="text-sm text-muted-foreground">Glass Shelves</p>
                        </div>
                        <div className="bg-muted/30 rounded-lg p-4 text-center">
                          <p className="text-3xl font-bold" data-testid="text-file-mj">{preview.fileBreakdowns[selectedFileIndex].mjDoorsCount}</p>
                          <p className="text-sm text-muted-foreground">M&J Doors</p>
                        </div>
                        <div className="bg-muted/30 rounded-lg p-4 text-center">
                          <p className="text-3xl font-bold" data-testid="text-file-richelieu">{preview.fileBreakdowns[selectedFileIndex].richelieuDoorsCount}</p>
                          <p className="text-sm text-muted-foreground">Richelieu Doors</p>
                        </div>
                        <div className="bg-muted/30 rounded-lg p-4 text-center">
                          <p className="text-3xl font-bold" data-testid="text-file-doublethick">{preview.fileBreakdowns[selectedFileIndex].doubleThickCount}</p>
                          <p className="text-sm text-muted-foreground">Double Thick Parts</p>
                        </div>
                        <div className="bg-muted/30 rounded-lg p-4 text-center">
                          <p className="text-3xl font-bold" data-testid="text-file-cts">{preview.fileBreakdowns[selectedFileIndex].ctsPartsCount}</p>
                          <p className="text-sm text-muted-foreground">Cut to Size Parts</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4 mb-4">
                        <div className="flex items-center gap-3 p-3 bg-muted/20 rounded-lg">
                          <Weight className="w-5 h-5 text-muted-foreground" />
                          <div>
                            <p className="font-semibold" data-testid="text-file-weight">{Math.round(preview.fileBreakdowns[selectedFileIndex].weightLbs)} lbs</p>
                            <p className="text-xs text-muted-foreground">Estimated Weight</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 p-3 bg-muted/20 rounded-lg">
                          <Ruler className="w-5 h-5 text-muted-foreground" />
                          <div>
                            <p className="font-semibold" data-testid="text-file-maxlength">{preview.fileBreakdowns[selectedFileIndex].maxLength} mm</p>
                            <p className="text-xs text-muted-foreground">Max Length</p>
                          </div>
                        </div>
                      </div>

                      {/* Special Parts Flags */}
                      <div className="space-y-3 mb-4">
                        <h5 className="text-sm font-medium text-muted-foreground">Special Parts</h5>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="flex items-center gap-2 p-2 rounded-md bg-muted/20">
                            <span className={`w-2 h-2 rounded-full ${preview.fileBreakdowns[selectedFileIndex].hasMJDoors ? 'bg-primary' : 'bg-muted-foreground/30'}`} />
                            <span className="text-sm" data-testid="text-file-mjdoors">M&J Doors: {preview.fileBreakdowns[selectedFileIndex].hasMJDoors ? 'YES' : 'NO'}</span>
                          </div>
                          <div className="flex items-center gap-2 p-2 rounded-md bg-muted/20">
                            <span className={`w-2 h-2 rounded-full ${preview.fileBreakdowns[selectedFileIndex].hasRichelieuDoors ? 'bg-primary' : 'bg-muted-foreground/30'}`} />
                            <span className="text-sm" data-testid="text-file-richelieu">Richelieu Doors: {preview.fileBreakdowns[selectedFileIndex].hasRichelieuDoors ? 'YES' : 'NO'}</span>
                          </div>
                        </div>
                      </div>

                      {/* Custom Parts at Custom */}
                      <div className="space-y-2">
                        <h5 className="text-sm font-medium text-muted-foreground">Parts at Custom</h5>
                        {preview.fileBreakdowns[selectedFileIndex].customParts.length > 0 ? (
                          <div className="flex flex-wrap gap-2" data-testid="text-file-customparts">
                            {preview.fileBreakdowns[selectedFileIndex].customParts.map((part, idx) => (
                              <Badge key={idx} variant="outline" className="border-primary text-primary">
                                {part}
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">None</p>
                        )}
                      </div>

                      {/* File Notes */}
                      {project.files?.[selectedFileIndex] && (
                        <div className="space-y-2 mt-4 pt-4 border-t">
                          <h5 className="text-sm font-medium text-muted-foreground">Notes</h5>
                          <Textarea
                            placeholder="Add notes for this file..."
                            value={editingNotes[project.files[selectedFileIndex].id] ?? project.files[selectedFileIndex].notes ?? ""}
                            onChange={(e) => setEditingNotes(prev => ({
                              ...prev,
                              [project.files![selectedFileIndex].id]: e.target.value
                            }))}
                            className="min-h-[80px] resize-none"
                            data-testid="textarea-file-notes"
                          />
                          <Button
                            size="sm"
                            onClick={() => {
                              const fileId = project.files![selectedFileIndex].id;
                              const notes = editingNotes[fileId] ?? project.files![selectedFileIndex].notes ?? "";
                              updateFileNotes({ fileId, notes });
                            }}
                            disabled={isSavingNotes}
                            data-testid="button-save-file-notes"
                          >
                            {isSavingNotes ? (
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            ) : (
                              <Save className="w-4 h-4 mr-2" />
                            )}
                            Save Notes
                          </Button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full py-12 text-muted-foreground">
                      <FileText className="w-12 h-12 mb-3 opacity-30" />
                      <p className="text-sm">Select a file to view details</p>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Main Form Column */}
          <div className="lg:col-span-2 space-y-6">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)}>
                <Card className="border-none shadow-md">
                  <CardHeader>
                    <CardTitle>Project Details</CardTitle>
                    <CardDescription>
                      Review and edit project information before syncing to Asana.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <FormField
                        control={form.control}
                        name="name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Project Name</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="e.g. Anderson PO25-391065" className="bg-slate-50/50" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="dealer"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Dealer Name</FormLabel>
                            <FormControl>
                              <Input {...field} value={field.value ?? ""} placeholder="e.g. Closet World" className="bg-slate-50/50" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <FormField
                        control={form.control}
                        name="date"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Order Date</FormLabel>
                            <FormControl>
                              <Input {...field} value={field.value ?? ""} type="date" className="bg-slate-50/50" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="orderId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Order ID</FormLabel>
                            <FormControl>
                              <Input {...field} value={field.value ?? ""} className="bg-slate-50/50" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={form.control}
                      name="shippingAddress"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Shipping Address</FormLabel>
                          <FormControl>
                            <Textarea 
                              {...field}
                              value={field.value ?? ""}
                              className="bg-slate-50/50 min-h-[80px]" 
                              placeholder="Full shipping address..."
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <FormField
                        control={form.control}
                        name="phone"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Phone Number</FormLabel>
                            <FormControl>
                              <Input {...field} value={field.value ?? ""} className="bg-slate-50/50" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="taxId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Tax ID</FormLabel>
                            <FormControl>
                              <Input {...field} value={field.value ?? ""} className="bg-slate-50/50" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                      <FormField
                        control={form.control}
                        name="powerTailgate"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4 bg-slate-50/30">
                            <div className="space-y-0.5">
                              <FormLabel className="text-base">Power Tailgate</FormLabel>
                            </div>
                            <FormControl>
                              <Switch
                                checked={field.value ?? false}
                                onCheckedChange={field.onChange}
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="phoneAppointment"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4 bg-slate-50/30">
                            <div className="space-y-0.5">
                              <FormLabel className="text-base">Phone Appointment</FormLabel>
                            </div>
                            <FormControl>
                              <Switch
                                checked={field.value ?? false}
                                onCheckedChange={field.onChange}
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="flex justify-end pt-4 border-t">
                      <Button 
                        type="submit" 
                        disabled={isUpdating}
                        className="w-full sm:w-auto min-w-[120px]"
                      >
                        {isUpdating ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Saving...
                          </>
                        ) : (
                          <>
                            <Save className="w-4 h-4 mr-2" />
                            Save Changes
                          </>
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </form>
            </Form>
          </div>

          {/* Sidebar / Context Column */}
          <div className="space-y-6">
            <Card className="border-none shadow-md bg-slate-900 text-slate-100">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <RefreshCw className="w-5 h-5 text-blue-400" />
                  Sync Status
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between items-center py-2 border-b border-slate-700">
                    <span className="text-slate-400">Status</span>
                    <StatusBadge status={project.status as any} />
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-slate-700">
                    <span className="text-slate-400">Asana Task</span>
                    <span className="font-mono text-sm">
                      {project.asanaTaskId ? `#${project.asanaTaskId.slice(-6)}` : "Not Created"}
                    </span>
                  </div>
                  <div className="pt-4 text-sm text-slate-400">
                    {project.status === 'synced' 
                      ? "This project has been synced to Asana. Updates here won't reflect in Asana unless you sync again."
                      : "Review the details carefully before syncing to create an accurate Asana task."
                    }
                  </div>
                  <div className="pt-4 border-t border-slate-700">
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full text-slate-300 border-slate-600 hover:bg-slate-800"
                      onClick={() => {
                        const newStatus = project.status === 'synced' ? 'pending' : 'synced';
                        updateProject({ status: newStatus } as any, {
                          onSuccess: () => {
                            toast({ 
                              title: "Status updated", 
                              description: newStatus === 'synced' 
                                ? "Order marked as synced" 
                                : "Order marked as pending" 
                            });
                          }
                        });
                      }}
                      disabled={isUpdating}
                      data-testid="button-change-status"
                    >
                      {project.status === 'synced' ? (
                        <>
                          <RefreshCw className="w-4 h-4 mr-2" />
                          Mark as Pending
                        </>
                      ) : (
                        <>
                          <CheckCircle className="w-4 h-4 mr-2" />
                          Mark as Synced
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

          </div>
        </div>
      </div>
    </div>
  );
}
