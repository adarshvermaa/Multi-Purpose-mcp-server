// src/services/docGeneration.service.ts
import fs from "fs-extra";
import { docFunctions } from "main/chats/schemas/ai/functions";
import {
  ModuleNode,
  SiteManifest,
  SiteManifestSchema,
} from "main/chats/schemas/zod/chat.schemas";
import path from "path";
import { callModelWithFunctions } from "utils/aiClient";
import { enrichManifestWithDetails } from "./docGeneration.enrich";
import {
  generateAllModuleFlowcharts,
  // renderMermaidHtml,
} from "./docFlowchart.service";
export function safeId(s: string) {
  return String(s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
export function escapeHtml(s: string) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
function shortHash(s: string) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  }
  return (h >>> 0).toString(16).slice(0, 8);
}

/** Build sidebar markup from root module recursively */
export function buildSidebarMarkup(root: ModuleNode) {
  function renderNode(node: ModuleNode) {
    const childrenHtml = (node.children || []).map(renderNode).join("");

    interface TocFile {
      id: string;
      fileName: string;
    }

    const filesHtml: string =
      (node.files || [])
        .map(
          (f: TocFile) =>
            `<li class="toc-file">
              <a class="toc-link file-link" href="#${escapeHtml(f.id)}">
                📄 ${escapeHtml(f.fileName)}
              </a>
            </li>`
        )
        .join("") || "";

    return `<li class="toc-module">
      <details open>
        <summary class="module-summary">
          <a class="toc-link module-link" href="#${escapeHtml(node.id)}">
            📘 ${escapeHtml(node.title)}
          </a>
        </summary>
        ${filesHtml ? `<ul class="toc-files">${filesHtml}</ul>` : ""}
        ${childrenHtml ? `<ul class="toc-children">${childrenHtml}</ul>` : ""}
      </details>
    </li>`;
  }

  return `<ul class="toc-root">${renderNode(root)}</ul>`;
}

