# __DISPLAY_NAME__

A Next.js static-export site for the **DIG Network** — deployed to a network no host can read,
change, or take down.

Scaffolded with `npm create dig-app` (template: `next-static`).

> This template uses `output: 'export'` (`next.config.mjs`). A DIG capsule is a **blind static
> host** — there is no Next.js server at runtime, so use static-export-compatible features only.

## Free until publish

Scaffolding, building, and previewing cost **nothing**. There is **no mint, no chain, and no spend**
when you create or run this project — you only spend **$DIG** the moment you publish a
capsule with `digstore deploy`. *Iterate for free, publish when it's ready.*

## Develop

```sh
npm install
npm run dev            # Next dev server at http://localhost:3000
npm run build          # static export -> out/ (your content root)
digstore dev           # preview on the real chia:// read path — FREE, no chain, no spend
```

## Publish (this is the only step that spends $DIG)

```sh
digstore deploy        # build + publish a capsule ($DIG + a small XCH fee)
```

Your site goes live at its `*.on.dig.net` address. Re-run `digstore deploy` to ship an update.

## Deploy from CI

Wire up push-to-deploy with the GitHub Action:
<https://docs.dig.net/docs/digstore/cli/deploy-from-github-actions>.

## Config

`dig.toml` is the project manifest digstore reads (output dir, build command, default remote).
