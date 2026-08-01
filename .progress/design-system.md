# Design system + Electron shell

Stage 4 and 5. Tokens, fonts, primitives, the app frame, the routing, the store pattern,
and the main/preload processes underneath them.

**Read `## The surface contract` before you build any surface.** It is the part of this
document that other agents are required to follow.

---

## What landed

| Area | Files |
|---|---|
| Electron main | `app/src/main/index.ts` |
| Preload bridge | `app/src/preload/index.ts`, `app/src/preload/global.d.ts` |
| Tokens | `app/src/renderer/src/styles/tokens.css`, `styles/index.css` |
| Primitives | `app/src/renderer/src/components/**` |
| Shell | `App.tsx`, `components/shell/{Sidebar,GlobalControls,QuickCapture}.tsx` |
| Surfaces | `app/src/renderer/src/surfaces/**` |
| Store | `app/src/renderer/src/store/**` |
| Helpers | `app/src/renderer/src/lib/{bridge,category,cn,date,routes}.ts` |

No dependencies were added. `app/package.json` is untouched.

---

## 1. Tokens

`styles/tokens.css`. Every themed token is declared **once**, as
`light-dark(<light>, <dark>)`. Which half applies is decided by the used value of
`color-scheme` on `<html>`:

```
no attribute       color-scheme: light dark    follow the OS   (default)
data-theme=light   color-scheme: light         manual override
data-theme=dark    color-scheme: dark          manual override
```

One palette table instead of two that can drift, and the override is one declaration.
Native scrollbars, `<select>` popups and form controls follow `color-scheme` for free.
Verified: with no attribute and the OS in dark mode the body computed to `rgb(11,10,8)`;
with `data-theme=light` forced on the same OS it computed to `rgb(253,250,243)`.

### Palette

| Token | Light | Dark | Role |
|---|---|---|---|
| `--bg` | `#FDFAF3` | `#0B0A08` | app background |
| `--bg2` | `#F5EFE2` | `#0E0D0A` | sidebar |
| `--card` | `#FFFFFF` | `#151310` | card surface |
| `--card2` | `#FAF6EC` | `#1C1A15` | raised card |
| `--band` | `#F5EFE2` | `#161410` | full-width bands, modals |
| `--ink` | `#2A2520` | `#EDE6D6` | primary text |
| `--ink2` | `#6B6356` | `#8F8677` | secondary text |
| `--muted` | **`#6E6659`** | **`#8F8677`** | tertiary text, captions, eyebrows |
| `--faint` | `#A39A87` | `#474038` | **non-text only** |
| `--entry` | `#3A322B` | `#C8C0AE` | long-form body copy |
| `--done` | `#8A8275` | `#7C7365` | completed todo text |
| `--line` | `rgba(0,0,0,.09)` | `rgba(255,255,255,.07)` | hairline borders |
| `--rule` | `rgba(0,0,0,.06)` | `rgba(255,255,255,.05)` | dividers, ruled paper |
| `--dashed` | `rgba(0,0,0,.14)` | `rgba(255,255,255,.09)` | dashed placeholders |
| `--fill` | `rgba(0,0,0,.09)` | `rgba(255,255,255,.06)` | tracks, inert blocks |
| `--hover` | `rgba(0,0,0,.04)` | `rgba(255,255,255,.04)` | hover |
| `--hover-strong` | `rgba(0,0,0,.10)` | `rgba(255,255,255,.10)` | pressed |
| `--chk` | `rgba(60,46,28,.40)` | `rgba(255,255,255,.30)` | checkbox border |
| `--scrim` | `rgba(40,32,24,.32)` | `rgba(6,5,4,.65)` | modal backdrop |
| `--accent` | `#9C7E40` | `#C8A564` | fills, borders, bars |
| `--accent-text` | **`#8A6E33`** | `#C8A564` | the accent **as text** |
| `--accent-border` | `rgba(156,126,64,.28)` | `rgba(200,165,100,.22)` | |
| `--soft` | `rgba(156,126,64,.10)` | `rgba(200,165,100,.10)` | accent fill |
| `--on-accent` | `#FFFFFF` | `#0B0A08` | text on gold |
| `--danger` | `#B4483F` | `#D67878` | **destructive only** |
| `--danger-bg` / `--danger-border` / `--on-danger` | `rgba(180,72,63,.08)` / `.28` / `#FFFFFF` | `rgba(214,120,120,.12)` / `.32` / `#1A0E0D` | |
| `--cat-recruiting` | `oklch(.60 .038 65)` | `oklch(.72 .038 65)` | square |
| `--cat-school` | `oklch(.60 .038 130)` | `oklch(.72 .038 130)` | circle |
| `--cat-personal` | `oklch(.60 .038 20)` | `oklch(.72 .038 20)` | diamond |
| `--shadow` | `0 18px 36px -34px rgba(40,32,24,.45)` | `… rgba(0,0,0,.8)` | |
| `--ruled` | repeating-linear-gradient, 32px pitch | same | Today hero, via `.bg-ruled` |

