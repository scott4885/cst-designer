"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { Settings, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useOfficeStore } from "@/store/office-store";
import { ThemeToggle } from "@/components/ThemeToggle";

interface HeaderProps {
  onMobileMenuToggle?: () => void;
}

export default function Header({ onMobileMenuToggle }: HeaderProps) {
  const pathname = usePathname();
  const { currentOffice } = useOfficeStore();

  const getBreadcrumbs = (): { label: string; href?: string }[] => {
    const segments = pathname.split("/").filter(Boolean);

    if (segments.length === 0) return [{ label: "Offices" }];

    if (segments[0] === "settings") return [{ label: "Settings" }];

    if (segments[0] === "offices") {
      const crumbs: { label: string; href?: string }[] = [
        { label: "Offices", href: "/" },
      ];

      if (segments[1] === "new") {
        crumbs.push({ label: "New Office" });
      } else if (segments[1]) {
        const officeName = currentOffice?.name || "Office";
        if (segments[2] === "edit") {
          crumbs.push({ label: officeName, href: `/offices/${segments[1]}` });
          crumbs.push({ label: "Edit" });
        } else {
          crumbs.push({ label: officeName });
        }
      }

      return crumbs;
    }

    return [{ label: segments[0].charAt(0).toUpperCase() + segments[0].slice(1) }];
  };

  const crumbs = getBreadcrumbs();

  return (
    <header className="h-14 sm:h-16 border-b border-border bg-surface px-3 sm:px-6 flex items-center justify-between gap-2 flex-shrink-0">
      {/* Left: hamburger (mobile) + breadcrumbs */}
      <div className="flex items-center gap-2 min-w-0 flex-1">
        {/* Hamburger button — mobile only */}
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden h-9 w-9 min-h-[44px] min-w-[44px] flex-shrink-0"
          onClick={onMobileMenuToggle}
          aria-label="Open menu"
        >
          <Menu className="w-5 h-5" />
        </Button>

        {/* Breadcrumbs */}
        <div className="flex items-center gap-1 sm:gap-2 min-w-0 overflow-hidden">
          {crumbs.map((crumb, i) => (
            <span key={i} className="flex items-center gap-1 sm:gap-2 min-w-0">
              {i > 0 && <span className="text-muted-foreground flex-shrink-0">/</span>}
              {crumb.href ? (
                <Link
                  href={crumb.href}
                  className="text-sm sm:text-lg font-semibold text-muted-foreground hover:text-foreground transition-colors truncate"
                >
                  {crumb.label}
                </Link>
              ) : (
                <h2 className="text-sm sm:text-lg font-semibold text-foreground truncate">
                  {crumb.label}
                </h2>
              )}
            </span>
          ))}
        </div>
      </div>

      {/* Right: theme toggle + settings */}
      <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
        <ThemeToggle />
        <Link href="/settings">
          <Button variant="ghost" size="icon" className="rounded-full h-9 w-9 min-h-[44px] min-w-[44px]">
            <Settings className="w-5 h-5" />
          </Button>
        </Link>
      </div>
    </header>
  );
}
