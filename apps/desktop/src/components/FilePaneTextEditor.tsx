import { useCallback, useEffect, useState } from "react";
import Editor, { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";

loader.config({ monaco });

export type FilePaneTextEditorProps = {
  fileName: string;
  initialContent: string;
  isNewFile: boolean;
  monacoLanguage: string;
  onSave: (content: string) => Promise<void>;
  onClose: () => void;
};

export function FilePaneTextEditor({
  fileName,
  initialContent,
  isNewFile,
  monacoLanguage,
  onSave,
  onClose,
}: FilePaneTextEditorProps) {
  const [value, setValue] = useState(initialContent);
  const [dirty, setDirty] = useState(() => isNewFile || initialContent !== "");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  useEffect(() => {
    setValue(initialContent);
    setDirty(isNewFile || initialContent !== "");
    setSaveError(null);
  }, [initialContent, fileName, isNewFile]);

  const tryClose = useCallback(() => {
    if (dirty) {
      const ok = window.confirm("Discard unsaved changes?");
      if (!ok) {
        return;
      }
    }
    onClose();
  }, [dirty, onClose]);

  const handleSave = useCallback(async () => {
    setSaveError(null);
    setSaving(true);
    try {
      await onSave(value);
      onClose();
    } catch (e) {
      setSaveError(String(e));
    } finally {
      setSaving(false);
    }
  }, [onClose, onSave, value]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        void handleSave();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [handleSave]);

  const title = `${fileName}${dirty ? " (modified)" : ""}${isNewFile ? " — new" : ""}`;

  return (
    <div className="file-pane-text-editor" role="dialog" aria-label={`Text editor: ${fileName}`} aria-modal="true">
      <div className="file-pane-text-editor-toolbar">
        <span className="file-pane-text-editor-title" title={title}>
          {title}
        </span>
        <div className="file-pane-text-editor-actions">
          <button type="button" className="btn btn-sm" disabled={saving || !dirty} onClick={() => void handleSave()}>
            Save
          </button>
          <button type="button" className="btn btn-sm" disabled={saving} onClick={tryClose}>
            Close
          </button>
        </div>
      </div>
      {saveError ? (
        <div className="file-pane-banner file-pane-banner--error" role="alert">
          {saveError}
        </div>
      ) : null}
      <div className="file-pane-text-editor-body">
        <Editor
          height="100%"
          theme="vs-dark"
          path={fileName}
          defaultLanguage={monacoLanguage}
          value={value}
          onChange={(next) => {
            const v = next ?? "";
            setValue(v);
            setDirty(isNewFile || v !== initialContent);
          }}
          onMount={(ed) => {
            ed.focus();
          }}
          options={{
            minimap: { enabled: false },
            fontSize: 13,
            wordWrap: "on",
            scrollBeyondLastLine: false,
            automaticLayout: true,
          }}
        />
      </div>
    </div>
  );
}
