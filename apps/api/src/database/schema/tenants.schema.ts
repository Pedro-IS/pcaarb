import { pgTable, uuid, text, timestamp, pgEnum, index } from 'drizzle-orm/pg-core';

export const tenantStatusEnum = pgEnum('tenant_status', [
  'trial',
  'active',
  'past_due',
  'blocked',
  'canceled',
]);

export const tenants = pgTable(
  'tenants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyName: text('company_name').notNull(),
    document: text('document').notNull().unique(),
    status: tenantStatusEnum('status').notNull().default('trial'),
    trialEndsAt: timestamp('trial_ends_at', { withTimezone: true }),
    // Denormalized pointer to the tenant's own (RLS-protected)
    // subscriptions.currentPeriodEnd — same role trialEndsAt already plays
    // for TrialExpiryService's cron. subscriptions/subscription_invoices are
    // RLS-FORCEd (migration 0039), so BillingService.processDueBilling()
    // can't scan them cross-tenant directly; this column, kept in sync on
    // subscribe/renew/cancel, lets it find candidates cheaply on the one
    // table that's deliberately outside RLS, without ever holding the
    // sensitive billing data (amounts, plan, invoice history) itself.
    nextBillingCheckAt: timestamp('next_billing_check_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('tenants_next_billing_check_at_idx').on(table.nextBillingCheckAt)],
);

export type TenantRow = typeof tenants.$inferSelect;
export type NewTenantRow = typeof tenants.$inferInsert;
