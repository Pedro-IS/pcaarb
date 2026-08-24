import type { SelectHTMLAttributes } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

// Native <select> under the hood, on purpose — keeps free mobile/a11y
// behavior instead of pulling in a listbox library. `appearance-none` +
// an absolutely-positioned chevron replace the inconsistent native arrow.
export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select
        className={cn(
          'h-10 w-full appearance-none rounded-md border border-border bg-card px-3 pr-9 text-sm text-foreground outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/20',
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
    </div>
  );
}
