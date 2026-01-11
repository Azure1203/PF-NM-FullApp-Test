import { useEffect, useState } from "react";
import { useRoute, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { insertProjectSchema } from "@shared/schema";

import { useOrder, useUpdateOrder, useSyncOrder, useDeleteOrder } from "@/hooks/use-orders";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { ArrowLeft, RefreshCw, Save, Send, FileText, Loader2, ExternalLink, Trash2, FolderOpen, Download, CheckCircle, ChevronDown, ChevronUp, Package, Layers, Weight, Ruler } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import type { ProjectWithFiles } from "@shared/routes";

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

            {/* Files in Project */}
            <Card className="border-none shadow-md">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FolderOpen className="w-5 h-5 text-primary" />
                  Files in Project
                </CardTitle>
                <CardDescription>
                  {project.files?.length || 0} CSV file(s) uploaded
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {project.files?.map((file, index) => {
                    const isExpanded = expandedFiles.has(file.id || index);
                    const hasDetails = (file.coreParts ?? 0) > 0 || (file.dovetails ?? 0) > 0 || (file.assembledDrawers ?? 0) > 0;
                    
                    return (
                      <div key={file.id || index} className="bg-slate-50 rounded-lg border border-slate-100 overflow-hidden">
                        <div 
                          className="flex items-center justify-between p-3 cursor-pointer hover-elevate"
                          onClick={() => toggleFileExpanded(file.id || index)}
                          data-testid={`file-row-${file.id}`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <FileText className="w-5 h-5 text-slate-400 shrink-0" />
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate" title={file.poNumber || file.originalFilename}>
                                {file.poNumber || file.originalFilename}
                              </p>
                              <p className="text-xs text-muted-foreground truncate">
                                {file.originalFilename}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={(e) => { e.stopPropagation(); downloadFile(file); }}
                              className="shrink-0"
                              data-testid={`button-download-${file.id}`}
                            >
                              <Download className="w-4 h-4" />
                            </Button>
                            {hasDetails && (
                              isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />
                            )}
                          </div>
                        </div>
                        
                        {isExpanded && (
                          <div className="px-3 pb-3 border-t border-slate-200 bg-white">
                            <div className="grid grid-cols-2 gap-3 pt-3">
                              <div className="flex items-center gap-2">
                                <Package className="w-4 h-4 text-blue-500" />
                                <div>
                                  <p className="text-xs text-muted-foreground">Parts</p>
                                  <p className="text-sm font-semibold">{file.coreParts ?? 0}</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <Layers className="w-4 h-4 text-amber-500" />
                                <div>
                                  <p className="text-xs text-muted-foreground">Dovetails</p>
                                  <p className="text-sm font-semibold">{file.dovetails ?? 0}</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <Package className="w-4 h-4 text-green-500" />
                                <div>
                                  <p className="text-xs text-muted-foreground">Assembled Drawers</p>
                                  <p className="text-sm font-semibold">{file.assembledDrawers ?? 0}</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <Layers className="w-4 h-4 text-purple-500" />
                                <div>
                                  <p className="text-xs text-muted-foreground">5-Piece Doors</p>
                                  <p className="text-sm font-semibold">{file.fivePieceDoors ?? 0}</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <Weight className="w-4 h-4 text-slate-500" />
                                <div>
                                  <p className="text-xs text-muted-foreground">Weight</p>
                                  <p className="text-sm font-semibold">{file.weightLbs ?? 0} lbs</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <Ruler className="w-4 h-4 text-slate-500" />
                                <div>
                                  <p className="text-xs text-muted-foreground">Max Length</p>
                                  <p className="text-sm font-semibold">{file.maxLength ?? 0} mm</p>
                                </div>
                              </div>
                            </div>
                            
                            {/* Special flags */}
                            <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-slate-100">
                              {file.hasGlassParts && (
                                <span className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded-full">Glass Parts</span>
                              )}
                              {file.hasMJDoors && (
                                <span className="text-xs px-2 py-1 bg-amber-100 text-amber-700 rounded-full">M&J Doors</span>
                              )}
                              {file.hasRichelieuDoors && (
                                <span className="text-xs px-2 py-1 bg-purple-100 text-purple-700 rounded-full">Richelieu Doors</span>
                              )}
                              {file.hasDoubleThick && (
                                <span className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded-full">Double Thick</span>
                              )}
                              {!file.hasGlassParts && !file.hasMJDoors && !file.hasRichelieuDoors && !file.hasDoubleThick && (
                                <span className="text-xs text-muted-foreground">No special parts</span>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {(!project.files || project.files.length === 0) && (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No files in this project
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
