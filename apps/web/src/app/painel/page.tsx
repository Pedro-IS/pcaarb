'use client';

import Link from 'next/link';
import { motion } from 'motion/react';
import {
  BarChart3,
  ClipboardList,
  Contact,
  CreditCard,
  Gift,
  Package,
  Percent,
  Receipt,
  ShoppingBag,
  ShoppingCart,
  Store,
  Users,
  Wallet,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useCurrentUser } from '@/lib/use-current-user';

const SHORTCUTS = [
  { href: '/painel/pdv', label: 'POS', description: 'Open register and sell', icon: ShoppingCart },
  { href: '/painel/produtos', label: 'Products', description: 'Catalog, categories, and stock', icon: Package },
  { href: '/painel/vendas', label: 'Sales', description: 'History, receipt reprints, and NFC-e reissue', icon: Receipt },
  { href: '/painel/contagens', label: 'Inventory', description: 'Stock counts and adjustments', icon: ClipboardList },
  { href: '/painel/cadastros', label: 'Customers & Suppliers', description: 'Customers and suppliers', icon: Contact },
  { href: '/painel/fidelidade', label: 'Loyalty', description: 'Points, redemption, and customer history', icon: Gift },
  { href: '/painel/compras', label: 'Purchases', description: 'Supplier orders and receiving', icon: ShoppingBag },
  { href: '/painel/financeiro', label: 'Finance', description: 'Accounts payable and receivable', icon: Wallet },
  { href: '/painel/relatorios', label: 'Reports', description: 'ABC analysis, average ticket, and rankings', icon: BarChart3 },
  { href: '/painel/comissoes', label: 'Commissions', description: 'Commission rates and per-salesperson reports', icon: Percent },
  { href: '/painel/lojas', label: 'Stores', description: 'Network locations and consolidated view', icon: Store },
  { href: '/painel/usuarios', label: 'Users', description: 'Invite and manage roles', icon: Users },
  { href: '/painel/assinatura', label: 'Subscription', description: 'Plan, invoice, and payment method', icon: CreditCard },
];

function daysUntil(dateIso: string): number {
  return Math.ceil((new Date(dateIso).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
}

export default function PainelPage() {
  const meQuery = useCurrentUser();
  const me = meQuery.data;

  return (
    <>
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-balance">
          {me ? `Hi, ${me.user.name.split(' ')[0]}` : 'Dashboard'}
        </h1>
        {me ? (
          <div className="mt-2 flex items-center gap-2">
            <span className="text-sm text-muted">{me.tenant.companyName}</span>
            {me.tenant.status === 'trial' && me.tenant.trialEndsAt && (
              <Badge variant={daysUntil(me.tenant.trialEndsAt) <= 3 ? 'warning' : 'accent'}>
                Trial — {Math.max(daysUntil(me.tenant.trialEndsAt), 0)} day(s) left
              </Badge>
            )}
            {me.tenant.status === 'active' && <Badge variant="success">Active subscription</Badge>}
            {me.tenant.status === 'past_due' && (
              <Badge variant="warning">Payment pending — resolve it under Subscription</Badge>
            )}
            {(me.tenant.status === 'blocked' || me.tenant.status === 'canceled') && (
              <Badge variant="danger">Access blocked — resolve it under Subscription</Badge>
            )}
          </div>
        ) : (
          <Skeleton className="mt-2 h-4 w-40" />
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {SHORTCUTS.map((shortcut, index) => (
          <motion.div
            key={shortcut.href}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, delay: index * 0.04 }}
          >
            <Link href={shortcut.href}>
              <Card className="flex items-center gap-4 transition-colors hover:border-accent">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-soft text-accent">
                  <shortcut.icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-medium">{shortcut.label}</p>
                  <p className="text-sm text-muted">{shortcut.description}</p>
                </div>
              </Card>
            </Link>
          </motion.div>
        ))}
      </div>

      <p className="text-sm text-muted">
        Every sale in the POS already issues an NFC-e and confirms payment via a gateway in sandbox mode —
        switch to a real provider (Focus NFe, Pagar.me...) once the account/credentials are in place (see docs/03).
      </p>
    </>
  );
}
