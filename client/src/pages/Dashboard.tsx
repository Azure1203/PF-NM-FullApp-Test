import { Link } from "wouter";
import { useOrders, useDeleteOrder } from "@/hooks/use-orders";
import { useIsAdmin } from "@/hooks/use-admin";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, ArrowRight, FolderOpen, Search, Trash2, Loader2, LogOut, Mail, RefreshCw, ChevronDown, ChevronUp, Bug, Package, Shield, HelpCircle, Database, ExternalLink, Palette, Download } from "lucide-react";
import { PrinterSettings } from "@/components/PrinterSettings";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useAuth } from "@/hooks/use-auth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

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

interface DiagnosticFile {
  fileId: number;
  projectId: number;
  projectName: string;
  originalFilename: string;
  poNumber: string | null;
  allmoxyJobNumber: string | null;
  allmoxyJobNumberNormalized: string | null;
  hasPackingSlip: boolean;
  packingSlipPath: string | null;
}

interface DiagnosticResponse {
  totalFiles: number;
  searchQuery: string | null;
  files: DiagnosticFile[];
}

export default function Dashboard() {
  const { data: projects, isLoading } = useOrders();
  const { mutate: deleteProject, isPending: isDeleting } = useDeleteOrder();
  const { user } = useAuth();
  const { data: adminStatus } = useIsAdmin();
  const isAdmin = adminStatus?.isAdmin === true;
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "in_production" | "pending" | "synced" | "shipped">("all");
  
  // Sections that count as "In Production"
  const IN_PRODUCTION_SECTIONS = ["JOB CONFIRMED", "PACK HARDWARE", "HARDWARE PACKED", "PALLET PACKED", "READY TO SUBMIT", "READY TO LOAD"];
  const [diagnosticOpen, setDiagnosticOpen] = useState(false);
  const [diagnosticSearch, setDiagnosticSearch] = useState("");
  const [importManageOpen, setImportManageOpen] = useState(false);
  const [resettingImportId, setResettingImportId] = useState<string | number | null>(null);

  const { data: autoImportedProjects = [] } = useQuery<any[]>({
    queryKey: ['/api/asana-import/projects'],
    enabled: isAdmin,
  });

  const { mutate: backupToSheets, isPending: isBackingUp } = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/backup/google-sheets');
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({ 
        title: "Backup complete",
        description: `Saved ${data.stats.orders} orders, ${data.stats.products} products, ${data.stats.hardwareItems} hardware items to Google Sheets.`
      });
      if (data.spreadsheetUrl) {
        window.open(data.spreadsheetUrl, '_blank');
      }
    },
    onError: (error: Error) => {
      toast({ title: "Backup failed", description: error.message, variant: "destructive" });
    }
  });

  const { data: outlookSyncStatus } = useQuery<{ status: { lastSyncAt: string | null; lastSuccessAt: string | null; lastError: string | null; emailsProcessed: number; emailsMatched: number } | null }>({
    queryKey: ['/api/outlook/sync-status'],
    refetchInterval: 60000
  });

  const { data: agentmailSyncStatus } = useQuery<{ status: { lastSyncAt: string | null; lastSuccessAt: string | null; lastError: string | null; emailsProcessed: number; emailsMatched: number } | null }>({
    queryKey: ['/api/agentmail/sync-status'],
    refetchInterval: 60000
  });

  const { data: asanaImportStatus } = useQuery<{ status: { lastSyncAt: string | null; lastSuccessAt: string | null; lastError: string | null; tasksProcessed: number; tasksImported: number } | null }>({
    queryKey: ['/api/asana-import/status'],
    refetchInterval: 60000
  });

  const { mutate: triggerAsanaImport, isPending: isImportingAsana } = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/asana-import/trigger', {
        method: 'POST',
        credentials: 'include'
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || 'Failed to trigger Asana import');
      }
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/orders'] });
      queryClient.invalidateQueries({ queryKey: ['/api/asana-import/status'] });
      toast({
        title: "Asana import complete",
        description: `Processed ${data.processed} tasks, imported ${data.imported} new orders.`
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to import from Asana",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  const diagnosticQueryUrl = diagnosticSearch 
    ? `/api/diagnostic/order-files?search=${encodeURIComponent(diagnosticSearch)}`
    : '/api/diagnostic/order-files';
  
  const { data: diagnosticData, isLoading: isDiagnosticLoading, refetch: refetchDiagnostic } = useQuery<DiagnosticResponse>({
    queryKey: [diagnosticQueryUrl],
    enabled: diagnosticOpen
  });

  const { mutate: resetProcessedEmails, isPending: isResettingEmails } = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/outlook/processed-emails', {
        method: 'DELETE',
        credentials: 'include'
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || 'Failed to reset processed emails');
      }
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/outlook/sync-status'] });
      toast({
        title: "Processed emails reset",
        description: data.message
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to reset processed emails",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  const { mutate: fetchOutlookEmails, isPending: isFetchingEmails } = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/outlook/process-netley-emails', {
        method: 'POST',
        credentials: 'include'
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || 'Failed to fetch emails');
      }
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/orders'] });
      queryClient.invalidateQueries({ queryKey: ['/api/outlook/sync-status'] });
      toast({
        title: "Outlook emails processed",
        description: `Processed ${data.processed} emails, matched ${data.matched} packing slips to orders.`
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to fetch emails",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  const { mutate: fetchAgentMailEmails, isPending: isFetchingAgentMail } = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/agentmail/process-emails', {
        method: 'POST',
        credentials: 'include'
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || 'Failed to fetch AgentMail emails');
      }
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/orders'] });
      queryClient.invalidateQueries({ queryKey: ['/api/agentmail/sync-status'] });
      toast({
        title: "AgentMail emails processed",
        description: `Processed ${data.processed} emails, matched ${data.matched} packing slips to orders.`
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to fetch AgentMail emails",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  const { mutate: resetImportMutation } = useMutation({
    mutationFn: async (projectId: string | number) => {
      setResettingImportId(projectId);
      const isOrphan = typeof projectId === 'string' && String(projectId).startsWith('orphan-');
      if (isOrphan) {
        const processedTaskId = String(projectId).replace('orphan-', '');
        return apiRequest('POST', `/api/asana-import/reset-orphan/${processedTaskId}`, {});
      }
      return apiRequest('POST', `/api/asana-import/reset/${projectId}`, {});
    },
    onSuccess: () => {
      toast({ title: "Import reset", description: "The task tracking has been cleared and it will be re-imported on the next cycle." });
      queryClient.invalidateQueries({ queryKey: ['/api/orders'] });
      queryClient.invalidateQueries({ queryKey: ['/api/asana-import/status'] });
      queryClient.invalidateQueries({ queryKey: ['/api/asana-import/projects'] });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to reset import", description: error.message, variant: "destructive" });
    },
    onSettled: () => {
      setResettingImportId(null);
    }
  });

  const filteredProjects = projects?.filter(project => {
    // Apply search filter
    const term = search.toLowerCase();
    const matchesSearch = (
      project.name?.toLowerCase().includes(term) ||
      project.dealer?.toLowerCase().includes(term)
    );
    if (!matchesSearch) return false;
    
    // Apply status filter based on Asana section
    switch (statusFilter) {
      case "in_production":
        return project.asanaSection && IN_PRODUCTION_SECTIONS.includes(project.asanaSection.toUpperCase());
      case "shipped":
        return project.asanaSection?.toUpperCase() === 'SHIPPED';
      case "pending":
        return project.status === 'pending';
      case "synced":
        return project.status === 'synced';
      case "all":
      default:
        return true;
    }
  }) || [];

  return (
    <div className="min-h-screen bg-slate-50/50 pb-20">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-10">
        
        <div className="flex items-center justify-between mb-4 gap-2">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            {user && (
              <>
                <Avatar className="h-8 w-8 sm:h-9 sm:w-9 shrink-0">
                  <AvatarImage src={user.profileImageUrl || undefined} alt={user.firstName || "User"} />
                  <AvatarFallback className="bg-primary/10 text-primary text-xs sm:text-sm">
                    {user.firstName?.[0] || user.email?.[0] || "U"}
                  </AvatarFallback>
                </Avatar>
                <span className="text-xs sm:text-sm text-muted-foreground truncate">
                  Welcome, <span className="font-medium text-slate-700">{user.firstName || user.email}</span>
                </span>
              </>
            )}
          </div>
          <a href="/api/logout">
            <Button variant="outline" size="sm" data-testid="button-logout" className="gap-1 sm:gap-2 shrink-0">
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Log Out</span>
            </Button>
          </a>
        </div>
        
        <PageHeader 
          title="Perfect Fit Jobs" 
          description="Manage and sync your closet order projects."
          actions={
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    size="sm" 
                    variant="outline"
                    className="gap-2 rounded-xl" 
                    onClick={() => triggerAsanaImport()}
                    disabled={isImportingAsana}
                    data-testid="button-asana-import"
                  >
                    {isImportingAsana ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Download className="w-4 h-4" />
                    )}
                    <span className="hidden sm:inline">Import from Asana</span>
                    <span className="sm:hidden">Import</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <div className="text-sm">
                    {asanaImportStatus?.status?.lastSuccessAt ? (
                      <>
                        <p>Last import: {format(new Date(asanaImportStatus.status.lastSuccessAt), 'MMM d, h:mm a')}</p>
                        <p className="text-muted-foreground">Imported {asanaImportStatus.status.tasksImported} orders total</p>
                        <p className="text-muted-foreground">Auto-imports every 10 min</p>
                      </>
                    ) : (
                      <p>Auto-imports from Asana every 10 minutes</p>
                    )}
                  </div>
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    size="sm" 
                    variant="outline"
                    className="gap-2 rounded-xl" 
                    onClick={() => fetchOutlookEmails()}
                    disabled={isFetchingEmails}
                    data-testid="button-fetch-outlook-emails"
                  >
                    {isFetchingEmails ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Mail className="w-4 h-4" />
                    )}
                    <span className="hidden sm:inline">Fetch Netley Emails</span>
                    <span className="sm:hidden">Emails</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <div className="text-sm">
                    {outlookSyncStatus?.status?.lastSuccessAt ? (
                      <>
                        <p>Last sync: {format(new Date(outlookSyncStatus.status.lastSuccessAt), 'MMM d, h:mm a')}</p>
                        <p className="text-muted-foreground">Auto-syncs every 30 min</p>
                      </>
                    ) : (
                      <p>Auto-syncs every 30 minutes</p>
                    )}
                  </div>
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-2 rounded-xl"
                    onClick={() => fetchAgentMailEmails()}
                    disabled={isFetchingAgentMail}
                    data-testid="button-fetch-agentmail-emails"
                  >
                    {isFetchingAgentMail ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Mail className="w-4 h-4" />
                    )}
                    <span className="hidden sm:inline">Fetch AgentMail</span>
                    <span className="sm:hidden">AgentMail</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <div className="text-sm">
                    {agentmailSyncStatus?.status?.lastSuccessAt ? (
                      <>
                        <p>Last sync: {format(new Date(agentmailSyncStatus.status.lastSuccessAt), 'MMM d, h:mm a')}</p>
                        <p className="text-muted-foreground">Auto-syncs every 30 min</p>
                      </>
                    ) : (
                      <p>Auto-syncs every 30 minutes</p>
                    )}
                  </div>
                </TooltipContent>
              </Tooltip>
              <Link href="/how-it-works">
                <Button size="sm" variant="outline" className="gap-2 rounded-xl" data-testid="button-how-it-works">
                  <HelpCircle className="w-4 h-4" />
                  <span className="hidden sm:inline">How It Works</span>
                  <span className="sm:hidden">Help</span>
                </Button>
              </Link>
              <Link href="/products">
                <Button size="sm" variant="outline" className="gap-2 rounded-xl" data-testid="button-products">
                  <Package className="w-4 h-4" />
                  Products
                </Button>
              </Link>
              <Link href="/admin/color-grid">
                <Button size="sm" variant="outline" className="gap-2 rounded-xl" data-testid="button-color-grid">
                  <Palette className="w-4 h-4" />
                  <span className="hidden sm:inline">Colors</span>
                </Button>
              </Link>
              <PrinterSettings />
              <Button 
                size="sm" 
                variant="outline" 
                className="gap-2 rounded-xl" 
                data-testid="button-backup-sheets"
                onClick={() => backupToSheets()}
                disabled={isBackingUp}
              >
                {isBackingUp ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Database className="w-4 h-4" />
                )}
                <span className="hidden sm:inline">{isBackingUp ? 'Backing up...' : 'Backup'}</span>
              </Button>
              <Link href="/admin/users">
                <Button size="sm" variant="outline" className="gap-2 rounded-xl" data-testid="button-admin-users">
                  <Shield className="w-4 h-4" />
                  <span className="hidden sm:inline">Users</span>
                </Button>
              </Link>
              <Link href="/upload">
                <Button size="sm" className="btn-primary gap-2 rounded-xl" data-testid="button-upload-new">
                  <Plus className="w-4 h-4" />
                  <span className="hidden sm:inline">Upload New</span>
                  <span className="sm:hidden">Upload</span>
                </Button>
              </Link>
            </div>
          }
        />

        {/* Stats Section */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 sm:gap-6 mb-6 sm:mb-10">
          {[
            { label: "Total Projects", value: projects?.length || 0, color: "text-blue-600", bg: "bg-blue-50" },
            { label: "In Production", value: projects?.filter(p => p.asanaSection && IN_PRODUCTION_SECTIONS.includes(p.asanaSection.toUpperCase())).length || 0, color: "text-purple-600", bg: "bg-purple-50" },
            { label: "Shipped", value: projects?.filter(p => p.asanaSection?.toUpperCase() === 'SHIPPED').length || 0, color: "text-teal-600", bg: "bg-teal-50" },
            { label: "Pending Sync", value: projects?.filter(p => p.status === 'pending').length || 0, color: "text-amber-600", bg: "bg-amber-50" },
            { label: "Synced to Asana", value: projects?.filter(p => p.status === 'synced').length || 0, color: "text-green-600", bg: "bg-green-50" },
          ].map((stat, i) => (
            <Card key={i} className="border-none shadow-sm shadow-slate-100 hover:shadow-md transition-shadow">
              <CardContent className="p-3 sm:p-6 flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs sm:text-sm font-medium text-muted-foreground">{stat.label}</p>
                  <p className="text-xl sm:text-3xl font-bold mt-1 text-slate-800">{isLoading ? "-" : stat.value}</p>
                </div>
                <div className={`w-8 h-8 sm:w-12 sm:h-12 rounded-full ${stat.bg} ${stat.color} flex items-center justify-center shrink-0`}>
                  <FolderOpen className="w-4 h-4 sm:w-6 sm:h-6 opacity-80" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Filter Buttons */}
        <div className="flex flex-wrap gap-1.5 sm:gap-2 mb-4">
          <Button
            variant={statusFilter === "all" ? "default" : "outline"}
            size="sm"
            onClick={() => setStatusFilter("all")}
            className="rounded-lg"
            data-testid="filter-all"
          >
            All ({projects?.length || 0})
          </Button>
          <Button
            variant={statusFilter === "in_production" ? "default" : "outline"}
            size="sm"
            onClick={() => setStatusFilter("in_production")}
            className="rounded-lg"
            data-testid="filter-in-production"
          >
            <span className="hidden sm:inline">In Production</span>
            <span className="sm:hidden">Prod</span>
            {" "}({projects?.filter(p => p.asanaSection && IN_PRODUCTION_SECTIONS.includes(p.asanaSection.toUpperCase())).length || 0})
          </Button>
          <Button
            variant={statusFilter === "shipped" ? "default" : "outline"}
            size="sm"
            onClick={() => setStatusFilter("shipped")}
            className="rounded-lg"
            data-testid="filter-shipped"
          >
            Shipped ({projects?.filter(p => p.asanaSection?.toUpperCase() === 'SHIPPED').length || 0})
          </Button>
          <Button
            variant={statusFilter === "pending" ? "default" : "outline"}
            size="sm"
            onClick={() => setStatusFilter("pending")}
            className="rounded-lg"
            data-testid="filter-pending"
          >
            Pending ({projects?.filter(p => p.status === 'pending').length || 0})
          </Button>
          <Button
            variant={statusFilter === "synced" ? "default" : "outline"}
            size="sm"
            onClick={() => setStatusFilter("synced")}
            className="rounded-lg"
            data-testid="filter-synced"
          >
            Synced ({projects?.filter(p => p.status === 'synced').length || 0})
          </Button>
        </div>

        {/* Search Bar */}
        <div className="relative mb-4 sm:mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input 
            className="pl-10 rounded-xl border-slate-200 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all"
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
              <div key={project.id} className="bg-white rounded-xl p-3 sm:p-5 border border-slate-100 shadow-sm hover:shadow-md hover:border-primary/20 transition-all duration-200 relative overflow-hidden group">
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-transparent group-hover:bg-primary transition-colors" />
                
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-4">
                  <Link href={`/orders/${project.id}`} className="flex items-start gap-3 sm:gap-4 flex-1">
                    <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg bg-slate-50 flex items-center justify-center border border-slate-100 shrink-0 group-hover:bg-primary/5 group-hover:text-primary transition-colors">
                      <FolderOpen className="w-5 h-5 sm:w-6 sm:h-6 text-slate-400 group-hover:text-primary transition-colors" />
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-sm sm:text-lg text-slate-800 group-hover:text-primary transition-colors truncate">
                        <span className="text-muted-foreground font-medium hidden sm:inline">Project Name:</span> {project.name}
                      </h3>
                      <div className="flex flex-wrap items-center gap-x-3 sm:gap-x-6 gap-y-1 sm:gap-y-2 mt-1 text-xs sm:text-sm text-muted-foreground">
                        <span>Dealer: <span className="font-medium text-slate-700">{project.dealer || "N/A"}</span></span>
                        <span className="hidden sm:inline">Date: {project.createdAt ? format(new Date(project.createdAt), 'PPP') : 'N/A'}</span>
                      </div>
                      
                      {/* CSV File Names */}
                      {(project as any).fileNames && (project as any).fileNames.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {(project as any).fileNames.map((fileName: string, idx: number) => (
                            <Badge 
                              key={idx}
                              variant="secondary"
                              className="text-xs"
                              data-testid={`text-filename-${project.id}-${idx}`}
                            >
                              {fileName.replace(/\.csv$/i, '')}
                            </Badge>
                          ))}
                        </div>
                      )}
                      
                      {/* PF Production Section Status */}
                      {project.asanaSection && (
                        <div className="mt-1.5 sm:mt-2 flex flex-wrap gap-1 sm:gap-2">
                          <Badge 
                            variant="outline" 
                            className="bg-blue-50 text-blue-700 border-blue-200 text-xs sm:text-sm font-medium"
                            data-testid="badge-production-section"
                          >
                            {project.asanaSection}
                          </Badge>
                          {/* Production Status Badge - derived from section */}
                          {IN_PRODUCTION_SECTIONS.includes(project.asanaSection.toUpperCase()) && (
                            <Badge 
                              variant="outline" 
                              className="bg-purple-50 text-purple-700 border-purple-200 text-xs sm:text-sm font-semibold"
                              data-testid="badge-in-production"
                            >
                              IN PRODUCTION
                            </Badge>
                          )}
                          {project.asanaSection.toUpperCase() === 'SHIPPED' && (
                            <Badge 
                              variant="outline" 
                              className="bg-teal-50 text-teal-700 border-teal-200 text-xs sm:text-sm font-semibold"
                              data-testid="badge-shipped"
                            >
                              SHIPPED
                            </Badge>
                          )}
                        </div>
                      )}
                      
                      {/* Status Badges */}
                      <div className="flex flex-wrap gap-1 sm:gap-1.5 mt-1.5 sm:mt-2">
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
                    <div className="flex items-center gap-2 flex-wrap">
                      {(project as any).autoImported && (
                        <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-200 text-xs" data-testid={`badge-auto-imported-${project.id}`}>
                          Auto-imported
                        </Badge>
                      )}
                      <StatusBadge status={project.status as any} />
                    </div>
                    
                    <div className="flex items-center gap-2">
                      {isAdmin && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="icon" variant="ghost" className="text-muted-foreground hover:text-destructive hover:bg-destructive/10" data-testid={`button-delete-project-${project.id}`}>
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
                      )}

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

        {/* Auto-Imported Orders Management - Admin Only */}
        {isAdmin && (
          <div className="mt-10">
            <Collapsible open={importManageOpen} onOpenChange={setImportManageOpen}>
              <CollapsibleTrigger asChild>
                <Button 
                  variant="ghost" 
                  className="w-full justify-between text-muted-foreground"
                  data-testid="button-toggle-import-management"
                >
                  <div className="flex items-center gap-2">
                    <Download className="w-4 h-4" />
                    <span className="text-sm">Manage Auto-Imported Orders ({autoImportedProjects.length})</span>
                  </div>
                  {importManageOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <Card className="mt-2">
                  <CardContent className="p-4">
                    <p className="text-sm text-muted-foreground mb-4" data-testid="text-import-management-description">
                      These orders were automatically imported from the Asana "READY TO IMPORT" section. Resetting an import will delete the order and allow it to be re-imported on the next cycle.
                    </p>
                    {autoImportedProjects.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4" data-testid="text-no-auto-imports">
                        No auto-imported orders found.
                      </p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm border-collapse" data-testid="table-auto-imports">
                          <thead>
                            <tr className="border-b bg-muted/50">
                              <th className="text-left p-2">Order Name</th>
                              <th className="text-left p-2">Dealer</th>
                              <th className="text-left p-2">Imported</th>
                              <th className="text-left p-2">Status</th>
                              <th className="text-left p-2">Asana Task</th>
                              <th className="text-right p-2">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {autoImportedProjects.map((project: any) => (
                              <tr key={project.id} className="border-b" data-testid={`row-auto-import-${project.id}`}>
                                <td className="p-2">
                                  {project.orphaned ? (
                                    <span className="font-medium text-muted-foreground">{project.name} (no order created)</span>
                                  ) : (
                                    <Link href={`/orders/${project.id}`} className="font-medium underline">
                                      {project.name}
                                    </Link>
                                  )}
                                </td>
                                <td className="p-2 text-muted-foreground">{project.dealer || "N/A"}</td>
                                <td className="p-2 text-muted-foreground">
                                  {project.createdAt ? format(new Date(project.createdAt), 'MMM d, h:mm a') : 'N/A'}
                                </td>
                                <td className="p-2">
                                  <StatusBadge status={project.status as "pending" | "synced" | "error"} />
                                </td>
                                <td className="p-2">
                                  {project.asanaTaskId ? (
                                    <a
                                      href={`https://app.asana.com/0/0/${project.asanaTaskId}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-blue-600 hover:underline inline-flex items-center gap-1"
                                      data-testid={`link-asana-task-${project.id}`}
                                    >
                                      <ExternalLink className="w-3 h-3" />
                                      View
                                    </a>
                                  ) : (
                                    <span className="text-muted-foreground">-</span>
                                  )}
                                </td>
                                <td className="p-2 text-right">
                                  <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="text-destructive border-destructive/30"
                                        data-testid={`button-reset-import-${project.id}`}
                                      >
                                        {resettingImportId === project.id ? (
                                          <Loader2 className="w-3 h-3 animate-spin mr-1" />
                                        ) : (
                                          <RefreshCw className="w-3 h-3 mr-1" />
                                        )}
                                        Reset
                                      </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                      <AlertDialogHeader>
                                        <AlertDialogTitle>Reset this import?</AlertDialogTitle>
                                        <AlertDialogDescription>
                                          {project.orphaned
                                            ? `This will clear the tracking for "${project.name}" so it can be re-imported on the next cycle.`
                                            : `This will delete the order "${project.name}" and allow its Asana task to be re-imported on the next cycle.`
                                          }
                                        </AlertDialogDescription>
                                      </AlertDialogHeader>
                                      <AlertDialogFooter>
                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                        <AlertDialogAction
                                          onClick={() => resetImportMutation(project.id)}
                                          className="bg-destructive text-destructive-foreground"
                                        >
                                          Reset Import
                                        </AlertDialogAction>
                                      </AlertDialogFooter>
                                    </AlertDialogContent>
                                  </AlertDialog>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </CollapsibleContent>
            </Collapsible>
          </div>
        )}

        {/* Diagnostic Section - for debugging Outlook matching */}
        <div className="mt-10">
          <Collapsible open={diagnosticOpen} onOpenChange={setDiagnosticOpen}>
            <CollapsibleTrigger asChild>
              <Button 
                variant="ghost" 
                className="w-full justify-between text-muted-foreground"
                data-testid="button-toggle-diagnostic"
              >
                <div className="flex items-center gap-2">
                  <Bug className="w-4 h-4" />
                  <span className="text-sm">Diagnostic: Order Matching Debug</span>
                </div>
                {diagnosticOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <Card className="mt-2 border-dashed">
                <CardContent className="p-4">
                  <div className="mb-4">
                    <p className="text-sm text-muted-foreground mb-2" data-testid="text-diagnostic-description">
                      Search for an order by Allmoxy Job # to see if it exists in the database and its packing slip status.
                    </p>
                    <div className="flex flex-wrap gap-2 items-center">
                      <Input
                        placeholder="Enter Allmoxy Job # (e.g., 1865)"
                        value={diagnosticSearch}
                        onChange={(e) => setDiagnosticSearch(e.target.value)}
                        className="max-w-xs"
                        data-testid="input-diagnostic-search"
                      />
                      <Button 
                        variant="outline" 
                        size="icon"
                        onClick={() => refetchDiagnostic()}
                        disabled={isDiagnosticLoading}
                        data-testid="button-diagnostic-search"
                      >
                        {isDiagnosticLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => resetProcessedEmails()}
                        disabled={isResettingEmails}
                        data-testid="button-reset-processed-emails"
                      >
                        {isResettingEmails ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                        Reset Processed Emails
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2" data-testid="text-reset-description">
                      If emails are being skipped as "already processed", click Reset to clear the history and reprocess them.
                    </p>
                  </div>

                  {isDiagnosticLoading ? (
                    <div className="text-sm text-muted-foreground" data-testid="text-diagnostic-loading">Loading...</div>
                  ) : diagnosticData ? (
                    <div>
                      <p className="text-sm font-medium mb-2" data-testid="text-diagnostic-count">
                        Found {diagnosticData.totalFiles} files
                        {diagnosticData.searchQuery && ` matching "${diagnosticData.searchQuery}"`}
                      </p>
                      {diagnosticData.files.length === 0 ? (
                        <p className="text-sm text-amber-600" data-testid="text-diagnostic-no-match">
                          No files found with that Allmoxy Job #. This is why matching fails - the order doesn't exist in the database with this job number.
                        </p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm border-collapse" data-testid="table-diagnostic-results">
                            <thead>
                              <tr className="border-b bg-muted/50">
                                <th className="text-left p-2" data-testid="th-file-id">File ID</th>
                                <th className="text-left p-2" data-testid="th-project">Project</th>
                                <th className="text-left p-2" data-testid="th-filename">Filename</th>
                                <th className="text-left p-2" data-testid="th-allmoxy-job">Allmoxy Job #</th>
                                <th className="text-left p-2" data-testid="th-normalized">Normalized</th>
                                <th className="text-left p-2" data-testid="th-packing-slip">Has Packing Slip</th>
                              </tr>
                            </thead>
                            <tbody>
                              {diagnosticData.files.map((file) => (
                                <tr key={file.fileId} className="border-b" data-testid={`row-file-${file.fileId}`}>
                                  <td className="p-2" data-testid={`text-file-id-${file.fileId}`}>{file.fileId}</td>
                                  <td className="p-2" data-testid={`text-project-${file.fileId}`}>{file.projectName}</td>
                                  <td className="p-2 max-w-[200px] truncate" title={file.originalFilename} data-testid={`text-filename-${file.fileId}`}>
                                    {file.originalFilename}
                                  </td>
                                  <td className="p-2 font-mono" data-testid={`text-allmoxy-job-${file.fileId}`}>
                                    {file.allmoxyJobNumber || <span className="text-muted-foreground italic">empty</span>}
                                  </td>
                                  <td className="p-2 font-mono text-muted-foreground" data-testid={`text-normalized-${file.fileId}`}>
                                    {file.allmoxyJobNumberNormalized || '-'}
                                  </td>
                                  <td className="p-2" data-testid={`badge-packing-slip-${file.fileId}`}>
                                    {file.hasPackingSlip ? (
                                      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Yes</Badge>
                                    ) : (
                                      <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">No</Badge>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground" data-testid="text-diagnostic-empty">
                      Open this section to view all order files with their Allmoxy Job # and packing slip status.
                    </p>
                  )}
                </CardContent>
              </Card>
            </CollapsibleContent>
          </Collapsible>
        </div>
      </div>
    </div>
  );
}
