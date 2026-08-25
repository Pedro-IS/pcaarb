'use client';

import { useState, type ReactNode } from 'react';
import { Info } from 'lucide-react';
import { cn } from '@/lib/utils';

// Inline "what does this mean" hint — hover or focus a small icon, get one
// or two plain sentences. Not a form-field label (those stay in the field
// itself); this is for the handful of controls/statuses per screen where
// the label alone doesn't make the behavior obvious.
export function HelpHint({ children, className }: { children: ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);

  return (
    <span className={cn('relative inline-flex', className)}>
      <button
        type="button"
        aria-label="Help"
        className="inline-flex h-4 w-4 items-center justify-center rounded-full text-muted transition-colors hover:text-accent"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      >
        <Info className="h-3.5 w-3.5" />
      </button>
      {open && (
        <span
          role="tooltip"
          className="absolute left-1/2 top-full z-20 mt-1.5 w-56 -translate-x-1/2 rounded-md border border-border bg-card p-2.5 text-xs leading-snug text-foreground shadow-lg"
        >
          {children}
        </span>
      )}
    </span>
  );
}
