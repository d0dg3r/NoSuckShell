import { Suspense, lazy } from "react";

const HelpPanel = lazy(async () => {
  const m = await import("../../HelpPanel");
  return { default: m.HelpPanel };
});

export function AppSettingsHelpTab() {
  return (
    <div className="settings-stack">
      <section className="settings-card settings-help-wrap">
        <Suspense fallback={null}>
          <HelpPanel />
        </Suspense>
      </section>
    </div>
  );
}