**The three bolded values are measured corrections, not taste.** Light `--muted` is
`#6E6659` (the old `#A39A87` measured 2.79:1 and is now demoted to `--faint`, which must
never carry text). `--accent-text` exists because the fill accent `#9C7E40` is 3.84:1 on
white — fine for a bar, below AA for a label. Dark `--ink2`/`--muted` are `#8F8677`. Do
not restore the loom originals.

Also defined: `--sidebar-w: 224px`, `--sidebar-w-collapsed: 76px`, `--titlebar-h: 44px`,
`--duration-fast|base|slow: 120|180|260ms`.

### Tailwind wiring

`@theme inline` — so `bg-card` emits `background-color: var(--card)` and theme switching
needs no re-render.

- **colours** — `bg-*`, `text-*`, `border-*` for every token above, plus `transparent`,
  `current`, `inherit`.
- **`--color-*: initial` clears Tailwind's default palette.** `bg-red-500` does not exist
  in this app. That is the structural way to hold the single-accent discipline, which the
  brief calls "the property most easily broken by adding colours carelessly".
- **type** — `font-display`/`font-serif` (Cormorant), `font-sans` (DM Sans), `font-mono`.
  Sizes: `text-micro` 10.5 · `text-label` 11 · `text-xs` 12 · `text-sm` 13 · `text-base` 14
  · `text-md` 14.5 · `text-lg` 19 · `text-xl` 22 · `text-title` 25 · `text-hero` 30 ·
  `text-display` 40, each with a paired line-height. Tracking: `tracking-label` .14em,
  `tracking-page` .16em, `tracking-tight` −.01em, `tracking-display` −.015em.
- **radii** — named for the job and deliberately not colliding with `rounded-sm|md|lg`:
  `rounded-marker` 1 · `cell` 4 · `check` 6 · `block` 7 · `field` 10 · `nav` 11 ·
  `control` 12 · `panel` 16 · `card` 22 · `pill` 99.
- **spacing** — `gutter` 20 · `card` 26 · `card-x` 28 · `page-x` 36 · `page-y` 32 ·
  `titlebar` 44 · `sidebar` / `sidebar-collapsed`. Usable as `gap-gutter`, `px-page-x`,
  `py-card`, `pt-titlebar`. All confirmed present in the built CSS.
- **other** — `shadow-card`, `ease-quiet`.

Utilities in `styles/index.css`: `.bg-ruled`, `.transition-quiet` (the one transition in
the system), `.text-estimate` (italic Cormorant for agent estimates), `.drag-region` /
`.no-drag` for the frameless window, plus a `prefers-reduced-motion` block and one
`:focus-visible` treatment (2px gold, 2px offset) for the whole app.

**Prefer explicit tokens over opacity modifiers.** `--soft`, `--fill`, `--hover` and
`--accent-border` exist so you never need `bg-accent/10`. (`color-mix()` does work
correctly with `light-dark()` — verified — so a modifier is not *broken*, just off-system.)

---

## 2. Fonts

Self-hosted, six variable woff2 files, 223 KB. `styles/index.css` imports
`public/fonts/fonts.css` first, before Tailwind and the tokens. That file is generated and
must not be hand-edited, and there are no `@font-face` rules anywhere else.

**The built app makes zero external network requests.** Verified two ways: `grep` for any
`fonts.googleapis`/`fonts.gstatic`/`cdn` URL across `out/renderer/` returns nothing, and
the running production app requested exactly six local paths and no others —

```
["/index.html","/assets/index-1outKa7L.js","/assets/index-D3G9g2fF.css",
 "/fonts/dm-sans-normal-latin.woff2","/fonts/cormorant-normal-latin.woff2",
 "/fonts/cormorant-italic-latin.woff2"]
```

