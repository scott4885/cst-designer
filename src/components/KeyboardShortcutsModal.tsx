"use client";

/**
 * Keyboard Shortcuts Help Modal — Sprint 16
 * Triggered by pressing "?" or clicking help.
 */

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SHORTCUT_DEFINITIONS } from "@/lib/keyboard-shortcuts";
import type { ShortcutDefinition } from "@/lib/keyboard-shortcuts";
import { Keyboard } from "lucide-react";

interface KeyboardShortcutsModalProps {
  open: boolean;
  onClose: () => void;
}

const CATEGORY_ORDER = ["Global", "Template Builder", "Navigation"] as const;

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center justify-center px-1.5 py-0.5 rounded border border-border bg-muted text-xs font-mono font-medium text-foreground min-w-[24px]">
      {children}
    </kbd>
  );
}

export default function KeyboardShortcutsModal({
  open,
  onClose,
}: KeyboardShortcutsModalProps) {
  const grouped = CATEGORY_ORDER.map((category) => ({
    category,
    shortcuts: SHORTCUT_DEFINITIONS.filter(
      (s): s is ShortcutDefinition => s.category === category
    ),
  }));

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="h-4 w-4" />
            Keyboard Shortcuts
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 max-h-[70vh] overflow-y-auto pr-1">
          {grouped.map(({ category, shortcuts }) => (
            <div key={category}>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                {category}
              </h3>
              <div className="space-y-1">
                {shortcuts.map((s) => (
                  <div
                    key={s.key}
                    className="flex items-center justify-between py-1 px-2 rounded hover:bg-muted/50 transition-colors"
                  >
                    <span className="text-sm text-foreground">{s.description}</span>
                    <Kbd>{s.display}</Kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <p className="text-xs text-muted-foreground text-center mt-2">
          Press <Kbd>?</Kbd> or <Kbd>Esc</Kbd> to close
        </p>
      </DialogContent>
    </Dialog>
  );
}
