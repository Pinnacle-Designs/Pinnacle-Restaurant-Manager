# Marketing site (`docs/`)

Static landing page and partnership materials for Pinnacle Restaurant Manager.

## Files

| File | Description |
|------|-------------|
| `index.html` | Main site — live demo embed, features, pricing |
| `pitch.html` | **Public** mini pitch + request form for the private deck |
| `pitch-request.js` | Posts form to `{appUrl}/api/pitch-request` |
| `pricing.html` | Redirects to `index.html#pricing` |
| `config.js` | Set `PINNACLE_CONFIG.appUrl` to your deployed app |
| `live-demo.js` | Embeds the real app via `/api/embed/launch` |
| `styles.css` | Site styles |
| `assets/` | Logo and screenshots |

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
