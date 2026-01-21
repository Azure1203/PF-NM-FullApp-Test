import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { 
  Plus, ArrowLeft, Trash2, Loader2, Users, UserPlus, Shield
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/hooks/use-auth";
import type { AllowedUser } from "@shared/schema";

export default function AdminUsers() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");

  const { data: allowedUsers, isLoading } = useQuery<AllowedUser[]>({
    queryKey: ['/api/admin/allowed-users'],
    queryFn: async () => {
      const res = await fetch('/api/admin/allowed-users', { credentials: 'include' });
      if (!res.ok) {
        const error = await res.text();
        throw new Error(error || 'Failed to fetch allowed users');
      }
      return res.json();
    },
  });

  const addUserMutation = useMutation({
    mutationFn: async (data: { email?: string; username?: string; displayName?: string }) => {
      const res = await apiRequest('POST', '/api/admin/allowed-users', data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/allowed-users'] });
      toast({ title: "User added to allowed list" });
      setIsDialogOpen(false);
      setEmail("");
      setUsername("");
      setDisplayName("");
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to add user", 
        description: error.message || "User may already exist", 
        variant: "destructive" 
      });
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest('DELETE', `/api/admin/allowed-users/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/allowed-users'] });
      toast({ title: "User removed from allowed list" });
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to remove user", 
        description: error.message, 
        variant: "destructive" 
      });
    },
  });

  const handleAddUser = () => {
    if (!email.trim() && !username.trim()) {
      toast({ title: "Email or username is required", variant: "destructive" });
      return;
    }
    addUserMutation.mutate({ 
      email: email.trim() || undefined,
      username: username.trim() || undefined, 
      displayName: displayName.trim() || undefined 
    });
  };

  const formatDate = (date: string | Date | null) => {
    if (!date) return "-";
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <Link href="/">
                <Button variant="ghost" size="icon" data-testid="button-back">
                  <ArrowLeft className="h-5 w-5" />
                </Button>
              </Link>
              <div className="flex items-center gap-2">
                <Shield className="h-6 w-6 text-primary" />
                <h1 className="text-xl font-semibold">Allowed Users</h1>
              </div>
            </div>
            <Button 
              onClick={() => setIsDialogOpen(true)}
              data-testid="button-add-user"
            >
              <UserPlus className="h-4 w-4 mr-2" />
              Add User
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Users with Access ({allowedUsers?.length || 0})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : allowedUsers && allowedUsers.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Username</TableHead>
                    <TableHead>Display Name</TableHead>
                    <TableHead>Added By</TableHead>
                    <TableHead>Date Added</TableHead>
                    <TableHead className="w-[100px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allowedUsers.map((allowedUser) => (
                    <TableRow key={allowedUser.id} data-testid={`row-user-${allowedUser.id}`}>
                      <TableCell className="font-medium">
                        {allowedUser.email || "-"}
                      </TableCell>
                      <TableCell>
                        {allowedUser.username || "-"}
                      </TableCell>
                      <TableCell>
                        {allowedUser.displayName || "-"}
                      </TableCell>
                      <TableCell>
                        {allowedUser.addedBy || "-"}
                      </TableCell>
                      <TableCell>
                        {formatDate(allowedUser.createdAt)}
                      </TableCell>
                      <TableCell>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button 
                              variant="ghost" 
                              size="icon"
                              data-testid={`button-delete-user-${allowedUser.id}`}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Remove User Access?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to remove <strong>{allowedUser.email || allowedUser.username}</strong> from the allowed users list? 
                                They will no longer be able to access the application.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => deleteUserMutation.mutate(allowedUser.id)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                data-testid={`button-confirm-delete-${allowedUser.id}`}
                              >
                                Remove
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No users have been added yet.</p>
                <p className="text-sm mt-1">Add users to allow them to access the application.</p>
              </div>
            )}
          </CardContent>
        </Card>

        {user && (
          <Card className="mt-4">
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">
                You are currently logged in as: <strong>{user.email || user.firstName || user.id}</strong>
              </p>
            </CardContent>
          </Card>
        )}
      </main>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Allowed User</DialogTitle>
            <DialogDescription>
              Add a user by email or Replit username to grant them access. At least one is required.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter email address"
                data-testid="input-email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="username">Replit Username</Label>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter Replit username"
                data-testid="input-username"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="displayName">Display Name (optional)</Label>
              <Input
                id="displayName"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Enter display name"
                data-testid="input-display-name"
              />
            </div>
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setIsDialogOpen(false)}
              data-testid="button-cancel"
            >
              Cancel
            </Button>
            <Button 
              onClick={handleAddUser}
              disabled={addUserMutation.isPending}
              data-testid="button-save-user"
            >
              {addUserMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Adding...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-2" />
                  Add User
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
