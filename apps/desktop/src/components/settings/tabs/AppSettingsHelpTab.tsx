import { Suspense, lazy } from "react";

const HelpPanel = lazy(async () => {
  const m = await import("../../HelpPanel");
  return { default: m.HelpPanel };
});

export type AppSettingsHelpTabProps = {
  resolveHelpShortcutLabel: (action: string) => string | undefined;
  shortcutCheatsheetLines: Array<{ label: string; keys: string }>;
};

export function AppSettingsHelpTab({ resolveHelpShortcutLabel, shortcutCheatsheetLines }: AppSettingsHelpTabProps) {
  return (
    <div className="settings-stack">
      <section className="settings-card settings-help-wrap">
        <Suspense fallback={null}>
          <HelpPanel
            resolveHelpShortcutLabel={resolveHelpShortcutLabel}
            shortcutCheatsheetLines={shortcutCheatsheetLines}
          />
        </Suspense>
      </section>
    </div>
  );
}
