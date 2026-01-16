import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";

import Dashboard from "@/pages/Dashboard";
import UploadOrder from "@/pages/UploadOrder";
import OrderDetails from "@/pages/OrderDetails";
import CutToSize from "@/pages/CutToSize";
import PackingChecklist from "@/pages/PackingChecklist";
import NotFound from "@/pages/not-found";
import Landing from "@/pages/Landing";

function AppRouter() {
  const { isLoading, isAuthenticated } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Landing />;
  }

  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/upload" component={UploadOrder} />
      <Route path="/orders/:id" component={OrderDetails} />
      <Route path="/files/:fileId/cts" component={CutToSize} />
      <Route path="/files/:fileId/checklist" component={PackingChecklist} />
      <Route component={NotFound} />
    </Switch>
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
