# Setup Guide

Complete setup for local development and production deployment of Pinnacle Restaurant Manager.

## Requirements

| Requirement | Version |
|-------------|---------|
| Node.js | **24+** (required by `@zxing/library` and `package.json` engines) |
| npm | 10+ |

## Quick start (local)

```bash
npm run launch
```

This runs `npm install`, `prisma db push`, and `npm run dev`.

Open [http://localhost:3000](http://localhost:3000)

### First-time database

```bash
cp .env.example .env
# Edit .env — at minimum set AUTH_SECRET for non-trivial sessions
npm run db:push
```

### Demo data (development only)

With `ENABLE_AUTH_SEED=true` in `.env` (or in development by default):

- Visit `http://localhost:3000/api/auth/seed` to seed demo users and sample data
- Demo login: `owner@pinnacle.com` / `demo1234`

## Signup & onboarding flow

1. **Choose a plan** — `/signup` or `/signup?plan=GROWTH`
2. **Create account** — creates an Owner user and Location
3. **Install PWA** (optional) — add to home screen
4. **Onboarding wizard** — `/onboarding`
   - Restaurant details (name, address, phone, seats)
   - Optional sample data
   - Stripe subscription autopay (or skip)
   - Launch dashboard

New owners are redirected to onboarding until `setupComplete` is true.

## Environment variables

Copy `.env.example` to `.env`. Key variables:

### Required (production)

| Variable | Purpose |
|----------|---------|
| `AUTH_SECRET` | Session signing — **32+ characters** in production |
| `DATABASE_URL` | SQLite path, e.g. `file:./dev.db` |
| `NEXT_PUBLIC_APP_URL` | Public app URL for Stripe redirects and OAuth |

### Stripe subscription billing

| Variable | Purpose |
|----------|---------|
| `STRIPE_SECRET_KEY` | Stripe API secret |
| `STRIPE_WEBHOOK_SECRET` | Webhook signature verification |
| `STRIPE_PRICE_STARTER` | Optional fixed price ID |
| `STRIPE_PRICE_GROWTH` | Optional fixed price ID |
| `STRIPE_PRICE_PRO` | Optional fixed price ID |

**Webhook endpoint:** `{APP_URL}/api/webhooks/stripe`

**Events:** `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`

### Guest payments (POS)

| Variable | Purpose |
|----------|---------|
| `STRIPE_CONNECT_CLIENT_ID` | Stripe Connect OAuth |
| `SQUARE_APPLICATION_ID` | Square OAuth |
| `SQUARE_APPLICATION_SECRET` | Square OAuth |
| `SQUARE_ENVIRONMENT` | `sandbox` or `production` |

### Platform admin

| Variable | Purpose |
|----------|---------|
| `PLATFORM_ADMIN_EMAILS` | Comma-separated emails with access to `/admin` |

Alternatively set `isPlatformAdmin` on a user via Prisma Studio or the admin panel.

### Optional

| Variable | Purpose |
|----------|---------|
| `OPENAI_API_KEY` | AI insights, receipt OCR, photo analysis |
| `SUPPORT_EMAIL` | Shown in Account → Payments & support |
| `ENABLE_AUTH_SEED` | Enable `/api/auth/seed` in production |

## Billing setup (owners)

1. Sign in as **Owner**
2. Complete onboarding or go to **Account → Billing & autopay**
3. Click **Set up autopay with Stripe** (when `STRIPE_SECRET_KEY` is configured)
4. Manage payment method via **Manage billing in Stripe** (Customer Portal)

Security details and setup checklists: **Account → Payments & support**

## Marketing site (`docs/`)

Static marketing site with live embedded demo.

| File | Purpose |
|------|---------|
| `docs/index.html` | Landing page, pricing, features |
| `docs/pitch-deck.html` | Print-friendly pitch deck (Save as PDF) |
| `docs/config.js` | Set `PINNACLE_CONFIG.appUrl` to your deployed app |
| `docs/live-demo.js` | Embeds live app demo |

**Local preview:** Open `docs/index.html` via Live Server, or visit `/docs/` when the Next app is running.

**GitHub Pages:** Includes `.nojekyll`. Set `config.js` app URL to your Vercel deployment.

## Deploy (Vercel)

1. Set environment variables in Vercel project settings
2. `vercel-build` runs `db:deploy-seed` then `next build`
3. SQLite deploy database is copied to `/tmp` at runtime
4. Register Stripe webhook to production URL
5. Set Node.js **24.x** in Vercel project settings

## Platform admin panel

Access: `/admin` (requires `PLATFORM_ADMIN_EMAILS` or `isPlatformAdmin`)

- View all locations (plan, billing status, active)
- Suspend/activate locations, override plan
- View users, enable/disable accounts, grant platform admin

## Project scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run db:push` | Apply Prisma schema to local DB |
| `npm run db:studio` | Prisma Studio GUI |
| `npm run db:deploy-seed` | Build deploy SQLite with seed data |

## Troubleshooting

**Prisma EPERM on Windows:** Stop running Node/dev servers, then `npm run db:generate`

**Stripe checkout 503:** `STRIPE_SECRET_KEY` not set — manual billing fallback works for dev

**Onboarding loop:** Complete all steps or set `setupComplete` on the Location in Prisma Studio

**Admin access denied:** Add your email to `PLATFORM_ADMIN_EMAILS` and sign in again
