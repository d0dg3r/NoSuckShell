# Refactoring: pain points & roadmap (`App.tsx`)

This document records **when** a larger frontend refactor pays off, a **lightweight map** of [`apps/desktop/src/App.tsx`](../apps/desktop/src/App.tsx), and **three incremental extraction candidates**. It implements the team decision from the refactor plan: prefer small PRs aligned with [`architecture.md`](architecture.md) (`components/`, `features/`).

## 1. When to refactor (pain points)

Treat refactoring as a **tool**, not a goal. Start or schedule work when **at least one** of these is true:

| Signal | What it means here |
| --- | --- |
| **Reviews** | PRs touching `App.tsx` are hard to review because unrelated concerns (sidebar + settings + splits) change together. |
| **Bugs** | Regressions recur in the same area (e.g. drag/drop, workspace restore, settings modal) because state and UI are tightly coupled in one file. |
| **Feature tempo** | New UI takes disproportionate effort: finding the right `useEffect` / handler among thousands of lines, or fear of breaking unrelated flows. |
| **Onboarding** | New contributors cannot form a mental model of “where host list lives” vs “where terminal layout lives” within a reasonable time. |

If none of these apply and releases are stable, **defer** large splits; use the map below only when you pick up the next refactor PR.

**Already in good shape:** Rust modules in `src-tauri`, shared helpers under `features/`, and IPC in `tauri-api.ts` — no parallel backend refactor is required for frontend cleanup.

## 2. Mini-audit: `App.tsx` structure

Line ranges are approximate (~**4055** lines as of the terminal-dock extraction). Use them as **navigation hints**, not rigid contracts.

| Region (lines) | Content |
| --- | --- |
| **~1–~220** | Imports; lazy `LayoutCommandCenter`; re-exports from [`features/`](../apps/desktop/src/features/) (split-tree, workspace snapshot, pane DnD, preferences, session model, bootstrap, …). |
| **~220–~3650** | `export function App()`: **state**, **refs**, **effects** (many persisted in `hooks/` — workspace bootstrap/persist, ref sync, session-output trust listener), **handlers** (connect, backup, layout, DnD, …). |
| **~3650–~3850** | `createSplitPaneRenderer` bridge + thin **`renderHostRow`** delegating to [`HostListRow`](../apps/desktop/src/components/HostListRow.tsx) (row + slide menu). |
| **~3750–end** | **Root JSX**: `app-shell`, [`HostSidebar`](../apps/desktop/src/components/HostSidebar.tsx), [`TerminalWorkspaceDock`](../apps/desktop/src/components/TerminalWorkspaceDock.tsx) (workspace tabs + DnD, terminal grid / mobile pager, footer), context menus, settings, modals ([`AddHostModal`](../apps/desktop/src/components/AddHostModal.tsx), [`QuickConnectModal`](../apps/desktop/src/components/QuickConnectModal.tsx), [`TrustHostModal`](../apps/desktop/src/components/TrustHostModal.tsx)), mobile shell. Split panes still use `renderSplitNode` from [`SplitWorkspace.tsx`](../apps/desktop/src/components/SplitWorkspace.tsx). |

**Pure logic (no React)** now also lives in: [`split-tree.ts`](../apps/desktop/src/features/split-tree.ts), [`workspace-snapshot.ts`](../apps/desktop/src/features/workspace-snapshot.ts), [`pane-dnd.ts`](../apps/desktop/src/features/pane-dnd.ts), [`app-preferences.ts`](../apps/desktop/src/features/app-preferences.ts), [`app-bootstrap.ts`](../apps/desktop/src/features/app-bootstrap.ts), [`session-model.ts`](../apps/desktop/src/features/session-model.ts), [`app-id.ts`](../apps/desktop/src/features/app-id.ts), [`tauri-runtime.ts`](../apps/desktop/src/features/tauri-runtime.ts) (with Vitest where noted in repo).

**Hooks:** [`useAppRefSync`](../apps/desktop/src/hooks/useAppRefSync.ts), [`useSessionOutputTrustListener`](../apps/desktop/src/hooks/useSessionOutputTrustListener.ts), [`useWorkspaceLocalStorage`](../apps/desktop/src/hooks/useWorkspaceLocalStorage.ts) (`useWorkspaceBootstrapFromStorage`, `useWorkspacePersistToStorage`).

## 3. Three incremental extractions (order: low risk → larger)

Each step should be **one PR**, with `npm test` (and `npm run build` in `apps/desktop`) green before merge.

### A) Pure view-profile / filter logic → `features/`

**Target:** [`apps/desktop/src/features/view-profile-filters.ts`](../apps/desktop/src/features/view-profile-filters.ts).

**Status:** Done — logic + `ViewFilterHostRow` live in that module; Vitest in `view-profile-filters.test.ts`; `App.tsx` wires `evaluateGroup`, `createDefaultViewProfile`, and `createEmptyViewFilterRule`.

### B) App settings panel body → `components/`

**Target:** [`apps/desktop/src/components/AppSettingsPanel.tsx`](../apps/desktop/src/components/AppSettingsPanel.tsx) (shell + tab wiring) and [`apps/desktop/src/components/settings/`](../apps/desktop/src/components/settings/) (`app-settings-types`, `app-settings-panel-props`, `app-settings-constants`, per-tab modules under `settings/tabs/`).

**Status:** Done — settings UI split by main tab; `App` still passes the full prop surface into `AppSettingsPanel`.

### C) Sidebar host list + filters → `components/`

**Target:** [`apps/desktop/src/components/HostSidebar.tsx`](../apps/desktop/src/components/HostSidebar.tsx).

**Status:** Done — sidebar chrome, filters, and host list call back into `App` via props; host-row rendering stays `renderHostRow` in `App` until a further slice.

## 4. Optional next steps (not required)

- **`useReducer` / context** for workspace or split state: defer until interaction bugs or review pain justify a single owner for that subgraph; current hooks + props remain easier to follow for most changes.
- **Further shrink `App`:** host list row + slide panel live in [`HostListRow`](../apps/desktop/src/components/HostListRow.tsx); optional next step is merging `renderHostRow` into `HostSidebar` with a slimmer prop surface or context for host-edit state. Right-dock terminal workspace UI lives in [`TerminalWorkspaceDock`](../apps/desktop/src/components/TerminalWorkspaceDock.tsx).

## 5. TypeScript output (`noEmit`)

Compiler output next to sources (duplicate `.js` files) is avoided by `"noEmit": true` in [`apps/desktop/tsconfig.json`](../apps/desktop/tsconfig.json). `npm run build` remains `tsc && vite build`: **typecheck only** from `tsc`, bundling from Vite.
