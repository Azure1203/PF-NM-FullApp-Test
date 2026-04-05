import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';

const OUTPUT_PAGES = [
  { id: 'invoice',      label: 'Invoice' },
  { id: 'customerSlip', label: 'Customer Packing Slip' },
  { id: 'internalSlip', label: 'Internal Packing Slip' },
  { id: 'elias',        label: 'Elias Dovetail' },
  { id: 'mj',           label: 'M&J Doors' },
  { id: 'hardware',     label: 'Hardware' },
  { id: 'glass',        label: 'Glass' },
  { id: 'ord',          label: 'Cabinet Vision (.ORD)' },
  { id: 'cts',          label: 'Cut-to-Size' },
  { id: 'erp',          label: 'ERP Import' },
];

const SETTING_KEYS = [
  { key: 'showProductImages', label: 'Show product images' },
  { key: 'showPricing',       label: 'Show pricing' },
];

export default function OutputSettings() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: settings, isLoading } = useQuery<Record<string, Record<string, string>>>({
    queryKey: ['/api/admin/output-settings'],
    queryFn: () => fetch('/api/admin/output-settings', { credentials: 'include' }).then(r => r.json()),
  });

  const updateMutation = useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) =>
      fetch('/api/admin/output-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ key, value }),
      }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/output-settings'] });
      toast({ title: 'Setting saved' });
    },
    onError: (e: any) => {
      toast({ title: 'Failed to save', description: e.message, variant: 'destructive' });
    },
  });

  const toggleSetting = (page: string, settingKey: string) => {
    const current = settings?.[page]?.[settingKey] === 'true';
    updateMutation.mutate({
      key: `output.${page}.${settingKey}`,
      value: String(!current),
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold" data-testid="heading-output-settings">Output Page Settings</h1>
        <p className="text-muted-foreground mt-1">Configure display options for each output document type.</p>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1,2,3].map(i => <Skeleton key={i} className="h-28 w-full" />)}
        </div>
      ) : (
        <div className="grid gap-4 max-w-2xl">
          {OUTPUT_PAGES.map(page => {
            const pageSettings = settings?.[page.id];
            const visibleKeys = SETTING_KEYS.filter(s => pageSettings?.[s.key] !== undefined);
            if (visibleKeys.length === 0) return null;

            return (
              <Card key={page.id} data-testid={`card-output-${page.id}`}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">{page.label}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {visibleKeys.map(setting => {
                    const isOn = pageSettings![setting.key] === 'true';
                    return (
                      <div key={setting.key} className="flex items-center justify-between">
                        <Label className="text-sm" htmlFor={`${page.id}-${setting.key}`}>
                          {setting.label}
                        </Label>
                        <Switch
                          id={`${page.id}-${setting.key}`}
                          data-testid={`switch-${page.id}-${setting.key}`}
                          checked={isOn}
                          onCheckedChange={() => toggleSetting(page.id, setting.key)}
                          disabled={updateMutation.isPending}
                        />
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
