# PCAARB

*[Leia em português](README.pt-BR.md)*

A modular, multi-tenant retail management SaaS with point-of-sale — think a TOTVS-style ERP, built lean from a single-store PDV and grown module by module into a fuller back office. Built for the Brazilian small/medium retail market (products, price/discount rules, LGPD, NFC-e fiscal documents), but the architecture underneath is generic.

This README is a concise, English-language orientation for anyone evaluating the codebase from the outside. The day-by-day engineering log — every module, every design decision and its rationale, every security finding and its fix, written as the work happened — lives in **[README.pt-BR.md](README.pt-BR.md)**. That file is long and detailed on purpose: it's the most complete record of how this system was actually built and hardened.

## What's in the repo

| Doc | Content |
|---|---|
| [README.pt-BR.md](README.pt-BR.md) | The full engineering log — every module and every security review, in detail (Portuguese) |
| [docs/01-product-vision-and-roadmap.md](docs/01-product-vision-and-roadmap.md) | Original product vision, target market, and phased roadmap |
| [docs/02-tech-stack-proposal.md](docs/02-tech-stack-proposal.md) | Original tech stack proposal, pre-implementation |
| [docs/03-build-vs-buy-payments-fiscal.md](docs/03-build-vs-buy-payments-fiscal.md) | Build-vs-buy analysis for payments and Brazilian fiscal integration |
| [docs/06-competitive-analysis-and-action-plan.md](docs/06-competitive-analysis-and-action-plan.md) | Comparison against Square/Shopify POS/Lightspeed, gaps found, and what's next |
| [PRECOS-E-CUSTOS.md](PRECOS-E-CUSTOS.md) | Subscription pricing catalog and cost structure (Portuguese) |
| [docs/04-termos-de-uso-RASCUNHO.md](docs/04-termos-de-uso-RASCUNHO.md) / [docs/05-politica-de-privacidade-RASCUNHO.md](docs/05-politica-de-privacidade-RASCUNHO.md) | Terms of Service / LGPD privacy policy — drafts, need legal review before publishing (Portuguese) |

## Stack

TypeScript monorepo (pnpm workspaces + Turborepo). API: NestJS + Drizzle ORM + Postgres (row-level security enforced at the database level, not just the application layer), JWT auth with refresh-token rotation, CASL for authorization. Frontend: Next.js (App Router), TanStack Query, a service-worker-based PWA for the offline point-of-sale. Shared Zod schemas in `packages/shared` are the single source of truth for validation on both ends. External integrations (payment gateway, fiscal document issuance, transactional email, marketplace channels) are all behind internal adapter interfaces with a mock/sandbox implementation — swapping in a real provider is writing one new adapter class, not touching the rest of the system. Error tracking (Sentry) follows the same pattern: wired and ready, a no-op until `SENTRY_DSN` is set.

Code, comments, and the UI (all ~25 pages in `apps/web`) are in English, including test files. What's still Portuguese, for now: API error/validation messages surfaced to the UI — a smaller, separate follow-up, since translating those touches e2e test assertions that check exact error text.

## Current status

The original phased roadmap (Foundation → MVP → Consolidation → Expansion) is complete, plus a follow-on gap-closing pass and the start of an "Advanced/Enterprise" phase. In business terms, the system covers: multi-tenant registration and auth with per-tenant trial/subscription billing; product/customer/supplier catalogs; point-of-sale with split payments, an offline-capable PWA mode, and full sale returns/refunds; inventory with physical counts; accounts payable/receivable with a simplified cash-basis P&L; purchase orders; multi-store consolidation; a loyalty/CRM program; sales-commission tracking; e-commerce/marketplace order import; role-based access control with per-user permission overrides on top of four base roles; programmatic API keys and signed outbound webhooks for third-party integration; an audit log for sensitive actions; and LGPD (Brazil's GDPR-equivalent) data export/anonymization tooling.

See [docs/06-competitive-analysis-and-action-plan.md](docs/06-competitive-analysis-and-action-plan.md) for how this compares to Square/Shopify POS/Lightspeed and what's next.

Payment processing and fiscal document (NFC-e) issuance are fully built against internal interfaces but currently run against mock/sandbox adapters — no real payment processor or fiscal provider account exists yet. That, plus a lawyer review of the draft legal documents and a production hosting deployment, are the remaining steps before real customers could be onboarded; none of them are code. See [README.pt-BR.md](README.pt-BR.md) for the full status log.

**Visual design system.** The frontend previously ran on Tailwind's unmodified defaults (an `indigo-500` accent, `zinc` neutrals) — functional but generic, and inconsistent under the hood (status colors were hardcoded per component instead of themed). A deliberate design pass replaced that with a real token system — a distinct teal accent, warm neutrals, and dedicated success/warning/danger/info colors, all theme-aware — plus new `Table`/`Select` primitives and a manual light/dark toggle (previously OS-preference only). Every screen in the app now runs on it: the landing and pricing pages, all five auth screens (now sharing one layout instead of five independently duplicated ones), the painel shell/dashboard, all fourteen list/table painel modules, and the POS screen — the most state-heavy screen in the app (cash-session lifecycle, offline sale queue, split payments), restyled visually only, with the full sale flow (open register → stock-insufficient rejection → finalize → NFC-e confirmation) re-verified live afterward to confirm nothing in that logic moved.

**Testing and security posture:** 168 end-to-end tests (against a real Postgres instance, not mocks) plus a unit test suite, all green, re-run after every change. Security has been treated as an ongoing practice rather than a one-time pass — dedicated reviews ran before shipping anything touching auth, money, or permissions, using a two-stage process (one pass to identify candidate issues, independent verification passes that actively try to rule each one out before it counts as confirmed). That process found and fixed several real vulnerabilities pre-merge, including privilege-escalation paths through the granular permission-override system, an authentication timing side-channel, and a session-revocation gap on user deactivation — all documented with full technical detail in the Portuguese log, in the interest of being transparent about what was found rather than only what shipped clean.

## Running it locally

```bash
pnpm install
docker compose up -d                                 # Postgres + Redis
cp apps/api/.env.example apps/api/.env.local          # set JWT secrets
cp apps/web/.env.example apps/web/.env.local
pnpm db:migrate                                       # apply Drizzle migrations
pnpm dev                                              # API on :3001, web on :3000
```

> **Port already in use?** `docker-compose.yml` publishes Postgres on `5433` and Redis on `6380` (instead of the standard `5432`/`6379`) to avoid colliding with another Postgres/Redis already running on the host. If that's not a concern on your machine, feel free to use the standard ports — just update `DATABASE_URL` and the compose file to match.

> **Two database URLs?** `DATABASE_URL` (owns the schema) is used only by `pnpm db:migrate`/`db:generate`. `APP_DATABASE_URL` is the API's runtime connection, on a restricted role (`pcaarb_app`, no `SUPERUSER`/`BYPASSRLS`) created by migration `0011_app_role_least_privilege`. Run `pnpm db:migrate` before starting the API — without that migration the role doesn't exist yet and the API won't boot.

## License

This is a public repository for portfolio/technical-evaluation purposes only — it is not open source. See [LICENSE](LICENSE): no use beyond reading is authorized without explicit permission. Every `package.json` in the monorepo is marked `"license": "UNLICENSED"` for the same reason.