There is no CDN `<link>` and no `preconnect` in `index.html`. The CSP forbids remote
origins outright (`default-src 'self'`, `font-src 'self'`).

Both families are declared across their full axes (Cormorant 300–700, DM Sans 100–1000),
so any weight in range is available. `font-optical-sizing: auto` is on `body`.
**Italic is always Cormorant** — there is no DM Sans italic cut, so `italic` on sans text
is a signal you reached for the wrong family.

---

## 3. Primitives — `@/components`

Import from the barrel, not the individual files.

| Component | Props |
|---|---|
| **`CategoryMarker`** | `category` · `size?`=8 · `showLabel?` · `decorative?` · `className?` · `labelClassName?` |
| `CategoryLegend` | `className?` — all three markers with names, for a filter bar or chart legend |
| `Card` | `variant?` `'surface'\|'raised'\|'band'` · `title?` · `meta?` · `actions?` · `padded?`=true · plus `<section>` props |
| `Eyebrow` | `children` · `className?` — the 11px uppercase group label |
| `Button` | `variant?` `'primary'\|'secondary'\|'soft'\|'ghost'\|'destructive'` · `size?` `'sm'\|'md'` · `shape?` `'control'\|'pill'` · `loading?` · `leading?` · `full?` · plus `<button>` props |
| `Checkbox` | `label?` · `strikeWhenChecked?` · plus `<input type=checkbox>` props |
| `Input` | `label?` · `hint?` · `error?` · `required?` · `className?` (wrapper) · `inputClassName?` · plus `<input>` props |
| `Textarea` | same shell + `textareaClassName?` · `rows?`=4 |
| `Select` | same shell + `selectClassName?` · `children` = `<option>`s |
| `Field` | `label?` · `hint?` · `error?` · `required?` · `children({id, describedBy})` — the shell the three controls share |
| `Badge` | `tone?` `'neutral'\|'accent'\|'danger'` · `leading?` · `children` |
| `Dot` | `tone?` `'accent'\|'soft'\|'faint'` — the 6px status dot |
| `Dialog` | `open` · `onClose` · `title` (required) · `hideTitle?` · `description?` · `footer?` · `size?` `'capture'\|'sm'\|'md'\|'lg'` · `children` |
| `ToastProvider` / `useToast()` | `toast(message, { tone?: 'neutral'\|'accent', duration? })` |
| `EmptyState` | `title` · `children?` · `action?` · `compact?` |
| `Skeleton` | `width?` · `height?` · `radius?` `'field'\|'control'\|'panel'\|'card'\|'pill'` |
| `SkeletonLines` | `lines?`=3 |
| `StreakBadge` | `streak: StreakInfo \| null` |
| `PriorityEdge` | `priority: Priority` · `height?`=16 |
| `Page` | see the contract below |

### `CategoryMarker` — the one that matters

Categories resolve by **shape**: recruiting = square, school = circle, personal = diamond
(rotated 45°, drawn at 0.875× so its visual weight matches). The three hues hold lightness
and chroma constant and vary only hue, which is what makes the triad harmonious *and* what
puts their mutual contrast at 1.01–1.03. **Colour alone is not a usable encoding here and
must never be the only signal.** A lightness split was evaluated and rejected: lightness
encodes rank and these categories are unordered.

The marker carries `role="img"` + `aria-label` unless `decorative` or `showLabel` is set,
and its wrapper keeps a stable `size × size` footprint so a rotated diamond never shifts
the row it sits in. For places that cannot mount a component — the Today rail's absolutely
positioned blocks, Recharts `fill` props — use `categoryMarkerStyle(category, size)` from
`@/lib/category`, which returns the same inline style.

### Rules the primitives enforce

- **Red is only `<Button variant="destructive">` and `<Badge tone="danger">`.** Confirmed
  in the running app: `--danger` appears in exactly 2 CSS rules in the whole bundle. Not
  for overdue, not for over-budget, not for a missed day, not for an error. Those are gold.
- **`Field` renders validation errors in gold, not red.** A field you have not filled in
  correctly is information, not damage.
- **`Toast` has no error tone.** Write failure copy that says what survived:
  "Couldn't reach the vault. Nothing was lost."
