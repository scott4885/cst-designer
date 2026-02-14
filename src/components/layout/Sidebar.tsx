"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Building2, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "Offices", icon: Building2 },
  { href: "/settings", label: "Settings", icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 bg-[#1a1a1a] border-r border-border flex flex-col">
      {/* Logo/Brand */}
      <Link href="/" className="block p-6 border-b border-border hover:bg-secondary/50 transition-colors">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-accent/20 flex items-center justify-center">
            <span className="text-accent font-bold text-lg">S</span>
          </div>
          <div>
            <h1 className="text-sm font-semibold text-foreground">Schedule</h1>
            <p className="text-xs text-muted-foreground">Template Designer</p>
          </div>
        </div>
      </Link>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = item.href === "/"
            ? pathname === "/" || pathname.startsWith("/offices")
            : pathname === item.href || pathname.startsWith(item.href + "/");
          
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                isActive
                  ? "bg-accent/10 text-accent border border-accent/20"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary"
              )}
            >
              <Icon className="w-5 h-5" />
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
