import { useId } from "react";

export type SettingsHelpHintProps = {
  /** Short topic for aria-label (English). */
  topic: string;
  /** Long help text (English); shown via native tooltip and for assistive tech. */
  description: string;
};

/**
 * Inline help control: hover/focus shows `description` (title); screen readers get the full text.
 */
export function SettingsHelpHint({ topic, description }: SettingsHelpHintProps) {
  const id = useId();
  const hintId = `settings-help-${id.replace(/:/g, "")}`;
  return (
    <span className="settings-help-hint-wrap">
      <button
        type="button"
        className="settings-help-hint"
        aria-label={`More about ${topic}`}
        aria-describedby={hintId}
        title={description}
      >
        ?
      </button>
      <span id={hintId} className="visually-hidden">
        {description}
      </span>
    </span>
  );
}
