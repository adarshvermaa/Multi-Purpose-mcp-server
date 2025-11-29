/* ======================================================================
   File: src/types/index.ts
   Lightweight shared types
   ====================================================================== */
export type FileMap = Record<string, string>;
export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
};
