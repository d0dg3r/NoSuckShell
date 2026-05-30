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

Line ranges are approximate (~**4048** lines in `App.tsx` after sidebar bridge + settings split). Use them as **navigation hints**, not rigid contracts.

| Region (lines) | Content |
| --- | --- |
| **~1–~220** | Imports; lazy `LayoutCommandCenter`; re-exports from [`features/`](../apps/desktop/src/features/) (split-tree, workspace snapshot, pane DnD, preferences, session model, bootstrap, …). |
| **~220–~3610** | `export function App()`: **state**, **refs**, **effects** (many persisted in `hooks/` — workspace bootstrap/persist, ref sync, session-output trust listener), **handlers** (connect, backup, layout, DnD, …). |
| **~3610–~3668** | `createSplitPaneRenderer` → `renderSplitNode` bridge; host list rows live in [`HostSidebar`](../apps/desktop/src/components/HostSidebar.tsx) via [`HostListRow`](../apps/desktop/src/components/HostListRow.tsx) + `hostListRowBridge`. |
| **~3669–end** | **Root JSX**: `app-shell`, [`HostSidebar`](../apps/desktop/src/components/HostSidebar.tsx), [`TerminalWorkspaceDock`](../apps/desktop/src/components/TerminalWorkspaceDock.tsx) (workspace tabs + DnD, terminal grid / mobile pager, footer), context menus, settings, modals ([`AddHostModal`](../apps/desktop/src/components/AddHostModal.tsx), [`QuickConnectModal`](../apps/desktop/src/components/QuickConnectModal.tsx), [`TrustHostModal`](../apps/desktop/src/components/TrustHostModal.tsx)), mobile shell. Split panes use `renderSplitNode` from [`SplitWorkspace.tsx`](../apps/desktop/src/components/SplitWorkspace.tsx). |

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

**Status:** Done — sidebar chrome, filters, and host list call back into `App` via props; rows render inside the sidebar via `hostListRowBridge` + [`HostListRow`](../apps/desktop/src/components/HostListRow.tsx).

### D) Settings modal positioning + drag → `hooks/`

**Target:** [`apps/desktop/src/hooks/useSettingsModalDrag.ts`](../apps/desktop/src/hooks/useSettingsModalDrag.ts).

**Status:** Done — encapsulates the auto-center effect, the pointer-move/up listener loop, the close-while-dragging cleanup, and the header pointer-down handler. `App.tsx` now reads `settingsModalRef`, `settingsModalPosition`, `isSettingsDragging`, and `handleSettingsHeaderPointerDown` from a single hook call (~70 lines removed from `App`).

### F) Modularize `styles.css` (deferred, planned)

**Target:** [`apps/desktop/src/styles.css`](../apps/desktop/src/styles.css) (~9k lines).

**Status:** Planned — not yet executed because per-section splits would touch every component import. **Suggested order** for incremental extraction (one section per PR):

1. **Tokens** (`:root` custom properties + font-faces) → `styles/tokens.css`.
2. **App shell + sidebar** (sidebar, host rows, host slide, add-host modal) → `styles/sidebar.css`.
3. **Workspace** (split panes, drop overlays, terminal chrome, NSS-Commander dock) → `styles/workspace.css`.
4. **Settings + modals** (settings shell, tabs, dialogs, popovers) → `styles/settings.css`.
5. **File panes** (file table, breadcrumbs, semantic colors, transfer progress) → `styles/file-pane.css`.

Each split should stay zero-diff visually and pass the existing Playwright screenshot suite (`npm run screenshots`) before merging.

### E) `React.memo` on terminal leaf → reduce typing-time re-renders

**Target:** [`apps/desktop/src/components/TerminalPane.tsx`](../apps/desktop/src/components/TerminalPane.tsx).

**Status:** Done — `TerminalPane` is wrapped in `React.memo` so unrelated parent re-renders (sidebar, settings, drag, host list refresh) do not cascade into the xterm subtree. Both callback props (`onUserInput`, `onSessionWorkingDirectoryChange`) are already `useCallback`-stable in `App.tsx`, so the default shallow comparison is correct. **Not yet memoized:** [`RemoteFilePane`](../apps/desktop/src/components/RemoteFilePane.tsx) and [`LocalFilePane`](../apps/desktop/src/components/LocalFilePane.tsx) — they receive a `spec`/handler bag that today is reconstructed each render inside [`SplitWorkspace.createSplitPaneRenderer`](../apps/desktop/src/components/SplitWorkspace.tsx); stabilizing those references is the prerequisite. Memoizing `createSplitPaneRenderer` directly is **not** useful: its bridge captures ~80 closure fields that change on most re-renders, so memoization would either be a no-op or risk stale-closure bugs.

## 4. Optional next steps (not required)

- **Component smoke tests:** shared bridge fixtures in [`host-list-row-fixtures.ts`](../apps/desktop/src/test/host-list-row-fixtures.ts); [`HostListRow.test.tsx`](../apps/desktop/src/components/HostListRow.test.tsx) (row UI), [`HostSidebar.test.tsx`](../apps/desktop/src/components/HostSidebar.test.tsx) (empty list, one row, settings click via `minimalHostSidebarProps()`).
- **`useReducer` / context** for workspace or split state: defer until interaction bugs or review pain justify a single owner for that subgraph; current hooks + props remain easier to follow for most changes.
- **Further shrink `App`:** [`HostSidebar`](../apps/desktop/src/components/HostSidebar.tsx) renders [`HostListRow`](../apps/desktop/src/components/HostListRow.tsx) via a typed `hostListRowBridge` (no `renderHostRow` callback in `App`). Right-dock workspace UI lives in [`TerminalWorkspaceDock`](../apps/desktop/src/components/TerminalWorkspaceDock.tsx). Remaining cohesive slices for follow-up extractions include the **settings sub-tab routing** (6 sub-tab `useState`s + cross-tab navigation calls) and the **Identity-Store form drafts** (8 user / key form fields in `App`).

## 5. TypeScript output (`noEmit`)

Compiler output next to sources (duplicate `.js` files) is avoided by `"noEmit": true` in [`apps/desktop/tsconfig.json`](../apps/desktop/tsconfig.json). `npm run build` remains `tsc && vite build`: **typecheck only** from `tsc`, bundling from Vite.
