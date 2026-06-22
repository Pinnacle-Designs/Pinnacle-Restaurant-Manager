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
   - **Download app** — `/download` (PWA + store links when published)
   - Launch dashboard

New owners are redirected to onboarding until `setupComplete` is true. After Stripe checkout, owners land on `/download` before finishing onboarding.

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
| `STRIPE_SECRET_KEY` | Stripe API secret (env only — never in code) |
| `STRIPE_WEBHOOK_SECRET` | Webhook signature verification |
| `STRIPE_PRICE_STARTER` | Price ID (`price_...`) from product default_price |
| `STRIPE_PRICE_GROWTH` | Price ID for Growth plan |
| `STRIPE_PRICE_PRO` | Price ID for Pro plan |

Checkout uses these price IDs in `line_items` (same pattern as [Stripe Checkout docs](https://docs.stripe.com/checkout/quickstart)), with `mode: subscription` for monthly autopay.

**Webhook endpoint:** `{APP_URL}/api/webhooks/stripe`

**Events:** `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`

### Stripe production (Vercel / live app)

Production app URL: **`https://pinnacle-resturant-manager.vercel.app`** (or your custom domain, e.g. `https://pinnacle.com` — set `NEXT_PUBLIC_APP_URL` to the URL customers use).

1. **Stripe Dashboard → Live mode** (toggle off “Test mode”)
2. **API keys** — copy **Secret key** (`sk_live_...`) → Vercel env `STRIPE_SECRET_KEY`
3. **Create products & prices** (one-time):

   ```bash
   # In .env temporarily set STRIPE_SECRET_KEY=sk_live_...
   APP_URL=https://pinnacle-resturant-manager.vercel.app npm run stripe:setup:live
   ```

   This creates Starter ($79), Growth ($249), and Pro ($449) as Stripe **Products** with `default_price_data` (monthly recurring). Price IDs are written to `.env` locally or printed for Vercel.

   Or create products manually in Stripe → Products, then add price IDs to Vercel.

4. **Webhook** (if not created by script) — [Stripe Webhooks](https://dashboard.stripe.com/webhooks) → Add endpoint:
   - URL: `https://pinnacle-resturant-manager.vercel.app/api/webhooks/stripe`
   - Events: `checkout.session.completed`, `customer.subscription.*`, `invoice.payment_failed`
   - Copy **Signing secret** → Vercel `STRIPE_WEBHOOK_SECRET`

5. **Vercel project → Settings → Environment Variables** (Production):

   | Variable | Value |
   |----------|--------|
   | `AUTH_SECRET` | Random string, **32+ characters** |
   | `NEXT_PUBLIC_APP_URL` | `https://pinnacle-resturant-manager.vercel.app` (or custom domain) |
   | `STRIPE_SECRET_KEY` | `sk_live_...` |
   | `STRIPE_WEBHOOK_SECRET` | `whsec_...` |
   | `STRIPE_PRICE_STARTER` | `price_...` from setup script |
   | `STRIPE_PRICE_GROWTH` | `price_...` |
   | `STRIPE_PRICE_PRO` | `price_...` |
   | `PLAN_BILLING_OPTIONAL` | `false` |
   | `PLAN_TRIAL_DAYS` | `14` |
   | `SUPPORT_EMAIL` | Your support inbox |
   | `EMBED_FRAME_ANCESTORS` | `https://pinnacle.com,https://pinnacle-designs.github.io` (if marketing site iframes the demo) |

6. **Redeploy** Vercel after saving env vars.

7. **Test live checkout** — sign up at `/signup?plan=GROWTH`, complete onboarding → **Set up autopay with Stripe**. Use a real card or Stripe test clock in live mode only with caution.

**Local dev** keeps `sk_test_...`, `PLAN_BILLING_OPTIONAL=true`, and `npm run stripe:listen` for webhooks.

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
| `NEXT_PUBLIC_APP_STORE_URL` | iOS App Store URL for `/download` page |
| `NEXT_PUBLIC_PLAY_STORE_URL` | Google Play URL for `/download` page |

## Legal pages

Public routes: `/privacy` and `/terms`. Link these from signup and your marketing site before App Store / Play Store submission.

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
| `docs/pitch.html` | Public investors page + private deck request form |
| `docs/pitch-request.js` | Submits requests to `/api/pitch-request` |
| `private/pitch-deck.html` | **Private** full deck — not on public site |
| `docs/config.js` | Set `PINNACLE_CONFIG.appUrl` to your deployed app |
| `docs/live-demo.js` | Embeds live app demo |

**Local preview:** Open `docs/index.html` via Live Server, or visit `/docs/` when the Next app is running.

**GitHub Pages:** Includes `.nojekyll`. Set `config.js` app URL to your Vercel deployment.

## Deploy (Vercel)

### Automated checklist

```bash
npm run production:checklist    # generates secrets, pushes schema, writes .env.vercel.production
npm run production:verify       # validates production env + integration health
```

### Production requirements

1. **PostgreSQL** — Neon, Vercel Postgres, or Supabase (`DATABASE_URL=postgresql://...`). SQLite is preview/embed only.
2. **Environment variables** — copy from `.env.vercel.production` into Vercel → Settings → Environment Variables (Production).
3. **Stripe live** — `APP_URL=https://your-app.vercel.app npm run stripe:setup:live`
4. **Webhook** — `https://your-app.vercel.app/api/webhooks/stripe` → copy `STRIPE_WEBHOOK_SECRET` to Vercel.
5. **Deploy** — connect GitHub repo in Vercel, or `npx vercel --prod`
6. Set Node.js **24.x** in Vercel project settings.

`vercel-build` runs `tsx scripts/vercel-build.ts` (Prisma generate + schema push; no demo seed unless `SEED_DEMO_DATA=true`).

Local Postgres (optional): `docker compose up -d` then `npm run production:checklist -- --postgres`

## Platform admin panel

Access: `/admin` (requires `PLATFORM_ADMIN_EMAILS` or `isPlatformAdmin`)

- View all locations (plan, billing status, active)
- Suspend/activate locations, override plan
- View users, enable/disable accounts, grant platform admin
- Review **Pitch requests** from the public investors page; send `private/pitch-deck.html` manually

## Project scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run production:checklist` | Generate secrets, DB push, Vercel env template |
| `npm run production:verify` | Validate production env + integration health |
| `npm run db:studio` | Prisma Studio GUI |
| `npm run db:deploy-seed` | Build deploy SQLite with seed data |
| `npm run stripe:setup` | Create test-mode Stripe prices (+ optional `--webhook`) |
| `npm run stripe:setup:live` | Create live-mode prices + production webhook |
| `npm run stripe:listen` | Forward Stripe webhooks to localhost |

## Troubleshooting

**Prisma EPERM on Windows:** Stop running Node/dev servers, then `npm run db:generate`

**Stripe checkout 503:** `STRIPE_SECRET_KEY` not set — manual billing fallback works for dev

**Onboarding loop:** Complete all steps or set `setupComplete` on the Location in Prisma Studio

**Admin access denied:** Add your email to `PLATFORM_ADMIN_EMAILS` and sign in again