/** Build index.html using a template and manifest */
export function buildIndexHtml(projectName: string, manifest: SiteManifest) {
  const now = escapeHtml(manifest.generatedAt || new Date().toLocaleString());
  const sidebarMarkup = buildSidebarMarkup(manifest.rootModule);

  const fragments: string[] = [];
  function collectFragments(node: ModuleNode) {
    const id = node.id;
    const frag = manifest.moduleHtmlMap[id];
    if (frag) fragments.push(frag);
    if (node.files) {
      for (const f of node.files) {
        const ffrag = manifest.moduleHtmlMap[f.id];
        if (ffrag) fragments.push(ffrag);
      }
    }
    (node.children || []).forEach(collectFragments);
  }
  collectFragments(manifest.rootModule);
  const mainFragments = fragments.join("\n");

  return `<!doctype html>
<html lang="en" data-theme="light">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${escapeHtml(projectName)} — Documentation</title>
  <style>
    :root {
      --header-offset: 96px;
      --g1: #0b6b3a;
      --g2: #9be5b0;
      --muted: #55626a;
      --text-color-light: #012018;
      --bg-color-light: linear-gradient(180deg, rgba(11,107,58,0.04), rgba(155,229,176,0.02));
      --bg-color-dark: #121212;
      --text-color-dark: #e0e0e0;
    }

    html { scroll-behavior: smooth; }

    body {
      font-family: Inter, system-ui, Arial;
      margin: 0;
      background: var(--bg-color-light);
      color: var(--text-color-light);
      transition: background 0.3s, color 0.3s;
    }

    [data-theme="dark"] body {
      background: var(--bg-color-dark);
      color: var(--text-color-dark);
    }

    .bg-logo {
      position: fixed;
      left: 50%;
      top: 35%;
      transform: translate(-50%,-50%) rotate(-20deg);
      font-size: 96px;
      font-weight: 800;
      color: rgba(1,16,8,0.04);
      pointer-events: none;
      z-index: 1;
    }

    .container {
      max-width: 1200px;
      margin: 28px auto;
      padding: 20px;
      position: relative;
      z-index: 2;
    }

    header {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 18px;
      border-radius: 12px;
      background: linear-gradient(135deg,var(--g1),var(--g2));
      color: white;
    }

    header h1 { margin: 0; }

    .toggle-theme {
      margin-left: auto;
      padding: 6px 12px;
      border: none;
      border-radius: 6px;
      background: rgba(255,255,255,0.2);
      color: white;
      cursor: pointer;
      font-size: 13px;
    }

    .layout {
      display: flex;
      gap: 20px;
      margin-top: 20px;
    }

    nav.sidebar ul {
      list-style: none;
      padding-left: 0;
      margin: 0;
    }

   .toc-link {
    text-decoration: none;
    color: var(--text-color-light);
    padding: 4px 0;
    display: inline-block;
    transition: color 0.2s ease;
   }

[data-theme="dark"] .toc-link {
  color: var(--text-color-dark);
}

.toc-link:hover {
  color: var(--g1);
  text-decoration: underline;
}

.module-link {
  font-weight: 600;
  font-size: 14px;
}

.file-link {
  font-size: 13px;
  margin-left: 12px;
  color: #444;
}

[data-theme="dark"] .file-link {
  color: #aaa;
}

.toc-module summary {
  cursor: pointer;
}

.toc-files, .toc-children {
  padding-left: 16px;
  margin: 4px 0 8px;
}

    nav.sidebar {
      width: 300px;
      flex: 0 0 300px;
      background: #fff;
      border-radius: 8px;
      padding: 14px;
      height: calc(100vh - 170px);
      overflow: auto;
      position: sticky;
      top: 24px;
    }

    [data-theme="dark"] nav.sidebar {
      background: #1e1e1e;
      color: var(--text-color-dark);
    }

    main.content { flex: 1; min-width: 0; }

    section, article {
      background: #fff;
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 16px;
      box-shadow: 0 6px 18px rgba(0,0,0,0.04);
      scroll-margin-top: calc(var(--header-offset) + 12px);
    }

    [data-theme="dark"] section, [data-theme="dark"] article {
      background: #1c1c1c;
    }

    pre, code {
      font-family: monospace;
      background: #f5f5f5;
      padding: 8px;
      display: block;
      overflow-x: auto;
      border-radius: 6px;
      margin-top: 10px;
    }

    [data-theme="dark"] pre, [data-theme="dark"] code {
      background: #2b2b2b;
      color: #eee;
    }

    footer {
      margin-top: 30px;
      text-align: center;
      color: var(--muted);
      font-size: 13px;
    }
  </style>
</head>
<body>
  <div class="bg-logo">${escapeHtml(projectName)}</div>
  <div class="container">
    <header>
      <div style="font-weight:700;font-size:20px">📘 ${escapeHtml(
        projectName
      )}</div>
      <button class="toggle-theme" onclick="toggleTheme()">Dark/Light</button>
      <div style="font-size:13px;color:rgba(255,255,255,0.95);margin-left:auto">${now}</div>
    </header>
    <div class="layout">
      <nav class="sidebar" aria-label="Contents">
        <div class="toc">${sidebarMarkup}</div>
      </nav>
      <main class="content">
        ${mainFragments}
        <footer>Generated by AI docs • ${escapeHtml(projectName)}</footer>
      </main>
    </div>
  </div>
  <script>
    (function() {
      const HEADER_OFFSET = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--header-offset')) || 96;
      function findTarget(id) {
        if (!id) return null;
        const byId = document.getElementById(id);
        if (byId) return byId;
        const byData = document.querySelector('[data-section-id="' + (CSS && CSS.escape ? CSS.escape(id) : id) + '"]');
        if (byData) return byData;
        const alt = String(id).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
        return document.getElementById(alt) || document.querySelector('[data-section-id="' + alt + '"]');
      }
      document.querySelectorAll('nav.sidebar a[href^="#"]').forEach(a => {
        a.addEventListener('click', function(ev) {
          if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
          ev.preventDefault();
          const raw = a.getAttribute('href').slice(1);
          let id;
          try { id = decodeURIComponent(raw); } catch { id = raw; }
          const target = findTarget(id);
          if (!target) return;
          const rect = target.getBoundingClientRect();
          const absoluteY = rect.top + window.scrollY;
          const y = Math.max(absoluteY - HEADER_OFFSET - 12, 0);
          window.scrollTo({ top: y, behavior: 'smooth' });
          try { history.replaceState && history.replaceState(null, '', '#' + encodeURIComponent(id)); } catch {}
          target.style.transition = 'box-shadow 0.25s ease';
          const prev = target.style.boxShadow;
          target.style.boxShadow = '0 0 0 6px rgba(11,107,58,0.08)';
          setTimeout(() => target.style.boxShadow = prev || '', 900);
        });
      });
    })();

    function toggleTheme() {
      const html = document.documentElement;
      const current = html.getAttribute('data-theme');
      html.setAttribute('data-theme', current === 'dark' ? 'light' : 'dark');
    }
  </script>
</body>
</html>`;
}

