'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, CreditCard, FileText, Lock, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import {
  SUBSCRIPTION_PLAN_CATALOG,
  type SubscribablePlan,
  type Subscription,
  type SubscriptionInvoice,
} from '@pcaarb/shared';
import { apiFetch, ApiError } from '@/lib/api-client';
import { formatCentsToBRL } from '@/lib/currency';
import { useAccessToken } from '@/lib/use-access-token';
import { useCurrentUser } from '@/lib/use-current-user';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge, type BadgeVariant } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { SkeletonRows } from '@/components/ui/skeleton';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';

const PLAN_ORDER: SubscribablePlan[] = ['starter', 'profissional', 'multi_loja'];

const STATUS_BADGE: Record<Subscription['status'], { label: string; variant: BadgeVariant }> = {
  active: { label: 'Active', variant: 'success' },
  past_due: { label: 'Payment pending', variant: 'warning' },
  canceled: { label: 'Canceled', variant: 'danger' },
};

function daysUntil(dateIso: string): number {
  return Math.ceil((new Date(dateIso).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
}

export default function AssinaturaPage() {
  const accessToken = useAccessToken();
  const meQuery = useCurrentUser();
  const queryClient = useQueryClient();
  const canManage = meQuery.data?.user.role === 'owner';
  // GET /billing/subscription and /billing/invoices require owner/admin on
  // the backend (security review finding, 2026-08-18 — previously accessible
  // to any authenticated role). Without this gate here, financeiro/
  // operador_caixa navigating to this page would just see the queries
  // fail with 403 with no explanation.
  const canView = meQuery.data?.user.role === 'owner' || meQuery.data?.user.role === 'admin';

  const subscriptionQuery = useQuery({
    queryKey: ['billing', 'subscription'],
    // A 404 here isn't a real error, it's the normal state for someone who
    // hasn't subscribed yet (trial only) — treated as "no subscription"
    // instead of letting react-query fall into retry/error for a fully expected case.
    queryFn: async () => {
      try {
        return await apiFetch<Subscription>('/billing/subscription', { accessToken: accessToken! });
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) {
          return null;
        }
        throw error;
      }
    },
    enabled: !!accessToken && canView,
  });

  const invoicesQuery = useQuery({
    queryKey: ['billing', 'invoices'],
    queryFn: () => apiFetch<SubscriptionInvoice[]>('/billing/invoices', { accessToken: accessToken! }),
    enabled: !!accessToken && canView,
  });

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: ['billing'] });
    queryClient.invalidateQueries({ queryKey: ['users', 'me'] });
  }

  const subscribeMutation = useMutation({
    mutationFn: (plan: SubscribablePlan) => apiFetch<Subscription>('/billing/subscribe', { method: 'POST', accessToken: accessToken!, body: { plan } }),
    onSuccess: (_, plan) => {
      invalidateAll();
      toast.success(`Subscribed to the ${SUBSCRIPTION_PLAN_CATALOG[plan].label} plan`);
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Error processing subscription');
    },
  });

  const cancelMutation = useMutation({
    mutationFn: () => apiFetch('/billing/cancel', { method: 'POST', accessToken: accessToken! }),
    onSuccess: () => {
      invalidateAll();
      toast.success('Subscription canceled');
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Error canceling subscription');
    },
  });

  if (!accessToken || !meQuery.data || (canView && subscriptionQuery.isLoading)) {
    return (
      <>
        <h1 className="text-2xl font-semibold tracking-tight">Subscription</h1>
        <Card className="flex flex-col gap-4">
          <SkeletonRows rows={2} cols={1} />
        </Card>
      </>
    );
  }

  if (!canView) {
    return (
      <>
        <h1 className="text-2xl font-semibold tracking-tight">Subscription</h1>
        <Card>
          <EmptyState icon={Lock} message="Only the owner and admin can see subscription and billing data." />
        </Card>
      </>
    );
  }

  const subscription = subscriptionQuery.data;
  const tenant = meQuery.data?.tenant;
  const trialing = tenant?.status === 'trial';
  const blocked = tenant?.status === 'blocked';

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Subscription</h1>

      {trialing && tenant?.trialEndsAt && (
        <Card className="flex items-center gap-3 border-accent/40 bg-accent-soft/40">
          <CreditCard className="h-5 w-5 text-accent" />
          <p className="text-sm">
            You are in the trial period — {Math.max(daysUntil(tenant.trialEndsAt), 0)} day(s) remaining. Subscribe to a
            plan below to continue after the trial ends.
          </p>
        </Card>
      )}

      {blocked && (
        <Card className="flex items-center gap-3 border-danger/40 bg-danger-soft">
          <XCircle className="h-5 w-5 text-danger" />
          <p className="text-sm">
            Access blocked for non-payment. Pick a plan below — you will be charged immediately and access returns as
            soon as it is approved.
          </p>
        </Card>
      )}

      {subscription && (
        <Card className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium">Current plan: {SUBSCRIPTION_PLAN_CATALOG[subscription.plan as SubscribablePlan]?.label ?? subscription.plan}</h2>
            <Badge variant={STATUS_BADGE[subscription.status].variant}>{STATUS_BADGE[subscription.status].label}</Badge>
          </div>
          <p className="text-sm text-muted">
            {formatCentsToBRL(subscription.priceCents)}/month
            {subscription.status === 'active' &&
              ` — next charge on ${new Date(subscription.currentPeriodEnd).toLocaleDateString('pt-BR')}`}
            {subscription.status === 'past_due' && ' — last charge failed, we will automatically retry it'}
          </p>
          {canManage && subscription.status !== 'canceled' && (
            <Button
              variant="danger"
              className="self-start"
              loading={cancelMutation.isPending}
              onClick={() => cancelMutation.mutate()}
            >
              Cancel subscription
            </Button>
          )}
        </Card>
      )}

      {canManage && (
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-muted">{subscription && subscription.status !== 'canceled' ? 'Change plan' : 'Choose a plan'}</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {PLAN_ORDER.map((plan) => {
              const catalog = SUBSCRIPTION_PLAN_CATALOG[plan];
              const isCurrent = subscription?.plan === plan && subscription.status !== 'canceled';
              return (
                <Card key={plan} className={`flex flex-col gap-3 ${isCurrent ? 'border-accent ring-1 ring-accent' : ''}`}>
                  <div>
                    <h3 className="font-medium">{catalog.label}</h3>
                    <p className="text-lg font-semibold">{formatCentsToBRL(catalog.priceCents)}<span className="text-xs font-normal text-muted">/month</span></p>
                  </div>
                  <p className="flex-1 text-xs text-muted">{catalog.description}</p>
                  {isCurrent ? (
                    <div className="flex items-center gap-1.5 text-xs text-accent">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Current plan
                    </div>
                  ) : (
                    <Button
                      variant={plan === 'profissional' ? 'primary' : 'secondary'}
                      loading={subscribeMutation.isPending}
                      onClick={() => subscribeMutation.mutate(plan)}
                    >
                      {subscription && subscription.status !== 'canceled' ? 'Switch to this plan' : 'Subscribe'}
                    </Button>
                  )}
                </Card>
              );
            })}
          </div>
          <p className="text-xs text-muted">
            {subscription && subscription.status !== 'canceled'
              ? 'Switching plans charges the full price of the new plan immediately and restarts the 30-day cycle from today.'
              : 'Need a public API, SSO, or dedicated support? The Enterprise plan is quote-only — get in touch.'}
          </p>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-medium text-muted">
          <FileText className="h-3.5 w-3.5" />
          Invoice history
        </h2>
        {!invoicesQuery.data ? (
          <div className="rounded-lg border border-border">
            <SkeletonRows rows={2} cols={3} />
          </div>
        ) : invoicesQuery.data.length === 0 ? (
          <div className="rounded-lg border border-border">
            <EmptyState icon={FileText} message="No invoices yet." />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <tr>
                <TableHead>Period</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
              </tr>
            </TableHeader>
            <TableBody>
              {invoicesQuery.data.map((invoice) => (
                <TableRow key={invoice.id}>
                  <TableCell>
                    {new Date(invoice.periodStart).toLocaleDateString('pt-BR')} – {new Date(invoice.periodEnd).toLocaleDateString('pt-BR')}
                  </TableCell>
                  <TableCell numeric>{formatCentsToBRL(invoice.amountCents)}</TableCell>
                  <TableCell>
                    <Badge variant={invoice.status === 'paid' ? 'success' : 'danger'}>
                      {invoice.status === 'paid' ? 'Paid' : 'Failed'}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </>
  );
}
