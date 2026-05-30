import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type MutableRefObject,
} from "react";
import type { SettingsOpenMode } from "../components/settings/app-settings-types";

type Position = { x: number; y: number };

export type SettingsModalDrag = {
  /** Ref to attach to the settings modal element so the hook can read its size/position. */
  settingsModalRef: MutableRefObject<HTMLElement | null>;
  /** Modal position in viewport pixels (`null` until first auto-center has run). */
  settingsModalPosition: Position | null;
  /** True while the user is actively dragging the modal header. */
  isSettingsDragging: boolean;
  /** Pointer-down handler for the modal header that starts the drag interaction. */
  onSettingsHeaderPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
};

/**
 * Encapsulates the settings modal centering + drag interaction:
 * 1. Auto-centers the modal in the viewport once when it opens in `modal` mode.
 * 2. Tracks pointer move/up while dragging and clamps the next position inside the viewport.
 * 3. Resets dragging state when the modal closes.
 */
export function useSettingsModalDrag(params: {
  isAppSettingsOpen: boolean;
  settingsOpenMode: SettingsOpenMode;
}): SettingsModalDrag {
  const { isAppSettingsOpen, settingsOpenMode } = params;

  const [isSettingsDragging, setIsSettingsDragging] = useState(false);
  const [settingsModalPosition, setSettingsModalPosition] = useState<Position | null>(null);
  const settingsModalRef = useRef<HTMLElement | null>(null);
  const settingsDragOffsetRef = useRef<Position | null>(null);

  // Auto-center the modal in the viewport the first time it opens in modal mode.
  useEffect(() => {
    if (!isAppSettingsOpen || settingsOpenMode !== "modal" || settingsModalPosition) {
      return;
    }
    const modal = settingsModalRef.current;
    const width = modal?.offsetWidth ?? 860;
    const topMargin = 20;
    const x = Math.max(8, Math.round((window.innerWidth - width) / 2));
    const y = Math.max(
      topMargin,
      Math.round((window.innerHeight - Math.min(820, window.innerHeight - 40)) / 2),
    );
    setSettingsModalPosition({ x, y });
  }, [isAppSettingsOpen, settingsModalPosition, settingsOpenMode]);

  // Track pointer move + up while dragging, with viewport clamping on both axes.
  useEffect(() => {
    if (!isSettingsDragging) {
      return;
    }
    const onPointerMove = (event: PointerEvent) => {
      const dragOffset = settingsDragOffsetRef.current;
      const modal = settingsModalRef.current;
      if (!dragOffset || !modal) {
        return;
      }
      const modalWidth = modal.offsetWidth;
      const modalHeight = modal.offsetHeight;
      const nextX = Math.min(
        Math.max(8, event.clientX - dragOffset.x),
        Math.max(8, window.innerWidth - modalWidth - 8),
      );
      const nextY = Math.min(
        Math.max(8, event.clientY - dragOffset.y),
        Math.max(8, window.innerHeight - modalHeight - 8),
      );
      setSettingsModalPosition({ x: Math.round(nextX), y: Math.round(nextY) });
    };
    const onPointerUp = () => {
      setIsSettingsDragging(false);
      settingsDragOffsetRef.current = null;
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [isSettingsDragging]);

  // Closing the panel must always cancel any in-flight drag.
  useEffect(() => {
    if (isAppSettingsOpen) {
      return;
    }
    setIsSettingsDragging(false);
    settingsDragOffsetRef.current = null;
  }, [isAppSettingsOpen]);

  const onSettingsHeaderPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (!isAppSettingsOpen || settingsOpenMode !== "modal") {
        return;
      }
      const target = event.target as HTMLElement | null;
      // Header buttons (close, mode toggle) must not start a drag.
      if (target?.closest("button")) {
        return;
      }
      const modal = settingsModalRef.current;
      if (!modal) {
        return;
      }
      const modalRect = modal.getBoundingClientRect();
      settingsDragOffsetRef.current = {
        x: event.clientX - modalRect.left,
        y: event.clientY - modalRect.top,
      };
      setIsSettingsDragging(true);
    },
    [isAppSettingsOpen, settingsOpenMode],
  );

  return {
    settingsModalRef,
    settingsModalPosition,
    isSettingsDragging,
    onSettingsHeaderPointerDown,
  };
}
