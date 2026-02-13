"use client";

import { usePathname } from "next/navigation";
import { Settings, User } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Header() {
  const pathname = usePathname();

  // Generate breadcrumbs from pathname
  const generateBreadcrumbs = () => {
    const segments = pathname.split("/").filter(Boolean);
    if (segments.length === 0) return "Dashboard";
    
    const breadcrumbs = segments.map((segment, index) => {
      // Capitalize and format segment
      let label = segment.charAt(0).toUpperCase() + segment.slice(1);
      
      // Replace common patterns
      if (segment === "new") label = "New Office";
      if (segment.match(/^[0-9a-f-]{36}$/i)) label = "Template Builder"; // UUID pattern
      
      return label;
    });
    
    return breadcrumbs.join(" / ");
  };

  return (
    <header className="h-16 border-b border-border bg-surface px-6 flex items-center justify-between">
      {/* Breadcrumbs */}
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold text-foreground">
          {generateBreadcrumbs()}
        </h2>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="rounded-full">
          <Settings className="w-5 h-5" />
        </Button>
        <Button variant="ghost" size="icon" className="rounded-full">
          <User className="w-5 h-5" />
        </Button>
      </div>
    </header>
  );
}
