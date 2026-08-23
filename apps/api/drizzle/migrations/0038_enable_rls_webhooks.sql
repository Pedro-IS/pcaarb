-- Same isolation pattern as every prior FORCE RLS migration (0002, 0004, 0006,
-- 0008, 0010, 0014, 0016, 0018, 0021, 0023, 0026, 0028, 0032, 0035).
-- FORCE for the same reason as always: migration 0011 already ran before
-- these tables existed, so the table owner would otherwise bypass RLS.
ALTER TABLE "webhook_endpoints" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "webhook_endpoints" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_webhook_endpoints" ON "webhook_endpoints"
	USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE "webhook_deliveries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "webhook_deliveries" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_webhook_deliveries" ON "webhook_deliveries"
	USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid);
