"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useOfficeStore } from "@/store/office-store";

export default function Header() {
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
    <header className="h-16 border-b border-border bg-surface px-6 flex items-center justify-between">
      <div className="flex items-center gap-2">
        {crumbs.map((crumb, i) => (
          <span key={i} className="flex items-center gap-2">
            {i > 0 && <span className="text-muted-foreground">/</span>}
            {crumb.href ? (
              <Link
                href={crumb.href}
                className="text-lg font-semibold text-muted-foreground hover:text-foreground transition-colors"
              >
                {crumb.label}
              </Link>
            ) : (
              <h2 className="text-lg font-semibold text-foreground">
                {crumb.label}
              </h2>
            )}
          </span>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <Link href="/settings">
          <Button variant="ghost" size="icon" className="rounded-full">
            <Settings className="w-5 h-5" />
          </Button>
        </Link>
      </div>
    </header>
  );
}
