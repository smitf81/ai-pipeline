# 🎙️ Voice Dojo — PWA

Character impression trainer. Earn XP. Unlock iconic voices. Train your ear.

---

## Deploy to Netlify (free, ~2 minutes)

### Option A — Drag & drop (fastest)
1. Run `npm install && npm run build` locally
2. Go to [netlify.com](https://netlify.com) → sign up free
3. Drag the `dist/` folder onto the Netlify dashboard
4. Done — you'll get a live URL instantly

### Option B — Connect GitHub (best for ongoing dev)
1. Push this folder to a GitHub repo
2. Go to Netlify → "Add new site" → "Import from Git"
3. Select your repo
4. Build command: `npm run build`
5. Publish directory: `dist`
6. Deploy — Netlify auto-deploys on every push

---

## Add your app icons

Before deploying, add two PNG icons to `public/icons/`:
- `icon-192.png` — 192×192px
- `icon-512.png` — 512×512px

These appear on the home screen when installed. Use a mic or 🎙️ image.
Free icon generators: [realfavicongenerator.net](https://realfavicongenerator.net)

---

## Local dev

```bash
npm install
npm run dev
```

Opens at `http://localhost:5173`

Note: mic permissions work fine in local dev on Chrome/Edge.
On iOS Safari, you need the live HTTPS URL for mic to work.

---

## Sell it

Once live, link to your Netlify URL. To charge:
- **Gumroad** — simplest, takes a cut, no setup fee. Sell as a "web app access" product, deliver the URL on purchase.
- **Stripe Payment Links** — slightly more setup, lower fees at scale.
- **Ko-fi / Patreon** — if you want a tip-based model first to validate demand.

PWA means: works on iOS, Android, desktop. No App Store needed. No review process.

---

## Tech stack

- React 18
- Vite + vite-plugin-pwa (handles service worker + manifest automatically)
- Workbox (offline caching)
- Anthropic Claude API (scoring)
- Web Speech API (mic input)
- localStorage (XP + progress persistence)
