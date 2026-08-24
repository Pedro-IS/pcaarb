import Link from 'next/link';
import { Layers, Plug, ShieldCheck, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';

const CAPABILITIES = [
  {
    icon: Layers,
    label: 'Multi-store, one ledger',
    description: 'Every location shares inventory, finance, and reporting — tenant-isolated at the database level.',
  },
  {
    icon: ShieldCheck,
    label: 'Permissions down to the action',
    description: 'Role-based access with per-user overrides, not just presets.',
  },
  {
    icon: WifiOff,
    label: 'Offline-first POS',
    description: 'The register keeps selling without a connection and syncs the moment it returns.',
  },
  {
    icon: Plug,
    label: 'API-first, webhook-native',
    description: 'Programmatic keys in, signed event delivery out — built to connect, not silo.',
  },
];

export default function Home() {
  return (
    <main className="flex flex-1 flex-col">
      <div className="flex flex-1 flex-col items-center justify-center gap-8 px-6 py-24 text-center">
        <div className="flex flex-col gap-4">
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">
            Retail operations platform
          </span>
          <h1 className="max-w-2xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            Run the whole store — sales, stock, and finance — from one system built to keep up.
          </h1>
          <p className="max-w-md self-center text-muted">
            No enterprise sprawl, no spreadsheets stitched together. Start operating the same day.
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-4">
          <Link href="/registrar">
            <Button>Start for free</Button>
          </Link>
          <Link href="/precos">
            <Button variant="secondary">View pricing</Button>
          </Link>
          <Link href="/login">
            <Button variant="ghost">Log in</Button>
          </Link>
        </div>
      </div>

      <div className="border-t border-border px-6 py-16">
        <div className="mx-auto grid max-w-5xl grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {CAPABILITIES.map((capability) => (
            <div key={capability.label} className="flex flex-col items-start gap-3 text-left">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-soft text-accent">
                <capability.icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-medium">{capability.label}</p>
                <p className="mt-1 text-sm text-muted">{capability.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
