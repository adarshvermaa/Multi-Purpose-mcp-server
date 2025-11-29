// src/pages/main/chats/ChatIDE.tsx
import React, { useEffect, useRef } from "react";
import useFileSystem from "../../hooks/useFileSystem";
import ChatPanel from "../../components/chat/ChatPanel";
import FileTree from "../../components/filetree/FileTree";
import MonacoEditorWrapper from "../../components/editor/MonacoEditorWrapper";
import FileActions from "../../components/filetree/FileActions";
import gsap from "gsap";

export default function ChatIDEPage() {
  const { files, tree, activePath, setActivePath, reload, hasFiles } =
    useFileSystem();

  const containerRef = useRef<HTMLDivElement | null>(null);
  const chatRef = useRef<HTMLDivElement | null>(null);

  // PAGE FADE-IN ANIMATION
  useEffect(() => {
    if (!containerRef.current) return;

    gsap.fromTo(
      containerRef.current,
      { autoAlpha: 0, y: 30, scale: 0.96 },
      {
        autoAlpha: 1,
        y: 0,
        scale: 1,
        duration: 0.7,
        ease: "power3.out",
      }
    );
  }, []);

  // CHAT PANEL SLIDE ANIMATION
  useEffect(() => {
    if (!chatRef.current) return;

    gsap.fromTo(
      chatRef.current,
      { autoAlpha: 0, x: -20 },
      {
        autoAlpha: 1,
        x: 0,
        duration: 0.6,
        ease: "power3.out",
      }
    );
  }, []);

  //
  // ============================
  // FULL-SCREEN CHAT MODE (NO FILES)
  // ============================
  //
  if (!hasFiles) {
    return (
      <div
        ref={containerRef}
        className="
          min-h-screen max-h-screen overflow-hidden 
          flex items-center justify-center p-6

          bg-linear-to-br 
          from-sky-50 via-cyan-50 to-emerald-50
          dark:from-gray-900 dark:to-gray-900 dark:via-gray-900
        "
      >
        <div
          ref={chatRef}
          className="w-full max-w-5xl h-[90vh] flex items-center justify-center"
        >
          <ChatPanel
            files={files}
            activePath={activePath}
            reloadFiles={reload}
            compact={false}
          />
        </div>
      </div>
    );
  }

  //
  // ============================
  // IDE MODE WITH FILES + CHAT + EDITOR
  // ============================
  //

  const editorContent = files[activePath] ?? "// Select a file from left panel";

  return (
    <div
      ref={containerRef}
      className="
      
        min-h-screen max-h-screen overflow-hidden
       bg-linear-to-br
        from-gray-50 to-gray-100
        dark:from-gray-900 dark:to-gray-800
      "
    >
      <div className="max-w-[1920px] mx-auto grid grid-cols-12 gap-6 h-full py-4 px-3 ">
        {/* LEFT: Chat + File Explorer */}
        <aside
          ref={chatRef}
          className="col-span-3 flex flex-col gap-4 h-full overflow-hidden"
        >
          <ChatPanel
            files={files}
            activePath={activePath}
            reloadFiles={reload}
            compact
          />

          <div
            className="
              bg-white dark:bg-[#111113] 
              rounded-2xl shadow-lg p-3 
              h-[calc(100vh-16rem)] flex flex-col
              border border-gray-200 dark:border-gray-700
            "
          >
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Project
                </div>
                <div className="text-lg font-semibold text-slate-800 dark:text-slate-200">
                  Files
                </div>
              </div>

              <FileActions files={files} activePath={activePath} />
            </div>

            <div className="flex-1 overflow-auto pr-1">
              <FileTree
                tree={tree}
                activePath={activePath}
                onSelect={setActivePath}
              />
            </div>
          </div>
        </aside>

        {/* RIGHT: Editor */}
        <main className="col-span-9 h-full">
          <div
            className="
              bg-white dark:bg-[#111113]
              rounded-2xl shadow-lg flex flex-col h-full overflow-hidden
              border border-gray-200 dark:border-gray-700
            "
          >
            {/* Editor Header */}
            <div
              className="p-4 border-b bg-white/90 dark:bg-[#111113]/90 backdrop-blur 
              border-gray-200 dark:border-gray-700
              flex items-center justify-between
            "
            >
              <div>
                <div className="text-sm text-slate-500 dark:text-slate-400">
                  Editing
                </div>
                <div className="text-lg font-semibold text-slate-800 dark:text-slate-200">
                  {activePath || "(no file selected)"}
                </div>
              </div>

              <div className="text-sm text-slate-500 dark:text-slate-400">
                Files: {Object.keys(files).length}
              </div>
            </div>

            {/* Editor Body */}
            <div className="flex-1 bg-white dark:bg-[#0f0f11]">
              <MonacoEditorWrapper
                key={activePath}
                value={editorContent}
                language={getLangFromPath(activePath)}
                readOnly
              />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

// detect language from file name
function getLangFromPath(p?: string) {
  if (!p) return "plaintext";
  if (p.endsWith(".tsx") || p.endsWith(".ts")) return "typescript";
  if (p.endsWith(".jsx") || p.endsWith(".js")) return "javascript";
  if (p.endsWith(".css")) return "css";
  return "plaintext";
}
