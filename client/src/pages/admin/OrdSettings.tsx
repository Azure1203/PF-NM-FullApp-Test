import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Settings, Save } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";

export default function OrdSettings() {
  const { toast } = useToast();
  const [headerTemplate, setHeaderTemplate] = useState('');
  const [headerTemplateLoaded, setHeaderTemplateLoaded] = useState(false);

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-1">System configuration for Cabinet Vision exports.</p>
      </div>

      <Card data-testid="card-ord-header-template">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            ORD Header Template
          </CardTitle>
          <CardDescription>
            Template for the [Header] block prepended to each file in .ORD exports. Use{" "}
            <code className="text-xs bg-muted px-1 py-0.5 rounded">{"{{design_name}}"}</code> and{" "}
            <code className="text-xs bg-muted px-1 py-0.5 rounded">{"{{po_number}}"}</code> as placeholders.
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
                rows={12}
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
    </div>
  );
}
