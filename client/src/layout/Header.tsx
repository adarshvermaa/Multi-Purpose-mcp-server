import { useState, useEffect, useRef } from "react";
import {
  Sparkles,
  Bell,
  ChevronDown,
  User,
  Settings,
  LogOut,
  Sun,
  Moon,
} from "lucide-react";
import gsap from "gsap";

export default function Header() {
  const [openProfile, setOpenProfile] = useState(false);
  const [openBell, setOpenBell] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("light");

  const profileRef = useRef<HTMLDivElement>(null);
  const bellRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  /* ------------------------------------------------------
   *  APPLY THEME ON MOUNT
   * ------------------------------------------------------ */
  useEffect(() => {
    const saved =
      (localStorage.getItem("theme") as "light" | "dark") || "light";
    setTheme(saved);

    const root = document.documentElement;
    saved === "dark"
      ? root.classList.add("dark")
      : root.classList.remove("dark");
  }, []);

  /* ------------------------------------------------------
   *  THEME TOGGLE
   * ------------------------------------------------------ */
  const toggleTheme = () => {
    const newTheme = theme === "light" ? "dark" : "light";
    setTheme(newTheme);

    const root = document.documentElement;
    newTheme === "dark"
      ? root.classList.add("dark")
      : root.classList.remove("dark");

    localStorage.setItem("theme", newTheme);
  };

  /* ------------------------------------------------------
   *  ANIMATION FOR DROPDOWN
   * ------------------------------------------------------ */
  useEffect(() => {
    if (openProfile || openBell) {
      gsap.fromTo(
        dropdownRef.current,
        { opacity: 0, y: -10 },
        { opacity: 1, y: 0, duration: 0.25, ease: "power2.out" }
      );
    }
  }, [openProfile, openBell]);

  /* ------------------------------------------------------
   *  CLICK OUTSIDE TO CLOSE
   * ------------------------------------------------------ */
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (
        profileRef.current &&
        !profileRef.current.contains(e.target as Node) &&
        bellRef.current &&
        !bellRef.current.contains(e.target as Node)
      ) {
        setOpenProfile(false);
        setOpenBell(false);
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  return (
    <header
      className="
        h-14 flex items-center justify-between px-6 
        bg-white dark:bg-slate-900 
        border-b border-slate-200 dark:border-slate-700 
        shadow-sm
      "
    >
      {/* Brand */}
      <div className="flex items-center gap-2 font-semibold text-slate-800 dark:text-slate-100 text-lg">
        <Sparkles className="text-indigo-600" size={20} />
        <span>AI Code Builder</span>
      </div>

      {/* Right Section */}
      <div className="flex items-center gap-4">
        {/* Theme Switch */}
        <button
          onClick={toggleTheme}
          className="
            p-2 rounded-xl transition 
            bg-slate-100 hover:bg-slate-200
            dark:bg-slate-800 dark:hover:bg-slate-700
            text-slate-700 dark:text-slate-300
          "
        >
          {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
        </button>

        {/* Notification Bell */}
        <div className="relative" ref={bellRef}>
          <button
            onClick={() => {
              setOpenBell(!openBell);
              setOpenProfile(false);
            }}
            className="
              relative p-2 rounded-xl transition
              bg-slate-100 hover:bg-slate-200 
              dark:bg-slate-800 dark:hover:bg-slate-700
              text-slate-700 dark:text-slate-300
            "
          >
            <Bell size={20} />
            <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
          </button>

          {openBell && (
            <div
              ref={dropdownRef}
              className="
                z-50
                absolute right-0 mt-3 w-64 
                bg-white dark:bg-slate-900 
                border border-slate-200 dark:border-slate-700 
                rounded-xl shadow-xl p-3 space-y-3
                text-slate-700 dark:text-slate-300
              "
            >
              <p className="text-sm opacity-70">Notifications</p>
              <div className="p-2 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 text-sm">
                No new notifications ✨
              </div>
            </div>
          )}
        </div>

        {/* Profile Menu */}
        <div className="relative" ref={profileRef}>
          <button
            onClick={() => {
              setOpenProfile(!openProfile);
              setOpenBell(false);
            }}
            className="
              flex items-center gap-2 px-3 py-1.5 
              bg-slate-100 hover:bg-slate-200 
              dark:bg-slate-800 dark:hover:bg-slate-700
              rounded-xl transition-all
              text-slate-700 dark:text-slate-300
            "
          >
            <div
              className="w-8 h-8 rounded-full bg-linear-to-br from-indigo-500 to-purple-500 flex-center 
                text-white font-bold text-sm shadow"
            >
              A
            </div>
            <span className="font-medium">Adarsh</span>
            <ChevronDown size={16} />
          </button>

          {openProfile && (
            <div
              ref={dropdownRef}
              className="
                z-50
                absolute right-0 mt-3 w-48 
                bg-white dark:bg-slate-900 
                border border-slate-200 dark:border-slate-700 
                rounded-xl shadow-xl
                text-slate-700 dark:text-slate-300
              "
            >
              <ul className="py-2 text-sm">
                <DropdownItem icon={<User size={16} />} label="Profile" />
                <DropdownItem icon={<Settings size={16} />} label="Settings" />
                <div className="border-t my-2 border-slate-200 dark:border-slate-700" />
                <DropdownItem icon={<LogOut size={16} />} label="Logout" />
              </ul>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function DropdownItem({ icon, label }: any) {
  return (
    <li>
      <button
        className="
          w-full flex items-center gap-3 px-4 py-2 
          hover:bg-slate-100 dark:hover:bg-slate-800 
          transition-all
        "
      >
        {icon}
        {label}
      </button>
    </li>
  );
}
