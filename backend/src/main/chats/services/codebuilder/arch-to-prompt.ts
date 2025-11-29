// src/services/codebuilder/arch-to-prompt.ts
import type { ArchitectureNode } from "../../chat.types";

function detectFrameworkFromImportantLines(lines?: string[]): {
  language?: string;
  framework?: string;
  toolchain?: string;
} {
  if (!lines || !lines.length) return {};
  const text = lines.join(" ").toLowerCase();
  if (
    text.includes("npx create-next-app") ||
    text.includes("next.js") ||
    text.includes("nextjs")
  ) {
    return { language: "javascript", framework: "nextjs" };
  }
  if (text.includes("express"))
    return { language: "javascript", framework: "express" };
  if (text.includes("uvicorn") || text.includes("fastapi"))
    return { language: "python", framework: "fastapi" };
  if (text.includes("cargo") || text.includes("rust"))
    return { language: "rust", toolchain: "cargo" };
  if (text.includes("go ") || text.includes("golang"))
    return { language: "go" };
  if (text.includes("npm") || text.includes("tsc"))
    return { language: "typescript" };
  return {};
}

/** Flatten a node into a simple module description for the prompt */
type ModuleNode = {
  id: string;
  title?: string;
  summary?: string;
  description?: string;
  key_points: string[];
  important_lines: string[];
  api_endpoints: string[];
  children: ModuleNode[];
};

function nodeToModule(node: ArchitectureNode): ModuleNode {
  return {
    id: node.id,
    title: node.title,
    summary: node.summary,
    description: node.description,
    key_points: node.key_points ?? [],
    important_lines: node.important_lines ?? [],
    api_endpoints: (node.api_endpoints ?? []).map((ep) =>
      typeof ep === "string" ? ep : JSON.stringify(ep)
    ),
    children: (node.children ?? []).map(nodeToModule),
  };
}

/**
 * Convert the rootModule architecture into a generic 'prompt' object your builder understands.
 */
export function buildPromptFromArchitecture(root: ArchitectureNode) {
  const top = nodeToModule(root);
  // Gather all important_lines across tree for heuristic detection
  const gatherImportantLines = (n: ArchitectureNode, out: string[] = []) => {
    if (n.important_lines) out.push(...n.important_lines);
    (n.children ?? []).forEach((c) => gatherImportantLines(c, out));
    return out;
  };
  const allLines = gatherImportantLines(root);

  const heuristic = detectFrameworkFromImportantLines(allLines);

  // Construct prompt object — include modules array, summary, and hints (deps, frameworks)
  const prompt: Record<string, any> = {
    description: root.summary ?? root.description,
    documentationTitle: root.title ?? root.id,
    modules: top, // nested modules under 'modules'
    hints: {
      language: heuristic.language ?? "unspecified",
      framework: heuristic.framework ?? undefined,
      toolchain: heuristic.toolchain ?? undefined,
    },
    // Add a compact list of top key points & important_lines for AI to use
    key_points: root.key_points ?? [],
    important_lines: allLines.slice(0, 200), // keep reasonable size
  };

  // Extract potential dependencies from common important lines heuristically
  const deps: string[] = [];
  if (allLines.join(" ").match(/\bexpress\b/)) deps.push("express");
  if (allLines.join(" ").match(/\bnext\.js\b|\bcreate-next-app\b/))
    deps.push("next");
  if (allLines.join(" ").match(/\bfastapi\b/)) deps.push("fastapi");
  if (allLines.join(" ").match(/\buvicorn\b/)) deps.push("uvicorn");
  if (allLines.join(" ").match(/\bcargo\b/)) deps.push("cargo");

  if (deps.length) prompt.dependencies = Array.from(new Set(deps));

  return prompt;
}
