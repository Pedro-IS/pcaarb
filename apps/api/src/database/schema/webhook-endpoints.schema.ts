import { pgTable, uuid, text, jsonb, boolean, timestamp } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.schema';
import { users } from './users.schema';

// A tenant-configured HTTP target that receives business events (sale
// completed, sale returned...) as signed POST requests — see
// WebhooksService for the delivery/retry/signing mechanics. The inverse of
// an API key: a key is a credential the tenant uses to call INTO PCAARB,
// an endpoint is PCAARB calling OUT to a system the tenant owns.
export const webhookEndpoints = pgTable('webhook_endpoints', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  url: text('url').notNull(),
  description: text('description'),
  // Kept in plaintext (unlike an API key, which is only ever stored
  // hashed): PCAARB is the one signing outgoing requests with it on every
  // delivery, so it must stay reversible on our side — the same tradeoff
  // Stripe/GitHub/Shopify make for webhook signing secrets, which is why
  // their dashboards let a tenant view the secret again, not just once.
  secret: text('secret').notNull(),
  subscribedEvents: jsonb('subscribed_events').$type<string[]>().notNull(),
  active: boolean('active').notNull().default(true),
  createdByUserId: uuid('created_by_user_id')
    .notNull()
    .references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type WebhookEndpointRow = typeof webhookEndpoints.$inferSelect;
export type NewWebhookEndpointRow = typeof webhookEndpoints.$inferInsert;
