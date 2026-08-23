import { pgTable, uuid, text, jsonb, integer, timestamp, pgEnum } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.schema';
import { webhookEndpoints } from './webhook-endpoints.schema';

export const webhookDeliveryStatusEnum = pgEnum('webhook_delivery_status', [
  'pending',
  'success',
  'failed',
  'exhausted',
]);

// One row per event delivered to one endpoint — an inspectable attempt log,
// the same role Stripe's "webhook attempts" dashboard serves. `attempt`
// advances in place on retry (rather than inserting a new row per try), so
// a delivery's whole history stays a single row to look up.
export const webhookDeliveries = pgTable('webhook_deliveries', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  webhookEndpointId: uuid('webhook_endpoint_id')
    .notNull()
    .references(() => webhookEndpoints.id, { onDelete: 'cascade' }),
  eventType: text('event_type').notNull(),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
  status: webhookDeliveryStatusEnum('status').notNull().default('pending'),
  httpStatus: integer('http_status'),
  errorMessage: text('error_message'),
  attempt: integer('attempt').notNull().default(1),
  nextRetryAt: timestamp('next_retry_at', { withTimezone: true }),
  deliveredAt: timestamp('delivered_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type WebhookDeliveryRow = typeof webhookDeliveries.$inferSelect;
export type NewWebhookDeliveryRow = typeof webhookDeliveries.$inferInsert;
