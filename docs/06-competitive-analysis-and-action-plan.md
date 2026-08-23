# PCAARB — Competitive Analysis and Action Plan

*Written 2026-08-23, after the English translation pass completed. From this point on, new code, docs, and comments are written in English directly — see the note in [README.md](../README.md).*

## Why this document exists

With the product functionally complete and now legible in English, the next question is no longer "does PCAARB have the features on its own roadmap" but "how does it read next to the systems a technical buyer already knows" — Square, Shopify POS, Lightspeed Retail, Toast. This document compares PCAARB against that bar, names concrete gaps, and splits what happens next into two lists: what gets built autonomously, and what only the business owner can do. It replaces ad-hoc "what's next" decisions with one written reference, the same way [docs/01](01-product-vision-and-roadmap.md) did for the original roadmap.

## What the comparison found

**Webhooks / outbound events.** Square's developer platform treats webhooks as core infrastructure — a merchant subscribes an endpoint to event types (order, payment, inventory) and gets a signed POST within seconds of the event. PCAARB had the inbound half of an API-first story (programmatic API keys, shipped 2026-08-18) but nothing outbound — a third-party system (accounting software, a BI tool, a CRM) had no way to know something happened without polling. **Closed this session** — see "What shipped" below.

**Omnichannel inventory sync.** Lightspeed's headline feature is real-time stock/price sync *out* to every channel from one catalog. PCAARB's marketplace module (shipped 2026-08-18) only pulls orders *in* — it has no push-side sync to update a channel's listing when stock or price changes here. This is a real gap, but a different shape of work than webhooks: each channel (Mercado Livre, Shopee, a Shopify storefront) has its own push API, so this is integration-partner work, not a single well-scoped feature. Left for a future cycle, not this one — flagged here so it isn't forgotten, not because it's low-value.

**Observability.** Every technical-due-diligence guide checked for this analysis lists it as a core review item, on the same footing as security controls and API maturity — not a nice-to-have. PCAARB has none: `docs/02-tech-stack-proposal.md` originally proposed Sentry/OpenTelemetry and neither was ever built (a gap already flagged in an earlier status-doc note, 2026-08-18). Structured logging exists (`LoggingInterceptor`) but nothing captures exceptions, traces requests, or would page anyone if the API started failing in production. **Next priority** — see below.

**A real gap found *during* this analysis, not from the competitive read:** `subscriptions` and `subscription_invoices` are the only two tenant-owned tables in the entire schema without Row-Level Security enabled — every other business table has had it since the module that introduced it shipped (confirmed by grepping every `ENABLE ROW LEVEL SECURITY` migration). Today this isn't exploitable (every query in `billing.service.ts` explicitly filters by `tenantId`), but it breaks the database-level defense-in-depth pattern the rest of the schema relies on as a second layer, independent of application code being correct. Worth fixing, but the same cross-tenant-cron problem `WebhooksService.retryDueDeliveries()` had to solve applies here too (billing's own cron reads across all tenants) — not a five-minute fix, tracked here rather than done reactively mid-analysis.

**What's already a genuine differentiator, confirmed rather than assumed.** Per-user permission overrides on top of RBAC, RLS-enforced multi-tenancy, and the integrated loyalty/commission/DRE data model (all previously identified in `pcaarb_differentiation` memory) hold up well against the compared systems — none of Square/Shopify/Lightspeed expose per-user permission exceptions this granularly; it's normally role presets only. Nothing in this analysis changes that list, it just adds webhooks to it.

## What shipped this session

**Outbound webhooks** (`apps/api/src/modules/webhooks/`) — endpoints subscribe to `sale.completed` / `sale.returned`, each delivery is HMAC-SHA256 signed (Stripe-style `t=<timestamp>,v1=<signature>` header, timestamp included in the signed content to resist replay), retried with backoff (1m/5m/30m/2h/12h, 6 attempts) via a cron sweep, and logged per-attempt in an inspectable delivery log with a manual-retry action — mirroring Stripe's dashboard, not just "fire and hope." Includes an SSRF guard (blocks loopback/RFC1918/link-local/cloud-metadata targets, re-checked at send time against DNS rebinding) since this is the first feature where PCAARB's own server makes outbound requests to a URL a tenant supplies. Full e2e coverage (8 new tests: CRUD, CASL, delivery+signature verification against a real local receiver, retry-after-failure) plus a unit-tested SSRF guard. `SalesService`/`SaleReturnsService` dispatch on genuine completion only — an offline-sync replay of an already-processed sale never re-fires the event, proven by a dedicated test.

