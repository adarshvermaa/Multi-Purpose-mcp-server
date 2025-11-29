// src/components/layout/Footer.tsx
export default function Footer() {
  return (
    <footer
      className="
        h-12 flex items-center justify-center text-sm
        border-t border-slate-200 bg-white shadow-inner
        
        dark:bg-gray-900 
        dark:border-slate-700 
        dark:text-slate-400
      "
    >
      © {new Date().getFullYear()} AI Code Builder – Powered by Adarsh
    </footer>
  );
}
