import type { PathBreadcrumbSegment } from "../features/file-pane-paths";

type Props = {
  segments: PathBreadcrumbSegment[];
  prefix?: string;
  fullTitle?: string;
  className?: string;
  onNavigate: (path: string) => void;
};

export function FilePanePathBreadcrumbs({
  segments,
  prefix,
  fullTitle,
  className,
  onNavigate,
}: Props) {
  const classes = ["file-pane-path", "file-pane-path-breadcrumbs", className].filter(Boolean).join(" ");
  return (
    <nav className={classes} aria-label="Path" title={fullTitle}>
      {prefix ? <span className="file-pane-path-prefix">{prefix}</span> : null}
      {segments.map((segment, index) => {
        const isCurrent = index === segments.length - 1;
        const prev = index > 0 ? segments[index - 1] : undefined;
        // Root crumb is already a "/"; skip extra separator so "/app" reads as "/ app" not "/ / app".
        const showSeparator = index > 0 && prev?.label !== "/";
        return (
          <span key={`${segment.path}-${index}`} className="file-pane-path-segment">
            {showSeparator ? (
              <span className="file-pane-path-separator" aria-hidden="true">
                /
              </span>
            ) : null}
            <button
              type="button"
              className={`file-pane-path-crumb ${isCurrent ? "is-current" : ""}`}
              disabled={isCurrent}
              aria-current={isCurrent ? "page" : undefined}
              onClick={() => onNavigate(segment.path)}
            >
              {segment.label}
            </button>
          </span>
        );
      })}
    </nav>
  );
}
