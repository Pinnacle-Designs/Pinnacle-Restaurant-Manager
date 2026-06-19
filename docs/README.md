# Marketing site (`docs/`)

Static landing page and partnership materials for Pinnacle Restaurant Manager.

## Files

| File | Description |
|------|-------------|
| `index.html` | Main site — live demo embed, features, POS/KDS, menu platform (incl. sub-recipes), team/payroll, operations, integrations (280+ marketplace), analytics, pricing |
| `pitch.html` | **Public** mini pitch + request form for the private deck |
| `pitch-request.js` | Posts form to `{appUrl}/api/pitch-request` |
| `site-nav.js` | Shared header nav (desktop + mobile hamburger) |
| `pricing.html` | Redirects to `index.html#pricing` |
| `config.js` | Set `PINNACLE_CONFIG.appUrl` to your deployed app |
| `live-demo.js` | Embeds the real app via `/api/embed/launch` |
| `styles.css` | Site styles |
| `assets/` | Logo and screenshots |

## Product highlights (marketing copy)

- **POS & KDS** — serve flow, split checks, station routing, recipe depletion
- **Menu** — engineering matrix, sub-recipes, 6-channel sync, BOH 86 controls
- **Team** — scheduling, timeclock, hiring, payroll runs, holiday pay rules, compliance, training
- **Operations** — purchase orders, loading dock, invoice OCR, walk-in counts, back office COGS
- **Integrations** — QuickBooks/Xero/Sage, vendor EDI, 280+ partner marketplace
- **Analytics & AI** — 12 tabs, Command Center, Crystal Ball forecasting
- **Billing** — Stripe subscription autopay, Square/Stripe Connect for guest payments
- **Onboarding** — self-serve signup wizard; platform admin at `/admin`

## Private pitch deck (not public)

The full investor deck lives at **`private/pitch-deck.html`** in the repo root — it is **not** in `docs/` and is not linked from the marketing site.

1. Review requests in **Platform admin → Pitch requests**
2. Open `private/pitch-deck.html` locally → Print → Save as PDF
3. Email the PDF to qualified contacts only

## Preview locally

**Option A — Next.js (recommended)**

```bash
npm run dev
```

- Site: [http://localhost:3000/docs/](http://localhost:3000/docs/)
- Investors: [http://localhost:3000/docs/pitch.html](http://localhost:3000/docs/pitch.html)

**Option B — Live Server / static**

Open `index.html` in VS Code Live Server. Update `config.js`:

```js
window.PINNACLE_CONFIG = {
  appUrl: "http://localhost:3000"
};
```

The pitch request form needs the Next.js app running so `/api/pitch-request` can receive submissions.

## GitHub Pages

Deploy the `docs/` folder as the site root. Set `config.js` `appUrl` to your production Vercel URL.

Public page = marketing (`pitch.html`). Private deck = negotiation tool (`private/` — not deployed).