/* ---------------------------
   Model/Function-call helpers
   --------------------------- */

/** parse the common OpenAI response shapes to extract the function call / content */
function parseModelResponse(resp: any) {
  const choice = resp?.choices?.[0];
  if (!choice) return { text: "", function_call: null };
  const message = choice.message ?? choice;
  const text =
    (message?.content &&
      typeof message.content === "string" &&
      message.content) ||
    (choice.text && typeof choice.text === "string" && choice.text) ||
    "";
  const func =
    (message?.function_call && {
      name: message.function_call.name,
      arguments: message.function_call.arguments,
    }) ||
    (choice?.function_call && {
      name: choice.function_call.name,
      arguments: choice.function_call.arguments,
    }) ||
    null;
  return { text, function_call: func };
}
// add near safeId / escapeHtml helpers

/**
 * Normalize a single module node (recursively).
 * - Fills title/id where missing
 * - Ensures files have id/fileName
 * - Collects ids for uniqueness checks (mutates seen set)
 */
export function normalizeModuleNode(
  raw: any,
  seenIds: Set<string>,
  parentPathParts: string[] = []
): ModuleNode {
  const node: any = raw && typeof raw === "object" ? { ...raw } : {};

  // title fallback
  if (!node.title || typeof node.title !== "string" || !node.title.trim()) {
    const derived =
      (raw && (raw.name || raw.moduleName || raw.title)) ||
      (raw && raw.relPath && path.basename(String(raw.relPath))) ||
      "Untitled Module";
    node.title = String(derived).trim();
  }

  // id fallback + uniqueness
  let base = (raw && raw.id) || node.title || "module";
  base = String(base);
  let cand = safeId(base) || safeId(node.title);
  if (!cand || cand.length === 0) {
    cand = `module-${shortHash(node.title + JSON.stringify(raw || ""))}`;
  }
  // attempt to make unique
  let unique = cand;
  let c = 1;
  while (seenIds.has(unique) || !unique) {
    unique = `${cand}-${c++}`;
  }
  node.id = unique;
  seenIds.add(unique);

  // ensure summary/description exist (strings)
  node.summary = typeof node.summary === "string" ? node.summary : "";
  node.description =
    typeof node.description === "string" ? node.description : "";

  // normalize files (ensure required subfields)
  node.files = Array.isArray(node.files)
    ? node.files.map((f: any) => ({ ...(f ?? {}) }))
    : [];
  node.files = node.files.map((f: any) => {
    const file: any = { ...(f ?? {}) };
    // fileName fallback
    if (
      !file.fileName ||
      typeof file.fileName !== "string" ||
      !file.fileName.trim()
    ) {
      file.fileName = file.relPath
        ? path.basename(String(file.relPath))
        : file.name ?? "file";
    }
    // id fallback & uniqueness
    let fbase =
      (file.id && String(file.id)) || `${node.title}-${file.fileName}`;
    let fid = safeId(fbase) || safeId(file.fileName);
    if (!fid || seenIds.has(fid)) {
      fid = safeId(
        `${file.fileName}-${shortHash(
          file.relPath ?? file.fileName ?? node.id
        )}`
      );
    }
    let funique = fid;
    let fc = 1;
    while (seenIds.has(funique) || !funique) {
      funique = `${fid}-${fc++}`;
    }
    file.id = funique;
    seenIds.add(funique);

    // other required fields (default empty)
    file.relPath = typeof file.relPath === "string" ? file.relPath : "";
    file.summary = typeof file.summary === "string" ? file.summary : "";
    file.key_points = Array.isArray(file.key_points)
      ? file.key_points.map(String)
      : [];
    file.important_lines = Array.isArray(file.important_lines)
      ? file.important_lines.map(String)
      : [];
    file.api_endpoints = Array.isArray(file.api_endpoints)
      ? file.api_endpoints.map((ep: any) => ({
          method: ep?.method ? String(ep.method) : "",
          path: ep?.path ? String(ep.path) : "",
          note: ep?.note ? String(ep.note) : "",
        }))
      : [];

    return file;
  });

  // normalize children recursively
  node.children = Array.isArray(node.children)
    ? node.children.map((c: any) => ({ ...(c ?? {}) }))
    : [];
  node.children = node.children.map((child: any) =>
    normalizeModuleNode(child, seenIds, [...parentPathParts, node.id])
  );

  // ensure meta exists
  node.meta = node.meta && typeof node.meta === "object" ? node.meta : {};

  // cast to ModuleNode (the schema will validate later)
  return node as ModuleNode;
}

