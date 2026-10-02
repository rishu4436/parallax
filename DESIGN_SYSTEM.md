# PARALLAX design system

Visual language for the BSC tokenized-stock desk. Grounded in `PRODUCT_ARCHITECTURE.md`. This file is the source of truth for tokens and shared primitives. Individual screens keep their current markup until a later pass adopts these primitives.

Direction: premium institutional finance, modern brokerage, editorial typography, restrained BNB gold, strict information hierarchy.

Not this product: neon crypto, gradient wash, pill cards, glassmorphism, cartoon AI, bounce, confetti, Lottie loaders.

Implementation lives in:

- `apps/web/app/globals.css` — CSS variables and utility classes
- `apps/web/tailwind.config.ts` — Tailwind mapping
- `apps/web/components/ui/` — shared React primitives
- `packages/core/src/amounts.ts` — numeric formatting

---

## 1. Color tokens

One dark canvas. Gold is a scarce instrument: the mark, the primary action, the live quote, DEMO labels. It is not a fill for panels.

RGB channels are stored so Tailwind opacity modifiers (`bg-gold/40`, `bg-bg/80`) keep working.

| Token | RGB | Hex | Role |
| --- | --- | --- | --- |
| `--bg` | 7 8 10 | `#07080A` | Page void |
| `--raised` | 12 14 18 | `#0C0E12` | Panel / drawer surface |
| `--raised-2` | 16 19 26 | `#10131A` | Nested well (inputs, log rows) |
| `--line` | 28 32 40 | `#1C2028` | Hairline borders |
| `--line-strong` | 42 46 56 | `#2A2E38` | Scrollbar, active rule |
| `--ink` | 244 241 234 | `#F4F1EA` | Primary text |
| `--muted` | 200 196 186 | `#C8C4BA` | Secondary text |
| `--dim` | 139 144 154 | `#8B909A` | Kickers, hints, empty |
| `--gold` | 240 185 11 | `#F0B90B` | Primary action, mark, live accent |
| `--gold-dim` | 201 162 39 | `#C9A227` | Hover on gold |
| `--up` | 61 220 151 | `#3DDC97` | Positive gap, OPEN, buy |
| `--down` | 232 93 108 | `#E85D6C` | Negative gap, CLOSED, sell, error |
| `--warn` | 232 184 109 | `#E8B86D` | Halted, incomplete NET, pending |
| `--overlay` | 7 8 10 / 0.88 | — | Modal scrim |
| `--plate` | ink / 0.035 | — | Open-session grid |
| `--fog` | gold radial, closed session only | — | Atmosphere, not decoration |

Session atmosphere (`html[data-session=open|closed]`):

- Open: `--fog: none`. Grid is ink plate.
- Closed: gold fog at the top-left, plate tints gold at 4.5%. This is the hours-split, not a theme switch.

Rules:

- Panels use `bg` or `raised`, never gold fills.
- Selection highlight is gold at 28% on ink.
- Links and tx hashes use gold text, not underline rainbows.
- Do not introduce a second accent (cyan, purple, electric green).

Tailwind: `bg`, `raised`, `raised2`, `line`, `lineStrong`, `ink`, `muted`, `dim`, `gold`, `goldDim`, `up`, `down`, `warn`.

---

## 2. Typography

Two families, already loaded in `layout.tsx`:

| Role | Face | CSS |
| --- | --- | --- |
| UI / body | Geist (`--font-geist`) | `font-sans` |
| Display | Instrument Serif (`--font-display`) | `.display` |
| Numerals | same face, tabular lining | `.num` |

Scale:

| Name | Size | Weight | Tracking | Use |
| --- | --- | --- | --- | --- |
| kicker | 10px | 400 | 0.22em | Section labels, always uppercase, `text-dim` |
| micro | 11px | 400 | 0.14–0.16em | Controls, DEMO, simulation status |
| ui | 12px | 500 | 0.22em | Wordmark `PARALLAX` |
| body | 13–14px | 400 | 0 | Copy, reasons, copilot |
| table | 12px | 400 | 0 | Tape, comparison, ticket rows |
| title | 30–48px serif | 400 | −0.03em | Name of the company |
| hero | 48–72px serif + `.num` | 400 | −0.03em | Price, pairing code |

Rules:

- One display line per panel. Kickers name the panel; serif names the asset; tabular numbers are the data.
- Body copy is Geist. Do not set strategy theses in serif.
- Kickers never wrap mid-word. Prefer one line.
- Letter-spacing on buttons is 0.16–0.20em, uppercase or tracked small caps, not bold gold sans at 18px.

