import { Link } from "wouter";
import { useOrders } from "@/hooks/use-orders";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, ArrowRight, FileText, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";

export default function Dashboard() {
  const { data: orders, isLoading } = useOrders();
  const [search, setSearch] = useState("");

  const filteredOrders = orders?.filter(order => {
    const term = search.toLowerCase();
    return (
      order.originalFilename.toLowerCase().includes(term) ||
      order.dealer?.toLowerCase().includes(term) ||
      order.poNumber?.toLowerCase().includes(term)
    );
  }) || [];

  return (
    <div className="min-h-screen bg-slate-50/50 pb-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        
        <PageHeader 
          title="Order Dashboard" 
          description="Manage and sync your closet orders."
          actions={
            <Link href="/upload">
              <Button size="lg" className="btn-primary gap-2 rounded-xl text-md h-12 px-6">
                <Plus className="w-5 h-5" />
                Upload New Order
              </Button>
            </Link>
          }
        />

        {/* Stats Section */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
          {[
            { label: "Total Orders", value: orders?.length || 0, color: "text-blue-600", bg: "bg-blue-50" },
            { label: "Pending Sync", value: orders?.filter(o => o.status === 'pending').length || 0, color: "text-amber-600", bg: "bg-amber-50" },
            { label: "Synced to Asana", value: orders?.filter(o => o.status === 'synced').length || 0, color: "text-green-600", bg: "bg-green-50" },
          ].map((stat, i) => (
            <Card key={i} className="border-none shadow-sm shadow-slate-100 hover:shadow-md transition-shadow">
              <CardContent className="p-6 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">{stat.label}</p>
                  <p className="text-3xl font-bold mt-1 text-slate-800">{isLoading ? "-" : stat.value}</p>
                </div>
                <div className={`w-12 h-12 rounded-full ${stat.bg} ${stat.color} flex items-center justify-center`}>
                  <FileText className="w-6 h-6 opacity-80" />
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
            placeholder="Search by filename, dealer, or PO number..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Orders List */}
        <div className="space-y-4">
          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-24 rounded-xl bg-white border border-slate-100 shadow-sm animate-pulse" />
            ))
          ) : filteredOrders.length === 0 ? (
            <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-slate-200">
              <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <FileText className="w-8 h-8 text-slate-400" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900">No orders found</h3>
              <p className="text-muted-foreground mt-1">
                {search ? "Try adjusting your search terms" : "Upload your first CSV order to get started"}
              </p>
              {!search && (
                <Link href="/upload">
                  <Button variant="outline" className="mt-4">Upload Order</Button>
                </Link>
              )}
            </div>
          ) : (
            filteredOrders.map((order) => (
              <Link key={order.id} href={`/orders/${order.id}`} className="block group">
                <div className="bg-white rounded-xl p-5 border border-slate-100 shadow-sm hover:shadow-md hover:border-primary/20 transition-all duration-200 relative overflow-hidden">
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-transparent group-hover:bg-primary transition-colors" />
                  
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-lg bg-slate-50 flex items-center justify-center border border-slate-100 shrink-0 group-hover:bg-primary/5 group-hover:text-primary transition-colors">
                        <FileText className="w-6 h-6 text-slate-400 group-hover:text-primary transition-colors" />
                      </div>
                      
                      <div>
                        <h3 className="font-semibold text-lg text-slate-800 group-hover:text-primary transition-colors">
                          {order.dealer || "Unknown Dealer"}
                          <span className="text-muted-foreground font-normal text-sm ml-2">
                            ({order.originalFilename})
                          </span>
                        </h3>
                        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mt-1 text-sm text-muted-foreground">
                          <span>PO: <span className="font-medium text-slate-700">{order.poNumber || "N/A"}</span></span>
                          <span>Date: {order.createdAt ? format(new Date(order.createdAt), 'PPP') : 'N/A'}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between md:justify-end gap-6 w-full md:w-auto">
                      <StatusBadge status={order.status as any} />
                      <div className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 group-hover:translate-x-1 group-hover:text-primary transition-all">
                        <ArrowRight className="w-5 h-5" />
                      </div>
                    </div>
                  </div>
                </div>
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
