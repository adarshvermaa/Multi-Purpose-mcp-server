// src/layout/AppLayout.tsx
import React, { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import gsap from "gsap";
import Header from "./Header";
import Sidebar from "./Sidebar";
import Footer from "./Footer";

/**
 * AppLayout
 * - fixes accidental page blur by explicitly neutralizing filter/backdropFilter
 * - sets explicit positioning & z-index so children appear above accidental overlays
 * - keeps initial GSAP entrance animation
 */

export default function AppLayout({ children }: any) {
  const contentRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const isEditorRoute = location.pathname === '/editor';

  useEffect(() => {
    if (!contentRef.current) return;
    gsap.fromTo(
      contentRef.current,
      { opacity: 0, y: 10 },
      { opacity: 1, y: 0, duration: 0.5, ease: "power3.out" }
    );
  }, []);

  // dev helper: call findOverlays() in browser console to locate overlaying nodes
  // (keeps harmless in production but useful while debugging)
  (globalThis as any).findOverlays = () => {
    const els = Array.from(document.querySelectorAll("body *"));
    const hits: any[] = [];
    els.forEach((el) => {
      const cs = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      const coversViewport =
        Math.round(rect.width) >= window.innerWidth - 2 &&
        Math.round(rect.height) >= window.innerHeight - 2;
      if (
        (cs.backdropFilter && cs.backdropFilter !== "none") ||
        (cs.filter && cs.filter !== "none") ||
        (coversViewport &&
          (/rgba|hsla/.test(cs.backgroundColor) || Number(cs.zIndex) > 0))
      ) {
        hits.push({
          el,
          tag: el.tagName,
          id: el.id,
          classes: el.className,
          zIndex: cs.zIndex,
          bg: cs.backgroundColor,
          filter: cs.filter,
          backdrop: cs.backdropFilter || (cs as any).webkitBackdropFilter,
          rect: {
            w: Math.round(rect.width),
            h: Math.round(rect.height),
            x: Math.round(rect.x),
            y: Math.round(rect.y),
          },
        });
      }
    });
    console.table(
      hits.map((h) => ({
        tag: h.tag,
        id: h.id || "",
        classes: (h.classes || "").toString().slice(0, 60),
        zIndex: h.zIndex,
        bg: h.bg,
        filter: h.filter,
        backdrop: h.backdrop,
        width: h.rect.w,
        height: h.rect.h,
      }))
    );
    return hits;
  };

  return (
    <div
      className="w-full h-screen flex flex-col bg-linear-to-br from-sky-50 via-cyan-50 to-emerald-50 overflow-hidden dark:bg-gray-900"
      // ensure no global backdrop-filter bleeds in from parent contexts
      style={{
        WebkitBackdropFilter: "none",
        backdropFilter: "none",
        filter: "none",
      }}
    >
      <Header />

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar: positioned above page-level backgrounds - hidden on /editor route */}
        {!isEditorRoute && (
          <div style={{ position: "relative", zIndex: 20 }} className="shrink-0">
            <Sidebar />
          </div>
        )}

        {/* Main content area */}
        <main
          ref={contentRef}
          // IMPORTANT: set relative position and a positive zIndex so
          // accidental overlays with lower z-index won't dim it.
          className="flex-1 scrollbar-thin scrollbar-track-white scrollbar-thumb-slate-300"
          style={{
            position: "relative",
            zIndex: 10,
            // Prevent inherited filters/backdrop-blur from affecting this region
            WebkitBackdropFilter: "none",
            backdropFilter: "none",
            filter: "none",
            // ensure the main area can receive pointer events if something above had pointer-events set
            pointerEvents: "auto",
          }}
        >
          {children}
        </main>
      </div>

      <Footer />
    </div>
  );
}
