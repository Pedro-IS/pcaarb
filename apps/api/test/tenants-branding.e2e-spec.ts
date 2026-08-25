import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import type { Env } from '../src/config/env.validation';
import { DRIZZLE, type Database } from '../src/database/drizzle.provider';
import { users } from '../src/database/schema/index';
import { registerTenant } from './helpers/register-tenant';

// 1x1 transparent PNG — smallest valid file that satisfies the mimetype filter.
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

// Same helper as assinatura/fidelidade/comissoes: creates the user directly
// in the database, without relying on the invite/email flow.
async function mintUser(app: INestApplication, db: Database, tenantId: string, role: 'admin' | 'operador_caixa') {
  const email = `${role}-${Date.now()}-${Math.random().toString(36).slice(2)}@pcaarb.test`;
  const passwordHash = await bcrypt.hash('SenhaForte123', 12);
  const [user] = await db.insert(users).values({ tenantId, name: role, email, passwordHash, role }).returning();
  const jwtService = app.get(JwtService);
  const config = app.get<ConfigService<Env, true>>(ConfigService);
  const accessToken = await jwtService.signAsync(
    { sub: user!.id, tenantId, role },
    { secret: config.get('JWT_ACCESS_SECRET', { infer: true }), expiresIn: config.get('JWT_ACCESS_TTL', { infer: true }) },
  );
  return { id: user!.id, accessToken };
}

describe('Tenants / branding (e2e)', () => {
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

  it('sem logo: GET /users/me diz hasLogo false e GET do logo dá 404', async () => {
    const tenant = await registerTenant(app, 'branding-sem-logo');

    const me = await request(app.getHttpServer()).get('/api/users/me').set('Authorization', `Bearer ${tenant.accessToken}`);
    expect(me.body.tenant.hasLogo).toBe(false);
    expect(me.body.tenant.displayName).toBeNull();
    expect(me.body.tenant.logo).toBeUndefined(); // bytes never leave the API

    const logo = await request(app.getHttpServer()).get('/api/tenants/branding/logo').set('Authorization', `Bearer ${tenant.accessToken}`);
    expect(logo.status).toBe(404);
  });

  it('owner atualiza nome fantasia e logo — refletido em /users/me e no GET do logo', async () => {
    const tenant = await registerTenant(app, 'branding-owner');

    const update = await request(app.getHttpServer())
      .patch('/api/tenants/branding')
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .field('displayName', 'Nome Fantasia LTDA')
      .attach('logo', TINY_PNG, { filename: 'logo.png', contentType: 'image/png' });
    expect(update.status).toBe(200);
    expect(update.body.displayName).toBe('Nome Fantasia LTDA');
    expect(update.body.hasLogo).toBe(true);
    expect(update.body.logo).toBeUndefined();

    const me = await request(app.getHttpServer()).get('/api/users/me').set('Authorization', `Bearer ${tenant.accessToken}`);
    expect(me.body.tenant.displayName).toBe('Nome Fantasia LTDA');
    expect(me.body.tenant.hasLogo).toBe(true);

    const logo = await request(app.getHttpServer()).get('/api/tenants/branding/logo').set('Authorization', `Bearer ${tenant.accessToken}`);
    expect(logo.status).toBe(200);
    expect(logo.headers['content-type']).toBe('image/png');
    expect(Buffer.compare(logo.body, TINY_PNG)).toBe(0);
  });

  it('nome fantasia em branco limpa o campo (volta a usar o companyName registrado em outros lugares)', async () => {
    const tenant = await registerTenant(app, 'branding-limpa-nome');
    await request(app.getHttpServer())
      .patch('/api/tenants/branding')
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .field('displayName', 'Temporário');

    const cleared = await request(app.getHttpServer())
      .patch('/api/tenants/branding')
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .field('displayName', '');
    expect(cleared.status).toBe(200);
    expect(cleared.body.displayName).toBeNull();
  });

  it('admin e operador de caixa não podem editar a marca — só owner (GET do logo continua liberado pra qualquer papel)', async () => {
    const tenant = await registerTenant(app, 'branding-rbac');
    const admin = await mintUser(app, db, tenant.tenantId, 'admin');
    const cashier = await mintUser(app, db, tenant.tenantId, 'operador_caixa');

    const adminUpdate = await request(app.getHttpServer())
      .patch('/api/tenants/branding')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .field('displayName', 'Tentativa Admin');
    expect(adminUpdate.status).toBe(403);

    const cashierUpdate = await request(app.getHttpServer())
      .patch('/api/tenants/branding')
      .set('Authorization', `Bearer ${cashier.accessToken}`)
      .field('displayName', 'Tentativa Caixa');
    expect(cashierUpdate.status).toBe(403);

    const cashierRemove = await request(app.getHttpServer())
      .delete('/api/tenants/branding/logo')
      .set('Authorization', `Bearer ${cashier.accessToken}`);
    expect(cashierRemove.status).toBe(403);

    // Every role needs to render the logo on their own screens (topbar, PDV) — this is a read, not a management action.
    const cashierReadsLogo = await request(app.getHttpServer())
      .get('/api/tenants/branding/logo')
      .set('Authorization', `Bearer ${cashier.accessToken}`);
    expect(cashierReadsLogo.status).toBe(404); // no logo set for this tenant, but not a 403
  });

  it('rejeita tipo de arquivo fora da allowlist e arquivo maior que 512KB', async () => {
    const tenant = await registerTenant(app, 'branding-validacao');

    const wrongType = await request(app.getHttpServer())
      .patch('/api/tenants/branding')
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .field('displayName', 'Loja X')
      .attach('logo', Buffer.from('not an image'), { filename: 'file.txt', contentType: 'text/plain' });
    expect(wrongType.status).toBe(400);

    const tooLarge = await request(app.getHttpServer())
      .patch('/api/tenants/branding')
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .field('displayName', 'Loja X')
      .attach('logo', Buffer.alloc(600 * 1024, 1), { filename: 'big.png', contentType: 'image/png' });
    expect(tooLarge.status).toBe(413);

    // Neither bad attempt should have persisted a logo.
    const me = await request(app.getHttpServer()).get('/api/users/me').set('Authorization', `Bearer ${tenant.accessToken}`);
    expect(me.body.tenant.hasLogo).toBe(false);
  });

  it('owner remove o logo — GET volta a dar 404 e hasLogo volta a false', async () => {
    const tenant = await registerTenant(app, 'branding-remove');
    await request(app.getHttpServer())
      .patch('/api/tenants/branding')
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .field('displayName', 'Loja Y')
      .attach('logo', TINY_PNG, { filename: 'logo.png', contentType: 'image/png' });

    const remove = await request(app.getHttpServer())
      .delete('/api/tenants/branding/logo')
      .set('Authorization', `Bearer ${tenant.accessToken}`);
    expect(remove.status).toBe(200);
    expect(remove.body.hasLogo).toBe(false);
    expect(remove.body.displayName).toBe('Loja Y'); // removing the logo doesn't touch the display name

    const logo = await request(app.getHttpServer()).get('/api/tenants/branding/logo').set('Authorization', `Bearer ${tenant.accessToken}`);
    expect(logo.status).toBe(404);
  });
});
