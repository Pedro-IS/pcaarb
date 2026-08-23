import { createHmac } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { DRIZZLE, type Database } from '../src/database/drizzle.provider';
import { users } from '../src/database/schema/index';
import { registerTenant } from './helpers/register-tenant';
import { openCashSession } from './helpers/open-cash-session';

interface CapturedRequest {
  headers: Record<string, string | string[] | undefined>;
  body: string;
  status: number;
}

// A local receiver the test fully controls — reachable only because
// webhook-url-guard.ts skips its private-IP block under NODE_ENV=test
// (vitest's default), which is exactly what that skip exists for. Each
// call gets its own random free port so tests can run without colliding.
function startCaptureServer(responseStatus = 200): Promise<{ url: string; requests: CapturedRequest[]; close: () => Promise<void> }> {
  const requests: CapturedRequest[] = [];
  return new Promise((resolve) => {
    const server: Server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk) => chunks.push(chunk));
      req.on('end', () => {
        requests.push({ headers: req.headers, body: Buffer.concat(chunks).toString('utf8'), status: responseStatus });
        res.writeHead(responseStatus);
        res.end();
      });
    });
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${port}/receive`,
        requests,
        close: () => new Promise((res) => server.close(() => res())),
      });
    });
  });
}

async function waitFor(condition: () => boolean, timeoutMs = 5000): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('Timed out waiting for condition');
    }
    await new Promise((r) => setTimeout(r, 50));
  }
}

async function loginAs(app: INestApplication, db: Database, tenantId: string, role: 'admin' | 'financeiro' | 'operador_caixa') {
  const email = `${role}-${Date.now()}-${Math.random().toString(36).slice(2)}@pcaarb.test`;
  const passwordHash = await bcrypt.hash('SenhaForte123', 12);
  await db.insert(users).values({ tenantId, name: role, email, passwordHash, role });
  const login = await request(app.getHttpServer()).post('/api/auth/login').send({ email, password: 'SenhaForte123' });
  return login.body.accessToken as string;
}

describe('Webhooks (e2e)', () => {
  let app: INestApplication;
  let db: Database;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    db = app.get(DRIZZLE);
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates an endpoint, lists it, and never exposes the secret differently between the two', async () => {
    const tenant = await registerTenant(app, 'webhook-cria');
    const created = await request(app.getHttpServer())
      .post('/api/webhooks')
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({ url: 'https://example.com/hook', subscribedEvents: ['sale.completed'] });
    expect(created.status).toBe(201);
    expect(created.body.secret).toMatch(/^whsec_/);
    expect(created.body.active).toBe(true);

    const list = await request(app.getHttpServer()).get('/api/webhooks').set('Authorization', `Bearer ${tenant.accessToken}`);
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].secret).toBe(created.body.secret);
  });

  it('rejects a subscription request with no event types and an invalid URL', async () => {
    const tenant = await registerTenant(app, 'webhook-valida');
    const noEvents = await request(app.getHttpServer())
      .post('/api/webhooks')
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({ url: 'https://example.com/hook', subscribedEvents: [] });
    expect(noEvents.status).toBe(400);

    const badUrl = await request(app.getHttpServer())
      .post('/api/webhooks')
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({ url: 'not-a-url', subscribedEvents: ['sale.completed'] });
    expect(badUrl.status).toBe(400);
  });

  it('updates active/events, rotates the secret to a new value, and deletes', async () => {
    const tenant = await registerTenant(app, 'webhook-atualiza');
    const created = await request(app.getHttpServer())
      .post('/api/webhooks')
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({ url: 'https://example.com/hook', subscribedEvents: ['sale.completed'] });

    const updated = await request(app.getHttpServer())
      .patch(`/api/webhooks/${created.body.id}`)
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({ active: false, subscribedEvents: ['sale.completed', 'sale.returned'] });
    expect(updated.status).toBe(200);
    expect(updated.body.active).toBe(false);
    expect(updated.body.subscribedEvents).toEqual(['sale.completed', 'sale.returned']);

    const rotated = await request(app.getHttpServer())
      .post(`/api/webhooks/${created.body.id}/rotate-secret`)
      .set('Authorization', `Bearer ${tenant.accessToken}`);
    expect(rotated.status).toBe(201);
    expect(rotated.body.secret).not.toBe(created.body.secret);

    const deleted = await request(app.getHttpServer())
      .delete(`/api/webhooks/${created.body.id}`)
      .set('Authorization', `Bearer ${tenant.accessToken}`);
    expect(deleted.status).toBe(204);

    const list = await request(app.getHttpServer()).get('/api/webhooks').set('Authorization', `Bearer ${tenant.accessToken}`);
    expect(list.body).toHaveLength(0);
  });

  it('only admin/owner manage webhooks; financeiro and operador_caixa are rejected', async () => {
    const tenant = await registerTenant(app, 'webhook-rbac');
    const financeiroToken = await loginAs(app, db, tenant.tenantId, 'financeiro');
    const cashierToken = await loginAs(app, db, tenant.tenantId, 'operador_caixa');

    const financeiroAttempt = await request(app.getHttpServer()).get('/api/webhooks').set('Authorization', `Bearer ${financeiroToken}`);
    expect(financeiroAttempt.status).toBe(403);

    const cashierAttempt = await request(app.getHttpServer())
      .post('/api/webhooks')
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({ url: 'https://example.com/hook', subscribedEvents: ['sale.completed'] });
    expect(cashierAttempt.status).toBe(403);
  });

  it('isolates endpoints between tenants', async () => {
    const tenantA = await registerTenant(app, 'webhook-isola-a');
    const tenantB = await registerTenant(app, 'webhook-isola-b');
    await request(app.getHttpServer())
      .post('/api/webhooks')
      .set('Authorization', `Bearer ${tenantA.accessToken}`)
      .send({ url: 'https://example.com/hook', subscribedEvents: ['sale.completed'] });

    const listB = await request(app.getHttpServer()).get('/api/webhooks').set('Authorization', `Bearer ${tenantB.accessToken}`);
    expect(listB.body).toHaveLength(0);
  });

  it('delivers a signed test event to the configured URL', async () => {
    const tenant = await registerTenant(app, 'webhook-teste');
    const capture = await startCaptureServer();
    try {
      const created = await request(app.getHttpServer())
        .post('/api/webhooks')
        .set('Authorization', `Bearer ${tenant.accessToken}`)
        .send({ url: capture.url, subscribedEvents: ['sale.completed'] });

      const test = await request(app.getHttpServer())
        .post(`/api/webhooks/${created.body.id}/test`)
        .set('Authorization', `Bearer ${tenant.accessToken}`);
      expect(test.status).toBe(204);

      await waitFor(() => capture.requests.length === 1);
      const received = capture.requests[0]!;
      expect(received.headers['x-pcaarb-event']).toBe('webhook.test');
      const signatureHeader = received.headers['x-pcaarb-signature'] as string;
      const [tPart, vPart] = signatureHeader.split(',');
      const timestamp = tPart!.slice('t='.length);
      const expectedSignature = createHmac('sha256', created.body.secret as string)
        .update(`${timestamp}.${received.body}`)
        .digest('hex');
      expect(vPart).toBe(`v1=${expectedSignature}`);

      const deliveries = await request(app.getHttpServer())
        .get(`/api/webhooks/${created.body.id}/deliveries`)
        .set('Authorization', `Bearer ${tenant.accessToken}`);
      expect(deliveries.body).toHaveLength(1);
      expect(deliveries.body[0].status).toBe('success');
      expect(deliveries.body[0].httpStatus).toBe(200);
    } finally {
      await capture.close();
    }
  });

  it('fires sale.completed on a real sale, but never re-fires on an offline-sync replay of the same clientSaleId', async () => {
    const tenant = await registerTenant(app, 'webhook-venda');
    const capture = await startCaptureServer();
    try {
      await request(app.getHttpServer())
        .post('/api/webhooks')
        .set('Authorization', `Bearer ${tenant.accessToken}`)
        .send({ url: capture.url, subscribedEvents: ['sale.completed'] });

      const product = await request(app.getHttpServer())
        .post('/api/products')
        .set('Authorization', `Bearer ${tenant.accessToken}`)
        .send({ name: 'Produto webhook', priceCents: 1500, trackStock: false });
      await openCashSession(app, tenant.accessToken, 5000);

      const clientSaleId = 'a1111111-1111-1111-1111-111111111111';
      const saleBody = { clientSaleId, items: [{ productId: product.body.id, quantity: 1 }], payments: [{ method: 'dinheiro', amountCents: 1500 }] };
      const sale = await request(app.getHttpServer()).post('/api/sales').set('Authorization', `Bearer ${tenant.accessToken}`).send(saleBody);
      expect(sale.status).toBe(201);

      await waitFor(() => capture.requests.length === 1);

      // Replay: same clientSaleId, as an offline-sync retry would send —
      // must return the same sale without a second webhook firing.
      const replay = await request(app.getHttpServer()).post('/api/sales').set('Authorization', `Bearer ${tenant.accessToken}`).send(saleBody);
      expect(replay.status).toBe(201);
      expect(replay.body.id).toBe(sale.body.id);

      // Give a would-be second delivery time to arrive before asserting it didn't.
      await new Promise((r) => setTimeout(r, 300));
      expect(capture.requests).toHaveLength(1);

      const payload = JSON.parse(capture.requests[0]!.body);
      expect(payload.type).toBe('sale.completed');
      expect(payload.data.saleId).toBe(sale.body.id);
      expect(payload.data.totalCents).toBe(1500);
    } finally {
      await capture.close();
    }
  });

  it('a failed delivery is recorded with a scheduled retry, and a manual retry against a now-healthy endpoint succeeds', async () => {
    const tenant = await registerTenant(app, 'webhook-retry');
    const capture = await startCaptureServer(500);
    try {
      const created = await request(app.getHttpServer())
        .post('/api/webhooks')
        .set('Authorization', `Bearer ${tenant.accessToken}`)
        .send({ url: capture.url, subscribedEvents: ['sale.completed'] });

      await request(app.getHttpServer()).post(`/api/webhooks/${created.body.id}/test`).set('Authorization', `Bearer ${tenant.accessToken}`);
      await waitFor(() => capture.requests.length === 1);

      let deliveries = await request(app.getHttpServer())
        .get(`/api/webhooks/${created.body.id}/deliveries`)
        .set('Authorization', `Bearer ${tenant.accessToken}`);
      expect(deliveries.body[0].status).toBe('failed');
      expect(deliveries.body[0].httpStatus).toBe(500);
      expect(deliveries.body[0].nextRetryAt).toBeTruthy();
      expect(deliveries.body[0].attempt).toBe(1);

      // The endpoint "recovers": from here on it answers 200.
      await capture.close();
      const healthy = await startCaptureServer(200);
      // Point the endpoint at the recovered server's port before retrying.
      await request(app.getHttpServer())
        .patch(`/api/webhooks/${created.body.id}`)
        .set('Authorization', `Bearer ${tenant.accessToken}`)
        .send({ url: healthy.url });

      const retry = await request(app.getHttpServer())
        .post(`/api/webhooks/deliveries/${deliveries.body[0].id}/retry`)
        .set('Authorization', `Bearer ${tenant.accessToken}`);
      expect(retry.status).toBe(204);

      await waitFor(() => healthy.requests.length === 1);
      deliveries = await request(app.getHttpServer())
        .get(`/api/webhooks/${created.body.id}/deliveries`)
        .set('Authorization', `Bearer ${tenant.accessToken}`);
      expect(deliveries.body[0].status).toBe('success');
      expect(deliveries.body[0].attempt).toBe(2);
      await healthy.close();
    } finally {
      // capture is already closed mid-test in the success path; ignore if so.
      await capture.close().catch(() => {});
    }
  });
});
