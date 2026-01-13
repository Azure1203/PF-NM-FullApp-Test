import { Link } from "wouter";
import { useOrders, useDeleteOrder } from "@/hooks/use-orders";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, ArrowRight, FolderOpen, Search, Trash2, Loader2, LogOut } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useAuth } from "@/hooks/use-auth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

const RED_PRODUCTION_STATUSES = [
  "WAITING FOR BO HARDWARE",
  "WAITING FOR DOVETAIL", 
  "WAITING FOR MARATHON HARDWARE",
  "WAITING FOR GLASS SHELVES",
  "WAITING FOR GLASS FOR DOORS",
  "WAITING FOR NETLEY SHAKER DOORS",
  "GARAGE PANELS TO DRILL",
  "DOUBLE UP PARTS AT CUSTOM",
  "WAITING FOR NETLEY ASSEMBLED DRAWERS",
  "CLOSET RODS NOT CUT"
];

export default function Dashboard() {
  const { data: projects, isLoading } = useOrders();
  const { mutate: deleteProject, isPending: isDeleting } = useDeleteOrder();
  const { user } = useAuth();
  const [search, setSearch] = useState("");

  const filteredProjects = projects?.filter(project => {
    const term = search.toLowerCase();
    return (
      project.name?.toLowerCase().includes(term) ||
      project.dealer?.toLowerCase().includes(term)
    );
  }) || [];

  return (
    <div className="min-h-screen bg-slate-50/50 pb-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            {user && (
              <>
                <Avatar className="h-9 w-9">
                  <AvatarImage src={user.profileImageUrl || undefined} alt={user.firstName || "User"} />
                  <AvatarFallback className="bg-primary/10 text-primary text-sm">
                    {user.firstName?.[0] || user.email?.[0] || "U"}
                  </AvatarFallback>
                </Avatar>
                <span className="text-sm text-muted-foreground">
                  Welcome, <span className="font-medium text-slate-700">{user.firstName || user.email}</span>
                </span>
              </>
            )}
          </div>
          <a href="/api/logout">
            <Button variant="outline" size="sm" data-testid="button-logout" className="gap-2">
              <LogOut className="w-4 h-4" />
              Log Out
            </Button>
          </a>
        </div>
        
        <PageHeader 
          title="Project Dashboard" 
          description="Manage and sync your closet order projects."
          actions={
            <Link href="/upload">
              <Button size="lg" className="btn-primary gap-2 rounded-xl text-md h-12 px-6" data-testid="button-upload-new">
                <Plus className="w-5 h-5" />
                Upload New Project
              </Button>
            </Link>
          }
        />

        {/* Stats Section */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-10">
          {[
            { label: "Total Projects", value: projects?.length || 0, color: "text-blue-600", bg: "bg-blue-50" },
            { label: "Projects Confirmed", value: projects?.filter(p => p.pfOrderStatus === 'ORDER CONFIRMED').length || 0, color: "text-purple-600", bg: "bg-purple-50" },
            { label: "Pending Sync", value: projects?.filter(p => p.status === 'pending').length || 0, color: "text-amber-600", bg: "bg-amber-50" },
            { label: "Synced to Asana", value: projects?.filter(p => p.status === 'synced').length || 0, color: "text-green-600", bg: "bg-green-50" },
          ].map((stat, i) => (
            <Card key={i} className="border-none shadow-sm shadow-slate-100 hover:shadow-md transition-shadow">
              <CardContent className="p-6 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">{stat.label}</p>
                  <p className="text-3xl font-bold mt-1 text-slate-800">{isLoading ? "-" : stat.value}</p>
                </div>
                <div className={`w-12 h-12 rounded-full ${stat.bg} ${stat.color} flex items-center justify-center`}>
                  <FolderOpen className="w-6 h-6 opacity-80" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Search Bar */}
        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <Input 
            className="pl-10 h-12 rounded-xl border-slate-200 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all text-base"
            placeholder="Search by project name or dealer..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Projects List */}
        <div className="space-y-4">
          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-24 rounded-xl bg-white border border-slate-100 shadow-sm animate-pulse" />
            ))
          ) : filteredProjects.length === 0 ? (
            <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-slate-200">
              <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <FolderOpen className="w-8 h-8 text-slate-400" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900">No projects found</h3>
              <p className="text-muted-foreground mt-1">
                {search ? "Try adjusting your search terms" : "Upload your first CSV files to create a project"}
              </p>
              {!search && (
                <Link href="/upload">
                  <Button variant="outline" className="mt-4">Upload Project</Button>
                </Link>
              )}
            </div>
          ) : (
            filteredProjects.map((project) => (
              <div key={project.id} className="bg-white rounded-xl p-5 border border-slate-100 shadow-sm hover:shadow-md hover:border-primary/20 transition-all duration-200 relative overflow-hidden group">
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-transparent group-hover:bg-primary transition-colors" />
                
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <Link href={`/orders/${project.id}`} className="flex items-start gap-4 flex-1">
                    <div className="w-12 h-12 rounded-lg bg-slate-50 flex items-center justify-center border border-slate-100 shrink-0 group-hover:bg-primary/5 group-hover:text-primary transition-colors">
                      <FolderOpen className="w-6 h-6 text-slate-400 group-hover:text-primary transition-colors" />
                    </div>
                    
                    <div className="flex-1">
                      <h3 className="font-semibold text-lg text-slate-800 group-hover:text-primary transition-colors">
                        {project.name}
                      </h3>
                      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mt-1 text-sm text-muted-foreground">
                        <span>Dealer: <span className="font-medium text-slate-700">{project.dealer || "N/A"}</span></span>
                        <span>Date: {project.createdAt ? format(new Date(project.createdAt), 'PPP') : 'N/A'}</span>
                      </div>
                      
                      {/* PF Production Section Status */}
                      {project.asanaSection && (
                        <div className="mt-2">
                          <Badge 
                            variant="outline" 
                            className="bg-blue-50 text-blue-700 border-blue-200 text-sm font-medium"
                            data-testid="badge-production-section"
                          >
                            {project.asanaSection}
                          </Badge>
                        </div>
                      )}
                      
                      {/* Status Badges */}
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {/* CTS Parts Status */}
                        {(project as any).ctsStatus?.hasCTSParts && (
                          (project as any).ctsStatus?.allCtsCut ? (
                            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-xs" data-testid="badge-cts-cut">
                              CTS PARTS CUT
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 text-xs" data-testid="badge-cts-not-done">
                              CTS PARTS NOT DONE
                            </Badge>
                          )
                        )}
                        
                        {/* Hardware Packed Status */}
                        {(project as any).hardwarePackaged ? (
                          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-xs" data-testid="badge-hardware-packed">
                            HARDWARE PACKED
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 text-xs" data-testid="badge-hardware-not-packed">
                            HARDWARE NOT PACKED
                          </Badge>
                        )}
                        
                        {/* Red Production Statuses */}
                        {project.pfProductionStatus?.filter(status => 
                          RED_PRODUCTION_STATUSES.includes(status)
                        ).map(status => (
                          <Badge 
                            key={status} 
                            variant="outline" 
                            className="bg-red-50 text-red-700 border-red-200 text-xs"
                            data-testid={`badge-status-${status.toLowerCase().replace(/\s+/g, '-')}`}
                          >
                            {status}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </Link>

                  <div className="flex items-center justify-between md:justify-end gap-4 w-full md:w-auto">
                    <StatusBadge status={project.status as any} />
                    
                    <div className="flex items-center gap-2">
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="icon" variant="ghost" className="text-muted-foreground hover:text-destructive hover:bg-destructive/10">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete Project?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will permanently remove the project "{project.name}" and all its files.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction 
                              onClick={() => deleteProject(project.id)}
                              className="bg-destructive text-destructive-foreground"
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>

                      <Link href={`/orders/${project.id}`}>
                        <div className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 group-hover:translate-x-1 group-hover:text-primary transition-all">
                          <ArrowRight className="w-5 h-5" />
                        </div>
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
