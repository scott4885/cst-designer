"use client";

import { useState, useCallback, createContext, useContext } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { TooltipProvider } from "@/components/ui/tooltip";
import Sidebar from "./Sidebar";
import Header from "./Header";
import KeyboardShortcutsModal from "@/components/KeyboardShortcutsModal";
import { useKeyboardShortcuts } from "@/lib/keyboard-shortcuts";

/** Detect Template Builder page: /offices/[id] (not /new, /edit, etc.) */
function isTemplateBuilderPage(pathname: string): boolean {
  const match = pathname.match(/^\/offices\/([^/]+)$/);
  return !!match && match[1] !== "new";
}

/** Full-screen context — allows child pages to toggle hiding sidebar/header */
export const FullScreenContext = createContext<{
  fullScreen: boolean;
  setFullScreen: (v: boolean) => void;
}>({ fullScreen: false, setFullScreen: () => {} });

export function useFullScreen() {
  return useContext(FullScreenContext);
}

export default function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [fullScreen, setFullScreen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const isBuilder = isTemplateBuilderPage(pathname);

  // Global keyboard shortcuts
  useKeyboardShortcuts({
    onHelp: useCallback(() => setShortcutsOpen(true), []),
    onEscape: useCallback(() => {
      if (fullScreen) { setFullScreen(false); return; }
      setShortcutsOpen(false);
    }, [fullScreen]),
    onGoOffices: useCallback(() => router.push("/"), [router]),
    onGoAnalytics: useCallback(() => router.push("/analytics"), [router]),
    onGoLibrary: useCallback(() => router.push("/templates"), [router]),
    onGoRollup: useCallback(() => router.push("/rollup"), [router]),
    onPrint: useCallback(() => window.print(), []),
  });

  return (
    <FullScreenContext.Provider value={{ fullScreen, setFullScreen }}>
      <TooltipProvider>
        <div className="flex h-screen overflow-hidden">
          {/* Mobile overlay backdrop */}
          {mobileSidebarOpen && !fullScreen && (
            <div
              className="fixed inset-0 z-40 bg-black/50 lg:hidden"
              onClick={() => setMobileSidebarOpen(false)}
            />
          )}

          {!fullScreen && (
            <Sidebar
              mobileOpen={mobileSidebarOpen}
              onMobileClose={() => setMobileSidebarOpen(false)}
            />
          )}

          <div className="flex flex-col flex-1 overflow-hidden min-w-0">
            {!fullScreen && (
              <Header onMobileMenuToggle={() => setMobileSidebarOpen((v) => !v)} />
            )}
            <main className={`flex-1 overflow-auto bg-background ${fullScreen ? "p-0" : isBuilder ? "p-2" : "p-4 sm:p-6"}`}>
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
    </FullScreenContext.Provider>
  );
}
