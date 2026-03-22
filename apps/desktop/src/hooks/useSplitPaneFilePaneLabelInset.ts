import { useLayoutEffect, type RefObject } from "react";

/** Match TerminalPane: reserve space under absolutely positioned `.split-pane-label`. */
export function useSplitPaneFilePaneLabelInset(
  rootRef: RefObject<HTMLElement | null>,
  ...effectDeps: unknown[]
) {
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) {
      return;
    }

    const apply = () => {
      const pane = root.closest(".split-pane") as HTMLElement | null;
      const label = pane?.querySelector(".split-pane-label") as HTMLElement | null;
      if (pane && label) {
        const paneTop = pane.getBoundingClientRect().top;
        const labelBottom = label.getBoundingClientRect().bottom;
        const inset = Math.ceil(Math.max(0, labelBottom - paneTop) + 2);
        root.style.paddingTop = `${inset}px`;
      } else {
        root.style.paddingTop = "";
      }
    };

    apply();
    const pane = root.closest(".split-pane");
    const label = pane?.querySelector(".split-pane-label") as HTMLElement | null;
    if (!label) {
      return () => {
        root.style.paddingTop = "";
      };
    }
    const ro = new ResizeObserver(() => apply());
    ro.observe(label);
    window.addEventListener("resize", apply);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", apply);
      root.style.paddingTop = "";
    };
  }, [rootRef, ...effectDeps]);
}
