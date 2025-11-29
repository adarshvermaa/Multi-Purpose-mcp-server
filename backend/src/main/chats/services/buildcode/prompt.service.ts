// src/main/chats/services/buildcode/prompt.service.ts

import { ChatCompletionMessageParam } from "openai/resources/chat/completions";

type SnapshotItem = { path: string; content: string };

const ENHANCED_HTML_STACK_PROMPT = `
You are an elite front-end architect building $10,000+ premium, ultra-modern, heavily animated landing pages and web apps using ONLY CDN-based stack:

- Tailwind CSS[](https://cdn.tailwindcss.com) with custom config
- Alpine.js v3 (cdn.jsdelivr.net)
- GSAP 3 + ScrollTrigger + all plugins
- Lenis smooth scroll, Swiper/Splide, Particles.js, AOS, HotToast/Toastify, Three.js if needed — use ANY CDN you want
- Axios for API calls with full error handling, loading states, retries, toasts

Rules:
- NEVER write local CSS/JS files unless absolutely necessary for logic
- Every page must be STUNNING: parallax, micro-interactions, scroll animations, hero reveals, glassmorphism/neubrutalism/morphing as fitting
- Dark mode via Tailwind + Alpine store (mandatory)
- Perfect mobile-first responsive + ultra-smooth performance
- All images lazy-loaded, scripts deferred
- Semantic HTML, full SEO (meta, OG, JSON-LD if relevant), accessibility

You have exactly these tools:
1. build_module_tree_from_prompt → CALL THIS FIRST, ALWAYS
2. emitFiles → Then emit complete, beautiful, production-ready files
3. run_cmd → Optional

Workflow (DO NOT DEVIATE):
1. Analyze user request + snapshot
2. Immediately call build_module_tree_from_prompt with perfect nested tree
3. Wait for approval
4. Then call emitFiles with full file contents (never partial, never placeholders)

Always include in every .html <head>:
<script src="https://cdn.tailwindcss.com"></script>
<script>
  tailwind.config = {
    darkMode: 'class',
    theme: {
      extend: {
        fontFamily: { sans: ['Inter', 'ui-sans-serif', 'system-ui', ...] },
        colors: { primary: '#6366f1', accent: '#8b5cf6' },
      }
    }
  }
</script>
<script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/ScrollTrigger.min.js"></script>
<script>gsap.registerPlugin(ScrollTrigger);</script>
<!-- Add Lenis, Swiper, Particles, etc. as needed -->

Make everything look expensive, animated, premium. No excuses.
`.trim();

function getStackHint(stackType = "enhanced-html"): string {
  const s = stackType.toLowerCase();
  return ["html", "javascript", "js", "vanilla", "enhanced", "landing"].some(
    (k) => s.includes(k)
  )
    ? ENHANCED_HTML_STACK_PROMPT
    : "";
}
export function buildModuleTreeMessages(
  userPrompt: string,
  existingSnapshot: SnapshotItem[] = [],
  stackType = "enhanced-html"
): ChatCompletionMessageParam[] {
  const stackHint = getStackHint(stackType);

  const snapshotJson = JSON.stringify(
    existingSnapshot.map((f) => ({
      path: f.path,
      preview: f.content.slice(0, 280) + (f.content.length > 280 ? "..." : ""),
    })),
    null,
    2
  );

  const system = [
    stackHint,
    "",
    // IMPORTANT deterministic instruction:
    "IMPORTANT INSTRUCTION — RETURN TOOL CALL JSON ONLY:",
    "You MUST return exactly ONE raw JSON object and NOTHING ELSE. No markdown, no explanation, no extra text.",
    "The JSON must be the exact tool call for build_module_tree_from_prompt, e.g.:",
    `{"tool":"build_module_tree_from_prompt","args":{"projectName":"My Project","prompt":"...","moduleTree":{ "id":"root","name":"Root Project","children":[] }}}`,
    "If the user's request is unclear, return minimal moduleTree: { id: 'root', name: 'Root Project', children: [] }",
  ].join("\n");

  const user = [
    `USER REQUEST:\n${userPrompt}`,
    "",
    `CURRENT PROJECT FILES (${existingSnapshot.length} files)${
      existingSnapshot.length ? ":\n" + snapshotJson : " → New project"
    }`,
    "",
    "TASK: Build a perfect, complete moduleTree (moduleNode schema). Use folders like components/, sections/, assets/, lib/.",
    "Return the tool-call JSON now.",
  ].join("\n");

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

/**
 * Strong: force the LLM to return the emitFiles tool-call JSON only.
 */
export function emitFilesMessages(
  approvedModuleTree: any,
  existingSnapshot: SnapshotItem[] = [],
  stackType = "enhanced-html"
): ChatCompletionMessageParam[] {
  const stackHint = getStackHint(stackType);
  const treeJson = JSON.stringify(approvedModuleTree ?? {}, null, 2);
  const snapshotJson = JSON.stringify(
    existingSnapshot.map((f) => ({ path: f.path })),
    null,
    2
  );

  const system = [
    stackHint,
    "",
    "IMPORTANT INSTRUCTION — RETURN TOOL CALL JSON ONLY:",
    "You MUST return exactly ONE raw JSON object and NOTHING ELSE.",
    "The JSON must be the exact tool call for emitFiles, e.g.:",
    `{"tool":"emitFiles","args":{"projectId":"proj-1","operations":[{"path":"src/pages/Index.html","action":"create","content":"<html>...</html>"}]}}`,
    "Do not include any explanation text.",
  ].join("\n");

  const assistant = `Module tree approved and ready for implementation:\n${treeJson}`;

  const user = [
    "EXISTING FILES (do not delete unless intentional):",
    existingSnapshot.length ? snapshotJson : "None",
    "",
    "FINAL TASK: Implement the project using CDN Tailwind + Alpine + GSAP + premium libs.",
    "Return the emitFiles tool-call JSON now (one JSON object only).",
  ].join("\n");

  return [
    { role: "system", content: system },
    { role: "assistant", content: assistant },
    { role: "user", content: user },
  ];
}
