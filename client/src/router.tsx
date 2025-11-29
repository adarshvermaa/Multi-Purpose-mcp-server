// src/router.tsx
import React from "react";
import type { RouteObject } from "react-router-dom"; // ✅ type-only import

// 🧠 Import all files inside src/pages dynamically
const pages = import.meta.glob("./pages/**/*.tsx", { eager: true });

function formatPath(path: string) {
  // Remove leading './pages' and extension
  let cleanPath = path.replace("./pages", "").replace(/\.tsx$/, "");
  if (cleanPath.endsWith("/Index")) cleanPath = cleanPath.replace("/Index", "");
  // Special case for Editor (don't lowercase)
  if (cleanPath === "/Editor") return "/editor";
  return cleanPath === "" ? "/" : cleanPath.toLowerCase();
}

// 🔄 Auto-generate routes
export const routes: RouteObject[] = Object.keys(pages).map((path) => {
  const Component = (pages[path] as any).default;
  return {
    path: formatPath(path),
    element: React.createElement(Component),
  };
});
