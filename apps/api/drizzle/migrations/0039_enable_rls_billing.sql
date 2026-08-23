-- Closes a gap found during the 2026-08-23 competitive-analysis pass (see
-- docs/06-competitive-analysis-and-action-plan.md): subscriptions and
-- subscription_invoices were the only two tenant-owned business tables in
-- the whole schema left outside RLS. The original reasoning (see the
-- removed comment this migration supersedes, in billing.service.ts) was
-- that the daily billing cron needs to scan across every tenant, which
-- per-session RLS would block — solved instead the same way
-- WebhooksService.retryDueDeliveries() solves the identical problem: loop
-- tenant IDs (from the non-RLS `tenants` table) and scope each iteration
-- with runWithTenant, rather than leaving the tables unprotected.
-- Same FORCE pattern as every other RLS migration (0002 onward).
ALTER TABLE "subscriptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "subscriptions" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_subscriptions" ON "subscriptions"
	USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE "subscription_invoices" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "subscription_invoices" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_subscription_invoices" ON "subscription_invoices"
	USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid);
