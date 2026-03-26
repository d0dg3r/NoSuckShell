import { useEffect, useRef, useState } from "react";

const LINES = [
  "ssh remote@host -p 22",
  "Negotiating encryption…",
  "Verifying host key fingerprint…",
  "Opening secure channel…",
  "Requesting SFTP subsystem…",
  "Enumerating directory entries…",
  "Resolving symlinks…",
  "chmod 0644 *.conf",
  "Synchronizing remote state…",
  "cat /etc/hostname",
];

const PROMPT = "nss ▸ ";
const TYPE_INTERVAL_MS = 45;
const LINE_PAUSE_MS = 600;
const CURSOR_BLINK_MS = 530;

type Props = {
  label?: string;
  className?: string;
};

export function OverlaySpinner({ label = "Loading", className }: Props) {
  const [visibleLines, setVisibleLines] = useState<string[]>([]);
  const [currentTyped, setCurrentTyped] = useState("");
  const [cursorVisible, setCursorVisible] = useState(true);
  const lineIdx = useRef(Math.floor(Math.random() * LINES.length));
  const charIdx = useRef(0);
  const phase = useRef<"typing" | "pause">("typing");
  const rafId = useRef(0);
  const lastTick = useRef(0);

  useEffect(() => {
    const blink = setInterval(() => setCursorVisible((v) => !v), CURSOR_BLINK_MS);
    return () => clearInterval(blink);
  }, []);

  useEffect(() => {
    const tick = (now: number) => {
      if (!lastTick.current) lastTick.current = now;
      const dt = now - lastTick.current;

      if (phase.current === "typing") {
        if (dt >= TYPE_INTERVAL_MS) {
          lastTick.current = now;
          const line = LINES[lineIdx.current % LINES.length];
          charIdx.current += 1;
          if (charIdx.current > line.length) {
            phase.current = "pause";
            setCurrentTyped("");
            setVisibleLines((prev) => {
              const next = [...prev, line];
              return next.length > 5 ? next.slice(-5) : next;
            });
          } else {
            setCurrentTyped(line.slice(0, charIdx.current));
          }
        }
      } else {
        if (dt >= LINE_PAUSE_MS) {
          lastTick.current = now;
          lineIdx.current += 1;
          charIdx.current = 0;
          phase.current = "typing";
        }
      }

      rafId.current = requestAnimationFrame(tick);
    };

    rafId.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId.current);
  }, []);

  return (
    <div
      className={`overlay-spinner${className ? ` ${className}` : ""}`}
      role="status"
      aria-label={label}
    >
      <div className="overlay-spinner-terminal">
        <div className="overlay-spinner-titlebar">
          <span className="overlay-spinner-dot overlay-spinner-dot--red" />
          <span className="overlay-spinner-dot overlay-spinner-dot--yellow" />
          <span className="overlay-spinner-dot overlay-spinner-dot--green" />
          <span className="overlay-spinner-titlebar-label">nss — loading</span>
        </div>
        <div className="overlay-spinner-body">
          {visibleLines.map((ln, i) => (
            <div key={i} className="overlay-spinner-line overlay-spinner-line--done">
              <span className="overlay-spinner-prompt">{PROMPT}</span>
              {ln}
            </div>
          ))}
          <div className="overlay-spinner-line">
            <span className="overlay-spinner-prompt">{PROMPT}</span>
            {currentTyped}
            <span
              className={`overlay-spinner-cursor${cursorVisible ? "" : " overlay-spinner-cursor--hidden"}`}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