## Action plan — what's next (my scope)

In priority order, each a full cycle (implement → test → verify live → document → commit):

1. ~~**Observability**~~ — **shipped 2026-08-23.** `@sentry/node` wired via `src/instrument.ts` (imported first in `main.ts`, before any other module, as Sentry's Node SDK requires for its auto-instrumentation to patch things like `pg`/`http` correctly) — a no-op until `SENTRY_DSN` is set, and explicitly disabled under `NODE_ENV=test` so the e2e suite's many deliberate error-path tests never reach Sentry's ingestion API. `HttpExceptionFilter` now calls `Sentry.captureException()` for genuinely unexpected errors only (not `HttpException` — a rejected sale or failed login is expected control flow, not a bug to page anyone about). Verified live: the built API boots and serves `/api/health` cleanly both with no DSN and with a DSN set. Request tracing was deliberately left out — the existing `LoggingInterceptor` already answers "how long did this take," and OpenTelemetry would be new infrastructure to maintain for a question already answered.
2. ~~**RLS on `subscriptions`/`subscription_invoices`**~~ — **shipped 2026-08-23.** Migration `0039` enables and FORCEs RLS on both, same pattern as every other tenant table. `BillingService` now routes every read/write through `runWithTenant`. The cross-tenant cron (`processDueBilling`, daily) couldn't just loop `WebhooksService`-style, though — an early version did exactly that (loop every row in `tenants`, one transaction per tenant) and it timed out in the e2e suite once the dev database had accumulated a few thousand tenants from months of test runs, a real preview of what it would cost in production at even modest scale. Fixed with a denormalized `tenants.nextBillingCheckAt` pointer (indexed, kept in sync on subscribe/renew/cancel) — the same role `tenants.trialEndsAt` already plays for the trial-expiry cron — so candidate discovery stays a cheap query on the one non-RLS table instead of a scan. A dedicated security review of the diff (tenant-id correctness across every `runWithTenant` call, RLS policy correctness, leak potential of the new column) found nothing.
3. **Revisit omnichannel push-sync** once a specific target channel is worth building against for real (this is naturally gated on which marketplace a pilot customer or acquirer actually cares about — building it generically now would be guessing).

Each of these gets a dedicated security-review pass if it touches auth/money, per the existing cadence (`pcaarb_security_cadence`).

**RLS audit closed out fully while fixing item 2**, not just the two tables named above: checked every other table in the schema for the same kind of gap. `api_keys` and `user_permission_overrides` also lack RLS, but both carry sound, deliberate, already-documented reasons (`api_keys` must be queried by hash before any tenant context exists — same as `users`/`tenants`; `user_permission_overrides` is read by `AbilityGuard` on every single authenticated request, a genuine hot-path tradeoff against wrapping every API call in an extra transaction) — unlike `subscriptions`, neither is an oversight. Every non-RLS table in the schema now has a specific, checked justification.

With all three items above shipped, there's no queued next item as of 2026-08-23 — the next entry here should come from either a fresh competitive-analysis pass (re-run periodically, not just once, per the original reasoning above) or a specific gap surfaced by real usage once customers exist.

## Your responsibilities (outside my scope, until we sell)

Unchanged from the standing checklist (`pcaarb_launch_blockers`), restated here because this document is meant to be the one place that answers "what's left" in full:

1. **A real Pagar.me account** (CNPJ + bank account) — `PAYMENT_PROVIDER` is still a mock that always approves.
2. **A real fiscal provider account** (Focus NFe or similar) — NFC-e issuance is still sandboxed.
3. **Lawyer review** of the draft Terms of Service / LGPD privacy policy before publishing them as binding.
4. **Production hosting** — domain + a real Vercel/Railway account. The app has only ever run locally.

None of the three items in the action plan above are gated on these — they're all buildable and testable against the mock/sandbox providers already in place, same as everything shipped so far.
