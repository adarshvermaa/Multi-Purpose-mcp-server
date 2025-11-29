import { useState } from "react";
import Editor from "@monaco-editor/react";
import { Copy, StopCircle, Trash2 } from "lucide-react";

export interface Message {
  id: string;
  role: "user" | "assistant";
  text: string;
  ts?: number; // Use number (timestamp) instead of string for consistency
  status?: "streaming" | "done" | "error";
}

export interface MessageListProps {
  messages: Message[];
  abortCurrent: () => void;
  copyMessage: (message: Message) => void;
  removeMessage: (id: string) => void;
}

export interface ChatPanelProps {
  files: Record<string, string>;
  activePath?: string;
  reloadFiles?: () => void;
  compact?: boolean;
}

const MessageList: React.FC<MessageListProps> = ({
  messages,
  abortCurrent,
  copyMessage,
  removeMessage,
}) => {
  const [editorHeights, setEditorHeights] = useState<Record<string, number>>(
    {}
  );

  // Detect if message contains code blocks and extract them
  const parseMessageContent = (text: string) => {
    const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
    const parts = [];
    let lastIndex = 0;
    let match;

    while ((match = codeBlockRegex.exec(text)) !== null) {
      // Add text before code block
      if (match.index > lastIndex) {
        parts.push({
          type: "text" as const,
          content: text.slice(lastIndex, match.index),
        });
      }

      // Add code block
      const language = match[1] || "javascript";
      const code = match[2].trim();
      parts.push({
        type: "code" as const,
        language,
        content: code,
      });

      lastIndex = match.index + match[0].length;
    }

    // Add remaining text
    if (lastIndex < text.length) {
      parts.push({
        type: "text" as const,
        content: text.slice(lastIndex),
      });
    }

    return parts.length > 0 ? parts : [{ type: "text", content: text }];
  };

  const handleEditorHeightChange = (messageId: string, height: number) => {
    setEditorHeights((prev) => ({
      ...prev,
      [messageId]: height,
    }));
  };

  return (
    <>
      {messages.map((m) => {
        const contentParts = parseMessageContent(m.text);
        const hasCodeBlocks = contentParts.some((part) => part.type === "code");

        return (
          <div
            key={m.id}
            className={`message-row flex ${
              m.role === "user" ? "justify-end" : "justify-start"
            }`}
          >
            <div
              className={`relative max-w-[80%] p-3 rounded-2xl whitespace-pre-wrap leading-relaxed transition-all duration-300 hover:shadow-lg
                ${
                  m.role === "user"
                    ? "bg-gradient-to-br from-sky-600 to-blue-600 text-white"
                    : "bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200"
                }
              `}
            >
              {/* Render message content with Monaco Editor for code blocks */}
              <div className="break-words">
                {contentParts.map((part, index) => {
                  if (part.type === "text") {
                    return (
                      <div
                        key={index}
                        className="whitespace-pre-wrap mb-2 last:mb-0"
                      >
                        {part.content}
                      </div>
                    );
                  } else if (part.type === "code") {
                    return (
                      <div
                        key={index}
                        className="my-2 rounded-lg overflow-hidden border border-slate-300 dark:border-slate-600"
                      >
                        <div className="flex items-center justify-between px-4 py-2 bg-slate-200 dark:bg-slate-700 border-b border-slate-300 dark:border-slate-600">
                          <span className="text-sm font-mono text-slate-600 dark:text-slate-300">
                            {/* {part.language} */}
                          </span>
                          <button
                            onClick={() =>
                              navigator.clipboard.writeText(part.content)
                            }
                            className="text-xs px-2 py-1 rounded hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors"
                          >
                            Copy
                          </button>
                        </div>
                        <Editor
                          height={Math.min(
                            400,
                            Math.max(200, part.content.split("\n").length * 20)
                          )}
                          // defaultLanguage={part.language}
                          value={part.content}
                          theme={m.role === "user" ? "vs-dark" : "vs"}
                          options={{
                            readOnly: true,
                            minimap: { enabled: false },
                            scrollBeyondLastLine: false,
                            fontSize: 14,
                            lineNumbers: "on",
                            wordWrap: "on",
                            folding: true,
                            lineNumbersMinChars: 3,
                            scrollbar: {
                              vertical: "hidden",
                              horizontal: "hidden",
                            },
                            renderLineHighlight: "none",
                            overviewRulerBorder: false,
                            hideCursorInOverviewRuler: true,
                            selectionHighlight: false,
                            occurrencesHighlight: "off",
                            renderValidationDecorations: "off",
                            matchBrackets: "never",
                            guides: {
                              indentation: false,
                              bracketPairs: false,
                            },
                          }}
                          onChange={(value) => {
                            // Handle height changes for better layout
                            if (value) {
                              const lineCount = value.split("\n").length;
                              const newHeight = Math.min(
                                400,
                                Math.max(200, lineCount * 20)
                              );
                              handleEditorHeightChange(
                                `${m.id}-${index}`,
                                newHeight
                              );
                            }
                          }}
                        />
                      </div>
                    );
                  }
                  return null;
                })}
              </div>

              <div className="mt-2 flex items-center justify-between gap-2">
                <div className="text-[10px] text-slate-500 dark:text-slate-400">
                  {m.ts ? new Date(m.ts).toLocaleTimeString() : ""}
                  {m.status === "streaming" && (
                    <span className="ml-2 text-xs text-amber-600">
                      {" "}
                      • streaming…
                    </span>
                  )}
                  {m.status === "error" && (
                    <span className="ml-2 text-xs text-red-500"> • error</span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {m.role === "assistant" && m.status === "streaming" && (
                    <button
                      onClick={() => abortCurrent()}
                      title="Abort stream"
                      className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700"
                    >
                      <StopCircle size={14} />
                    </button>
                  )}

                  <button
                    onClick={() => copyMessage(m)}
                    title="Copy"
                    className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700"
                  >
                    <Copy size={14} />
                  </button>

                  <button
                    onClick={() => removeMessage(m.id)}
                    title="Delete"
                    className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </>
  );
};

export default MessageList;
