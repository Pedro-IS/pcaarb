import { z } from 'zod';

// The two standard Brazilian thermal receipt roll widths — not a free
// number, so nothing but these two values can ever reach the @page CSS
// size hint that's built from it (see SaleReceipt).
export const RECEIPT_PAPER_WIDTHS = [58, 80] as const;
export const receiptPaperWidthSchema = z.union([z.literal(58), z.literal(80)]);

export const storeSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  name: z.string(),
  active: z.boolean(),
  receiptPaperWidthMm: receiptPaperWidthSchema,
  receiptAutoPrint: z.boolean(),
  printerLabel: z.string().nullable(),
  createdAt: z.string().datetime(),
});

export type Store = z.infer<typeof storeSchema>;

export const createStoreSchema = z.object({
  name: z.string().min(2, 'Nome muito curto').max(120),
});

export type CreateStoreInput = z.infer<typeof createStoreSchema>;

export const updateStoreSchema = z.object({
  name: z.string().min(2, 'Nome muito curto').max(120).optional(),
  active: z.boolean().optional(),
  receiptPaperWidthMm: receiptPaperWidthSchema.optional(),
  receiptAutoPrint: z.boolean().optional(),
  printerLabel: z.string().trim().max(60).nullable().optional(),
});

export type UpdateStoreInput = z.infer<typeof updateStoreSchema>;
