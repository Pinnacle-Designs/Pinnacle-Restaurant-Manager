# Pinnacle Restaurant Manager

AI-powered restaurant management — orders, inventory, staff, finances, analytics, and automated business insights.

## Requirements

**Node.js 24+** — see `engines` in `package.json`.

## Quick start

```bash
npm run launch
```

Open [http://localhost:3000](http://localhost:3000)

Full setup, environment variables, Stripe billing, deployment, and admin panel: **[SETUP.md](./SETUP.md)**

## Features

- **Dashboard** — Revenue, expenses, low-stock alerts, quick actions
- **Orders & POS** — Checks, split pay, cash/card/mobile payments
- **Menu / Inventory / Staff / Tables** — Full CRUD with barcode scan
- **Finances** — Expense tracking with receipt OCR
- **Analytics** — 12-tab business intelligence
- **AI Insights** — Pain point detection with push notifications
- **Account** — Profile, team permissions, Stripe autopay, Square/Stripe Connect
- **Onboarding** — Guided setup after signup (details → sample data → billing)
- **Admin panel** — Platform management at `/admin` for authorized operators

## Signup flow

```
/signup?plan=GROWTH  →  create account  →  /onboarding  →  /dashboard
```

Plans: **Starter** ($49), **Growth** ($149), **Pro** ($299) per location/month.

## Payments

| Flow | Provider |
|------|----------|
| Subscription autopay | Stripe Checkout + Customer Portal |
| Guest card payments | Square OAuth or Stripe Connect |

Owners configure under **Account → Billing & autopay**. Setup guide: **Account → Payments & support**.

## Marketing & partners

- In-app landing: `/`
- Static site: `/docs/` (also `docs/index.html` for GitHub Pages)
- **Public investors page:** `docs/pitch.html` → `/docs/pitch.html`
- **Private pitch deck:** `private/pitch-deck.html` (not deployed — send manually after request)

## Demo (development)

```bash
# After seed (dev): owner@pinnacle.com / demo1234
```

Seed route: `/api/auth/seed` (disabled in production unless `ENABLE_AUTH_SEED=true`)

## Tech stack

Next.js 15 · TypeScript · Tailwind CSS 4 · Prisma + SQLite · Stripe · OpenAI (optional)

## Project structure

```
src/app/          Pages and API routes
src/components/   UI, onboarding, admin, account
src/lib/          Auth, payments, permissions, AI
docs/             Marketing site and pitch deck
prisma/           Schema and deploy database
```
