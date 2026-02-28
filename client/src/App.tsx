import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";
import { Loader2, ShieldX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import Dashboard from "@/pages/Dashboard";
import OrderProcessingDashboard from "@/pages/daily/OrderProcessingDashboard";
import UploadOrder from "@/pages/UploadOrder";
import OrderDetails from "@/pages/OrderDetails";
import CutToSize from "@/pages/CutToSize";
import PackingChecklist from "@/pages/PackingChecklist";
import HardwareChecklist from "@/pages/HardwareChecklist";
import Products from "@/pages/Products";
import HardwareImport from "@/pages/HardwareImport";
import ComponentImport from "@/pages/ComponentImport";
import AdminUsers from "@/pages/AdminUsers";
import ColorGrid from "@/pages/ColorGrid";
import HowItWorks from "@/pages/HowItWorks";
import DynamicGridManager from "@/pages/admin/DynamicGridManager";
import ProxyVariableManager from "@/pages/admin/ProxyVariableManager";
import AllmoxyProductManager from "@/pages/admin/AllmoxyProductManager";
import NotFound from "@/pages/not-found";
import Landing from "@/pages/Landing";
import AppLayout from "@/components/AppLayout";

function AccessDenied({ onLogout }: { onLogout: () => void }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <div className="mx-auto w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
            <ShieldX className="w-8 h-8 text-destructive" />
          </div>
          <CardTitle className="text-2xl">Access Denied</CardTitle>
        </CardHeader>
        <CardContent className="text-center space-y-4">
          <p className="text-muted-foreground">
            Your account is not on the allowed users list. Please contact an administrator to request access.
          </p>
          <Button onClick={onLogout} variant="outline" className="w-full" data-testid="button-logout-denied">
            Sign Out
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function AppRouter() {
  const { isLoading, isAuthenticated, isNotAllowed, logout } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isNotAllowed) {
    return <AccessDenied onLogout={logout} />;
  }

  if (!isAuthenticated) {
    return <Landing />;
  }

  return (
    <AppLayout>
      <Switch>
        <Route path="/" component={OrderProcessingDashboard} />
        <Route path="/orders" component={Dashboard} />
        <Route path="/upload" component={UploadOrder} />
        <Route path="/products" component={Products} />
        <Route path="/products/import" component={HardwareImport} />
        <Route path="/products/import-components" component={ComponentImport} />
        <Route path="/admin/users" component={AdminUsers} />
        <Route path="/admin/color-grid" component={ColorGrid} />
        <Route path="/admin/attribute-grids" component={DynamicGridManager} />
        <Route path="/admin/proxy-variables" component={ProxyVariableManager} />
        <Route path="/admin/allmoxy-products" component={AllmoxyProductManager} />
        <Route path="/how-it-works" component={HowItWorks} />
        <Route path="/orders/:id" component={OrderDetails} />
        <Route path="/files/:fileId/cts" component={CutToSize} />
        <Route path="/files/:fileId/checklist" component={PackingChecklist} />
        <Route path="/files/:fileId/hardware-checklist" component={HardwareChecklist} />
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AppRouter />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
