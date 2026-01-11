import { useState, useRef } from "react";
import { useRoute } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";

import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowLeft, Scissors, MapPin, Image, Save, Loader2, Package, Upload, X, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import type { OrderFile, CtsPart, CtsPartConfig } from "@shared/schema";

interface CtsPartWithConfig extends CtsPart {
  config: CtsPartConfig | null;
}

export default function CutToSize() {
  const [, params] = useRoute("/files/:fileId/cts");
  const fileId = parseInt(params?.fileId || "0");
  const { toast } = useToast();
  
  const [editingConfig, setEditingConfig] = useState<{ [partNumber: string]: { rackLocation: string } }>({});
  const [uploadingPart, setUploadingPart] = useState<string | null>(null);
  const fileInputRefs = useRef<{ [partNumber: string]: HTMLInputElement | null }>({});

  const { data: fileInfo } = useQuery<{ file: any; projectName: string }>({
    queryKey: ['/api/files', fileId],
    enabled: !!fileId && fileId > 0,
  });

  const { data: ctsParts, isLoading } = useQuery<CtsPartWithConfig[]>({
    queryKey: ['/api/files', fileId, 'cts-parts'],
    enabled: !!fileId && fileId > 0,
  });

  const { mutate: saveConfig, isPending: isSaving } = useMutation({
    mutationFn: async ({ partNumber, rackLocation }: { partNumber: string; rackLocation: string }) => {
      return apiRequest('PUT', `/api/cts-configs/${encodeURIComponent(partNumber)}`, { rackLocation });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/files', fileId, 'cts-parts'] });
      toast({ title: "Configuration saved" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to save", description: error.message, variant: "destructive" });
    }
  });

  const { mutate: toggleCutStatus } = useMutation({
    mutationFn: async ({ partId, isCut }: { partId: number; isCut: boolean }) => {
      return apiRequest('PATCH', `/api/cts-parts/${partId}/cut`, { isCut });
    },
    onMutate: async ({ partId, isCut }) => {
      await queryClient.cancelQueries({ queryKey: ['/api/files', fileId, 'cts-parts'] });
      const previousParts = queryClient.getQueryData<CtsPartWithConfig[]>(['/api/files', fileId, 'cts-parts']);
      queryClient.setQueryData<CtsPartWithConfig[]>(['/api/files', fileId, 'cts-parts'], (old) => 
        old?.map(part => part.id === partId ? { ...part, isCut } : part)
      );
      return { previousParts };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/files', fileId, 'cts-status'] });
    },
    onError: (error: Error, _, context) => {
      if (context?.previousParts) {
        queryClient.setQueryData(['/api/files', fileId, 'cts-parts'], context.previousParts);
      }
      toast({ title: "Failed to update", description: error.message, variant: "destructive" });
    }
  });

  const handleImageUpload = async (partNumber: string, file: File) => {
    setUploadingPart(partNumber);
    try {
      const formData = new FormData();
      formData.append('image', file);
      
      const response = await fetch(`/api/cts-configs/${encodeURIComponent(partNumber)}/image`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Upload failed');
      }
      
      queryClient.invalidateQueries({ queryKey: ['/api/files', fileId, 'cts-parts'] });
      toast({ title: "Image uploaded successfully" });
    } catch (error: any) {
      toast({ title: "Upload failed", description: error.message, variant: "destructive" });
    } finally {
      setUploadingPart(null);
    }
  };

  const handleSaveConfig = (partNumber: string) => {
    const config = editingConfig[partNumber];
    const existingPart = ctsParts?.find(p => p.partNumber === partNumber);
    
    saveConfig({
      partNumber,
      rackLocation: config?.rackLocation ?? existingPart?.config?.rackLocation ?? ""
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50/50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50/50 pb-20">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        
        <div className="flex gap-4 mb-6">
          <Link href="/">
            <Button variant="ghost" className="pl-0 text-muted-foreground hover:text-foreground">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Dashboard
            </Button>
          </Link>
          {fileInfo && (
            <Link href={`/orders/${fileInfo.file.projectId}`}>
              <Button variant="ghost" className="pl-0 text-muted-foreground hover:text-foreground">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Order
              </Button>
            </Link>
          )}
        </div>

        <PageHeader 
          title="Cut To Size Parts" 
          description={fileInfo ? `Order: ${fileInfo.projectName}` : "Parts that need to be cut to specific lengths for this order."}
        />

        {!ctsParts || ctsParts.length === 0 ? (
          <Card className="border-none shadow-md">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <Scissors className="w-16 h-16 text-muted-foreground/30 mb-4" />
              <p className="text-lg font-medium text-muted-foreground">No Cut To Size Parts</p>
              <p className="text-sm text-muted-foreground/70">This file doesn't contain any .CTS parts.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {ctsParts.map((part) => {
              const editing = editingConfig[part.partNumber] ?? {
                rackLocation: part.config?.rackLocation ?? ""
              };
              
              return (
                <Card key={part.id} className={`border-none shadow-md transition-colors ${part.isCut ? 'bg-green-50 dark:bg-green-950/20 border-2 border-green-400' : ''}`} data-testid={`cts-part-${part.id}`}>
                  <CardHeader className="pb-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-center gap-4">
                        <Checkbox
                          checked={part.isCut}
                          onCheckedChange={(checked) => toggleCutStatus({ partId: part.id, isCut: !!checked })}
                          className="w-8 h-8 border-2 data-[state=checked]:bg-green-500 data-[state=checked]:border-green-500"
                          data-testid="checkbox-cut-status"
                        />
                        <div>
                          <CardTitle className={`text-lg ${part.isCut ? 'line-through text-muted-foreground' : ''}`} data-testid="text-part-number">{part.partNumber}</CardTitle>
                          <CardDescription data-testid="text-part-description">{part.description || "No description"}</CardDescription>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`text-3xl font-bold ${part.isCut ? 'text-green-600' : 'text-primary'}`} data-testid="text-cut-length">{part.cutLength} mm</div>
                        <div className="text-sm text-muted-foreground">{part.isCut ? 'Cut Complete' : 'Cut Length'}</div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 p-4 bg-muted/30 rounded-lg">
                      <div className="flex items-center gap-3">
                        <Package className="w-5 h-5 text-muted-foreground" />
                        <div>
                          <p className="text-2xl font-bold" data-testid="text-quantity">{part.quantity}</p>
                          <p className="text-xs text-muted-foreground">Quantity</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <MapPin className="w-5 h-5 text-muted-foreground" />
                        <div>
                          <p className="text-lg font-semibold" data-testid="text-rack-location">
                            {part.config?.rackLocation || <span className="text-muted-foreground/50 italic">Not set</span>}
                          </p>
                          <p className="text-xs text-muted-foreground">Rack Location</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Image className="w-5 h-5 text-muted-foreground" />
                        <div>
                          <p className="text-sm" data-testid="text-image-status">
                            {part.config?.imageUrl ? (
                              <span className="text-green-600 font-medium">Image set</span>
                            ) : (
                              <span className="text-muted-foreground/50 italic">No image</span>
                            )}
                          </p>
                          <p className="text-xs text-muted-foreground">Reference Photo</p>
                        </div>
                      </div>
                    </div>

                    {part.config?.imageUrl && (
                      <div className="rounded-lg overflow-hidden border bg-white">
                        <img 
                          src={part.config.imageUrl} 
                          alt={`Reference for ${part.partNumber}`}
                          className="w-full max-h-64 object-contain"
                          data-testid="img-part-reference"
                        />
                      </div>
                    )}

                    <div className="border-t pt-4">
                      <h4 className="text-sm font-medium text-muted-foreground mb-4">Configure Part</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor={`rack-${part.partNumber}`} className="flex items-center gap-2">
                            <MapPin className="w-4 h-4" />
                            Rack Location
                          </Label>
                          <Input
                            id={`rack-${part.partNumber}`}
                            placeholder="e.g. Rack A-12, Shelf 3"
                            value={editing.rackLocation}
                            onChange={(e) => setEditingConfig(prev => ({
                              ...prev,
                              [part.partNumber]: { ...editing, rackLocation: e.target.value }
                            }))}
                            data-testid="input-rack-location"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="flex items-center gap-2">
                            <Image className="w-4 h-4" />
                            Reference Image
                          </Label>
                          <div className="flex items-center gap-2">
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              ref={(el) => fileInputRefs.current[part.partNumber] = el}
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) handleImageUpload(part.partNumber, file);
                              }}
                              data-testid="input-image-file"
                            />
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => fileInputRefs.current[part.partNumber]?.click()}
                              disabled={uploadingPart === part.partNumber}
                              data-testid="button-upload-image"
                            >
                              {uploadingPart === part.partNumber ? (
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              ) : (
                                <Upload className="w-4 h-4 mr-2" />
                              )}
                              {part.config?.imageUrl ? 'Change Image' : 'Upload Image'}
                            </Button>
                            {part.config?.imageUrl && (
                              <span className="text-sm text-green-600">Image uploaded</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <Button
                        className="mt-4"
                        onClick={() => handleSaveConfig(part.partNumber)}
                        disabled={isSaving}
                        data-testid="button-save-config"
                      >
                        {isSaving ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <Save className="w-4 h-4 mr-2" />
                        )}
                        Save Rack Location
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
