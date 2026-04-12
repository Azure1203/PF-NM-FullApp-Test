import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryClient as qc, apiRequest } from "@/lib/queryClient";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useIsAdmin } from "@/hooks/use-admin";
import { Loader2, Save, Settings, Plus, Trash2, Shield, ShieldCheck, Users } from "lucide-react";
import type { AllowedUser } from "@shared/schema";

export default function AdminSettings() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-1">System configuration and user management.</p>
      </div>

      <Tabs defaultValue="ord" className="w-full">
        <TabsList>
          <TabsTrigger value="ord" data-testid="tab-settings-ord">ORD Export</TabsTrigger>
          <TabsTrigger value="output" data-testid="tab-settings-output">Output Settings</TabsTrigger>
          <TabsTrigger value="users" data-testid="tab-settings-users">Users</TabsTrigger>
        </TabsList>
        <div className="mt-6">
          <TabsContent value="ord"><OrdSettingsPanel /></TabsContent>
          <TabsContent value="output"><OutputSettingsPanel /></TabsContent>
          <TabsContent value="users"><UsersPanel /></TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

// ─── ORD Settings Panel ───────────────────────────────────────────────
function OrdSettingsPanel() {
  const { toast } = useToast();
  const [headerTemplate, setHeaderTemplate] = useState("");
  const [loaded, setLoaded] = useState(false);

  const { data: headerSetting, isLoading } = useQuery<{ value: string }>({
    queryKey: ["/api/admin/settings", "ord_header_template"],
    queryFn: async () => {
      const res = await fetch("/api/admin/settings/ord_header_template", { credentials: "include" });
      if (!res.ok) return { value: "" };
      return res.json();
    },
  });

  useEffect(() => {
    if (headerSetting?.value && !loaded) {
      setHeaderTemplate(headerSetting.value);
      setLoaded(true);
    }
  }, [headerSetting, loaded]);

  const saveMutation = useMutation({
    mutationFn: (value: string) => apiRequest("PUT", "/api/admin/settings/ord_header_template", { value }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/settings", "ord_header_template"] });
      toast({ title: "ORD Header Template saved" });
    },
    onError: (e: Error) => toast({ title: "Failed to save", description: e.message, variant: "destructive" }),
  });

  return (
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
      <CardContent className="space-y-4">
        {isLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : (
          <>
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
            <Button onClick={() => saveMutation.mutate(headerTemplate)} disabled={saveMutation.isPending} data-testid="button-save-ord-header">
              {saveMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              Save Template
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Output Settings Panel ────────────────────────────────────────────
const OUTPUT_PAGES = [
  { id: "invoice", label: "Invoice" },
  { id: "customerSlip", label: "Customer Packing Slip" },
  { id: "internalSlip", label: "Internal Packing Slip" },
  { id: "elias", label: "Elias Dovetail" },
  { id: "mj", label: "M&J Doors" },
  { id: "hardware", label: "Hardware" },
  { id: "glass", label: "Glass" },
  { id: "ord", label: "Cabinet Vision (.ORD)" },
  { id: "cts", label: "Cut-to-Size" },
  { id: "erp", label: "ERP Import" },
];

const SETTING_KEYS = [
  { key: "showProductImages", label: "Show product images" },
  { key: "showPricing", label: "Show pricing" },
];

function OutputSettingsPanel() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: settings, isLoading } = useQuery<Record<string, Record<string, string>>>({
    queryKey: ["/api/admin/output-settings"],
    queryFn: () => fetch("/api/admin/output-settings", { credentials: "include" }).then(r => r.json()),
  });

  const updateMutation = useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) =>
      fetch("/api/admin/output-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ key, value }),
      }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/output-settings"] });
      toast({ title: "Setting saved" });
    },
    onError: (e: any) => toast({ title: "Failed to save", description: e.message, variant: "destructive" }),
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Configure which options appear on each output document.</p>
      <div className="grid gap-4">
        {OUTPUT_PAGES.map(page => (
          <Card key={page.id}>
            <CardHeader className="py-3 pb-2">
              <CardTitle className="text-sm font-medium">{page.label}</CardTitle>
            </CardHeader>
            <CardContent className="py-0 pb-3">
              <div className="flex gap-6 flex-wrap">
                {SETTING_KEYS.map(sk => {
                  const rawKey = `output.${page.id}.${sk.key}`;
                  const pageSettings = settings?.[page.id] ?? {};
                  const isEnabled = pageSettings[sk.key] === "true";
                  return (
                    <div key={sk.key} className="flex items-center gap-2">
                      <Switch
                        id={rawKey}
                        checked={isEnabled}
                        onCheckedChange={(checked) =>
                          updateMutation.mutate({ key: rawKey, value: checked ? "true" : "false" })
                        }
                        data-testid={`switch-${page.id}-${sk.key}`}
                      />
                      <Label htmlFor={rawKey} className="text-sm cursor-pointer">{sk.label}</Label>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ─── Users Panel ─────────────────────────────────────────────────────
function UsersPanel() {
  const { toast } = useToast();
  const { user: currentUser } = useAuth();
  const { data: adminStatus } = useIsAdmin();
  const isCurrentUserAdmin = adminStatus?.isAdmin === true;

  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [newIsAdmin, setNewIsAdmin] = useState(false);

  const { data: allowedUsers, isLoading } = useQuery<AllowedUser[]>({
    queryKey: ["/api/admin/users"],
  });

  const addMutation = useMutation({
    mutationFn: ({ username, isAdmin }: { username: string; isAdmin: boolean }) =>
      apiRequest("POST", "/api/admin/users", { username, isAdmin }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "User added" });
      setAddDialogOpen(false);
      setNewUsername("");
      setNewIsAdmin(false);
    },
    onError: (e: Error) => toast({ title: "Failed to add user", description: e.message, variant: "destructive" }),
  });

  const toggleAdminMutation = useMutation({
    mutationFn: ({ id, isAdmin }: { id: number; isAdmin: boolean }) =>
      apiRequest("PATCH", `/api/admin/users/${id}`, { isAdmin }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "User updated" });
    },
    onError: (e: Error) => toast({ title: "Failed to update user", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/admin/users/${id}`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "User removed" });
    },
    onError: (e: Error) => toast({ title: "Failed to remove user", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" />
          <p className="text-sm text-muted-foreground">Manage who can access Order Manager.</p>
        </div>
        {isCurrentUserAdmin && (
          <Button size="sm" onClick={() => setAddDialogOpen(true)} data-testid="button-add-user">
            <Plus className="h-4 w-4 mr-1" /> Add User
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-2">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Username</TableHead>
                  <TableHead className="text-center">Admin</TableHead>
                  {isCurrentUserAdmin && <TableHead className="text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {(allowedUsers ?? []).map(u => (
                  <TableRow key={u.id} data-testid={`row-user-${u.id}`}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {u.isAdmin ? <ShieldCheck className="h-4 w-4 text-primary" /> : <Shield className="h-4 w-4 text-muted-foreground" />}
                        {u.username}
                        {u.username === currentUser?.username && (
                          <Badge variant="outline" className="text-xs">You</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      {isCurrentUserAdmin ? (
                        <Switch
                          checked={u.isAdmin}
                          onCheckedChange={(checked) => toggleAdminMutation.mutate({ id: u.id, isAdmin: checked })}
                          disabled={u.username === currentUser?.username}
                          data-testid={`switch-admin-${u.id}`}
                        />
                      ) : (
                        <span className="text-sm text-muted-foreground">{u.isAdmin ? "Yes" : "No"}</span>
                      )}
                    </TableCell>
                    {isCurrentUserAdmin && (
                      <TableCell className="text-right">
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              size="icon"
                              variant="ghost"
                              disabled={u.username === currentUser?.username}
                              data-testid={`button-delete-user-${u.id}`}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Remove {u.username}?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will revoke their access to Order Manager.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => deleteMutation.mutate(u.id)}
                                className="bg-destructive text-destructive-foreground"
                              >
                                Remove
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={addDialogOpen} onOpenChange={(o) => { if (!o) { setAddDialogOpen(false); setNewUsername(""); setNewIsAdmin(false); } }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Add User</DialogTitle>
            <DialogDescription>Grant access to Order Manager.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Replit Username</Label>
              <Input
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                placeholder="e.g. john_doe"
                data-testid="input-new-username"
              />
            </div>
            <div className="flex items-center gap-3">
              <Switch
                checked={newIsAdmin}
                onCheckedChange={setNewIsAdmin}
                id="new-is-admin"
                data-testid="switch-new-is-admin"
              />
              <Label htmlFor="new-is-admin">Administrator</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={() => addMutation.mutate({ username: newUsername.trim(), isAdmin: newIsAdmin })}
              disabled={!newUsername.trim() || addMutation.isPending}
              data-testid="button-confirm-add-user"
            >
              {addMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Add User
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