export function normalizeManifest(rawManifest: any) {
  if (!rawManifest || typeof rawManifest !== "object") {
    throw new Error("Invalid manifest: not an object");
  }
  const projectName =
    typeof rawManifest.projectName === "string" &&
    rawManifest.projectName.trim()
      ? rawManifest.projectName
      : rawManifest.project ?? "Untitled Project";
  const generatedAt = rawManifest.generatedAt ?? new Date().toISOString();

  const rootRaw = rawManifest.rootModule ?? rawManifest.root ?? rawManifest;

  const seen = new Set<string>();
  const rootModule = normalizeModuleNode(rootRaw, seen, []);

  const moduleHtmlMap =
    rawManifest.moduleHtmlMap && typeof rawManifest.moduleHtmlMap === "object"
      ? { ...rawManifest.moduleHtmlMap }
      : {};

  return {
    projectName,
    generatedAt,
    rootModule,
    moduleHtmlMap,
    ids: Array.from(seen),
  } as {
    projectName: string;
    generatedAt: string;
    rootModule: ModuleNode;
    moduleHtmlMap: Record<string, string>;
    ids: string[];
  };
}

export function ensureModuleHtmlMapComplete(normalized: {
  projectName: string;
  generatedAt: string;
  rootModule: ModuleNode;
  moduleHtmlMap: Record<string, string>;
  ids: string[];
}) {
  const warnings: string[] = [];
  const { moduleHtmlMap, rootModule } = normalized;

  // helper to locate a node or file by id
  function findNodeOrFileById(id: string, node: ModuleNode): any | null {
    if (node.id === id) return node;
    for (const f of node.files || []) {
      if (f.id === id) return f;
    }
    for (const c of node.children || []) {
      const r = findNodeOrFileById(id, c);
      if (r) return r;
    }
    return null;
  }

  for (const id of normalized.ids) {
    if (!moduleHtmlMap[id]) {
      const found = findNodeOrFileById(id, rootModule);
      if (found) {
        if ((found as any).fileName) {
          // file fragment
          moduleHtmlMap[id] = `<article id="${escapeHtml(id)}"><h3>${escapeHtml(
            (found as any).fileName
          )}</h3><p>${escapeHtml((found as any).summary || "")}</p></article>`;
          warnings.push(`auto-generated html fragment for file id=${id}`);
        } else {
          // module fragment
          moduleHtmlMap[id] = `<section id="${escapeHtml(id)}"><h2>${escapeHtml(
            (found as any).title || id
          )}</h2><p>${escapeHtml((found as any).summary || "")}</p></section>`;
          warnings.push(`auto-generated html fragment for module id=${id}`);
        }
      } else {
        // fallback generic fragment
        moduleHtmlMap[id] = `<section id="${escapeHtml(id)}"><h2>${escapeHtml(
          id
        )}</h2><p></p></section>`;
        warnings.push(
          `auto-generated generic html fragment for missing id=${id}`
        );
      }
    }
  }

  return warnings;
}
/** Validate + normalize helper: returns validated manifest + warnings */
export function validateAndNormalizeManifest(rawManifest: any) {
  // normalize
  const normalized = normalizeManifest(rawManifest);
  // ensure moduleHtmlMap completeness (fills missing html)
  const warnings = ensureModuleHtmlMapComplete(normalized);

  // build candidate manifest object for validation
  const candidate = {
    projectName: normalized.projectName,
    generatedAt: normalized.generatedAt,
    rootModule: normalized.rootModule,
    moduleHtmlMap: normalized.moduleHtmlMap,
  };

  // validate via Zod (will apply defaults on arrays/strings if any remained undefined)
  const manifest = SiteManifestSchema.parse(candidate);

  return { manifest, warnings };
}

