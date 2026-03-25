import { Suspense, lazy, useState } from "react";
import { openExternalUrl } from "../../../tauri-api";

const HelpPanel = lazy(async () => {
  const m = await import("../../HelpPanel");
  return { default: m.HelpPanel };
});

export type AppSettingsHelpTabProps = {
  resolveHelpShortcutLabel: (action: string) => string | undefined;
  shortcutCheatsheetLines: Array<{ label: string; keys: string }>;
};

export function AppSettingsHelpTab({ resolveHelpShortcutLabel, shortcutCheatsheetLines }: AppSettingsHelpTabProps) {
  const [widthMode, setWidthMode] = useState<"fit" | "wide">("fit");

  return (
    <div className="settings-stack">
      <section className={`settings-card settings-help-wrap ${widthMode === "wide" ? "is-help-wide" : "is-help-fit"}`}>
        <header className="settings-card-head settings-help-card-head">
          <h3>Help width</h3>
          <div className="settings-help-width-controls" role="group" aria-label="Help panel width">
            <button
              type="button"
              className={`btn btn-settings-mode ${widthMode === "fit" ? "is-active" : ""}`}
              onClick={() => setWidthMode("fit")}
            >
              Fit
            </button>
            <button
              type="button"
              className={`btn btn-settings-mode ${widthMode === "wide" ? "is-active" : ""}`}
              onClick={() => setWidthMode("wide")}
            >
              Wide
            </button>
          </div>
        </header>
        <Suspense fallback={<p className="muted-copy help-loading">Loading help…</p>}>
          <HelpPanel
            resolveHelpShortcutLabel={resolveHelpShortcutLabel}
            shortcutCheatsheetLines={shortcutCheatsheetLines}
            onOpenUrl={(url) => void openExternalUrl(url).catch(() => undefined)}
          />
        </Suspense>
      </section>
    </div>
  );
}
