# Black Sky Bound public playtest site

This directory owns the reproducible Sites landing page, hosting identity, and the curated `/play/` deployment surface for the Crown of Cinders demo.

The game remains canonically owned by the parent project. In the main workspace, `npm run build` first runs the parent `build:playtest` exporter, then stages only its bounded output into `public/` before Vinext builds the site. A standalone Sites source checkout validates and reuses the exact curated `public/` assets committed for that release. The generated paths stay ignored in the main game workspace; the deployment-source commit force-includes them with the landing source, social assets, lockfile, and `.openai/hosting.json`.

Release checks:

```text
npm test
npm --prefix site test
npm run smoke:public-3d-demo
```

Public paths remain `/`, `/play/index.html`, `/data/maps/manifest.json`, and `/data/maps/axiom-crown-of-cinders.runtime-map.json`.
