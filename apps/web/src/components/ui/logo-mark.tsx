import { useTenantLogoUrl } from '@/lib/use-tenant-logo';
import { cn } from '@/lib/utils';

// Renders nothing when the tenant hasn't set a logo — this is the tenant's
// own brand mark (topbar identity chip, receipts, PDV), distinct from the
// PCAARB wordmark chip elsewhere in the topbar. Falling back to that "P"
// glyph here would look like it's the tenant's logo, which it isn't.
export function LogoMark({ hasLogo, className }: { hasLogo: boolean | undefined; className?: string }) {
  const logoUrl = useTenantLogoUrl(hasLogo);
  if (!logoUrl) {
    return null;
  }
  // next/image can't optimize a blob: URL (it's local to this browser tab, not a fetchable network resource).
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={logoUrl} alt="" className={cn('rounded-md object-contain', className)} />;
}