/* ---------------------------
   Service Class
   --------------------------- */

class DocGenerationService {
  public functions = docFunctions;

  /**
   * Ask the model to build a site manifest from a prompt.
   * Returns a validated SiteManifest (throws if invalid).
   */
  public async buildSiteManifestFromPrompt(
    projectName: string,
    prompt: string,
    options: {
      maxDepth?: number;
      maxFilesPerModule?: number;
      verbosity?: "short" | "medium" | "detailed";
    } = {}
  ): Promise<SiteManifest> {
    const messages = [
      {
        role: "system",
        content:
          "You are a documentation generator. Use the provided functions. When producing anchor IDs use the safeId rule: lowercased, non-alphanumeric -> '-', trim leading/trailing '-'. The final response should be a function_call to generate_site_manifest returning a SiteManifest with keys: projectName, generatedAt, rootModule, moduleHtmlMap.",
      },
      {
        role: "user",
        content: `Create documentation site for "${projectName}". ${prompt}`,
      },
    ];

    // 1) ask model to build module tree (single function_call)
    const resp = await callModelWithFunctions(
      messages,
      this.functions,
      32768,
      false
    );

    const parsed = parseModelResponse(resp);
    console.log(parsed);
    if (!parsed.function_call) {
      // model didn't use functions - try to parse text as JSON manifest
      try {
        const maybe = parsed.text ? JSON.parse(parsed.text) : null;
        if (maybe) {
          const { manifest, warnings: _ } = validateAndNormalizeManifest(maybe);
          const { manifest: enrichedManifest, warnings: enrichWarnings } =
            await enrichManifestWithDetails(manifest, {
              detailLevel: "detailed",
              maxTokens: 32768,
              pauseMsBetweenRequests: 200,
            });
          console.log(enrichWarnings);
          //   const manifest = SiteManifestSchema.parse(maybe);
          return enrichedManifest;
        }
      } catch (err) {
        throw new Error(
          "Model did not return a function_call and textual output is not a valid manifest."
        );
      }
    }

    // parse function call args (function_call.arguments may be stringified JSON)
    let argsObj: any = {};
    try {
      const rawArgs =
        parsed.function_call.arguments ?? parsed.function_call.arguments ?? "";
      argsObj = typeof rawArgs === "string" ? JSON.parse(rawArgs) : rawArgs;
    } catch (err) {
      throw new Error(
        "Failed to parse function_call arguments from model: " + String(err)
      );
    }

    // If the function name is generate_site_manifest we expect manifest shape
    if (parsed.function_call.name === "generate_site_manifest") {
      // normalize first (will fill missing ids/titles and moduleHtmlMap entries)
      const normalized = normalizeManifest(argsObj);
      // now validate with Zod (throws if something still invalid)
      const { manifest, warnings: _ } =
        validateAndNormalizeManifest(normalized);

      this.ensureUniqueIds(manifest); // optional but safe

      const { manifest: enrichedManifest, warnings: enrichWarnings } =
        await enrichManifestWithDetails(manifest, {
          detailLevel: "detailed",
          maxTokens: 32768,
          pauseMsBetweenRequests: 200,
        });
      console.log(enrichWarnings);
      return enrichedManifest;
      //   const manifest = SiteManifestSchema.parse(normalized);
    }

    // If the model returned a module tree first, but not manifest, expect rootModule
    if (
      parsed.function_call &&
      parsed.function_call.name === "build_module_tree_from_prompt"
    ) {
      // The model requested the server to run build_module_tree_from_prompt.
      // The function args contain { projectName, prompt, options }.
      let buildArgs: any = {};
      try {
        buildArgs =
          typeof parsed.function_call.arguments === "string"
            ? JSON.parse(parsed.function_call.arguments)
            : parsed.function_call.arguments ?? {};
      } catch (err) {
        throw new Error(
          "Failed to parse build_module_tree_from_prompt arguments: " +
            String(err)
        );
      }

      // Now execute the tool: ask the model (forced text) to output the module tree JSON (rootModule).
      // We force textual output (function_call: "none") so the assistant returns plain JSON.
      const builderMessages = [
        {
          role: "system",
          content:
            "You are a documentation generator. Produce a JSON object `rootModule` representing the nested module tree. " +
            "Output only valid JSON (no explanation), exactly matching the ModuleNode shape: each node must include `id` (use safeId rule) and `title`, optional `summary`, `description`, optional `files` (with `id` and `fileName`), and optional `children` (array). Make ids unique.",
        },
        {
          role: "user",
          content: `Build a module tree for project "${String(
            buildArgs.projectName ?? "Project"
          )}".\n\nPrompt:\n${String(
            buildArgs.prompt ?? ""
          )}\n\nOptions: ${JSON.stringify(
            buildArgs.options ?? {}
          )}\n\nReturn a JSON object with a single top-level key "rootModule".`,
        },
      ];

      // Force textual JSON response. (forceText=true sets function_call:"none" in your wrapper.)
      const builderResp = await callModelWithFunctions(
        builderMessages,
        this.functions,
        10000,
        true
      );

      // parse builderResp for textual content
      const parsedBuilder = parseModelResponse(builderResp);
      const textOut = parsedBuilder.text?.trim?.() ?? "";

      if (!textOut) {
        throw new Error(
          "Builder model returned no text when executing build_module_tree_from_prompt."
        );
      }

      // Try to extract JSON object from textOut (allow if model wraps in code blocks)
      let jsonText = textOut;
      // strip surrounding ```json ``` or ``` blocks if present
      jsonText = jsonText
        .replace(/^\s*```(?:json)?\s*/, "")
        .replace(/\s*```\s*$/, "")
        .trim();

      let treeObj: any;
      try {
        treeObj = JSON.parse(jsonText);
        console.log("Parsed builder output:", treeObj);
      } catch (err) {
        // give a helpful error including sample output for debugging
        throw new Error(
          "Failed to parse JSON from builder model output. Raw output preview:\n" +
            (textOut.length > 2000 ? textOut.slice(0, 2000) + "..." : textOut)
        );
      }

      // builder should return { rootModule: { ... } } or rootModule directly
      const rawRootModule = treeObj.rootModule ?? treeObj;

      // Normalize the returned raw module tree (fills missing ids/titles, file ids, ensures moduleHtmlMap entries later)
      const normalizedManifestCandidate = normalizeManifest({
        projectName:
          buildArgs.projectName ?? buildArgs.project ?? "Untitled Project",
        generatedAt: new Date().toISOString(),
        rootModule: rawRootModule,
        moduleHtmlMap: treeObj.moduleHtmlMap ?? {},
      });

      // Validate with Zod (throws if still invalid)
      const { manifest, warnings: _ } = validateAndNormalizeManifest(
        normalizedManifestCandidate
      );
      this.ensureUniqueIds(manifest);

      const { manifest: enrichedManifest, warnings: enrichWarnings } =
        await enrichManifestWithDetails(manifest, {
          detailLevel: "detailed",
          maxTokens: 32768,
          pauseMsBetweenRequests: 200,
        });
      console.log(enrichWarnings);
      return enrichedManifest;
      // const manifest = SiteManifestSchema.parse(normalizedManifestCandidate);

      // ensure unique ids (redundant but safe)

      // At this point we have a validated manifest but moduleHtmlMap may be missing fragments.
      // Next step in your pipeline: ask model to generate HTML fragments for each module id and file id,
      // or you may let the model produce the site manifest in one go. For now, return the manifest so the caller can proceed.
      // return manifest;
    }
    // Add this block into buildSiteManifestFromPrompt, after argsObj is parsed

    throw new Error(
      "Unexpected model function_call: " + parsed.function_call.name
    );
  }

