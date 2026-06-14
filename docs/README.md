# Marketing site (`docs/`)

Static landing page and pitch materials for Pinnacle Restaurant Manager.

## Files

| File | Description |
|------|-------------|
| `index.html` | Main site — live demo embed, features, pricing |
| `pitch-deck.html` | Investor pitch deck — use **Print → Save as PDF** |
| `pricing.html` | Redirects to `index.html#pricing` |
| `config.js` | Set `PINNACLE_CONFIG.appUrl` to your deployed app |
| `live-demo.js` | Embeds the real app via `/api/embed/launch` |
| `styles.css` | Site styles |
| `assets/` | Logo and screenshots |

## Preview locally

**Option A — Next.js (recommended)**

```bash
npm run dev
```

Visit [http://localhost:3000/docs/](http://localhost:3000/docs/)

**Option B — Live Server / static**

Open `index.html` in VS Code Live Server. Update `config.js`:

```js
window.PINNACLE_CONFIG = {
  appUrl: "http://localhost:3000"
};
```

## GitHub Pages

The repo includes `.nojekyll`. Deploy the `docs/` folder as the site root. Set `config.js` `appUrl` to your production Vercel URL so signup and demo links resolve correctly.

## Pitch deck PDF

1. Open `pitch-deck.html` in a browser (via `/docs/pitch-deck.html` or locally)
2. Click **Download PDF** or use the browser print dialog
3. Choose **Save as PDF**

Update slide content in `pitch-deck.html` when pricing or positioning changes.
