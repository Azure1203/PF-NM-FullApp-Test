import { useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { insertOrderSchema } from "@shared/schema";

import { useOrder, useUpdateOrder, useSyncOrder, useDeleteOrder } from "@/hooks/use-orders";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, RefreshCw, Save, Send, Download, FileText, Loader2, ExternalLink, Trash2 } from "lucide-react";
import { Link } from "wouter";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

// Schema for form validation
const formSchema = insertOrderSchema.pick({
  date: true,
  dealer: true,
  shippingAddress: true,
  phone: true,
  taxId: true,
  powerTailgate: true,
  phoneAppointment: true,
  orderId: true,
  poNumber: true,
});

type FormValues = z.infer<typeof formSchema>;

export default function OrderDetails() {
  const [, params] = useRoute("/orders/:id");
  const id = parseInt(params?.id || "0");
  const [, setLocation] = useLocation();

  const { data: order, isLoading } = useOrder(id);
  const { mutate: updateOrder, isPending: isUpdating } = useUpdateOrder();
  const { mutate: syncOrder, isPending: isSyncing } = useSyncOrder();
  const { mutate: deleteOrder, isPending: isDeleting } = useDeleteOrder();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      powerTailgate: false,
      phoneAppointment: false,
    }
  });

  // Reset form when order data loads
  useEffect(() => {
    if (order) {
      form.reset({
        date: order.date || "",
        dealer: order.dealer || "",
        shippingAddress: order.shippingAddress || "",
        phone: order.phone || "",
        taxId: order.taxId || "",
        orderId: order.orderId || "",
        poNumber: order.poNumber || "",
        powerTailgate: order.powerTailgate || false,
        phoneAppointment: order.phoneAppointment || false,
      });
    }
  }, [order, form]);

  const onSubmit = (data: FormValues) => {
    updateOrder({ id, ...data });
  };

  const handleSync = () => {
    // First save changes, then sync
    form.handleSubmit((data) => {
      updateOrder({ id, ...data }, {
        onSuccess: () => syncOrder(id)
      });
    })();
  };

  const handleDelete = () => {
    deleteOrder(id, {
      onSuccess: () => setLocation("/")
    });
  };

  const downloadRawContent = () => {
    if (!order?.rawContent) return;
    const blob = new Blob([order.rawContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `raw-${order.originalFilename}`;
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

  if (!order) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50/50 p-4">
        <h2 className="text-2xl font-bold mb-2">Order Not Found</h2>
        <p className="text-muted-foreground mb-6">The order you are looking for doesn't exist.</p>
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
                  Delete Order
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This action cannot be undone. This will permanently delete the order
                    from the database.
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

            <Button 
              variant="outline" 
              onClick={downloadRawContent}
              className="hidden sm:flex"
            >
              <Download className="w-4 h-4 mr-2" />
              Raw CSV
            </Button>
            
            {order.status === 'synced' && order.asanaTaskId && (
              <Button 
                variant="outline"
                className="text-blue-600 border-blue-200 hover:bg-blue-50"
                onClick={() => window.open(`https://app.asana.com/0/0/${order.asanaTaskId}`, '_blank')}
              >
                <ExternalLink className="w-4 h-4 mr-2" />
                View in Asana
              </Button>
            )}
          </div>
        </div>

        <PageHeader 
          title={order.dealer || "Processing Order"} 
          description={`Extracted from ${order.originalFilename}`}
          actions={
            <div className="flex items-center gap-4">
              <StatusBadge status={order.status as any} />
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
                    {order.status === 'synced' ? 'Sync Again' : 'Sync to Asana'}
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
                    <CardTitle>Order Details</CardTitle>
                    <CardDescription>
                      Review and edit extracted information before syncing.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <FormField
                        control={form.control}
                        name="dealer"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Dealer Name</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="e.g. Closet World" className="bg-slate-50/50" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="poNumber"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>PO Number / Project Name</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="e.g. PO-12345" className="bg-slate-50/50" />
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
                              <Input {...field} type="date" className="bg-slate-50/50" />
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
                              <Input {...field} className="bg-slate-50/50" />
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
                              <Input {...field} className="bg-slate-50/50" />
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
                              <Input {...field} className="bg-slate-50/50" />
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
                    <StatusBadge status={order.status as any} />
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-slate-700">
                    <span className="text-slate-400">Asana Task</span>
                    <span className="font-mono text-sm">
                      {order.asanaTaskId ? `#${order.asanaTaskId.slice(-6)}` : "Not Created"}
                    </span>
                  </div>
                  <div className="pt-4 text-sm text-slate-400">
                    {order.status === 'synced' 
                      ? "This order has been successfully pushed to Asana. Updates here will not automatically reflect in Asana unless you sync again."
                      : "Review the details on the left carefully before syncing to ensure accurate task creation."
                    }
                  </div>
                </div>
              </CardContent>
            </Card>

            <Tabs defaultValue="raw" className="w-full">
              <TabsList className="w-full grid grid-cols-2 bg-white border border-slate-200">
                <TabsTrigger value="raw">Raw Data</TabsTrigger>
                <TabsTrigger value="meta">Metadata</TabsTrigger>
              </TabsList>
              <TabsContent value="raw">
                <Card className="border border-slate-200 shadow-none">
                  <CardContent className="p-4">
                    <div className="bg-slate-50 rounded-md p-3 text-xs font-mono text-slate-600 overflow-x-auto max-h-[300px] whitespace-pre">
                      {order.rawContent || "No raw content available."}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
              <TabsContent value="meta">
                <Card className="border border-slate-200 shadow-none">
                  <CardContent className="p-4 space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Uploaded</span>
                      <span>{new Date(order.createdAt!).toLocaleDateString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Filename</span>
                      <span className="truncate max-w-[150px]" title={order.originalFilename}>
                        {order.originalFilename}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    </div>
  );
}