  /** Ensure ids across manifest are unique; throws if collision (server can choose to sanitize) */
  ensureUniqueIds(manifest: SiteManifest) {
    const seen = new Set<string>();
    function walk(node: ModuleNode) {
      if (seen.has(node.id)) throw new Error("Duplicate module id: " + node.id);
      seen.add(node.id);
      for (const f of node.files || []) {
        if (seen.has(f.id)) throw new Error("Duplicate file id: " + f.id);
        seen.add(f.id);
      }
      for (const c of node.children || []) walk(c);
    }
    walk(manifest.rootModule);
  }

  /**
   * Write a folder with index.html + per-module file fragments.
   * Returns { htmlRoot, index, createdFiles }
   */
  public async writeManifestHtmlFolder(
    manifest: SiteManifest,
    outDir = "generated_html",
    htmlFolderName = "html"
  ) {
    const htmlRoot = path.resolve(outDir, htmlFolderName);
    await fs.mkdirp(htmlRoot);

    // 1) write index.html
    const indexHtml = buildIndexHtml(manifest.projectName, manifest);
    const indexPath = path.join(htmlRoot, "index.html");
    await fs.writeFile(indexPath, indexHtml, "utf8");
    const createdFiles = [indexPath];

    // 2) iterate module tree and write fragments for each module and file
    function ensureDir(p: string) {
      return fs.mkdirp(p);
    }

    async function writeNode(
      node: ModuleNode,
      modulePathSegments: string[] = []
    ) {
      const moduleDirName = safeId(node.title || node.id || "module");
      const modDir = path.join(htmlRoot, ...modulePathSegments, moduleDirName);
      await ensureDir(modDir);
      // write module fragment if present
      const frag = manifest.moduleHtmlMap[node.id];
      if (frag) {
        const fname = path.join(modDir, "index.html");
        await fs.writeFile(fname, frag, "utf8");
        createdFiles.push(fname);
      }
      // write files
      for (const f of node.files || []) {
        const fileNameSafe = safeId(f.fileName || f.id);
        const fpath = path.join(modDir, `${fileNameSafe}.html`);
        const ffrag =
          manifest.moduleHtmlMap[f.id] ||
          `<article id="${escapeHtml(f.id)}"><h3>${escapeHtml(
            f.fileName
          )}</h3><p>${escapeHtml(f.summary ?? "")}</p></article>`;
        await fs.writeFile(fpath, ffrag, "utf8");
        createdFiles.push(fpath);
      }
      // recurse children
      for (const c of node.children || []) {
        await writeNode(c, [...modulePathSegments, moduleDirName]);
      }
    }

    await writeNode(manifest.rootModule, []);
    return { ok: true, htmlRoot, index: indexPath, createdFiles };
  }

  /**
   * High level: build manifest from prompt and write the html folder.
   */
  public async generateDocsFromPrompt(
    projectName: string,
    prompt: string,
    opts: { outDir?: string; htmlFolderName?: string; modelOptions?: any } = {}
  ) {
    const manifest = await this.buildSiteManifestFromPrompt(
      projectName,
      prompt,
      opts.modelOptions || {}
    );
    const flowchart = await generateAllModuleFlowcharts(
      manifest,
      opts.outDir || "generated_flowcharts",
      opts.htmlFolderName || "chartsmodule_workflow.html"
    );
    console.log("Flowchart HTML saved at:", flowchart.path);
    const out = await this.writeManifestHtmlFolder(
      manifest,
      opts.outDir || "generated_html",
      opts.htmlFolderName || "html"
    );
    return { manifestPath: null, manifest, ...out };
  }
}

export default new DocGenerationService();
