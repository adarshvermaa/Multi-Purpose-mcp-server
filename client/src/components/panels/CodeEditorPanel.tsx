import React from 'react';
import Editor from '@monaco-editor/react';
import { X } from 'lucide-react';

interface CodeEditorPanelProps {
  code: string;
  language: 'html' | 'css' | 'javascript' | 'json';
  onChange: (value: string | undefined) => void;
  onClose: () => void;
  title?: string;
}

export default function CodeEditorPanel({
  code,
  language,
  onChange,
  onClose,
  title = 'Code Editor'
}: CodeEditorPanelProps) {
  return (
    <div className="flex flex-col h-full bg-[#1e1e1e] border-l border-gray-700">
      <div className="flex items-center justify-between px-4 py-2 bg-[#252526] border-b border-gray-700">
        <span className="text-sm font-medium text-gray-300">{title}</span>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-white transition"
        >
          <X size={16} />
        </button>
      </div>
      <div className="flex-1 overflow-hidden">
        <Editor
          height="100%"
          defaultLanguage={language}
          language={language}
          value={code}
          onChange={onChange}
          theme="vs-dark"
          options={{
            minimap: { enabled: false },
            fontSize: 14,
            wordWrap: 'on',
            scrollBeyondLastLine: false,
            automaticLayout: true,
          }}
        />
      </div>
    </div>
  );
}
