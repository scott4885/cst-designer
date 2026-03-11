"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { TooltipProvider } from "@/components/ui/tooltip";
import Sidebar from "./Sidebar";
import Header from "./Header";
import KeyboardShortcutsModal from "@/components/KeyboardShortcutsModal";
import { useKeyboardShortcuts } from "@/lib/keyboard-shortcuts";

export default function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const router = useRouter();

  // Global keyboard shortcuts
  useKeyboardShortcuts({
    onHelp: useCallback(() => setShortcutsOpen(true), []),
    onEscape: useCallback(() => setShortcutsOpen(false), []),
    onGoOffices: useCallback(() => router.push("/"), [router]),
    onGoAnalytics: useCallback(() => router.push("/analytics"), [router]),
    onGoLibrary: useCallback(() => router.push("/templates"), [router]),
    onGoRollup: useCallback(() => router.push("/rollup"), [router]),
    onPrint: useCallback(() => window.print(), []),
  });

  return (
    <TooltipProvider>
      <div className="flex h-screen overflow-hidden">
        {/* Mobile overlay backdrop */}
        {mobileSidebarOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/50 lg:hidden"
            onClick={() => setMobileSidebarOpen(false)}
          />
        )}

        <Sidebar
          mobileOpen={mobileSidebarOpen}
          onMobileClose={() => setMobileSidebarOpen(false)}
        />

        <div className="flex flex-col flex-1 overflow-hidden min-w-0">
          <Header onMobileMenuToggle={() => setMobileSidebarOpen((v) => !v)} />
          <main className="flex-1 overflow-auto bg-background p-4 sm:p-6">
            <ErrorBoundary>{children}</ErrorBoundary>
          </main>
        </div>
      </div>

      {/* Global keyboard shortcuts modal */}
      <KeyboardShortcutsModal
        open={shortcutsOpen}
        onClose={() => setShortcutsOpen(false)}
      />
    </TooltipProvider>
  );
}