---

## 3. Spacing

4px base. Prefer the existing Tailwind scale.

| Step | px | Typical |
| --- | --- | --- |
| 1 | 4 | Hairline padding, metric stack |
| 1.5 | 6 | Tight table cell |
| 2 | 8 | Control gap |
| 3 | 12 | Compact stack |
| 4 | 16 | Panel padding (ticket, strip) |
| 5 | 20 | Board padding |
| 6 | 24 | Column padding mobile |
| 7 | 28 | Aside padding |
| 8 | 32 | Column padding desktop |
| 10 | 40 | Modal inner |
| 12 | 48 | Landing vertical |

Page grid: desk is `1.4fr / 0.7fr` with a 1px `line` rule, not a gutter of empty gold. Landing max width `72rem` (max-w-6xl). Panel padding is 16–20px; do not inflate to 32px cards.

---

## 4. Borders

Hairline only. `1px solid rgb(var(--line))`.

- Panels: full box, square.
- Rows: `border-b` or `border-t`, never zebra.
- Selected rail / selected opportunity: `border-gold`, not a glow.
- Flagged board may use `border-gold/40` as the single gold box on the page.
- No 2px borders. No inner shadows pretending to be insets.

Utility: `.hair` sets `border-color` to line.

---

## 5. Radii

**0** on panels, buttons, inputs, tables, drawers, modals.

The only circles:

- Quote TTL ring (30s countdown) in confirm
- Optional 2px status dot

No `rounded-xl` cards. No pill tabs. Tab chrome is flush with the header rule.

---

## 6. Shadows

Almost none. Depth comes from hairlines and the scrim.

| Token | Value | Use |
| --- | --- | --- |
| `--shadow-none` | none | Panels |
| `--shadow-menu` | `0 12px 40px rgba(0,0,0,0.45)` | Wallet menu, dropdown |
| `--shadow-drawer` | `0 0 0 1px rgb(var(--line))` plus scrim | Settings |

No `shadow-gold`. No ambient blur behind prices.

---

## 7. Status colors

Map product states to tokens. Text, not badges-with-icons, unless a 2px dot is needed.

| State | Color | Copy |
| --- | --- | --- |
| OPEN / live / SUCCESS / buy | `--up` | OPEN, LIVE, SUCCESS |
| CLOSED / fail / error / sell | `--down` | CLOSED, FAILED, the API message |
| HALTED / incomplete NET / pending | `--warn` | HALTED, INCOMPLETE, PREPARING |
| OFFLINE / dim / empty | `--dim` | OFFLINE, — |
| DEMO | `--gold` | `DEMO DATA` always those two words |
| STALE quote | `--gold` kicker + `--down` reason | `QUOTE STALE` then requote |
| Kill switch | `--down` | `PARALLAX is paused. No sends.` |

Rail badges (RFQ, SWAP, AMM, RFQ+SWAP) are dim tracked micro text, not colored pills.

Simulation status is tracked micro: `SIMULATION STATUS SUCCESS` in up, `FAILED` in down, `PREPARING` in gold.

---

## 8. Numeric formatting

Shared in `@parallax/core` (`amounts.ts`). Missing values are the em dash `—` (U+2014), never `0`, `n/a`, or `$0.00`.

| Helper | Rule | Example |
| --- | --- | --- |
| `formatPx` | `$` + 2 dp if ≥ 1, 4 dp if < 1 | `$224.27`, `$0.0412` |
| `formatPct` | sign on positive, 2 dp | `+0.90%`, `−0.55%`, `0.00%` |
| `formatUsd` | full currency, default 2 dp | `$1.25` |
| `formatUsdt` | 2 dp + ` USDT` | `10.00 USDT` |
| `formatQty` | ≤4 dp; tiny values exponential | `0.0446`, `1.2e-7` |
| `formatBps` | integer + ` bps` | `12 bps` |
| `formatLiq` | grouped integer, no `$` if unit is volume | `425,820` |
| `formatTtl` | `00:SS` from leftover ms | `00:17` |
| `formatAge` | relative, compact | `12s`, `3m` |
| `shortAddr` | 6 + ellipsis + 4 | `0x8a44…0209` |
| `quoteFreshness` | leftover / stale vs 30s TTL | `{ stale, leftoverMs, label }` |

Display rules:

