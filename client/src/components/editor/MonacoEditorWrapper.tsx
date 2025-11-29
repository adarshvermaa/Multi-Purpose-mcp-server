/* ======================================================================
   File: src/components/editor/MonacoEditorWrapper.tsx
   Thin wrapper around @monaco-editor/react with sensible defaults.
   ====================================================================== */
import Editor from "@monaco-editor/react";

type Props = {
  value: string;
  language?: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
};

export default function MonacoEditorWrapper({
  value,
  language = "javascript",
  onChange,
  readOnly = false,
}: Props) {
  return (
    <Editor
      height="100%"
      defaultLanguage={language}
      language={language}
      value={value}
      onChange={(v) => onChange?.(v ?? "")}
      theme="vs-dark"
      options={{
        automaticLayout: true,
        minimap: { enabled: false },
        fontSize: 13,
        readOnly,
        renderLineHighlight: "gutter",
        scrollBeyondLastLine: false,
      }}
    />
  );
}
