import { randomBytes } from 'node:crypto';
import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { and, desc, eq, lte, sql } from 'drizzle-orm';
import type { CreateWebhookEndpointInput, UpdateWebhookEndpointInput, WebhookEventType } from '@pcaarb/shared';
import { DRIZZLE, type Database } from '../../database/drizzle.provider';
import { runWithTenant } from '../../database/tenant-context';
import {
  tenants,
  webhookEndpoints,
  webhookDeliveries,
  type WebhookEndpointRow,
  type WebhookDeliveryRow,
} from '../../database/schema/index';
import { assertPublicWebhookUrl } from './webhook-url-guard';
import { buildSignatureHeader } from './webhook-signing';

// Backoff table: index i is the delay applied after attempt (i+1) fails.
// 1m / 5m / 30m / 2h / 12h — close to Stripe's real shape (fast retries
// first, tapering off) without copying it exactly. MAX_ATTEMPTS = 6 means a
// persistently-down endpoint gets ~15h of retries before being marked
// 'exhausted' and left for a manual retry from the delivery log.
const MAX_ATTEMPTS = 6;
const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 3_600_000, 12 * 3_600_000];
const DELIVERY_TIMEOUT_MS = 10_000;

function generateSecret(): string {
  return `whsec_${randomBytes(24).toString('base64url')}`;
}

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async listEndpoints(tenantId: string): Promise<WebhookEndpointRow[]> {
    return runWithTenant(this.db, tenantId, (tx) =>
      tx.select().from(webhookEndpoints).where(eq(webhookEndpoints.tenantId, tenantId)).orderBy(desc(webhookEndpoints.createdAt)),
    );
  }

  async createEndpoint(tenantId: string, userId: string, input: CreateWebhookEndpointInput): Promise<WebhookEndpointRow> {
    await assertPublicWebhookUrl(input.url);
    return runWithTenant(this.db, tenantId, async (tx) => {
      const [endpoint] = await tx
        .insert(webhookEndpoints)
        .values({
          tenantId,
          url: input.url,
          description: input.description ?? null,
          secret: generateSecret(),
          subscribedEvents: input.subscribedEvents,
          createdByUserId: userId,
        })
        .returning();
      if (!endpoint) {
        throw new Error('Failed to create webhook endpoint');
      }
      return endpoint;
    });
  }

  async updateEndpoint(tenantId: string, id: string, input: UpdateWebhookEndpointInput): Promise<WebhookEndpointRow> {
    if (input.url) {
      await assertPublicWebhookUrl(input.url);
    }
    return runWithTenant(this.db, tenantId, async (tx) => {
      const existing = await this.findEndpointTx(tx, tenantId, id);
      const [updated] = await tx
        .update(webhookEndpoints)
        .set({
          ...(input.url !== undefined ? { url: input.url } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.subscribedEvents !== undefined ? { subscribedEvents: input.subscribedEvents } : {}),
          ...(input.active !== undefined ? { active: input.active } : {}),
          updatedAt: new Date(),
        })
        .where(eq(webhookEndpoints.id, existing.id))
        .returning();
      return updated!;
    });
  }

  async rotateSecret(tenantId: string, id: string): Promise<WebhookEndpointRow> {
    return runWithTenant(this.db, tenantId, async (tx) => {
      const existing = await this.findEndpointTx(tx, tenantId, id);
      const [updated] = await tx
        .update(webhookEndpoints)
        .set({ secret: generateSecret(), updatedAt: new Date() })
        .where(eq(webhookEndpoints.id, existing.id))
        .returning();
      return updated!;
    });
  }

  async deleteEndpoint(tenantId: string, id: string): Promise<void> {
    await runWithTenant(this.db, tenantId, async (tx) => {
      const existing = await this.findEndpointTx(tx, tenantId, id);
      await tx.delete(webhookEndpoints).where(eq(webhookEndpoints.id, existing.id));
    });
  }

  async listDeliveries(tenantId: string, endpointId: string): Promise<WebhookDeliveryRow[]> {
    return runWithTenant(this.db, tenantId, async (tx) => {
      await this.findEndpointTx(tx, tenantId, endpointId);
      return tx
        .select()
        .from(webhookDeliveries)
        .where(and(eq(webhookDeliveries.webhookEndpointId, endpointId), eq(webhookDeliveries.tenantId, tenantId)))
        .orderBy(desc(webhookDeliveries.createdAt));
    });
  }

  async sendTestEvent(tenantId: string, endpointId: string): Promise<void> {
    const endpoint = await runWithTenant(this.db, tenantId, (tx) => this.findEndpointTx(tx, tenantId, endpointId));
    await this.deliver(endpoint, 'webhook.test', { message: 'This is a test event from PCAARB.' });
  }

  async retryDelivery(tenantId: string, deliveryId: string): Promise<void> {
    const { delivery, endpoint } = await runWithTenant(this.db, tenantId, async (tx) => {
      const [delivery] = await tx
        .select()
        .from(webhookDeliveries)
        .where(and(eq(webhookDeliveries.id, deliveryId), eq(webhookDeliveries.tenantId, tenantId)))
        .limit(1);
      if (!delivery) {
        throw new NotFoundException('Webhook delivery not found');
      }
      const endpoint = await this.findEndpointTx(tx, tenantId, delivery.webhookEndpointId);
      // Bumped here, same as the cron sweep in retryDueDeliveries — a
      // manual retry from the delivery log IS another attempt, and must
      // count toward MAX_ATTEMPTS the same way an automatic one does.
      const [bumped] = await tx
        .update(webhookDeliveries)
        .set({ attempt: delivery.attempt + 1 })
        .where(eq(webhookDeliveries.id, delivery.id))
        .returning();
      return { delivery: bumped!, endpoint };
    });
    await this.attemptDelivery(endpoint, delivery);
  }

  // Fire-and-forget from the caller's perspective (SalesService,
  // SaleReturnsService): a subscriber's downtime must never affect the
  // sale/return it's supposed to be notified about, so this never throws —
  // every failure path resolves into a persisted delivery record instead of
  // an exception. Call this AFTER the triggering transaction has committed,
  // never from inside it: an outbound HTTP call has no business holding a
  // database transaction/connection open.
  async dispatchEvent(tenantId: string, eventType: WebhookEventType, payload: Record<string, unknown>): Promise<void> {
    try {
      const endpoints = await runWithTenant(this.db, tenantId, (tx) =>
        tx.select().from(webhookEndpoints).where(and(eq(webhookEndpoints.tenantId, tenantId), eq(webhookEndpoints.active, true))),
      );
      const subscribed = endpoints.filter((endpoint) => (endpoint.subscribedEvents as string[]).includes(eventType));
      await Promise.all(subscribed.map((endpoint) => this.deliver(endpoint, eventType, payload)));
    } catch (error) {
      this.logger.error(`Failed to dispatch ${eventType} for tenant ${tenantId}`, error instanceof Error ? error.stack : String(error));
    }
  }

  // Sweeps every tenant's due retries, one tenant at a time under its own
  // `runWithTenant` context. A single cross-tenant query would be tempting
  // (one query instead of N), but webhook_deliveries/webhook_endpoints are
  // both RLS-FORCEd like the rest of the tenant-owned tables — a query that
  // never sets app.tenant_id would just come back empty, or worse, this
  // would have to be the one place in the codebase reading tenant data
  // without tenant scoping. Looping tenants is the option that keeps the
  // same isolation guarantee everywhere; fine at today's tenant count.
  async retryDueDeliveries(): Promise<number> {
    const tenantRows = await this.db.select({ id: tenants.id }).from(tenants);
    let retried = 0;
    for (const { id: tenantId } of tenantRows) {
      const due = await runWithTenant(this.db, tenantId, (tx) =>
        tx
          .select({ delivery: webhookDeliveries, endpoint: webhookEndpoints })
          .from(webhookDeliveries)
          .innerJoin(webhookEndpoints, eq(webhookEndpoints.id, webhookDeliveries.webhookEndpointId))
          .where(
            and(
              eq(webhookDeliveries.tenantId, tenantId),
              eq(webhookDeliveries.status, 'failed'),
              eq(webhookEndpoints.active, true),
              lte(webhookDeliveries.nextRetryAt, sql`now()`),
            ),
          ),
      );
      for (const { delivery, endpoint } of due) {
        const bumped = await runWithTenant(this.db, tenantId, async (tx) => {
          const [row] = await tx
            .update(webhookDeliveries)
            .set({ attempt: delivery.attempt + 1 })
            .where(eq(webhookDeliveries.id, delivery.id))
            .returning();
          return row!;
        });
        await this.attemptDelivery(endpoint, bumped);
        retried += 1;
      }
    }
    return retried;
  }

  private async findEndpointTx(tx: Database, tenantId: string, id: string): Promise<WebhookEndpointRow> {
    const [endpoint] = await tx
      .select()
      .from(webhookEndpoints)
      .where(and(eq(webhookEndpoints.id, id), eq(webhookEndpoints.tenantId, tenantId)))
      .limit(1);
    if (!endpoint) {
      throw new NotFoundException('Webhook endpoint not found');
    }
    return endpoint;
  }

  private async deliver(endpoint: WebhookEndpointRow, eventType: string, payload: Record<string, unknown>): Promise<void> {
    const [delivery] = await runWithTenant(this.db, endpoint.tenantId, (tx) =>
      tx
        .insert(webhookDeliveries)
        .values({ tenantId: endpoint.tenantId, webhookEndpointId: endpoint.id, eventType, payload, status: 'pending', attempt: 1 })
        .returning(),
    );
    if (!delivery) {
      return;
    }
    await this.attemptDelivery(endpoint, delivery);
  }

  private async attemptDelivery(endpoint: WebhookEndpointRow, delivery: WebhookDeliveryRow): Promise<void> {
    try {
      // Re-checked here, not just at endpoint creation: DNS can resolve
      // differently between the two moments (rebinding), and an endpoint
      // active today may have been pointed at a private address since.
      await assertPublicWebhookUrl(endpoint.url);
    } catch {
      await this.recordOutcome(delivery, { success: false, httpStatus: null, errorMessage: 'Endpoint URL no longer resolves to a public address' });
      return;
    }

    const body = JSON.stringify({ id: delivery.id, type: delivery.eventType, createdAt: delivery.createdAt.toISOString(), data: delivery.payload });
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);
    try {
      const response = await fetch(endpoint.url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'user-agent': 'PCAARB-Webhooks/1.0',
          'x-pcaarb-event': delivery.eventType,
          'x-pcaarb-signature': buildSignatureHeader(endpoint.secret, timestamp, body),
        },
        body,
        // Never follow redirects automatically — a 3xx to a private address
        // would otherwise bypass the public-URL check above entirely.
        redirect: 'manual',
        signal: controller.signal,
      });
      const success = response.status >= 200 && response.status < 300;
      await this.recordOutcome(delivery, {
        success,
        httpStatus: response.status,
        errorMessage: success ? null : `Endpoint responded with HTTP ${response.status}`,
      });
    } catch (error) {
      await this.recordOutcome(delivery, { success: false, httpStatus: null, errorMessage: error instanceof Error ? error.message : 'Delivery failed' });
    } finally {
      clearTimeout(timeout);
    }
  }

  private async recordOutcome(
    delivery: WebhookDeliveryRow,
    outcome: { success: boolean; httpStatus: number | null; errorMessage: string | null },
  ): Promise<void> {
    if (outcome.success) {
      await runWithTenant(this.db, delivery.tenantId, (tx) =>
        tx
          .update(webhookDeliveries)
          .set({ status: 'success', httpStatus: outcome.httpStatus, errorMessage: null, deliveredAt: new Date() })
          .where(eq(webhookDeliveries.id, delivery.id)),
      );
      return;
    }
    const exhausted = delivery.attempt >= MAX_ATTEMPTS;
    // Safe index: exhausted is false here only when delivery.attempt < MAX_ATTEMPTS
    // (= RETRY_DELAYS_MS.length + 1), so delivery.attempt - 1 is always in range.
    const nextRetryAt = exhausted ? null : new Date(Date.now() + RETRY_DELAYS_MS[delivery.attempt - 1]!);
    await runWithTenant(this.db, delivery.tenantId, (tx) =>
      tx
        .update(webhookDeliveries)
        .set({ status: exhausted ? 'exhausted' : 'failed', httpStatus: outcome.httpStatus, errorMessage: outcome.errorMessage, nextRetryAt })
        .where(eq(webhookDeliveries.id, delivery.id)),
    );
  }
}
