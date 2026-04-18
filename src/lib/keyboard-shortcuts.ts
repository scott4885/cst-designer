/**
 * Keyboard Shortcuts Hook — Sprint 16
 *
 * `useKeyboardShortcuts(handlers)` — attaches event listeners on document,
 * ignores events inside input/textarea/select elements.
 * Returns a cleanup function (also auto-cleans on unmount).
 */

'use client';

import { useEffect, useCallback } from 'react';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface ShortcutHandlers {
  // Global
  onHelp?: () => void;           // ?
  onSave?: () => void;           // Cmd/Ctrl+S
  onPrint?: () => void;          // Cmd/Ctrl+P
  onExport?: () => void;         // Cmd/Ctrl+E
  onEscape?: () => void;         // Esc
  /** Loop 10: Cmd/Ctrl+Z undoes the last schedule mutation. */
  onUndo?: () => void;
  /** Loop 10: Cmd/Ctrl+Shift+Z or Cmd/Ctrl+Y redoes the last undo. */
  onRedo?: () => void;

  // Template Builder
  onPrevDay?: () => void;        // ←
  onNextDay?: () => void;        // →
  onJumpDay?: (day: number) => void;  // 1–5 (Mon–Fri)
  onGenerate?: () => void;       // G
  onVersionHistory?: () => void; // V
  onResetDay?: () => void;       // R
  onCopyMonday?: () => void;     // Shift+C

  // Navigation
  onGoOffices?: () => void;      // O
  onGoAnalytics?: () => void;    // A
  onGoLibrary?: () => void;      // L
  onGoRollup?: () => void;       // Shift+R
}

export interface ShortcutDefinition {
  key: string;
  display: string;
  description: string;
  category: 'Global' | 'Template Builder' | 'Navigation';
}

export const SHORTCUT_DEFINITIONS: ShortcutDefinition[] = [
  // Global
  { key: '?', display: '?', description: 'Open keyboard shortcuts help', category: 'Global' },
  { key: 'Cmd+S', display: '⌘S / Ctrl+S', description: 'Save current schedule', category: 'Global' },
  { key: 'Cmd+P', display: '⌘P / Ctrl+P', description: 'Print current view', category: 'Global' },
  { key: 'Cmd+E', display: '⌘E / Ctrl+E', description: 'Export (Excel)', category: 'Global' },
  { key: 'Cmd+Z', display: '⌘Z / Ctrl+Z', description: 'Undo', category: 'Global' },
  { key: 'Cmd+Shift+Z', display: '⌘⇧Z / Ctrl+Y', description: 'Redo', category: 'Global' },
  { key: 'Esc', display: 'Esc', description: 'Close modal / panel', category: 'Global' },
  // Template Builder
  { key: 'ArrowLeft', display: '←', description: 'Previous day', category: 'Template Builder' },
  { key: 'ArrowRight', display: '→', description: 'Next day', category: 'Template Builder' },
  { key: '1-5', display: '1–5', description: 'Jump to Mon–Fri', category: 'Template Builder' },
  { key: 'G', display: 'G', description: 'Generate schedule (Smart Fill All)', category: 'Template Builder' },
  { key: 'V', display: 'V', description: 'Open Version History', category: 'Template Builder' },
  { key: 'R', display: 'R', description: 'Reset day (with confirmation)', category: 'Template Builder' },
  { key: 'Shift+C', display: 'Shift+C', description: 'Copy Monday to all days', category: 'Template Builder' },
  // Navigation
  { key: 'O', display: 'O', description: 'Go to Offices', category: 'Navigation' },
  { key: 'A', display: 'A', description: 'Go to Analytics', category: 'Navigation' },
  { key: 'L', display: 'L', description: 'Go to Template Library', category: 'Navigation' },
  { key: 'Shift+R', display: 'Shift+R', description: 'Go to Rollup', category: 'Navigation' },
];

// ─── Check if event target is an input ────────────────────────────────────────────

function isInputTarget(e: KeyboardEvent): boolean {
  const target = e.target as HTMLElement | null;
  if (!target) return false;
  const tag = target.tagName.toLowerCase();
  return (
    tag === 'input' ||
    tag === 'textarea' ||
    tag === 'select' ||
    target.isContentEditable
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────────

export function useKeyboardShortcuts(handlers: ShortcutHandlers): void {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const key = e.key;
      const ctrl = e.ctrlKey || e.metaKey;
      const shift = e.shiftKey;

      // Cmd/Ctrl shortcuts (work even in inputs)
      if (ctrl) {
        if (key === 's') {
          e.preventDefault();
          handlers.onSave?.();
          return;
        }
        if (key === 'p') {
          e.preventDefault();
          handlers.onPrint?.();
          return;
        }
        if (key === 'e') {
          e.preventDefault();
          handlers.onExport?.();
          return;
        }
        // Loop 10: Undo / Redo. Skip when typing in inputs so browser native
        // text undo still works inside form fields.
        if (!isInputTarget(e) && (key === 'z' || key === 'Z')) {
          e.preventDefault();
          if (shift) {
            handlers.onRedo?.();
          } else {
            handlers.onUndo?.();
          }
          return;
        }
        if (!isInputTarget(e) && (key === 'y' || key === 'Y')) {
          e.preventDefault();
          handlers.onRedo?.();
          return;
        }
      }

      // Escape (works everywhere)
      if (key === 'Escape') {
        handlers.onEscape?.();
        return;
      }

      // All other shortcuts: skip if inside an input
      if (isInputTarget(e)) return;

      // Template Builder shortcuts
      if (key === 'ArrowLeft') {
        e.preventDefault();
        handlers.onPrevDay?.();
        return;
      }
      if (key === 'ArrowRight') {
        e.preventDefault();
        handlers.onNextDay?.();
        return;
      }

      // Day jumps 1–5
      if (!shift && !ctrl && /^[1-5]$/.test(key)) {
        handlers.onJumpDay?.(parseInt(key, 10));
        return;
      }

      // Single letter shortcuts
      if (!shift && !ctrl) {
        switch (key) {
          case '?': handlers.onHelp?.(); return;
          case 'g':
          case 'G': handlers.onGenerate?.(); return;
          case 'v':
          case 'V': handlers.onVersionHistory?.(); return;
          case 'o':
          case 'O': handlers.onGoOffices?.(); return;
          case 'a':
          case 'A': handlers.onGoAnalytics?.(); return;
          case 'l':
          case 'L': handlers.onGoLibrary?.(); return;
          case 'r':
          case 'R': handlers.onResetDay?.(); return;
        }
      }

      // Shift combos
      if (shift && !ctrl) {
        switch (key) {
          case 'C':
          case 'c': handlers.onCopyMonday?.(); return;
          case 'R':
          case 'r': handlers.onGoRollup?.(); return;
        }
      }
    },
    [handlers]
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);
}
