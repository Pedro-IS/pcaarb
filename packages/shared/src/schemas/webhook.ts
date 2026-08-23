import { z } from 'zod';

// Business events a tenant can subscribe a webhook endpoint to. Kept as an
// explicit enum (not a free-text string) so a subscription request fails
// fast on a typo instead of silently never firing. 'webhook.test' is not a
// real business event — it exists only so the endpoint's "Send test event"
// action has something to send.
export const webhookEventTypeSchema = z.enum(['sale.completed', 'sale.returned', 'webhook.test']);

export type WebhookEventType = z.infer<typeof webhookEventTypeSchema>;

export const webhookDeliveryStatusSchema = z.enum(['pending', 'success', 'failed', 'exhausted']);

export type WebhookDeliveryStatus = z.infer<typeof webhookDeliveryStatusSchema>;

export const webhookEndpointSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  url: z.string().url(),
  description: z.string().nullable(),
  // Shown on every read, unlike an API key's raw value (which is only ever
  // shown once) — PCAARB reuses this secret to sign every delivery, so the
  // tenant needs to be able to look it up again to configure verification
  // on their receiving end. Same tradeoff Stripe/GitHub/Shopify make.
  secret: z.string(),
  subscribedEvents: z.array(webhookEventTypeSchema),
  active: z.boolean(),
  createdByUserId: z.string().uuid(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type WebhookEndpoint = z.infer<typeof webhookEndpointSchema>;

export const createWebhookEndpointSchema = z.object({
  url: z.string().url('Enter a valid URL'),
  description: z.string().max(200).optional(),
  subscribedEvents: z.array(webhookEventTypeSchema).min(1, 'Select at least one event'),
});

export type CreateWebhookEndpointInput = z.infer<typeof createWebhookEndpointSchema>;

export const updateWebhookEndpointSchema = z.object({
  url: z.string().url('Enter a valid URL').optional(),
  description: z.string().max(200).nullable().optional(),
  subscribedEvents: z.array(webhookEventTypeSchema).min(1, 'Select at least one event').optional(),
  active: z.boolean().optional(),
});

export type UpdateWebhookEndpointInput = z.infer<typeof updateWebhookEndpointSchema>;

export const webhookDeliverySchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  webhookEndpointId: z.string().uuid(),
  eventType: z.string(),
  payload: z.record(z.unknown()),
  status: webhookDeliveryStatusSchema,
  httpStatus: z.number().int().nullable(),
  errorMessage: z.string().nullable(),
  attempt: z.number().int(),
  nextRetryAt: z.string().datetime().nullable(),
  deliveredAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});

export type WebhookDelivery = z.infer<typeof webhookDeliverySchema>;