- Every number uses `.num` (tabular lining).
- Prices and percents right-align in tables and ticket rows.
- NET EDGE that is incomplete (`slipKnown === false`) still prints the number and must carry a dim “slip not measured” note. Do not gray the number into looking like a missing value.
- Hashes: first 8 characters, gold, link to bscscan. Full hash in `title`.
- Clocks: `America/New_York` for cash session; local 24h in the top bar.

---

## 9. Button hierarchy

Class: `.btn` plus tone. React: `apps/web/components/ui/button.tsx`.

| Tone | Class | Look | Use |
| --- | --- | --- | --- |
| Primary | `.btn-primary` | Gold fill, `text-bg`, tracked | TRADE, SIGN, APPROVE, ARM, Connect |
| Secondary | `.btn-secondary` | Hairline, ink | REQUOTE, ANALYZE, SIMULATE, CANCEL |
| Ghost | `.btn-ghost` | No border, dim → ink | Sign out, skip, inline |
| Danger | `.btn-danger` | Hairline down, down text | Kill, remove |
| Buy | `.btn-buy` | Up hairline or up text | BUY in venue stack |
| Sell | `.btn-sell` | Down hairline | SELL |

Sizes:

- `sm` h-9, 11px tracking
- `md` h-11, 11px tracking (desk actions)
- `lg` h-12, 12px tracking (confirm SIGN)

States:

- Hover primary → `gold-dim`. Hover secondary → `border-gold`.
- Disabled: `opacity: 0.4`, pointer-events none. Never grey-on-grey mystery buttons.
- Busy: keep the label (`SIGN` → stay SIGN) and set `aria-busy`. Optional dim kicker above, not a spinner.
- Focus: 1px gold outline offset 2px. Keyboard visible.

Do not put two gold fills in the same row. Confirm is SIGN gold, REQUOTE and CANCEL secondary.

---

## 10. Input hierarchy

Class: `.field`. React: `apps/web/components/ui/field.tsx`.

| Kind | Look | Use |
| --- | --- | --- |
| Command | Bottom rule only, transparent, 14px | Top bar search |
| Box | 1px line, transparent, h-8–10, px-2 | Size, caps, arm form |
| Numeric | `.num` + right align | USDT, spread, ratio |
| Select | Transparent, no chevron art | DEMO, strategy type |
| Textarea | Box, 3–4 rows, dim placeholder | Copilot, plain rule |

Focus: `border-gold`. Error: `border-down` plus a 12px down sentence under the field. Placeholder: `text-dim`. No floating labels; a kicker or `dt` names the field.

---

## 11. Table hierarchy

Class: `.table`. React: `apps/web/components/ui/table.tsx`.

- Header: `text-dim`, `font-normal`, kicker-sized or 12px. Not uppercase soup unless the column is a status.
- Body: 12px, `border-t border-line`.
- Numeric columns: `.num text-right`.
- Selected row: `border-gold` on the row or left rule, not a fill.
- Comparison and ticket may be definition lists that *behave* as tables: label dim left, value tabular right, hairline between.

Max density: tape, scan, comparison. Do not card-wrap every row.

---

## 12. Modal and drawer behavior

React: `apps/web/components/ui/overlay.tsx` (Radix Dialog).

**Modal (confirm / takeover)**

- Scrim `bg-bg/88`, z-50, centered.
- Panel `max-w-xl`, `bg-bg`, hairline, padding 32–40px, radius 0.
- Esc and scrim click call the same Cancel path. They do not sign.
- Title is display serif. Kicker states side. TTL ring + `formatTtl` sit above actions.
- Three actions in a 3-column grid: SIGN / REQUOTE / CANCEL.
- Only one modal at a time. Settings cannot open over confirm.

**Drawer (settings)**

- Right edge, `max-w-md`, `border-l`, `bg-bg`, z-40, scrim `black/50`.
- Title display serif. Body 14px form grid, gap 16px.
- Save is primary. Closing without save discards.

**Menu (wallet chip)**

- Anchored, `w-72`, hairline, `bg-bg`, `--shadow-menu`, z-30.

Motion: overlay fade 220ms, drawer from-right 220ms, no bounce. `prefers-reduced-motion` already zeros transitions globally.

---

## 13. Skeleton states

Class: `.skeleton`. React: `<Skeleton />`.

A rectangular ink plate at 6% opacity. Optional slow 1.2s opacity pulse (0.45–0.8). No gradient sweep.

Use while the first quote or scan has never arrived. Match the metric grid (2×4) or table row count. Never skeleton a live number that is already on screen — that is a stale/loading kicker instead.

---

## 14. Loading states

No spinners. No skeleton once data exists.

