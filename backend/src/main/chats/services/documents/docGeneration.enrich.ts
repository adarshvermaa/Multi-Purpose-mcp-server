// src/services/docGeneration.enrich.ts

import { docFunctions } from "main/chats/schemas/ai/functions";
import {
  FileDoc,
  ModuleNode,
  SiteManifest,
} from "main/chats/schemas/zod/chat.schemas";
import { callModelWithFunctions } from "utils/aiClient";

type EnrichOptions = {
  detailLevel?: "short" | "medium" | "detailed";
  maxTokens?: number;
  pauseMsBetweenRequests?: number;
};

/**
 * Enrich the manifest in-place by asking the model to produce detailed summaries, key points, examples and HTML fragments.
 * Returns { manifest, warnings }.
 */
export async function enrichManifestWithDetails(
  manifest: SiteManifest,
  opts: EnrichOptions = {}
): Promise<{ manifest: SiteManifest; warnings: string[] }> {
  const detailLevel = opts.detailLevel ?? "short";
  const maxTokens = opts.maxTokens ?? 4000;
  const pauseMs = opts.pauseMsBetweenRequests ?? 120; // politeness / rate-limit cushion

  const warnings: string[] = [];

  // helper to sleep
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  // The instruction we send to the model for each module/file.
  // It requests JSON with specific fields. The model must return only JSON (no extra text).
  function makeModulePrompt(
    projectName: string,
    node: ModuleNode,
    contextNote = ""
  ) {
    return [
      {
        role: "system",
        content:
          "You are a documentation generator. Return ONLY valid JSON (no commentary). Produce detailed module documentation JSON for the provided module node. Use safeId for ids, and ensure outputs are escaped where appropriate. The JSON schema required (exact keys):\n\n" +
          "{\n" +
          '  "id": string,             // same as module.id\n' +
          '  "title": string,\n' +
          '  "summary": string,        // 5-10 paragraphs for detailed\n' +
          '  "key_points": string[],   // 12-18 concise bullet points\n' +
          '  "important_lines": string[], // up to 20 lines (commands, config, sample code)\n' +
          '  "api_endpoints": [{method, path, note, example}], // proper api in list of endpoints\n' +
          '  "html": string            // safe HTML fragment for this module (use <section id="{id}"> ... )\n' +
          "}\n\nBe verbose when detailLevel is 'detailed'. Keep HTML self-contained and simple (no scripts).",
      },
      {
        role: "user",
        content: JSON.stringify({
          projectName,
          detailLevel,
          module: {
            id: node.id,
            title: node.title,
            summary: node.summary ?? "",
            description: node.description ?? "",
            files: (node.files || []).map((f: FileDoc) => ({
              id: f.id,
              fileName: f.fileName,
              summary: f.summary ?? "",
            })),
            childrenCount: (node.children || []).length,
            contextNote,
          },
        }),
      },
    ];
  }

  // similar prompt for files (if you want per-file enrichment)
  function makeFilePrompt(
    projectName: string,
    moduleNode: ModuleNode,
    file: FileDoc
  ) {
    return [
      {
        role: "system",
        content:
          "You are a documentation generator. Return ONLY valid JSON (no commentary). Produce detailed file documentation JSON for the provided file. Schema required:\n\n" +
          "{\n" +
          '  "id": string,\n' +
          '  "fileName": string,\n' +
          '  "summary": string,\n' +
          '  "key_points": string[],\n' +
          '  "important_lines": string[],\n' +
          '  "api_endpoints": [{method, path, note, example}],\n' +
          '  "html": string\n' +
          "}\n\nKeep HTML simple and include code blocks where relevant." +
          "If you produce a generate_site_manifest function_call, follow up (in a subsequent assistant message) with a generate_flowchart_schema function_call that includes the manifest (or rootModule) as arguments, to request a Mermaid flowchart. If the model can produce the flowchart itself, call generate_flowchart_schema instead of generate_site_manifest.",
      },
      {
        role: "user",
        content: JSON.stringify({
          projectName,
          module: { id: moduleNode.id, title: moduleNode.title },
          file: {
            id: file.id,
            fileName: file.fileName,
            summary: file.summary ?? "",
            relPath: file.relPath ?? "",
          },
          detailLevel,
        }),
      },
    ];
  }

  // parse JSON helper (handles markdown/code fences and stray text)
  function extractJson(text: string) {
    let s = text.trim();
    // strip ```json or ``` wrappers
    s = s
      .replace(/^\s*```(?:json)?\s*/, "")
      .replace(/\s*```\s*$/, "")
      .trim();
    return JSON.parse(s);
  }

  // main recursive walker
  async function processNode(node: ModuleNode, parentPath: string[] = []) {
    // 1) enrich module itself
    try {
      const modPrompt = makeModulePrompt(
        manifest.projectName,
        node,
        parentPath.join(" > ")
      );
      // force text output (so model returns JSON text)
      const resp: any = await callModelWithFunctions(
        modPrompt,
        docFunctions,
        maxTokens,
        true
      );
      const text = (
        resp?.choices?.[0]?.message?.content ??
        resp?.choices?.[0]?.text ??
        ""
      ).toString();
      console.log("Module enrichment response:", text);
      if (!text || text.trim().length === 0) {
        warnings.push(`Empty response for module ${node.id}`);
      } else {
        const parsed = extractJson(text);
        // validate shape lightly
        if (
          parsed &&
          parsed.id &&
          parsed.title &&
          typeof parsed.html === "string"
        ) {
          // update node fields
          node.summary = parsed.summary ?? node.summary ?? "";
          node.description =
            parsed.description ?? node.description ?? node.summary;
          // key points and arrays
          if (Array.isArray(parsed.key_points)) node.files = node.files ?? []; // don't remove files
          // attach key_points, important_lines and api_endpoints into node.meta
          (node as any).key_points =
            parsed.key_points ?? (node as any).key_points ?? [];
          (node as any).important_lines =
            parsed.important_lines ?? (node as any).important_lines ?? [];
          (node as any).api_endpoints =
            parsed.api_endpoints ?? (node as any).api_endpoints ?? [];

          // ensure moduleHtmlMap updated
          manifest.moduleHtmlMap = manifest.moduleHtmlMap ?? {};
          manifest.moduleHtmlMap[node.id] = parsed.html;
        } else {
          warnings.push(
            `Module enrichment returned invalid shape for ${node.id}`
          );
        }
      }
    } catch (err: any) {
      warnings.push(
        `Failed to enrich module ${node.id}: ${String(err?.message ?? err)}`
      );
    }

    // optional: small pause to avoid rate-limit bursts
    await sleep(pauseMs);

    // 2) enrich each file under node (optional - can be heavy)
    if (Array.isArray(node.files) && node.files.length > 0) {
      for (const f of node.files) {
        try {
          const filePrompt = makeFilePrompt(manifest.projectName, node, f);
          const resp: any = await callModelWithFunctions(
            filePrompt,
            docFunctions,
            maxTokens,
            true
          );
          const text = (
            resp?.choices?.[0]?.message?.content ??
            resp?.choices?.[0]?.text ??
            ""
          ).toString();
          if (!text || text.trim().length === 0) {
            warnings.push(`Empty file response for ${f.id}`);
          } else {
            const parsed = extractJson(text);
            if (
              parsed &&
              parsed.id &&
              parsed.fileName &&
              typeof parsed.html === "string"
            ) {
              f.summary = parsed.summary ?? f.summary ?? "";
              f.key_points = parsed.key_points ?? f.key_points ?? [];
              f.important_lines =
                parsed.important_lines ?? f.important_lines ?? [];
              f.api_endpoints = parsed.api_endpoints ?? f.api_endpoints ?? [];
              manifest.moduleHtmlMap[f.id] = parsed.html;
            } else {
              warnings.push(
                `File enrichment returned invalid shape for ${f.id}`
              );
            }
          }
        } catch (err: any) {
          warnings.push(
            `Failed to enrich file ${f.id}: ${String(err?.message ?? err)}`
          );
        }
        await sleep(pauseMs);
      }
    }

    // 3) recurse into children
    for (const child of node.children || []) {
      await processNode(child, [...parentPath, node.title]);
    }
  }

  // Kick off from root
  await processNode(manifest.rootModule, []);

  return { manifest, warnings };
}
