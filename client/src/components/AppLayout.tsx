import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import {
  ClipboardList,
  Package,
  Grid3X3,
  Code,
  LogOut,
  FlaskConical,
  ImagePlus,
  Zap,
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
    section: "OPERATIONS",
    items: [
      { name: "Orders", href: "/orders", icon: ClipboardList },
    ],
  },
  {
    section: "ADMINISTRATION",
    items: [
      { name: "Products", href: "/admin/allmoxy-products", icon: Package },
      { name: "Product Images", href: "/admin/product-images", icon: ImagePlus },
      { name: "Attribute Grids", href: "/admin/attribute-grids", icon: Grid3X3 },
      { name: "Proxy Variables", href: "/admin/proxy-variables", icon: Code },
      { name: "Formula Tester", href: "/admin/formula-tester", icon: FlaskConical },
      { name: "Pricing Diagnostic", href: "/admin/diagnostic", icon: Zap },
      { name: "Settings", href: "/admin/settings", icon: Settings },
    ],
  },
];

export default function AppLayout({ children }: AppLayoutProps) {
  const [location] = useLocation();
  const { user, logoutMutation } = useAuth();

  const isOrderDetail = location.startsWith("/orders/");

  const isActive = (href: string) => {
    if (href === "/orders") return location === "/orders" || location === "/";
    return location === href || location.startsWith(href + "/");
  };

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Sidebar */}
      <aside className="w-56 hidden md:flex flex-col bg-[#2E2E2E] border-r border-[#807161]/20 shrink-0">
        <div className="px-5 py-4 border-b border-[#CDAB4A]/20">
          <p className="text-[10px] font-semibold tracking-[0.2em] uppercase text-[#807161] mb-0.5">Netley Millwork</p>
          <h1 className="text-sm font-bold tracking-tight text-[#F7F4F2]">Order Manager</h1>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
          {navItems.map((group) => (
            <div key={group.section} className="space-y-0.5">
              <h2 className="text-[9px] font-semibold tracking-[0.15em] uppercase px-2 text-[#807161] mb-1.5">
                {group.section}
              </h2>
              {group.items.map((item) => {
                const active = isActive(item.href);
                return (
                  <Link key={item.href} href={item.href}>
                    <a className={cn(
                      "flex items-center gap-2.5 px-2.5 py-2 rounded-md transition-colors text-sm font-medium",
                      active
                        ? "bg-[#CDAB4A]/15 text-[#CDAB4A]"
                        : "text-[#F7F4F2]/70 hover:bg-[#F7F4F2]/8 hover:text-[#F7F4F2]"
                    )}>
                      <item.icon className={cn(
                        "h-4 w-4 shrink-0",
                        active ? "text-[#CDAB4A]" : "text-[#F7F4F2]/50"
                      )} />
                      <span className="truncate">{item.name}</span>
                      {active && <div className="ml-auto h-1.5 w-1.5 rounded-full bg-[#CDAB4A] shrink-0" />}
                    </a>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="p-3 mt-auto border-t border-[#CDAB4A]/20">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="w-full justify-start gap-2.5 px-2 h-10 rounded-lg hover:bg-[#F7F4F2]/8">
                <Avatar className="h-7 w-7">
                  <AvatarFallback className="bg-[#CDAB4A]/20 text-[#CDAB4A] text-xs">
                    {user?.username?.[0]?.toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-col items-start overflow-hidden">
                  <span className="text-xs font-medium truncate w-full text-[#F7F4F2]">{user?.username}</span>
                  <span className="text-[10px] text-[#807161]">Admin</span>
                </div>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={() => logoutMutation.mutate()}>
                <LogOut className="mr-2 h-4 w-4" />
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden bg-background">
        {/* Top Header — hidden on order detail pages */}
        {!isOrderDetail && (
          <header className="h-12 border-b border-border bg-background flex items-center justify-between px-6 shrink-0">
            <PageTitle location={location} />
            <Avatar className="h-8 w-8 border-2 border-primary/20">
              <AvatarFallback className="bg-primary/15 text-primary text-xs">
                {user?.username?.[0]?.toUpperCase()}
              </AvatarFallback>
            </Avatar>
          </header>
        )}

        {/* Content Area */}
        {isOrderDetail ? (
          <div className="flex-1 flex flex-col min-h-0">
            {children}
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-7xl mx-auto min-h-full p-6">
              {children}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function PageTitle({ location }: { location: string }) {
  const allItems = navItems.flatMap(g => g.items);
  const matched = allItems.find(i => location === i.href || (i.href !== "/orders" && location.startsWith(i.href)));
  if (matched) return <h2 className="text-sm font-semibold">{matched.name}</h2>;
  if (location === "/" || location === "/orders") return <h2 className="text-sm font-semibold">Orders</h2>;
  return <h2 className="text-sm font-semibold">Dashboard</h2>;
}
