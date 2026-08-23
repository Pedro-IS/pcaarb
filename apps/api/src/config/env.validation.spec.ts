import { describe, expect, it } from 'vitest';
import { validateEnv } from './env.validation';

const validBaseEnv = {
  DATABASE_URL: 'postgres://user:pass@localhost:5432/pcaarb',
  APP_DATABASE_URL: 'postgres://app_user:pass@localhost:5432/pcaarb',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
  RESEND_API_KEY: 'test_key',
  RESEND_FROM_EMAIL: 'no-reply@example.com',
};

describe('validateEnv', () => {
  it('aplica defaults quando variáveis opcionais não são fornecidas', () => {
    const env = validateEnv(validBaseEnv);
    expect(env.PORT).toBe(3001);
    expect(env.NODE_ENV).toBe('development');
    expect(env.TRIAL_DAYS).toBe(14);
  });

  it('rejeita quando DATABASE_URL está ausente', () => {
    const { DATABASE_URL: _omit, ...rest } = validBaseEnv;
    expect(() => validateEnv(rest)).toThrow(/DATABASE_URL/);
  });

  it('rejeita quando APP_DATABASE_URL está ausente', () => {
    const { APP_DATABASE_URL: _omit, ...rest } = validBaseEnv;
    expect(() => validateEnv(rest)).toThrow(/APP_DATABASE_URL/);
  });

  it('rejeita segredo JWT curto demais', () => {
    expect(() =>
      validateEnv({ ...validBaseEnv, JWT_ACCESS_SECRET: 'curto' }),
    ).toThrow(/JWT_ACCESS_SECRET/);
  });

  it('SENTRY_DSN is optional and rejects a non-URL value when provided', () => {
    expect(validateEnv(validBaseEnv).SENTRY_DSN).toBeUndefined();
    expect(() => validateEnv({ ...validBaseEnv, SENTRY_DSN: 'not-a-url' })).toThrow(/SENTRY_DSN/);
    expect(validateEnv({ ...validBaseEnv, SENTRY_DSN: 'https://key@o0.ingest.sentry.io/1' }).SENTRY_DSN).toBe(
      'https://key@o0.ingest.sentry.io/1',
    );
  });
});
