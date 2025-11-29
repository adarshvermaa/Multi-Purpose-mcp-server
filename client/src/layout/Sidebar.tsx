// src/components/layout/Sidebar.tsx
import { useEffect, useRef } from "react";
import { MessageSquare, FileStack, Code } from "lucide-react";
import gsap from "gsap";

export default function Sidebar() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    gsap.fromTo(
      ref.current,
      { x: -40, opacity: 0 },
      { x: 0, opacity: 1, duration: 0.45, ease: "power3.out" }
    );
  }, []);

  return (
    <aside
      ref={ref}
      className="
        w-64 h-full 
        bg-white dark:bg-gray-900 
        shadow-xl 
        border-r border-slate-200 dark:border-slate-700 
        flex flex-col 
        p-5
        transition-colors
      "
    >
      <div className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
        Navigation
      </div>

      <NavItem icon={<MessageSquare />} label="Chat" />
      <NavItem icon={<FileStack />} label="File System" />
      <NavItem icon={<Code />} label="Code Editor" />
    </aside>
  );
}

function NavItem({ icon, label }: any) {
  return (
    <button
      className="
        flex items-center gap-3 
        px-3 py-2 
        rounded-lg 
        border border-transparent
        text-slate-700 dark:text-slate-300

        hover:border-indigo-300 dark:hover:border-indigo-600
        hover:bg-indigo-50 dark:hover:bg-indigo-900/30
        hover:text-indigo-600 dark:hover:text-indigo-400
        
        transition-colors duration-200
      "
    >
      <span className="text-slate-500 dark:text-slate-400">{icon}</span>
      {label}
    </button>
  );
}
