import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FileUp, ClipboardList, Zap } from "lucide-react";

export default function Landing() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex flex-col">
      <header className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
              <ClipboardList className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-semibold text-slate-800">Perfect Fit Orders</span>
          </div>
          <a href="/api/login">
            <Button data-testid="button-login" className="rounded-xl">Log In</Button>
          </a>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-4 py-16">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <h1 className="text-4xl sm:text-5xl font-bold text-slate-800 mb-4 font-serif">
            Closet Order Management
          </h1>
          <p className="text-lg text-muted-foreground mb-8">
            Upload CSV files, extract order details, and sync to Asana automatically. 
            Streamline your Perfect Fit production workflow.
          </p>
          <a href="/api/login">
            <Button size="lg" data-testid="button-get-started" className="rounded-xl h-14 px-8 text-lg gap-2">
              Get Started
            </Button>
          </a>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl w-full">
          {[
            {
              icon: FileUp,
              title: "Upload CSVs",
              description: "Upload multiple CSV files and automatically extract order details and metadata."
            },
            {
              icon: ClipboardList,
              title: "Review Orders",
              description: "View parts, dovetails, assembled drawers, and weight calculations at a glance."
            },
            {
              icon: Zap,
              title: "Sync to Asana",
              description: "One-click sync to create tasks in Asana with all order details and custom fields."
            }
          ].map((feature, i) => (
            <Card key={i} className="border-none shadow-sm hover-elevate">
              <CardContent className="p-6 text-center">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                  <feature.icon className="w-6 h-6 text-primary" />
                </div>
                <h3 className="font-semibold text-slate-800 mb-2">{feature.title}</h3>
                <p className="text-sm text-muted-foreground">{feature.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </main>

      <footer className="border-t py-6 text-center text-sm text-muted-foreground">
        Perfect Fit Orders Management System
      </footer>
    </div>
  );
}
