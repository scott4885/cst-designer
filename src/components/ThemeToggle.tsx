"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Moon, Sun, Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";

type ThemeMode = 'light' | 'dark' | 'system';

const CYCLE: ThemeMode[] = ['light', 'dark', 'system'];

const THEME_LABELS: Record<ThemeMode, string> = {
  light: 'Light mode — click to switch to Dark',
  dark: 'Dark mode — click to switch to System',
  system: 'System mode — click to switch to Light',
};

export function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <Button variant="ghost" size="icon" className="rounded-full min-h-[44px] min-w-[44px]">
        <Sun className="w-5 h-5" />
      </Button>
    );
  }

  const current = (theme as ThemeMode) || 'system';

  const cycleTheme = () => {
    const idx = CYCLE.indexOf(current);
    const next = CYCLE[(idx + 1) % CYCLE.length];
    setTheme(next);
  };

  const Icon =
    current === 'dark' ? Moon :
    current === 'light' ? Sun :
    Monitor;

  return (
    <Button
      variant="ghost"
      size="icon"
      className="rounded-full min-h-[44px] min-w-[44px]"
      onClick={cycleTheme}
      title={THEME_LABELS[current] || 'Toggle theme'}
      aria-label={THEME_LABELS[current] || 'Toggle theme'}
    >
      <Icon className="w-5 h-5" />
    </Button>
  );
}