| Surface | Copy | Treatment |
| --- | --- | --- |
| Quote | `QUOTING` | Dim kicker beside the board title |
| Scan | `SCANNING BSC` | Dim kicker on Opportunity engine |
| Prepare | `PREPARING` | Gold micro on the ticket |
| Sign | `Waiting for your signature` | Dim sentence in the modal |
| RFQ poll | `Polling the RFQ` | Dim sentence |
| Agent | `Connecting` | Primary button label replacement only here |

Optional: 1px gold hairline that fills left-to-right is reserved for the 30s TTL ring, not for network wait.

---

## 15. Stale states

Quotes die at 30 seconds. Stale is a first-class state, not an error.

- Kicker `QUOTE STALE` in gold.
- Body: `That price is 30 seconds old. Requote.`
- Primary action in that region becomes REQUOTE (secondary button). TRADE/SIGN disable.
- Age may show as `formatAge(now - quoteAt)` while fresh; once stale, stop counting up and show the copy above.
- Scan cache (30s) uses the same language if the ranked list is held: `cached` is an implementation detail, not user copy.

`quoteFreshness()` returns `{ stale, leftoverMs, label }` for UI.

---

## 16. Error states

Down text, 12–14px, the real message (`40367 US hours`, `40401 QUOTE_EXPIRED`, wallet mismatch). One sentence. No toast stack, no red banners, no retry emoji.

Place:

- Board: under the display name.
- Modal: above the action row.
- Field: under the input.
- Copilot: in the thread as a dim/down line.

Empty error string is not an error. Kill switch uses `COPY.killSwitch`. Closed rails use rail status, not a page-level error.

---

## 17. Empty states

Dim body, one or two sentences, no illustration.

Examples already in product copy:

- `Name a company. We will price every BNB wrapper.`
- `No executable wrapper quote is on the book yet.`
- `No scan yet.`
- `Friday ref unavailable`

React: `<EmptyState kicker title? body />`. Primary optional (e.g. Connect). Never invent a sample fill.

---

## 18. Motion timing

| Token | Time | Easing | Use |
| --- | --- | --- | --- |
| `--motion-micro` | 80ms | `ease` | Border color, text color |
| `--motion-ui` | 150ms | `ease` | Buttons, command focus (`duration-parallax`) |
| `--motion-overlay` | 220ms | `ease` | Modal / drawer |
| `--motion-skeleton` | 1200ms | `ease-in-out` | Pulse only |
| TTL ring | continuous 200ms ticks | linear | Confirm countdown |

Allowed continuous motion: TTL ring. Everything else is a state change.

Forbidden: bounce, spring overshoot, page parallax scroll, number tickers that roll, shimmer gradients.

`prefers-reduced-motion: reduce` disables animation and transition globally.

---

## 19. Responsive breakpoints

| Name | Width | Behavior |
| --- | --- | --- |
| default | 0–639 | Single column. Mobile tabs: Trade / Jobs / Wallet / Settings. |
| `sm` | 640 | Metric grids 4-col. Top nav appears. |
| `md` | 768 | Display type steps up. Landing two-col lens. |
| `desk` | 900 | Trade split `1.4fr / 0.7fr`. Below this, stack aside under main. |
| `lg` | 1024 | Comfortable desk padding. |
| `xl` | 1280 | No max-width on the desk; landing stays `max-w-6xl`. |

Touch targets on mobile tabs and SIGN/TRADE are ≥ 44px (`h-11` / `h-12`). Command field can shrink; the mark never wraps.

---

## Shared primitives (adopt later)

Do not restyle pages in this pass. New UI should import from `@/components/ui`:

| Export | File |
| --- | --- |
| `Button` | `button.tsx` |
| `Field`, `SelectField` | `field.tsx` |
| `Table`, `THead`, `TBody`, `TR`, `TH`, `TD` | `table.tsx` |
| `Modal`, `Drawer` | `overlay.tsx` |
| `Skeleton`, `EmptyState`, `ErrorState`, `StaleState`, `LoadingState` | `states.tsx` |
| `StatusChip`, `DemoMark` | `status.tsx` |
| `Panel`, `Metric` | `panel.tsx` |

Existing screens (`opportunity-board`, `confirm-takeover`, `settings-sheet`, …) stay as they are until an explicit redesign pass.

---

## Do not

- Recolor the void to navy or charcoal-blue.
- Add a light theme.
- Round the desk.
- Put gold behind NET EDGE.
- Use icons in place of kickers.
- Animate numbers.
- Hide 40367/40401 behind “something went wrong”.
- Drop DEMO DATA labeling.
)
