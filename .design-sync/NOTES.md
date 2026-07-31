# design-sync notes — MediSens

## Repo shape
- Not a published component library: `package.json` is `private`, has no `main`/`module`/`exports`,
  and `vite build` emits 15 **page** bundles. The sync therefore uses a generated barrel entry.
- `.ds-sync/make-barrel.mjs` regenerates `.design-sync/.cache/ds-entry.tsx` **and** rewrites
  `cfg.componentSrcMap`. Run it before every build.

## Required pre-build steps (in order)
1. `node .ds-sync/make-barrel.mjs` — barrel + componentSrcMap
2. `node .design-sync/build-css.mjs` — regenerates the CSS entry (see below)
3. `npx tsc -p tsconfig.json --declaration --emitDeclarationOnly --noEmit false --outDir ds-types`
   — emits the `.d.ts` tree (TS5011 rootDir warning is benign)
4. `node .ds-sync/package-build.mjs --config .design-sync/config.json --node-modules ./node_modules \
     --entry .design-sync/.cache/ds-entry.tsx --out ./ds-bundle`

## Tailwind is CDN-loaded — this is the big one
The app loads Tailwind from `https://cdn.tailwindcss.com` in 13 page shells; there is **no**
tailwind/postcss config and no `@tailwind` directives. So no utility CSS exists on disk.
`.design-sync/build-css.mjs` runs a sync-only Tailwind v3 build (installed in `.ds-sync/`, so the
repo's package.json and lockfile are untouched) scanning `src/**/*.tsx` + `pages/*.html`, then
concatenates: font `@import`s → Tailwind preflight+utilities → `dashboard.css`.
- **Gotcha that cost a debugging cycle:** extracting dashboard.css's leading `@import` with a
  `/^@import[^;]+;/` regex TRUNCATES it — the Google Fonts URL contains semicolons
  (`wght@300;400;…`). The resulting invalid at-rule invalidates the *entire* stylesheet (0 rules
  parsed, everything renders unstyled). The extraction is line-based now; keep it that way.
- Verify after any CSS change: a preview's `_ds_bundle.css` sheet should report **~1300 rules**, and
  `LoadingState`'s root should compute `display:flex; padding:20px; border-radius:8px`.

## `.d.ts` contracts
Without step 3 every emitted interface degrades to `[key: string]: unknown` (useless to the design
agent). The tree must go to a **non-dot** directory — the converter's glob skips dot-dirs, so
`.design-sync/.cache/types` is silently invisible. `ds-types/` is gitignored.

## Excluded components
`Sidebar`, `PatientDetailModal`, `PatientTransactionHistory` transitively import
`src/lib/supabase/client.ts`, which calls `createClient(undefined, undefined)` at module scope and
throws. The bundle is a single IIFE, so including any of them breaks **every** component.
Also skipped as duplicates: `shared/EmptyState`, `shared/LoadingState`, `shared/StatusBadge`
(re-export shims) and `feedback/Toast` (exports the `useToast` hook, not a component).

## Known render warns (triaged, expect these)
- `[RENDER_BLANK]` / `[RENDER_THIN]` on any component with no authored preview — that is the floor
  card rendering with minimal auto-props, not a defect.
- `[FONT_REMOTE]` "Inter" / "Plus Jakarta Sans" — served at runtime via the Google Fonts `@import`.
- `tokens: 3 missing` — below the converter's threshold, non-blocking.

## Re-sync risks
- **Tailwind CSS is regenerated, not committed** (`.design-sync/.cache/` is gitignored). A fresh
  clone MUST re-run steps 1–3 or the bundle ships unstyled with empty prop contracts.
- The Tailwind version is pinned only by `.ds-sync/package.json` (also gitignored). It was v3.4.19
  here; a v4 install would need a different config format.
- playwright must match the cached chromium build: cache had `chromium-1228` → **playwright 1.61.0**.
  1.62.x pins 1234 and fails with "Executable doesn't exist".
- `make-barrel.mjs` discovers components by regex (`export function <PascalCase>` /
  `export const <PascalCase> =`). A component authored some other way is silently missed — check the
  export count against `src/components` after adding one.
- Only 6 of 28 components have authored previews so far; the rest ship the floor card and are the
  standing offer for incremental authoring on any later sync.
