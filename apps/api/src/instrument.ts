import * as Sentry from '@sentry/node';

// Must be the very first import in main.ts, before 'reflect-metadata' or
// anything else — Sentry's Node SDK auto-instruments http/pg/etc. by
// patching modules as they're required, which only works if init() runs
// before those modules are first loaded. This is why it reads
// process.env directly instead of going through env.validation.ts's
// ConfigService: Nest's DI container doesn't exist yet at this point in
// the bootstrap, and won't until NestFactory.create() runs afterward.
//
// A no-op until SENTRY_DSN is set — same pattern as the mock payment/fiscal
// providers: this ships now and activates later without touching code, once
// a real Sentry project exists (see the launch-blockers list in
// docs/06-competitive-analysis-and-action-plan.md). Also disabled outright
// under NODE_ENV=test, so the e2e suite — which deliberately triggers many
// 4xx/error responses as test assertions — never talks to Sentry's
// ingestion API even if a DSN happens to be present in the environment.
if (process.env.SENTRY_DSN && process.env.NODE_ENV !== 'test') {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV ?? 'development',
  });
}