- **`StreakBadge` is structurally incapable of showing a broken streak (PRD J6).** There is
  no branch that renders `0`. `current >= 1` → "N days running". Otherwise it shows only
  the banked `longest`, framed as something owned. Otherwise it renders `null` — absence,
  not a zero. On the user's real imported data (`current: 0, longest: 44, total: 83`) it
  renders "Longest run · 44 days" and never mentions the gap. If you find yourself needing
  "days since", stop; that number does not belong in this product.
- **`EmptyState` copy register**: "Nothing captured yet." — never "You haven't…", never a
  count of what is missing.

---

## The surface contract

**Every routed surface returns exactly one `<Page>`, and nothing above it.**

```tsx
export function FinanceSurface() {
  return (
    <Page
      title="Finance"                        // Cormorant, sentence case, no trailing period
      eyebrow="August"                       // optional uppercase line above the title
      description="Spending against the limits you set."   // optional, one quiet line
      actions={<Button size="md" shape="pill">Add purchase</Button>}   // optional
    >
      <Card title="This month" meta="August, so far">…</Card>
      <Card title="Recent">…</Card>
    </Page>
  )
}
```

`<Page>` owns the eyebrow, the Cormorant title, the description, the page gutters, the
scroll container, and the persistent controls. Register the component in
`src/renderer/src/surfaces/index.tsx`; metadata (label, title, description) lives in
`src/renderer/src/lib/routes.ts`.

Rules:

1. **One `<Page>` per surface.** Do not nest one, do not render two, do not skip it.
2. **Children are the content column.** `<Page>` already applies the 20px gutter between
   them — do not add an outer spacing wrapper.
3. **Persistent chrome goes nowhere.** If a control belongs on every surface it belongs in
   `components/shell/GlobalControls.tsx`, not copy-pasted into `actions`.
4. **Loading renders `<Skeleton>` inside the cards, not instead of the Page.** The frame
   must never flicker.
5. **Errors render inside a card as a quiet line.** Never a red banner, never a blank
   screen, never the word "Error" alone.
6. **Do not restyle `Card`, `Button` or the type scale per surface.** If you need something
   that is not in `@/components`, that is a design decision: it goes in
   `Moodboard/Design-Brief.md` first and in `components/` second.

A crash inside a surface is caught by `SurfaceBoundary` in `App.tsx` (keyed by route, so
navigating resets it) and the sidebar stays usable. This was exercised for real: a
mid-HMR `ReferenceError` in `TodaySurface` was caught, rendered as a card, and recovered.

The seven placeholders each name what will live there and cite their PRD requirement ids —
`TodaySurface.tsx` for Today, `surfaces/index.tsx` for the rest. Replace them; do not
extend `Placeholder`.

---

## 4. The store pattern

Three parts and no more. `store/inbox.ts` is the worked example and the file to copy.

```ts
// 1. A read is a hook wrapping useVaultQuery. No caching, no normalization,
//    no store slice — the vault IS the cache.
export function useInboxCount(): VaultQuery<number> {
  return useVaultQuery(() => bridge().inbox.count(), [])
}

// 2. A write is a plain async function: call bridge(), then invalidateVault().
//    Not a hook, not in zustand — nothing about it is stateful.
export async function captureToInbox(text: string): Promise<void> {
  await bridge().system.quickCapture(text.trim())
  invalidateVault()
}

// 3. Errors are returned, never thrown at the render tree. The caller decides
//    whether that is an empty state, an inline note, or a toast.
const { data, error, loading, settled, refetch } = useInboxCount()
```

`useVaultQuery(fetcher, deps)` re-runs when `deps` change **and** whenever the vault
revision moves — which happens on any file change the main-process watcher sees and on any
explicit `invalidateVault()`. Out-of-order responses are discarded, so a fast refetch never
loses to a slow one still in flight. `settled` distinguishes "not yet" from "nothing".
`deps` follows the `useEffect` contract; the fetcher is deliberately *not* a dependency, so
an inline arrow is fine.

`zustand` holds only what the filesystem cannot:

- `store/ui.ts` — route, theme preference + resolved OS theme, sidebar collapsed, quick
  capture open. `initUi()` installs the `hashchange` and `prefers-color-scheme` listeners.
- `store/vault.ts` — the revision counter. `initVaultSync()` subscribes to
  `onVaultChanged`.

**Do not mirror vault records into a store.** Two sources of truth is the exact bug this
architecture was chosen to avoid.

