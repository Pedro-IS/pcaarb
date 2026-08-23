import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { and, desc, eq, inArray, isNotNull, lte, ne } from 'drizzle-orm';
import { SUBSCRIPTION_PLAN_CATALOG, type SubscribeInput } from '@pcaarb/shared';
import { DRIZZLE, type Database } from '../../database/drizzle.provider';
import { runWithTenant } from '../../database/tenant-context';
import {
  subscriptions,
  subscriptionInvoices,
  tenants,
  type SubscriptionRow,
  type SubscriptionInvoiceRow,
} from '../../database/schema/index';
import { PAYMENT_PROVIDER, type PaymentProvider } from '../payments/payment-provider.interface';

const BILLING_PERIOD_DAYS = 30;
// Days of access retained after the first declined charge before blocking —
// gives the store owner time to update the card without losing access
// immediately.
const GRACE_PERIOD_DAYS = 5;

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(PAYMENT_PROVIDER) private readonly paymentProvider: PaymentProvider,
  ) {}

  async getSubscription(tenantId: string): Promise<SubscriptionRow | undefined> {
    return runWithTenant(this.db, tenantId, async (tx) => {
      const [row] = await tx.select().from(subscriptions).where(eq(subscriptions.tenantId, tenantId)).limit(1);
      return row;
    });
  }

  async listInvoices(tenantId: string): Promise<SubscriptionInvoiceRow[]> {
    return runWithTenant(this.db, tenantId, (tx) =>
      tx.select().from(subscriptionInvoices).where(eq(subscriptionInvoices.tenantId, tenantId)).orderBy(desc(subscriptionInvoices.createdAt)),
    );
  }

  // Serves three cases with a single endpoint: first subscription,
  // reactivation (was canceled or blocked for non-payment), and plan change.
  // All of them charge immediately and restart the 30-day cycle from now —
  // security review finding (2026-08-17): a plan change without an
  // immediate charge allowed subscribing to Multi-loja, creating extra
  // stores, and switching back to Starter before renewal, ending up with
  // access to all the stores without ever actually paying for them.
  // Changing plans without charging again would require real proration —
  // out of scope for the billing MVP; charging the new plan's full price
  // immediately is simpler and closes the hole.
  async subscribe(tenantId: string, input: SubscribeInput): Promise<SubscriptionRow> {
    const existing = await this.getSubscription(tenantId);
    const priceCents = SUBSCRIPTION_PLAN_CATALOG[input.plan].priceCents;

    const charge = await this.paymentProvider.charge({
      tenantId,
      saleId: null,
      method: 'cartao_credito',
      amountCents: priceCents,
    });
    if (!charge.approved) {
      throw new BadRequestException(charge.declineReason ?? 'Pagamento recusado pelo gateway');
    }

    const now = new Date();
    const periodEnd = addDays(now, BILLING_PERIOD_DAYS);

    return runWithTenant(this.db, tenantId, async (tx) => {
      const [row] = existing
        ? await tx
            .update(subscriptions)
            .set({
              plan: input.plan,
              priceCents,
              status: 'active',
              pastDueSince: null,
              currentPeriodStart: now,
              currentPeriodEnd: periodEnd,
              updatedAt: now,
            })
            .where(eq(subscriptions.tenantId, tenantId))
            .returning()
        : await tx
            .insert(subscriptions)
            .values({ tenantId, plan: input.plan, priceCents, currentPeriodStart: now, currentPeriodEnd: periodEnd })
            .returning();
      if (!row) {
        throw new Error('Falha ao criar assinatura');
      }

      await tx.insert(subscriptionInvoices).values({
        tenantId,
        subscriptionId: row.id,
        periodStart: now,
        periodEnd,
        amountCents: priceCents,
        status: 'paid',
        providerChargeId: charge.providerTransactionId,
      });
      await tx.update(tenants).set({ status: 'active', nextBillingCheckAt: periodEnd }).where(eq(tenants.id, tenantId));

      return row;
    });
  }

  // Immediate cancellation, not scheduled for the end of the cycle —
  // deliberate simplification of the billing MVP (avoids a "canceled but
  // stays active until such date" state that would need yet another state
  // machine).
  async cancel(tenantId: string): Promise<SubscriptionRow> {
    const existing = await this.getSubscription(tenantId);
    if (!existing || existing.status === 'canceled') {
      throw new BadRequestException('Nenhuma assinatura ativa pra cancelar');
    }

    return runWithTenant(this.db, tenantId, async (tx) => {
      const [updated] = await tx
        .update(subscriptions)
        .set({ status: 'canceled', updatedAt: new Date() })
        .where(eq(subscriptions.tenantId, tenantId))
        .returning();
      if (!updated) {
        throw new Error('Falha ao cancelar assinatura');
      }
      // Cleared, not left pointing at a stale date: without this, a
      // canceled tenant with no subscription row at all could never happen
      // (there's always one, just status: 'canceled'), but clearing it here
      // means processDueBilling()'s candidate query never even considers
      // this tenant again — one less thing relying on the inner status
      // filter alone.
      await tx.update(tenants).set({ status: 'canceled', nextBillingCheckAt: null }).where(eq(tenants.id, tenantId));
      return updated;
    });
  }

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async handleCron(): Promise<void> {
    const processed = await this.processDueBilling();
    if (processed > 0) {
      this.logger.log(`${processed} assinatura(s) processada(s) no ciclo de cobrança.`);
    }
  }

  // Charges overdue cycles (status active/past_due with currentPeriodEnd in
  // the past). Success advances the period; failure marks past_due (1st
  // time) and keeps retrying every day until the grace period runs out, at
  // which point it blocks. A tenant that's already blocked is no longer
  // retried on its own — only via subscribe() (manual reactivation), so we
  // don't keep trying to charge a card already known to be invalid.
  // subscriptions/subscription_invoices are RLS-FORCEd like every other
  // tenant-owned table (migration 0039), so this can't do one cross-tenant
  // join on `subscriptions` the way it used to — a query against an
  // RLS-FORCEd table with no app.tenant_id set comes back empty, not "all
  // tenants". Candidate discovery instead runs against
  // tenants.nextBillingCheckAt, a plain (non-RLS) pointer kept in sync with
  // subscriptions.currentPeriodEnd by subscribe()/cancel()/the renewal
  // branch below — same role tenants.trialEndsAt already plays for
  // TrialExpiryService. This was NOT optional: an earlier version of this
  // method looped every row in `tenants` (one runWithTenant transaction
  // each) and timed out in the e2e suite once the dev database had
  // accumulated a few thousand tenants from prior test runs — a real
  // preview of what looping the whole tenant table would cost in
  // production at even modest scale, not just a test artifact to shrug off.
  async processDueBilling(): Promise<number> {
    const now = new Date();
    const tenantRows = await this.db
      .select({ id: tenants.id })
      .from(tenants)
      .where(and(ne(tenants.status, 'blocked'), isNotNull(tenants.nextBillingCheckAt), lte(tenants.nextBillingCheckAt, now)));

    let processed = 0;
    for (const tenant of tenantRows) {
      const subscription = await runWithTenant(this.db, tenant.id, async (tx) => {
        const [row] = await tx
          .select()
          .from(subscriptions)
          .where(and(eq(subscriptions.tenantId, tenant.id), inArray(subscriptions.status, ['active', 'past_due']), lte(subscriptions.currentPeriodEnd, now)))
          .limit(1);
        return row;
      });
      if (!subscription) {
        continue;
      }
      processed += 1;

      const charge = await this.paymentProvider.charge({
        tenantId: subscription.tenantId,
        saleId: null,
        method: 'cartao_credito',
        amountCents: subscription.priceCents,
      });

      if (charge.approved) {
        const periodEnd = addDays(subscription.currentPeriodEnd, BILLING_PERIOD_DAYS);
        await runWithTenant(this.db, tenant.id, async (tx) => {
          await tx
            .update(subscriptions)
            .set({
              status: 'active',
              pastDueSince: null,
              currentPeriodStart: subscription.currentPeriodEnd,
              currentPeriodEnd: periodEnd,
              updatedAt: now,
            })
            .where(eq(subscriptions.id, subscription.id));
          await tx.insert(subscriptionInvoices).values({
            tenantId: subscription.tenantId,
            subscriptionId: subscription.id,
            periodStart: subscription.currentPeriodEnd,
            periodEnd,
            amountCents: subscription.priceCents,
            status: 'paid',
            providerChargeId: charge.providerTransactionId,
          });
          await tx.update(tenants).set({ status: 'active', nextBillingCheckAt: periodEnd }).where(eq(tenants.id, subscription.tenantId));
        });
        continue;
      }

      const pastDueSince = subscription.pastDueSince ?? now;
      const graceExpired = now.getTime() - pastDueSince.getTime() > GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000;
      // tenants.nextBillingCheckAt deliberately untouched here: it still
      // mirrors the unmoved subscriptions.currentPeriodEnd, which is
      // already <= now — so this tenant is picked up again automatically
      // on tomorrow's run without needing an explicit "retry tomorrow" write.
      await runWithTenant(this.db, tenant.id, async (tx) => {
        await tx
          .update(subscriptions)
          .set({ status: 'past_due', pastDueSince, updatedAt: now })
          .where(eq(subscriptions.id, subscription.id));
        await tx.insert(subscriptionInvoices).values({
          tenantId: subscription.tenantId,
          subscriptionId: subscription.id,
          periodStart: subscription.currentPeriodStart,
          periodEnd: subscription.currentPeriodEnd,
          amountCents: subscription.priceCents,
          status: 'failed',
          providerChargeId: charge.providerTransactionId,
        });
        await tx
          .update(tenants)
          .set({ status: graceExpired ? 'blocked' : 'past_due' })
          .where(eq(tenants.id, subscription.tenantId));
      });
    }

    return processed;
  }
}
