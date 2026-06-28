# __DISPLAY_NAME__

A static site for the **DIG Network** — deployed to a network no host can read, change, or take down.

Scaffolded with `npm create dig-app` (template: `static`).

## Free until publish

Scaffolding, building, and previewing cost **nothing**. There is **no mint, no chain, and no spend**
when you create or run this project — you only spend a flat **100 DIG** the moment you publish a
capsule with `digstore deploy`. *Iterate for free, publish when it's ready.*

## Develop

```sh
npm install
npm run build          # copies src/ -> public/ (your content root)
digstore dev           # preview on the real dig:// read path — FREE, no chain, no spend
```

`digstore dev` serves your built site through the genuine DIG read path (encrypt → compile → verify
→ decrypt) with live reload, so what you see is exactly what visitors get.

## Publish (this is the only step that spends DIG)

```sh
digstore deploy        # build + publish a capsule (100 DIG + a small XCH fee)
```

Your site goes live at its `*.on.dig.net` address — immutable, encrypted, and impossible to take
down. Re-run `digstore deploy` to ship an update (each published update is a new capsule).

## Deploy from CI

Wire up push-to-deploy with the GitHub Action so every push to `main` publishes a new capsule:
<https://docs.dig.net/digstore/cli/deploy-from-github-actions>.

## Config

`dig.toml` is the project manifest digstore reads (output dir, build command, default remote).
