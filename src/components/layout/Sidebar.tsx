"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, Settings, BookOpen, Library, X, BarChart2, TrendingUp, Layers, SearchCode, Award, Activity, ChevronsLeft, ChevronsRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

const navItems = [
  { href: "/", label: "Offices", icon: Building2 },
  { href: "/analytics", label: "Analytics", icon: BarChart2 },
  { href: "/utilization", label: "Chair Utilization", icon: Activity },
  { href: "/rollup", label: "Production Rollup", icon: TrendingUp },
  { href: "/audit", label: "Block Audit", icon: SearchCode },
  { href: "/benchmarks", label: "Benchmarks", icon: Award },
  { href: "/sequences", label: "Sequences", icon: Layers },
  { href: "/templates", label: "Template Library", icon: Library },
  { href: "/appointment-library", label: "Appt Library", icon: BookOpen },
  { href: "/settings", label: "Settings", icon: Settings },
];

interface SidebarProps {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

/** Detect if we're on a Template Builder page (offices/[id] but not /edit, /new, /matrix, /report, /print) */
function isTemplateBuilderPage(pathname: string): boolean {
  const match = pathname.match(/^\/offices\/([^/]+)$/);
  return !!match && match[1] !== "new";
}

export default function Sidebar({ mobileOpen = false, onMobileClose }: SidebarProps) {
  const pathname = usePathname();
  const isBuilder = isTemplateBuilderPage(pathname);

  // Collapsed state: default collapsed on Template Builder, expanded elsewhere.
  // Track previous isBuilder value to reset collapse when entering builder (React docs pattern).
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return isBuilder;
    const stored = localStorage.getItem("cst:nav-collapsed");
    if (stored !== null) return stored === "true";
    return isBuilder; // default collapsed on builder
  });
  const [prevIsBuilder, setPrevIsBuilder] = useState(isBuilder);
  if (isBuilder !== prevIsBuilder) {
    setPrevIsBuilder(isBuilder);
    if (isBuilder) setCollapsed(true);
  }

  // Persist
  useEffect(() => {
    localStorage.setItem("cst:nav-collapsed", String(collapsed));
  }, [collapsed]);

  const sidebarWidth = collapsed ? "w-14" : "w-56";

  return (
    <aside
      className={cn(
        "bg-sidebar-bg border-r border-border flex flex-col flex-shrink-0 transition-all duration-200",
        sidebarWidth,
        mobileOpen
          ? "fixed inset-y-0 left-0 z-50 !w-56"
          : "hidden lg:flex"
      )}
    >
      {/* Logo/Brand */}
      <div className={cn("flex items-center border-b border-border", collapsed && !mobileOpen ? "justify-center p-3" : "justify-between p-4")}>
        {collapsed && !mobileOpen ? (
          <Link href="/" className="flex items-center justify-center hover:opacity-80 transition-opacity">
            <div className="w-8 h-8 rounded-lg bg-accent/20 flex items-center justify-center flex-shrink-0">
              <span className="text-accent font-bold text-lg">S</span>
            </div>
          </Link>
        ) : (
          <>
            <Link href="/" onClick={onMobileClose} className="flex items-center gap-2 hover:opacity-80 transition-opacity">
              <div className="w-8 h-8 rounded-lg bg-accent/20 flex items-center justify-center flex-shrink-0">
                <span className="text-accent font-bold text-lg">S</span>
              </div>
              <div>
                <h1 className="text-sm font-semibold text-foreground leading-tight">CST</h1>
                <p className="text-[10px] text-muted-foreground leading-tight">Schedule Template</p>
              </div>
            </Link>
            {/* Close button — mobile only */}
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden h-8 w-8"
              onClick={onMobileClose}
              aria-label="Close menu"
            >
              <X className="w-4 h-4" />
            </Button>
          </>
        )}
      </div>

      {/* Navigation */}
      <nav className={cn("flex-1 space-y-0.5", collapsed && !mobileOpen ? "p-1.5" : "p-3")}>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive =
            item.href === "/"
              ? pathname === "/" || pathname.startsWith("/offices")
              : pathname === item.href || pathname.startsWith(item.href + "/");

          const linkContent = (
            <Link
              key={item.href}
              href={item.href}
              onClick={onMobileClose}
              className={cn(
                "flex items-center rounded-lg text-sm font-medium transition-colors",
                collapsed && !mobileOpen
                  ? "justify-center p-2"
                  : "gap-3 px-3 py-2 min-h-[40px]",
                isActive
                  ? "bg-accent/10 text-accent border border-accent/20"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary"
              )}
            >
              <Icon className="w-[18px] h-[18px] flex-shrink-0" />
              {(!collapsed || mobileOpen) && <span>{item.label}</span>}
            </Link>
          );

          if (collapsed && !mobileOpen) {
            return (
              <Tooltip key={item.href}>
                <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
                <TooltipContent side="right">{item.label}</TooltipContent>
              </Tooltip>
            );
          }

          return <div key={item.href}>{linkContent}</div>;
        })}
      </nav>

      {/* Collapse toggle — desktop only */}
      <div className={cn("border-t border-border hidden lg:flex", collapsed ? "justify-center p-2" : "justify-end p-2 px-3")}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setCollapsed((c) => !c)}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {collapsed ? <ChevronsRight className="w-4 h-4" /> : <ChevronsLeft className="w-4 h-4" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">{collapsed ? "Expand" : "Collapse"}</TooltipContent>
        </Tooltip>
      </div>
    </aside>
  );
}
