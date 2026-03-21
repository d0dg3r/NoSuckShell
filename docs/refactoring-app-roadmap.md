# Refactoring: Schmerzpunkte & Roadmap (`App.tsx`)

This document records **when** a larger frontend refactor pays off, a **lightweight map** of [`apps/desktop/src/App.tsx`](../apps/desktop/src/App.tsx), and **three incremental extraction candidates**. It implements the team decision from the refactor plan: prefer small PRs aligned with [`architecture.md`](architecture.md) (`components/`, `features/`).

## 1. Schmerzpunkte festlegen (Refactor nur bei Bedarf)

Treat refactoring as a **tool**, not a goal. Start or schedule work when **at least one** of these is true:

| Signal | What it means here |
| --- | --- |
| **Reviews** | PRs touching `App.tsx` are hard to review because unrelated concerns (sidebar + settings + splits) change together. |
| **Bugs** | Regressions recur in the same area (e.g. drag/drop, workspace restore, settings modal) because state and UI are tightly coupled in one file. |
| **Feature tempo** | New UI takes disproportionate effort: finding the right `useEffect` / handler among thousands of lines, or fear of breaking unrelated flows. |
| **Onboarding** | New contributors cannot form a mental model of “where host list lives” vs “where terminal layout lives” within a reasonable time. |

If none of these apply and releases are stable, **defer** large splits; use the map below only when you pick up the next refactor PR.

**Already in good shape:** Rust modules in `src-tauri`, shared helpers under `features/`, and IPC in `tauri-api.ts` — no parallel backend refactor is required for frontend cleanup.

## 2. Mini-Audit: Struktur von `App.tsx`

Line ranges are approximate (file size changes over time). Use them as **navigation hints**, not rigid contracts.

| Region (lines) | Inhalt |
| --- | --- |
| **~1–661** | Imports; module-level **types** (`SessionTab`, `WorkspaceSnapshot`, `SplitTreeNode`, …); **constants** (storage keys, layout presets, `MOBILE_STACKED_MEDIA`); **pure helpers** (view filter builders, split-tree clone/rebalance, pane drop overlay math, `evaluateRule` / `evaluateGroup`, …). |
| **~662–~3750** | `export function App()`: **state** (hosts, sessions, entity store, workspaces, layout profiles, UI chrome, modals); **refs**; **effects** (persistence, listeners, focus); **handlers** (connect, save host, backup, layout apply, …). |
| **~3751–~4283** | **Render helpers** scoped inside `App`: e.g. `renderSplitNode` (pane chrome, drop zones, `TerminalPane`), host row / slide-menu rendering with `HostForm`. Heavy prop closure on parent state. |
| **~4295–end** | **Root JSX**: `app-shell`, sidebar (`aside`), filters, session tabs, split container, context menu, **app settings** (modal/docked), quick-connect / add-host modals, mobile stacked shell. |

**Effect / listener clusters:** search within `App()` for `useEffect` and `listen(` — most side effects live in the middle third of the component; extracting UI without moving the owning effect first tends to create stale closures or duplicate subscriptions.

## 3. Drei inkrementelle Extraktionen (Reihenfolge: risikoarm → größer)

Each step should be **one PR**, with `npm test` (and `npm run build` in `apps/desktop`) green before merge.

### A) Pure view-profile / filter logic → `features/`

**Scope:** Functions and small types at module top that only need `types.ts` / `ViewFilterRule` / `HostRowViewModel`-shaped rows — e.g. `parseBooleanRuleValue`, `getRuleFieldValue`, `evaluateRule`, `evaluateGroup`, and related helpers, plus `createEmptyFilterGroup` / `createDefaultViewProfile` if kept pure.

**Target:** e.g. [`apps/desktop/src/features/view-profile-filters.ts`](../apps/desktop/src/features/view-profile-filters.ts) (name can vary).

**Risk:** Low — no React; easy to unit test beside existing `features/*.test.ts`.

**Benefit:** Lesbarkeit + Testbarkeit; shrinks `App.tsx` without prop drilling.

### B) App settings panel body → `components/`

**Scope:** The large block that renders tabs (`appearance`, `layout`, `connections`, `data`, `views`, `store`, …) when `isAppSettingsOpen` is true — **presentational** subtree first, still driven by props/callbacks from `App`.

**Target:** e.g. [`apps/desktop/src/components/AppSettingsPanel.tsx`](../apps/desktop/src/components/AppSettingsPanel.tsx).

**Risk:** Medium — many props or a single “settings model” object; avoid passing entire `App` state; consider a narrow typed props interface.

**Benefit:** Reviews focus on settings UX; parallel work on sidebar vs settings becomes easier.

### C) Sidebar host list + filters → `components/`

**Scope:** `aside` content: search, status/favorite/tag filters, host list rows, quick-add affordances — **not** necessarily all session/workspace logic on first pass.

**Target:** e.g. [`apps/desktop/src/components/HostSidebar.tsx`](../apps/desktop/src/components/HostSidebar.tsx).

**Risk:** Medium–high — DnD (`setDragPayload`, hover highlights) and host slide-menu tie into global state; extract in slices (list-only first, then drag).

**Benefit:** Parallele Entwicklung (Hosts vs Terminal-Bereich); klarere Grenze für zukünftige Features.

## 4. TypeScript-Ausgabe (`noEmit`)

Compiler output next to sources (duplicate `.js` files) is avoided by `"noEmit": true` in [`apps/desktop/tsconfig.json`](../apps/desktop/tsconfig.json). `npm run build` remains `tsc && vite build`: **typecheck only** from `tsc`, bundling from Vite.
