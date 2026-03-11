"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, Settings, BookOpen, Library, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const navItems = [
  { href: "/", label: "Offices", icon: Building2 },
  { href: "/templates", label: "Template Library", icon: Library },
  { href: "/appointment-library", label: "Appt Library", icon: BookOpen },
  { href: "/settings", label: "Settings", icon: Settings },
];

interface SidebarProps {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export default function Sidebar({ mobileOpen = false, onMobileClose }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside
      className={cn(
        "w-64 bg-sidebar-bg border-r border-border flex flex-col flex-shrink-0",
        // Mobile: hidden by default (taken out of flow); fixed overlay when open
        // Desktop: always in-flow, never fixed
        mobileOpen
          ? "fixed inset-y-0 left-0 z-50"
          : "hidden lg:flex"
      )}
    >
      {/* Logo/Brand */}
      <div className="flex items-center justify-between p-6 border-b border-border">
        <Link href="/" onClick={onMobileClose} className="flex items-center gap-3 hover:opacity-80 transition-opacity">
          <div className="w-8 h-8 rounded-lg bg-accent/20 flex items-center justify-center flex-shrink-0">
            <span className="text-accent font-bold text-lg">S</span>
          </div>
          <div>
            <h1 className="text-sm font-semibold text-foreground">CST</h1>
            <p className="text-xs text-muted-foreground">Custom Schedule Template</p>
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
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive =
            item.href === "/"
              ? pathname === "/" || pathname.startsWith("/offices")
              : pathname === item.href || pathname.startsWith(item.href + "/") ||
                (item.href === "/templates" && pathname.startsWith("/templates"));

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onMobileClose}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors min-h-[44px]",
                isActive
                  ? "bg-accent/10 text-accent border border-accent/20"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary"
              )}
            >
              <Icon className="w-5 h-5 flex-shrink-0" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-border">
        <p className="text-xs text-muted-foreground text-center">
          v1.0.0 - Internal Tool
        </p>
      </div>
    </aside>
  );
}
