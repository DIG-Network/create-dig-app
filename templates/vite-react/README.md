# __DISPLAY_NAME__

A React app (Vite) for the **DIG Network** — deployed to a network no host can read, change, or
take down.

Scaffolded with `npm create dig-app` (template: `vite-react`).

## Free until publish

Scaffolding, building, and previewing cost **nothing**. There is **no mint, no chain, and no spend**
when you create or run this project — you only spend **$DIG** the moment you publish a
capsule with `digstore deploy`. *Iterate for free, publish when it's ready.*

## Develop

```sh
npm install
npm run dev            # Vite dev server at http://localhost:5173
npm run build          # production build -> dist/ (your content root)
digstore dev           # preview on the real chia:// read path — FREE, no chain, no spend
```

`digstore dev` serves your built site through the genuine DIG read path (encrypt → compile → verify
→ decrypt) with live reload and an injected `window.chia` dev shim, so what you see is exactly what
visitors get.

## Publish (this is the only step that spends $DIG)

```sh
digstore deploy        # build + publish a capsule ($DIG + a small XCH fee)
```

Your app goes live at its `*.on.dig.net` address. Re-run `digstore deploy` to ship an update.

## Deploy from CI

Wire up push-to-deploy with the GitHub Action:
<https://docs.dig.net/docs/digstore/cli/deploy-from-github-actions>.

## Config

`dig.toml` is the project manifest digstore reads (output dir, build command, default remote).
