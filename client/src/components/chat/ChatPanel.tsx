import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { io, Socket } from "socket.io-client";
import {
  Send,
  RefreshCw,
  Loader2,
  CheckCircle2,
  Trash2,
  MessageSquare,
  X,
  Bot,
  Sparkles,
  Code2,
  FileText,
  Zap,
} from "lucide-react";
import MessageList, { type ChatPanelProps, type Message } from "./massegsChat";

function formatSummary(results: any[]) {
  let out = "\n\n📁 File Changes Applied:";
  const creates = results.filter(
    (r) => r.action === "create" && r.status === "applied"
  );
  if (creates.length > 0) {
    out += `\n• Created ${creates.length} file(s): ${creates
      .map((r) => r.path)
      .join(", ")}`;
  }
  const updates = results.filter(
    (r) => r.action === "update" && r.status === "applied"
  );
  if (updates.length > 0) {
    out += `\n• Updated ${updates.length} file(s): ${updates
      .map((r) => r.path)
      .join(", ")}`;
  }
  const deletes = results.filter(
    (r) => r.action === "delete" && r.status === "applied"
  );
  if (deletes.length > 0) {
    out += `\n• Deleted ${deletes.length} file(s): ${deletes
      .map((r) => r.path)
      .join(", ")}`;
  }
  const failed = results.filter((r) => r.status === "failed");
  if (failed.length > 0) {
    out += `\n⚠️ ${failed.length} operation(s) failed: ${failed
      .map((r) => `${r.path} (${r.message})`)
      .join("; ")}`;
  }
  if (creates.length === 0 && updates.length === 0 && deletes.length === 0) {
    out += "\n• No changes applied.";
  }
  return out;
}

