# NoSuckShell style guide

This guide defines **how the product reads** in the UI and in **committed documentation**. For implementation rules, see [CODE_GUIDE.md](CODE_GUIDE.md).

## Language

- **User-visible strings** (labels, buttons, tooltips, banners, dialogs, errors, empty states) must be **English**.
- Requirements or discussions may arrive in other languages; **translate them into natural English** in the app and in repo docs.
- **Repository documentation** (`README.md`, `SECURITY.md`, `CONTRIBUTING.md`, `docs/**/*.md`, changelog text, release notes) is **English** unless the project explicitly adds a localized fork or a dedicated translations path.
- **Code comments** for developers: concise **English**. Quote non-English specs only when necessary.

## Tone and clarity

- Prefer **direct, plain language** over marketing fluff.
- **Errors and warnings**: explain what went wrong and what the user can do next (when feasible). Avoid blaming the user.
- **Buttons and actions**: use verbs (“Save”, “Connect”, “Delete layout”) instead of vague nouns where the action is primary.
- **Consistency**: reuse the same term for the same concept across the app (see [Terminology](#terminology)).

## Terminology

Align with existing product language and the root [README.md](../README.md):

- **Host** — SSH target (from config or app store), not “server” unless the UI already uses that word in the same context.
- **Layout** / **layout profile** — saved split geometry and optional host/session mapping.
- **Panel** / **split** — workspace regions and recursive splits (e.g. left/bottom).
- **Session** — terminal or SSH session bound to a panel.

When adding a feature, **grep the codebase** for existing strings before inventing new names.

## UI and UX expectations

- **Do not** use “§” or other characters that render poorly in native or web views.
- Prefer **accessible defaults**: sufficient contrast, visible focus for keyboard navigation where controls are interactive.
- Keep **copy proportional** to the control: short labels; longer explanations in help or secondary text.

## Documentation style

- Use **sentence case** for headings unless a specific doc already uses a different convention.
- Link to **paths and URLs in full** (no elided `https://` or middle segments).
- For user-facing behavior changes, update **CHANGELOG** and any relevant help text in the repo’s process (see [CONTRIBUTING.md](../CONTRIBUTING.md)).

## Maintenance

When copy or doc conventions change, update this file **in the same change or a follow-up PR** and obtain **maintainer approval** before merging policy-only updates. See [AGENTS.md](../AGENTS.md).
