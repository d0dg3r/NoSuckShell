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
        return (
          <span key={`${segment.path}-${index}`} className="file-pane-path-segment">
            {index > 0 ? (
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