export default function ChatPanel({
  files,
  activePath,
  reloadFiles,
  compact = false,
}: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [sending, setSending] = useState(false);
  const [reconnectAttempt, setReconnectAttempt] = useState<number | null>(null);
  const [fileSummary, setFileSummary] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const currentAid = useRef<string>("");
  const base = "http://localhost:4000";

  // ---------- utils ----------
  const nextId = () => `m_${Math.random().toString(36).slice(2, 9)}`;

  function buildPrompt(text: string, ap?: string, f?: Record<string, string>) {
    let out = text;
    if (ap && f?.[ap]) out += `\n\nActiveFile:${ap}\n${f[ap].slice(0, 1800)}`;
    return out;
  }

  // ---------- socket init & lifecycle ----------
  useEffect(() => {
    const s: Socket = io(base, {
      transports: ["websocket"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 800,
    });

    const onConnect = () => {
      setConnected(true);
      setReconnectAttempt(null);
      setStatusMessage("Connected to AI service");
      setSocket(s);
    };

    const onDisconnect = (reason: string) => {
      setConnected(false);
      setStatusMessage(`Disconnected (${reason})`);
    };

    const onConnectError = (err: any) => {
      console.error("Socket connect_error:", err);
      setStatusMessage("Connection error - retrying...");
    };

    const onReconnecting = (attempt: number) => {
      setReconnectAttempt(attempt);
      setStatusMessage(`Reconnecting… (attempt ${attempt})`);
    };

    const onReconnect = (attempt: number) => {
      setReconnectAttempt(null);
      setStatusMessage(`Reconnected successfully`);
      console.log("Socket reconnected after", attempt, "attempts");
    };

    s.on("connect", onConnect);
    s.on("disconnect", onDisconnect);
    s.on("connect_error", onConnectError);
    s.on("reconnecting", onReconnecting);
    s.on("reconnect", onReconnect);

    return () => {
      s.off("connect", onConnect);
      s.off("disconnect", onDisconnect);
      s.off("connect_error", onConnectError);
      s.off("reconnecting", onReconnecting);
      s.off("reconnect", onReconnect);
      s.disconnect();
    };
  }, []);

  // ---------- Auto-resize textarea ----------
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
      inputRef.current.style.height =
        Math.min(inputRef.current.scrollHeight, 120) + "px";
    }
  }, [input]);

  // ---------- GSAP animate on new message and auto-scroll ----------
  useEffect(() => {
    const nodes = containerRef.current?.querySelectorAll(".message-row");
    if (!nodes?.length) return;

    const last = nodes[nodes.length - 1] as HTMLElement;
    gsap.fromTo(
      last,
      {
        autoAlpha: 0,
        y: 20,
        scale: 0.95,
      },
      {
        autoAlpha: 1,
        y: 0,
        scale: 1,
        duration: 0.4,
        ease: "back.out(1.2)",
      }
    );

    // Smooth scroll to bottom
    if (containerRef.current) {
      const scrollHeight = containerRef.current.scrollHeight;
      const height = containerRef.current.clientHeight;
      const maxScrollTop = scrollHeight - height;

      gsap.to(containerRef.current, {
        scrollTop: maxScrollTop,
        duration: 0.3,
        ease: "power2.out",
      });
    }
  }, [messages]);

  // ---------- stream handlers ----------
  useEffect(() => {
    if (!socket) return;

    const safeAppendChunk = (chunkText: string) => {
      setMessages((msgs) =>
        msgs.map((msg) =>
          msg.id === currentAid.current
            ? { ...msg, text: (msg.text || "") + chunkText }
            : msg
        )
      );
    };

    const onChunk = (p: any) => {
      if (!p?.type) return;
      setIsTyping(true);
      safeAppendChunk(p.text ?? "");
    };

    const onAck = (p: any) => {
      if (!p) return;
      console.debug("AI ack:", p);
    };

    const onWarning = (p: any) => {
      safeAppendChunk(`\n\n⚠️ Warning: ${p?.text ?? JSON.stringify(p)}`);
    };

    const onToolName = (p: any) => {
      safeAppendChunk(`\n\n🔧 Tool: ${p?.text ?? p?.name ?? "unknown"}`);
    };

    const onToolArgs = (p: any) => {
      safeAppendChunk(`\n\n📥 Tool args: ${JSON.stringify(p?.args ?? p)}`);
    };

    const onDone = (p: any) => {
      setSending(false);
      setIsTyping(false);
      setMessages((msgs) =>
        msgs.map((msg) =>
          msg.id === currentAid.current
            ? { ...msg, text: (msg.text || "") + "\n\n✅ Done", status: "done" }
            : msg
        )
      );

      if (reloadFiles && p?.toolCallName === "emitFiles") {
        reloadFiles();
      }
    };

    const onFileSummary = (payload: any) => {
      if (!payload?.results) return;
      const summary = formatSummary(payload.results);
      setFileSummary(summary);
      setMessages((msgs) =>
        msgs.map((msg) =>
          msg.id === currentAid.current
            ? { ...msg, text: (msg.text || "") + summary }
            : msg
        )
      );
      if (reloadFiles) reloadFiles();
    };

    const onError = (err: any) => {
      console.error("socket error event:", err);
      setSending(false);
      setIsTyping(false);
      setMessages((msgs) =>
        msgs.map((msg) =>
          msg.id === currentAid.current
            ? {
                ...msg,
                text: (msg.text || "") + `\n\n❌ Error: ${String(err)}`,
                status: "error",
              }
            : msg
        )
      );
    };

    socket.on("ai:chunk", onChunk);
    socket.on("ai:ack", onAck);
    socket.on("ai:warning", onWarning);
    socket.on("ai:tool_name", onToolName);
    socket.on("ai:tool_args", onToolArgs);
    socket.on("ai:done", onDone);
    socket.on("file.operations.summary", onFileSummary);
    socket.on("error", onError);

    return () => {
      socket.off("ai:chunk", onChunk);
      socket.off("ai:ack", onAck);
      socket.off("ai:warning", onWarning);
      socket.off("ai:tool_name", onToolName);
      socket.off("ai:tool_args", onToolArgs);
      socket.off("ai:done", onDone);
      socket.off("file.operations.summary", onFileSummary);
      socket.off("error", onError);
    };
  }, [socket, reloadFiles]);

  // ---------- UI actions ----------
  const send = async () => {
    if (!input.trim() || !socket || sending) return;
    setSending(true);
    setIsTyping(true);

    const userId = nextId();
    const timestamp = Date.now(); // Use timestamp instead of ISO string

    setMessages((m) => [
      ...m,
      {
        id: userId,
        role: "user",
        text: input,
        ts: timestamp,
        status: "done",
      },
    ]);

    const aid = nextId();
    currentAid.current = aid;
    setMessages((m) => [
      ...m,
      {
        id: aid,
        role: "assistant",
        text: "",
        ts: timestamp,
        status: "streaming",
      },
    ]);

    const prompt = buildPrompt(input, activePath, files);

    try {
      const res = await fetch(`${base}/api/v1/chats/project/builder/emit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userPrompt: prompt,
          thinkMode: false,
          stackType: "reactVite",
          socketId: socket.id,
        }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Request failed: ${res.status} ${res.statusText}`);
      }

      const data = await res.json().catch(() => null);
      if (data?.ok && reloadFiles) {
        setTimeout(() => reloadFiles(), 500);
      }
    } catch (e) {
      console.error("send error:", e);
      setMessages((m) =>
        m.map((mm) =>
          mm.id === currentAid.current
            ? {
                ...mm,
                text: mm.text + `\n\n❌ Error: ${String(e)}`,
                status: "error",
              }
            : mm
        )
      );
      setStatusMessage(`Error: ${String(e)}`);
      setSending(false);
      setIsTyping(false);
    } finally {
      setInput("");
      if (inputRef.current) {
        inputRef.current.style.height = "auto";
      }
    }
  };

  const abortCurrent = () => {
    if (!socket || !currentAid.current) return;
    socket.emit("ai:abort", { id: currentAid.current });
    setStatusMessage("Generation aborted");
    setSending(false);
    setIsTyping(false);
    setMessages((m) =>
      m.map((mm) =>
        mm.id === currentAid.current
          ? {
              ...mm,
              status: "error",
              text: mm.text + "\n\n⏹️ Aborted by user",
            }
          : mm
      )
    );
  };

  const clear = () => {
    setMessages([]);
    setFileSummary(null);
    setStatusMessage("Conversation cleared");
    setTimeout(() => setStatusMessage(null), 2000);
  };

  const copyMessage = async (m: Message) => {
    try {
      await navigator.clipboard.writeText(m.text);
      setStatusMessage("Copied to clipboard");
      setTimeout(() => setStatusMessage(null), 1800);
    } catch (e) {
      setStatusMessage("Copy failed");
      setTimeout(() => setStatusMessage(null), 1800);
    }
  };

  const removeMessage = (id: string) => {
    setMessages((m) => m.filter((x) => x.id !== id));
    setStatusMessage("Message deleted");
    setTimeout(() => setStatusMessage(null), 1400);
  };

  const quickPrompt = (prompt: string) => {
    setInput(prompt);
    inputRef.current?.focus();
  };

  // initial intro
  useEffect(() => {
    if (messages.length === 0) {
      setMessages([
        {
          id: nextId(),
          role: "assistant",
          text: "Hello! I'm your AI coding assistant. I can help you generate UI components, modify files, refactor code, or answer programming questions. What would you like to build today?",
          ts: Date.now(), // Use timestamp
          status: "done",
        },
      ]);
    }
  }, []);

  // mount animation
  useEffect(() => {
    gsap.from(".chat-panel-container", {
      // autoAlpha: 0,
      y: 30,
      scale: 0.98,
      duration: 0.5,
      ease: "power2.out",
    });
  }, []);

  return (
    <div
      className={`chat-panel-container relative flex flex-col
        bg-gradient-to-br from-slate-50 via-white to-blue-50/30 
        dark:from-slate-900 dark:via-slate-800 dark:to-blue-900/20
        border border-slate-200/80 dark:border-slate-700/60
        backdrop-blur-sm
        ${compact ? "h-[calc(100vh-64px)]" : "h-[calc(80vh-96px)]"}
        rounded-3xl shadow-2xl shadow-blue-500/5 dark:shadow-blue-500/10
        overflow-hidden
      `}
    >
      {/* HEADER - Glass morphism */}
      <div className="relative bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl border-b border-slate-200/60 dark:border-slate-700/60 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg">
                <Bot className="text-white" size={24} />
              </div>
              <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-emerald-500 rounded-full border-2 border-white dark:border-slate-800 flex items-center justify-center">
                <Zap size={12} className="text-white" />
              </div>
            </div>

            <div>
              <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                Code Assistant
              </h1>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                AI-powered code generation and refactoring
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Connection Status */}
            <div
              className={`flex items-center gap-3 px-4 py-2 rounded-2xl transition-all duration-300 ${
                connected
                  ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20"
                  : "bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20"
              }`}
            >
              {connected ? (
                <CheckCircle2 className="text-emerald-500" size={18} />
              ) : (
                <Loader2 className="animate-spin text-amber-500" size={18} />
              )}
              <div className="flex flex-col">
                <span className="text-sm font-medium">
                  {connected ? "Connected" : "Connecting"}
                </span>
                {reconnectAttempt ? (
                  <span className="text-xs opacity-75">
                    Attempt {reconnectAttempt}
                  </span>
                ) : (
                  <span className="text-xs opacity-75">
                    {statusMessage || "Ready"}
                  </span>
                )}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2">
              <button
                onClick={reloadFiles}
                className="p-3 rounded-2xl bg-slate-100/80 dark:bg-slate-700/80 hover:bg-slate-200 dark:hover:bg-slate-600 transition-all duration-200 group"
                title="Reload files"
              >
                <RefreshCw
                  size={18}
                  className="text-slate-600 dark:text-slate-300 group-hover:rotate-180 transition-transform"
                />
              </button>

              <button
                onClick={clear}
                className="p-3 rounded-2xl bg-slate-100/80 dark:bg-slate-700/80 hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400 transition-all duration-200"
                title="Clear chat"
              >
                <Trash2 size={18} />
              </button>
            </div>
          </div>
        </div>

        {/* Quick Prompts */}
        <div className="flex items-center gap-3 mt-4 overflow-x-auto pb-2">
          <span className="text-sm text-slate-500 dark:text-slate-400 whitespace-nowrap">
            Try:
          </span>
          {[
            "create real estate portfolio with animations",
            "Add TypeScript types for this",
            "Fix the styling issues",
            "Generate a form with validation",
          ].map((prompt, i) => (
            <button
              key={i}
              onClick={() => quickPrompt(prompt)}
              className="px-3 py-1.5 text-sm bg-white/60 dark:bg-slate-700/60 hover:bg-white dark:hover:bg-slate-600 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-700 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 transition-all duration-200 whitespace-nowrap"
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>

      {/* MESSAGES CONTAINER */}
      <div
        ref={containerRef}
        className="flex-1 overflow-auto p-6 space-y-6 bg-gradient-to-b from-transparent to-blue-50/20 dark:to-blue-900/5"
      >
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-blue-500/10 to-purple-500/10 flex items-center justify-center mb-6">
              <Sparkles className="text-blue-500" size={32} />
            </div>
            <h3 className="text-xl font-semibold text-slate-700 dark:text-slate-300 mb-2">
              Start a Conversation
            </h3>
            <p className="text-slate-500 dark:text-slate-400 max-w-md">
              Ask me to generate UI components, refactor code, fix bugs, or
              explain programming concepts.
            </p>
          </div>
        )}

        <MessageList
          messages={messages}
          abortCurrent={abortCurrent}
          copyMessage={copyMessage}
          removeMessage={removeMessage}
        />

        {/* Typing Indicator */}
        {isTyping && (
          <div className="flex justify-start">
            <div className="max-w-[80%] p-4 rounded-2xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-3 text-slate-500 dark:text-slate-400">
                <Loader2 className="animate-spin" size={16} />
                <span className="text-sm">AI is thinking...</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* INPUT AREA */}
      <div className="p-6 bg-white/50 dark:bg-slate-800/50 border-t border-slate-200/60 dark:border-slate-700/60 backdrop-blur-sm">
        <div className="flex items-end gap-3">
          <div className="flex-1 relative">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              rows={1}
              placeholder="Ask me to generate UI, code, or modify files..."
              className="w-full resize-none p-4 pr-12 rounded-2xl border border-slate-300/80 dark:border-slate-600/80 bg-white/80 dark:bg-slate-700/80 text-slate-800 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all duration-200 shadow-sm"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              aria-label="Chat input"
            />

            {/* Active file indicator */}
            {activePath && (
              <div className="absolute bottom-2 left-4 flex items-center gap-2">
                <FileText size={12} className="text-blue-500" />
                <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">
                  {activePath.split("/").pop()}
                </span>
              </div>
            )}
          </div>

          <button
            onClick={send}
            disabled={!connected || sending || !input.trim()}
            className="p-4 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 text-white shadow-lg hover:shadow-xl disabled:opacity-50 disabled:shadow-none disabled:cursor-not-allowed transition-all duration-200 group relative overflow-hidden"
            aria-label="Send message"
          >
            <div className="relative z-10">
              {sending ? (
                <Loader2 className="animate-spin" size={20} />
              ) : (
                <Send
                  size={20}
                  className="group-hover:translate-x-0.5 transition-transform"
                />
              )}
            </div>
            <div className="absolute inset-0 bg-gradient-to-br from-blue-600 to-purple-700 opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
          </button>
        </div>

        {/* Status Bar */}
        <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-200/40 dark:border-slate-700/40">
          <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
            <button
              onClick={clear}
              className="hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
            >
              Clear chat
            </button>

            {fileSummary && (
              <button
                onClick={() => setFileSummary(null)}
                className="hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
              >
                Hide summary
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <Code2 size={14} />
            <span>React + TypeScript</span>
          </div>
        </div>

        {/* Status Message */}
        {statusMessage && (
          <div className="mt-3 p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-700 dark:text-blue-300 text-sm flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageSquare size={16} />
              <span>{statusMessage}</span>
            </div>
            <button
              onClick={() => setStatusMessage(null)}
              className="p-1 rounded-lg hover:bg-blue-500/20 transition-colors"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {/* File Summary */}
        {fileSummary && (
          <div className="mt-3 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-sm font-mono whitespace-pre-wrap">
            <div className="flex items-center gap-2 mb-2">
              <FileText size={16} />
              <span className="font-semibold">File Operations</span>
            </div>
            {fileSummary}
          </div>
        )}
      </div>
    </div>
  );
}
