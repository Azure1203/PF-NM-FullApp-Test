import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { 
  ShoppingCart, 
  Package, 
  Grid3X3, 
  Code, 
  LogOut,
  FlaskConical,
  ClipboardList,
  Users,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

interface AppLayoutProps {
  children: React.ReactNode;
}

const navItems = [
  {
    section: "DAILY OPERATIONS",
    items: [
      { name: "Order Processing", href: "/", icon: ShoppingCart },
      { name: "All Orders", href: "/orders", icon: ClipboardList },
    ]
  },
  {
    section: "SYSTEM ADMINISTRATION",
    items: [
      { name: "Products", href: "/admin/allmoxy-products", icon: Package },
      { name: "Attribute Grids", href: "/admin/attribute-grids", icon: Grid3X3 },
      { name: "Proxy Variables", href: "/admin/proxy-variables", icon: Code },
      { name: "Formula Tester", href: "/admin/formula-tester", icon: FlaskConical },
      { name: "Settings", href: "/admin/settings", icon: Settings },
      { name: "Users", href: "/admin/users", icon: Users },
    ]
  }
];

export default function AppLayout({ children }: AppLayoutProps) {
  const [location] = useLocation();
  const { user, logoutMutation } = useAuth();

  const getPageTitle = () => {
    for (const group of navItems) {
      const item = group.items.find(i => i.href === location);
      if (item) return item.name;
    }
    if (location.startsWith("/orders/")) return "Order Details";
    return "Dashboard";
  };

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 hidden md:flex flex-col bg-[#2E2E2E] border-r border-[#807161]/20">
        <div className="px-6 py-5 border-b border-[#CDAB4A]/20">
          <p className="text-[10px] font-semibold tracking-[0.2em] uppercase text-[#807161] mb-0.5">Netley Millwork</p>
          <h1 className="text-base font-bold tracking-tight text-[#F7F4F2]">Order Manager</h1>
        </div>
        
        <nav className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
          {navItems.map((group) => (
            <div key={group.section} className="space-y-1">
              <h2 className="text-[10px] font-semibold tracking-[0.15em] uppercase px-2 text-[#807161] mb-2">
                {group.section}
              </h2>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const isActive = location === item.href;
                  return (
                    <Link key={item.href} href={item.href}>
                      <a className={cn(
                        "flex items-center gap-3 px-3 py-2 rounded-md transition-colors text-sm font-medium",
                        isActive
                          ? "bg-[#CDAB4A]/15 text-[#CDAB4A]"
                          : "text-[#F7F4F2]/70 hover:bg-[#F7F4F2]/8 hover:text-[#F7F4F2]"
                      )}>
                        <item.icon className={cn(
                          "h-4 w-4 shrink-0",
                          isActive ? "text-[#CDAB4A]" : "text-[#F7F4F2]/50"
                        )} />
                        <span>{item.name}</span>
                        {isActive && <div className="ml-auto h-1.5 w-1.5 rounded-full bg-[#CDAB4A]" />}
                      </a>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="p-4 mt-auto border-t border-[#CDAB4A]/20">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="w-full justify-start gap-3 px-2 h-12 rounded-xl hover:bg-[#F7F4F2]/8">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-[#CDAB4A]/20 text-[#CDAB4A]">
                    {user?.username?.[0]?.toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-col items-start overflow-hidden">
                  <span className="text-sm font-medium truncate w-full text-[#F7F4F2]">{user?.username}</span>
                  <span className="text-xs text-[#807161]">Admin</span>
                </div>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onClick={() => logoutMutation.mutate()}>
                <LogOut className="mr-2 h-4 w-4" />
                <span>Log out</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 bg-background overflow-hidden">
        {/* Header */}
        <header className="h-14 border-b border-border bg-background flex items-center justify-between px-8 sticky top-0 z-10">
          <h2 className="text-sm font-semibold tracking-tight text-foreground">{getPageTitle()}</h2>
          <div className="flex items-center gap-4">
            <div className="hidden sm:flex flex-col items-end mr-2">
              <span className="text-sm font-medium">{user?.username}</span>
              <span className="text-xs text-muted-foreground capitalize">Administrator</span>
            </div>
            <Avatar className="h-9 w-9 border-2 border-primary/20">
              <AvatarFallback className="bg-primary/15 text-primary">
                {user?.username?.[0]?.toUpperCase()}
              </AvatarFallback>
            </Avatar>
          </div>
        </header>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-8 relative">
          <div className="max-w-7xl mx-auto h-full">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
