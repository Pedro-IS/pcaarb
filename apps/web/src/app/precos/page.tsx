import Link from 'next/link';
import { CheckCircle2 } from 'lucide-react';
import { SUBSCRIPTION_PLAN_CATALOG, type SubscribablePlan } from '@pcaarb/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { formatCentsToBRL } from '@/lib/currency';

const PLAN_ORDER: SubscribablePlan[] = ['starter', 'profissional', 'multi_loja'];

const PLAN_FEATURES: Record<SubscribablePlan, string[]> = {
  starter: ['Single store, 1 register', 'Customers & Suppliers, POS, basic inventory', 'Basic finance', '1 admin + 1 operator'],
  profissional: [
    'Everything in Starter',
    'Purchases, inventory, cost centers/P&L',
    'Reports and BI',
    'Loyalty and salesperson commissions',
    'Unlimited users, granular permissions',
  ],
  multi_loja: ['Everything in Professional', 'Consolidated multi-store view', '+ R$99/month per additional store'],
};

export default function PrecosPage() {
  return (
    <main className="flex flex-1 flex-col items-center gap-10 px-6 py-16">
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Pricing</span>
        <h1 className="max-w-2xl text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          Transparent pricing, no setup contract
        </h1>
        <p className="max-w-md text-muted">14 days free on any plan. Cancel anytime, no penalty.</p>
      </div>

      <div className="grid w-full max-w-5xl grid-cols-1 gap-6 sm:grid-cols-3">
        {PLAN_ORDER.map((plan) => {
          const catalog = SUBSCRIPTION_PLAN_CATALOG[plan];
          const highlighted = plan === 'profissional';
          return (
            <Card
              key={plan}
              className={
                highlighted
                  ? 'relative flex flex-col gap-4 border-accent shadow-lg ring-1 ring-accent sm:-translate-y-2'
                  : 'flex flex-col gap-4'
              }
            >
              {highlighted && (
                <Badge variant="accent" className="absolute -top-3 left-1/2 -translate-x-1/2">
                  Most popular
                </Badge>
              )}
              <div>
                <h2 className="font-medium">{catalog.label}</h2>
                <p className="mt-1 text-3xl font-semibold tabular-nums">
                  {formatCentsToBRL(catalog.priceCents)}
                  <span className="text-sm font-normal text-muted">/month</span>
                </p>
              </div>
              <ul className="flex flex-1 flex-col gap-2 text-sm text-muted">
                {PLAN_FEATURES[plan].map((feature) => (
                  <li key={feature} className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                    {feature}
                  </li>
                ))}
              </ul>
              <Link href="/registrar">
                <Button variant={highlighted ? 'primary' : 'secondary'} className="w-full">
                  Start for free
                </Button>
              </Link>
            </Card>
          );
        })}
      </div>

      <Card className="flex max-w-xl flex-col items-center gap-2 text-center">
        <h2 className="font-medium">Enterprise</h2>
        <p className="text-sm text-muted">
          Large-scale operations, public API, SSO, and dedicated support — contact us for pricing.
        </p>
        <Link href="/registrar">
          <Button variant="ghost">Talk to us</Button>
        </Link>
      </Card>
    </main>
  );
}
