import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { 
  ShoppingCart, 
  Package, 
  Grid3X3, 
  Code, 
  Settings, 
  User, 
  LogOut,
  ChevronRight,
  FlaskConical,
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
    ]
  },
  {
    section: "SYSTEM ADMINISTRATION",
    items: [
      { name: "Products", href: "/admin/allmoxy-products", icon: Package },
      { name: "Attribute Grids", href: "/admin/attribute-grids", icon: Grid3X3 },
      { name: "Proxy Variables", href: "/admin/proxy-variables", icon: Code },
      { name: "Formula Tester", href: "/admin/formula-tester", icon: FlaskConical },
      { name: "Settings", href: "/admin/color-grid", icon: Settings },
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
      <aside className="w-64 border-r bg-card hidden md:flex flex-col">
        <div className="p-6">
          <h1 className="text-xl font-bold tracking-tight text-primary">Order Manager</h1>
        </div>
        
        <nav className="flex-1 overflow-y-auto px-4 space-y-8">
          {navItems.map((group) => (
            <div key={group.section} className="space-y-2">
              <h2 className="text-xs font-semibold text-muted-foreground tracking-wider px-2">
                {group.section}
              </h2>
              <div className="space-y-1">
                {group.items.map((item) => {
                  const isActive = location === item.href;
                  return (
                    <Link key={item.href} href={item.href}>
                      <a className={cn(
                        "flex items-center gap-3 px-3 py-2 rounded-md transition-colors group",
                        isActive 
                          ? "bg-primary text-primary-foreground" 
                          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                      )}>
                        <item.icon className="h-4 w-4" />
                        <span className="text-sm font-medium">{item.name}</span>
                        {isActive && <ChevronRight className="ml-auto h-4 w-4" />}
                      </a>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="p-4 border-t mt-auto">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="w-full justify-start gap-3 px-2 h-12 rounded-xl">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-primary/10 text-primary">
                    {user?.username?.[0]?.toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-col items-start overflow-hidden">
                  <span className="text-sm font-medium truncate w-full">{user?.username}</span>
                  <span className="text-xs text-muted-foreground">Admin</span>
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
      <main className="flex-1 flex flex-col min-w-0 bg-slate-50 dark:bg-slate-950 overflow-hidden">
        {/* Header */}
        <header className="h-16 border-b bg-background flex items-center justify-between px-8 sticky top-0 z-10 shadow-sm">
          <h2 className="text-lg font-semibold tracking-tight">{getPageTitle()}</h2>
          <div className="flex items-center gap-4">
            <div className="hidden sm:flex flex-col items-end mr-2">
              <span className="text-sm font-medium">{user?.username}</span>
              <span className="text-xs text-muted-foreground capitalize">Administrator</span>
            </div>
            <Avatar className="h-9 w-9 border-2 border-primary/20">
              <AvatarFallback className="bg-primary/5 text-primary">
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
