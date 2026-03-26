type Props = {
  /** Visually hidden label for assistive tech */
  label?: string;
  className?: string;
};

export function InlineSpinner({ label = "Loading", className }: Props) {
  return (
    <span className={className ? `inline-spinner ${className}` : "inline-spinner"} role="status" aria-label={label}>
      <span className="inline-spinner-dot" aria-hidden="true" />
      <span className="inline-spinner-dot" aria-hidden="true" />
      <span className="inline-spinner-dot" aria-hidden="true" />
    </span>
  );
}