Render the four states in this order — `!settled && loading` → `error` → `settled &&
empty` → `data`. `TodaySurface`'s `InboxCard` is the reference implementation.

---

## 5. Main process

`src/main/index.ts`. Single-instance lock, macOS lifecycle (`window-all-closed` does not
quit, `activate` recreates), `contextIsolation: true`, `nodeIntegration: false`,
`titleBarStyle: 'hiddenInset'` with the traffic lights floated over a 44px drag strip at
the top of the sidebar. Window background is set from `nativeTheme` at creation and updated
on OS theme change, so there is no white flash on launch. External links and all
navigation are denied and handed to the system browser. `registerIpcHandlers(ipcMain)` is
called and `ipc-router.ts` is untouched.

**Production is served from `desvu://app/`, not `file://`.** Two reasons, both
load-bearing: `file://` pages have a null origin so `default-src 'self'` blocks the app's
own bundle — meaning `file://` effectively cannot have a strict CSP, and this app ingests
arbitrary fetched URLs into the corpus. And root-absolute asset paths (`/fonts/*.woff2`,
written by the generated `fonts.css`) resolve against the filesystem root under `file://`.
The handler has a traversal guard and falls back to `index.html`.

**Vault watcher.** Native recursive `fs.watch` on the path from `@shared/vault`, debounced
250ms, ignoring `.git` `.obsidian` `.trash` `.impeccable` `.claude` `node_modules`,
`.DS_Store`, any dotfile (atomic writes and iCloud both stage through them) and
`~`/`.tmp`/`.swp` suffixes. Pushes `IPC_EVENTS.vaultChanged` with
`{ at, paths, truncated }`, capped at 64 paths. A missing vault logs a warning and the app
still opens.

**Quick capture (PRD C8).** `CommandOrControl+Shift+Space` is registered globally; it
focuses the window and pushes an event the renderer turns into the capture dialog.
`⌘⇧K` does the same from inside the app. One field, no category picker, no priority — and
**on failure the dialog stays open with the text intact**, because losing a capture to a
failed write is the worst thing it could do.

### A bug this caught

The default Electron User-Agent embeds the product name, and `app.setName('Dès vu')` puts a
non-ASCII character in it. HTTP header values are ByteStrings, so `protocol.handle` threw
`TypeError: Cannot convert argument to a ByteString` while building the request headers for
assets served over `desvu://`. Fixed by stripping the UA to printable ASCII after
`setName`. This only appears in a real production launch — the dev server does not go
through the custom protocol.

## 6. Preload

`src/preload/index.ts`. `window.desvu` is built **mechanically from `IPC_CHANNELS`** by
splitting each `domain:method` string, so a channel that is not in the allowlist is not
reachable and a channel added there needs no edit here. Every domain object is
`Object.freeze`d. `ipcRenderer` is never exposed. Plus `onVaultChanged(fn)` and
`onQuickCapture(fn)`, both returning an unsubscribe.

Verified in the running production app: 13 domains present, `bridgeFrozen: true`,
`rawIpcRendererLeaked: false` (no `ipcRenderer`, `require` or `process` on `window`).

`src/preload/global.d.ts` carries the `Window` augmentation. **It must not be named
`index.d.ts`** — TypeScript drops a `foo.d.ts` when `foo.ts` is in the same program, which
silently removes the global types.

---

## Verified

Everything below is real output from this session.

```
$ npx tsc --noEmit
TypeScript: No errors found

$ npx electron-vite build
out/main/index.js  103.11 kB
out/preload/index.mjs  2.23 kB
../../out/renderer/index.html                   1.35 kB
../../out/renderer/assets/index-D3G9g2fF.css   31.43 kB
../../out/renderer/assets/index-1outKa7L.js   272.08 kB
✓ built in 297ms

$ npx vitest run
Test Files  10 passed (10)
     Tests  143 passed (143)
```

`test/ipc-contract.test.ts` passing is the parity check between `IPC_CHANNELS`, the
main-process router and this preload allowlist.

**Ran in dev (`electron-vite dev`)** — window opened, `[desvu] watching vault at
/Users/jeffreyshen/Documents/Dès vu`, no errors. Renderer exercised at the dev server:
both themes, all seven surfaces, quick capture open/type/submit/Escape, and the failure
path (dialog stays open, text preserved, message in gold).

