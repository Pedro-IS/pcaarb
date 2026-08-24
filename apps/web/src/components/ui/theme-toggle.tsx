'use client';

import { useSyncExternalStore } from 'react';
import { Moon, Sun } from 'lucide-react';
import { getEffectiveTheme, getServerTheme, setStoredTheme, subscribeTheme } from '@/lib/theme';

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribeTheme, getEffectiveTheme, getServerTheme);

  function toggle() {
    setStoredTheme(theme === 'dark' ? 'light' : 'dark');
  }

  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className="flex h-8 w-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-card-hover hover:text-foreground"
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}
