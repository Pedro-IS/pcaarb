import { pgTable, uuid, text, boolean, integer, timestamp } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.schema';

// Every sale/cash session happens at a store — even a tenant on the Starter/
// Profissional plan (a single store) has one row here, created automatically
// at registration (see TenantsService.registerWithOwner). Creating a 2nd
// store is restricted to the Multi-store plan (see BillingService/StoresService)
// — it's literally what that plan sells.
export const stores = pgTable('stores', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  active: boolean('active').notNull().default(true),
  // Printer profile for this store's checkout counter — the receipt printed
  // here is always a non-fiscal courtesy copy (the fiscal instrument is the
  // NFC-e itself, transmitted electronically); this only controls how that
  // copy is laid out and whether it prints automatically. 58/80mm are the
  // two standard Brazilian thermal roll widths — enforced by the Zod schema
  // (packages/shared), not a DB constraint, same approach used elsewhere in
  // this codebase for small closed value sets.
  receiptPaperWidthMm: integer('receipt_paper_width_mm').notNull().default(80),
  receiptAutoPrint: boolean('receipt_auto_print').notNull().default(false),
  printerLabel: text('printer_label'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type StoreRow = typeof stores.$inferSelect;
export type NewStoreRow = typeof stores.$inferInsert;