**Ran the production build in real Electron** (`electron .`, loading `desvu://app`):

```
FOLLOWS_OS {"attr":null,"colorScheme":"light dark","bodyBg":"rgb(11, 10, 8)"}   # OS is dark
REPORT     {"bridgePresent":true,"bridgeDomains":[13 domains + 2 subscribers],
            "rawIpcRendererLeaked":false,"bridgeFrozen":true,
            "bodyBg":"rgb(253, 250, 243)","bodyColor":"rgb(42, 37, 32)",   # data-theme=light
            "fontFamily":"\"DM Sans\", system-ui, …",
            "loadedFonts":["Cormorant italic","Cormorant normal","DM Sans normal"],
            "navLabels":["Today","Journal","Explore","Finance","Meals & training",
                         "Brain dump","Synthesis"],
            "h1":"Today"}                                                   # PRD T9
PROBLEMS   []                          # no CSP violation, no console error, no failed load
NAV        all 7 routes render their own h1, hash syncs, aria-current follows
SIDEBAR    {"expanded":"224px","collapsed":"76px","restored":"224px","titlebarReserve":"44px"}
MISC       {"dangerTokenUsedByRules":2,"focusRuleExists":true,
            "reducedMotionHandled":true,"ruledPaperAvailable":true,"title":"Dès vu"}
```

**Vault watcher, end to end.** An mtime-only `touch` of a vault file (content unchanged, so
`git status` stayed clean) reached the renderer:

```
BEFORE {"bridge":"object","events":0}
AFTER  {"events":[{"at":1785580798931,"paths":["README.md"],"truncated":false}, …]}
```

**Integration with the storage layer** (which landed mid-session — re-verified against it):

```
LIVE_IPC {"vaultPath":"/Users/jeffreyshen/Documents/Dès vu","inboxCount":0,"todos":0,
          "streak":{"current":0,"longest":44,"total":83},"headerPill":"inbox clear"}
CAPTURE  {"before":0,"after":1,"headerPill":"1 captured, unsorted"}
```

The header pill moved from "inbox clear" to "1 captured, unsorted" **with no manual
refetch** — that is `vaultChanged` → revision bump → `useVaultQuery` re-run, proven live.
And note the real streak: `current: 0, longest: 44`. `StreakBadge` renders
"Longest run · 44 days" and never a zero.

Screenshots of the real Electron window in both themes were captured via
`webContents.capturePage()` (`screencapture` is blocked for the shell — no Screen Recording
permission).

---

## Needs action

1. **One verification line is still in the vault.** `Inbox/2026-08-01.md` contains
   `- [ ] 03:41 · app · desvu design-system verification line` from the live capture test.
   I tried to remove it and the permission system correctly blocked both the `rm` and the
   overwrite, and I did not work around that. One `rm` clears it. (`data/journal-streak.json`
   also appeared, from my `journal.streak()` call — that one is legitimate app state.)

2. **Requested addition to `@shared/ipc`** (orchestrator-owned, not edited unilaterally):

   ```ts
   export const IPC_EVENTS = {
     vaultChanged: 'event:vault-changed',
     quickCapture: 'event:quick-capture',   // ← please add
   } as const
   ```

   PRD C8's global accelerator needs a push channel. The string currently lives in exactly
   two places, both commented — `src/main/index.ts` and `src/preload/index.ts`. Adding it
   lets both import from the contract.

## Left for later

- **Empty and degraded states.** The brief defers them by decision: day-one blank and the
  return-after-lapse screen (60 unsorted lines, everything overdue, three weeks of empty
  grid). `EmptyState` sets the register but the highest-stakes screen in the product is not
  designed yet.
- **Motion.** `--duration-*`, `--ease-quiet` and `.transition-quiet` are derived, not from
  the brief, which lists motion as still to derive. They are deliberately short and quiet.
- **The frameless always-on-top quick-capture window.** C8 describes a separate window; it
  is currently an in-shell dialog reachable by the global accelerator, which satisfies the
  behaviour. A second renderer entry point would be needed for the literal reading.
- **Chart tokens.** Recharts is a dependency but nothing charts yet. Series colour follows
  the same rule: gold for the primary series, category markers for category-split data,
  `--fill` for context. No new hues.
- **Search (S1–S3).** No surface owns it yet; it will most likely live in the header rather
  than in the sidebar's seven.
