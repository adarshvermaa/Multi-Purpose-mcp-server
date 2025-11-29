// src/services/docService.ts
import path from "path";
import fs from "fs-extra";
import AdmZip from "adm-zip";
import puppeteer from "puppeteer";
import { callModelWithFunctions } from "utils/aiClient";
import { FUNCTIONS_DEF } from "main/chats/schemas/ai/functions";
import { runTool } from "utils/tools";
import { chunkTextPreserveLines } from "utils/chunk";
import { globSync } from "glob";

type FileSnapshot = { relPath: string; absPath?: string; content: string };
type FileSummary = {
  relPath: string; // keep internally for anchors/ids
  fileName?: string; // new: basename only for display
  summary?: string;
  key_points?: string[];
  important_lines?: string[];
  api_endpoints?: Array<{ method?: string; path?: string; note?: string }>;
};

type SubmoduleDoc = {
  name: string; // e.g. "submodule" or "_root"
  files: FileSummary[];
};

type ModuleDoc = {
  moduleName: string; // top-level folder name
  submodules: SubmoduleDoc[]; // immediate subfolders + root bucket
};

const MAX_FILE_BYTES = 200 * 1024;
const CHUNK_SIZE = 7000;
const BATCH_SIZE_DEFAULT = 5;

export async function snapshotDir(root: string): Promise<FileSnapshot[]> {
  const absRoot = path.resolve(process.cwd(), root);
  const pattern = `${root.replace(/\\/g, "/")}/**/*`;
  const matches = globSync(pattern, { nodir: true, dot: true, absolute: true });
  const exclude = new Set([
    "node_modules",
    ".git",
    "dist",
    "build",
    "package-lock.json",
    "migrations",
    "schemas",
    "generated_pdfs",
    "tmp_uploads",
  ]);
  const out: FileSnapshot[] = [];
  for (const abs of matches) {
    const rel = path.relative(absRoot, abs);
    if (rel.split(path.sep).some((p) => exclude.has(p))) continue;
    try {
      const stat = await fs.stat(abs);
      if (stat.size > MAX_FILE_BYTES) {
        const content =
          (await fs.readFile(abs, "utf8")).slice(0, MAX_FILE_BYTES) +
          "\n\n/* ...truncated... */";
        out.push({ relPath: rel, absPath: abs, content });
        continue;
      }
      const content = await fs.readFile(abs, "utf8");
      out.push({ relPath: rel, absPath: abs, content });
    } catch (err) {
      // skip
    }
  }
  return out;
}

/* --- function-call loop for a single chunk ---
   - messages seeded with system + user
   - call model with FUNCTIONS_DEF
   - if function_call returned -> execute runTool (server), append assistant messages with tool result, loop
   - up to maxFunctionCalls, finally parse JSON or fallback to raw text
*/
async function processChunkWithFunctionLoop(
  chunk: string,
  relPath: string,
  maxFunctionCalls = 1
) {
  const system = `You are a concise code documentation assistant. Produce JSON:
{ "summary": "<1-3 sentences>", "key_points": ["..."], "important_lines": ["..."] }.
If you want the server to run helpers (redact/save/extract), call one of the provided functions.`;
  const user = `File: ${relPath}\n\nContent:\n${chunk}\n\nReturn JSON or call a function.`;
  const messages: any[] = [
    { role: "system", content: system },
    { role: "user", content: user },
  ];

  for (let i = 0; i < maxFunctionCalls; i++) {
    const resp: any = await callModelWithFunctions(messages, FUNCTIONS_DEF);
    const choice = resp?.choices?.[0];
    const msg = choice?.message ?? choice ?? {};
    if (msg?.function_call) {
      const fname = msg.function_call.name;
      const fargsRaw =
        typeof msg.function_call.arguments === "string"
          ? msg.function_call.arguments
          : JSON.stringify(msg.function_call.arguments);
      const toolResult = await runTool(fname, fargsRaw);
      messages.push({
        role: "assistant",
        content: `Model requested function ${fname}(${fargsRaw})`,
      });
      messages.push({
        role: "assistant",
        content: `Tool result (${fname}): ${JSON.stringify(toolResult)}`,
      });
      continue;
    }
    const text = msg?.content ?? resp.choices?.[0]?.text ?? "";
    const jsonStart = String(text).indexOf("{");
    const jsonText =
      jsonStart >= 0 ? String(text).slice(jsonStart) : String(text);
    try {
      return JSON.parse(jsonText);
    } catch {
      return {
        summary: String(text).slice(0, 800),
        key_points: [],
        important_lines: [],
      };
    }
  }

  // force final textual reply
  const finalResp: any = await callModelWithFunctions(
    messages,
    FUNCTIONS_DEF,
    800,
    /*forceText*/ true
  );
  const finalText =
    finalResp?.choices?.[0]?.message?.content ??
    finalResp?.choices?.[0]?.text ??
    "";
  try {
    return JSON.parse(String(finalText).slice(String(finalText).indexOf("{")));
  } catch {
    return {
      summary: String(finalText).slice(0, 800),
      key_points: [],
      important_lines: [],
    };
  }
}

// async function processFile(file: FileSnapshot) {
//   const chunks = chunkTextPreserveLines(file.content, CHUNK_SIZE);
//   const chunkResults = [];
//   for (const c of chunks) {
//     const r = await processChunkWithFunctionLoop(c, file.relPath, 5);
//     chunkResults.push(r);
//     await new Promise((r) => setTimeout(r, 200)); // throttle
//   }
//   console.log("chunkResults", chunkResults);
//   return {
//     relPath: file.relPath,
//     summary: chunkResults.map((c) => c.summary ?? "").join("\n\n"),
//     key_points: chunkResults.flatMap((c) => c.key_points ?? []),
//     important_lines: chunkResults.flatMap((c) => c.important_lines ?? []),
//   };
// }

export async function processFile(file: { relPath: string; content: string }) {
  const chunks = chunkTextPreserveLines(file.content, 32768);
  const chunkResults: any[] = [];
  const endpointsCollected: Array<{
    method?: string;
    path?: string;
    note?: string;
  }> = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];

    // 1) existing function loop summarization (your previous function)
    const r = await processChunkWithFunctionLoop(chunk, file.relPath, 5);
    const parsed = r ?? {
      summary: "",
      key_points: [],
      important_lines: [],
    };
    chunkResults.push(parsed);
    // console.log(chunkResults);
    // 2) call server-side tool to extract API endpoints (safe, heuristic)
    try {
      const epRes = await runTool(
        "extract_api_endpoints",
        JSON.stringify({ text: chunk })
      );
      if (epRes?.ok && Array.isArray(epRes.endpoints)) {
        for (const e of epRes.endpoints) {
          // simple dedupe key = method + path
          if (e?.path)
            endpointsCollected.push({
              method: e.method,
              path: e.path,
              note: e.note,
            });
        }
      }
    } catch (err) {
      // ignore extraction errors for robust processing
      console.warn(
        "extract_api_endpoints failed for",
        file.relPath,
        String(err).slice(0, 200)
      );
    }

    // small throttle to avoid bursts
    await new Promise((r) => setTimeout(r, 120));
  }

  // merge chunk outputs into a single file-level summary
  const mergedSummary = chunkResults
    .map((c) => c.summary ?? "")
    .filter(Boolean)
    .join("\n\n");
  const mergedKeyPoints = chunkResults.flatMap((c) => c.key_points ?? []);
  const mergedImportant = chunkResults.flatMap((c) => c.important_lines ?? []);

  // dedupe endpoints by method+path
  const uniqMap = new Map<
    string,
    { method?: string; path?: string; note?: string }
  >();
  for (const e of endpointsCollected) {
    const k = `${String(e.method ?? "").toUpperCase()}::${String(
      e.path ?? ""
    )}`;
    if (!uniqMap.has(k)) uniqMap.set(k, e);
  }
  const apiEndpoints = Array.from(uniqMap.values());
  return {
    relPath: file.relPath,
    fileName: path.basename(file.relPath), // short display name
    summary: mergedSummary,
    key_points: mergedKeyPoints,
    important_lines: mergedImportant,
    api_endpoints: apiEndpoints,
    chunks: chunkResults.length,
  };
}

export async function processFilesInBatches(
  files: FileSnapshot[],
  batchSize = BATCH_SIZE_DEFAULT
) {
  const out: any[] = [];
  for (let i = 0; i < files.length; i += batchSize) {
    const batch = files.slice(i, i + batchSize);
    for (const f of batch) {
      try {
        const doc = await processFile(f);
        console.log(doc);
        out.push(doc);
      } catch (err) {
        out.push({
          relPath: f.relPath,
          summary: "ERROR",
          key_points: [],
          important_lines: [],
        });
      }
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return out;
}
function escapeHtml(s: string) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function safeId(s: string) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
export function buildHtmlForModules(projectName: string, modules: ModuleDoc[]) {
  const now = new Date().toLocaleString();

  // build nested TOC markup
  const toc = modules
    .map((m) => {
      const moduleId = safeId(`module-${m.moduleName}`);
      const subList = m.submodules
        .map((s) => {
          const fileLinks = s.files
            .map((f, idx) => {
              const fid = safeId(
                `module-${m.moduleName}-sub-${s.name}-file-${idx}-${f.relPath}`
              );

              return `<li class="toc-file"><a href="#${fid}">${escapeHtml(
                f.fileName ?? f.relPath.split(/[\\/]/).pop()!
              )}</a></li>`;
            })
            .join("");
          return `<li class="toc-submodule">
                    <details open>
                      <summary>${escapeHtml(
                        s.name === "_root" ? "(root)" : s.name
                      )}</summary>
                      <ul class="toc-files">${fileLinks}</ul>
                    </details>
                  </li>`;
        })
        .join("");
      return `<li class="toc-module">
                <details open>
                  <summary class="module-summary">${escapeHtml(
                    m.moduleName
                  )}</summary>
                  <ul class="submodule-list">${subList}</ul>
                </details>
              </li>`;
    })
    .join("");

  // build content sections
  const sections = modules
    .map((m) =>
      m.submodules
        .map((s) =>
          s.files
            .map((f, idx) => {
              const sectionId = safeId(
                `module-${m.moduleName}-sub-${s.name}-file-${idx}-${f.relPath}`
              );
              const keyPointsHtml = (f.key_points || [])
                .map((kp) => `<li>${escapeHtml(kp)}</li>`)
                .join("");
              const codeHtml = escapeHtml(
                (f.important_lines || []).slice(0, 10).join("\n\n")
              );
              const apiTable =
                f.api_endpoints && f.api_endpoints.length > 0
                  ? `<div class="api-endpoints">
                      <strong>API Endpoints</strong>
                      <table style="width:100%; border-collapse:collapse; margin-top:8px;">
                        <thead>
                          <tr>
                            <th style="text-align:left; padding:6px; border-bottom:1px solid rgba(0,0,0,0.06)">Method</th>
                            <th style="text-align:left; padding:6px; border-bottom:1px solid rgba(0,0,0,0.06)">Path</th>
                            <th style="text-align:left; padding:6px; border-bottom:1px solid rgba(0,0,0,0.06)">Note</th>
                          </tr>
                        </thead>
                        <tbody>
                          ${f.api_endpoints
                            .map(
                              (ep) => `
                            <tr>
                              <td style="padding:6px; vertical-align:top; font-weight:600; color:#064e3b">${escapeHtml(
                                ep.method || ""
                              )}</td>
                              <td style="padding:6px; vertical-align:top">${escapeHtml(
                                ep.path || ""
                              )}</td>
                              <td style="padding:6px; vertical-align:top; color:#6b7280">${escapeHtml(
                                ep.note || ""
                              )}</td>
                            </tr>`
                            )
                            .join("")}
                        </tbody>
                      </table>
                    </div>`
                  : "";

              return `

<section id="${sectionId}" class="doc-section" data-section-id="${sectionId}">
  <div class="section-header">
    <div>
      <h2>${escapeHtml(f.fileName ?? f.relPath.split(/[\\/]/).pop()!)}</h2>
      <div class="meta-small">Module: ${escapeHtml(m.moduleName)} ${
                s.name !== "_root" ? ` / ${escapeHtml(s.name)}` : ""
              }</div>
    </div>
    <a class="anchor-link" href="#${sectionId}">#</a>
  </div>

  <div class="section-body">
    <p class="summary"><strong>Summary:</strong> ${escapeHtml(
      String(f.summary ?? "No summary available.")
    )}</p>

    <div class="kp">
      <strong>Key points</strong>
      <ul>${keyPointsHtml}</ul>
    </div>

    ${apiTable}

    <div class="important">
      <strong>Important lines / snippets</strong>
      <pre class="code-block">${codeHtml}</pre>
    </div>
  </div>
</section>`;
            })
            .join("\n")
        )
        .join("\n")
    )
    .join("\n");

  // final HTML (green gradient theme, sidebar + header) with watermark & scroll fixes
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${escapeHtml(projectName)} — Module Documentation</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;700&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet">
<style>
  :root{
    --g1:#0b6b3a;
    --g2:#9be5b0;
    --card:#ffffff;
    --muted:#55626a;
    --accent:#0b6b3a;
    --max-width:1200px;
    --header-offset:96px; /* used for scroll offset (adjust if your header size changes) */
  }

  html { scroll-behavior:smooth; }
  html,body{height:100%;margin:0;padding:0;background:linear-gradient(180deg, rgba(11,107,58,0.04), rgba(155,229,176,0.02));font-family:Inter,system-ui,Segoe UI,Roboto,Arial;color:#012018}
  body { position: relative; }

  /* watermark background logo */
  .bg-logo {
    position: fixed;
    left: 50%;
    top: 35%;
    transform: translate(-50%, -50%) rotate(-20deg);
    font-size: 96px;
    font-weight: 800;
    color: rgba(1,16,8,0.04);
    pointer-events: none;
    user-select: none;
    z-index: 1;
    letter-spacing: 4px;
  }

  .container{max-width:var(--max-width);margin:28px auto;padding:20px; position: relative; z-index: 2}
  header{display:flex;align-items:center;gap:16px;padding:18px;border-radius:12px;background:linear-gradient(135deg,var(--g1),var(--g2));color:white;box-shadow:0 10px 30px rgba(6,28,18,0.12)}
  header h1{margin:0;font-size:20px}
  header .meta{margin-left:auto;text-align:right;font-size:13px;opacity:0.95}

  .layout{display:flex;gap:20px;margin-top:20px;align-items:flex-start}
  nav.sidebar{width:300px;flex:0 0 300px;background:var(--card);border-radius:10px;padding:14px;box-shadow:0 8px 20px rgba(8,20,12,0.06);height:calc(100vh - 170px);overflow:auto;position:sticky;top:24px}
  nav.sidebar h3{margin:0 0 8px 0}
  nav.sidebar ul{list-style:none;margin:0;padding:0}
  .toc-module{margin:6px 0}
  .module-summary{font-weight:600;color:var(--accent);cursor:pointer}
  .toc-submodule summary{cursor:pointer}
  .toc-files{margin:8px 0 8px 18px;padding:0}
  .toc-file{margin:6px 0}
  .toc-file a{color:#073b28;text-decoration:none}

  main.content{flex:1;min-width:0}
  .doc-section{
    background:var(--card);
    border-radius:8px;
    padding:16px;
    margin-bottom:16px;
    box-shadow:0 6px 18px rgba(10,20,10,0.04);
    page-break-inside:avoid;
    border:1px solid rgba(0,0,0,0.04);

    /* IMPORTANT: allow anchor scrolling offset so section is not hidden under header */
    scroll-margin-top: calc(var(--header-offset) + 16px);
  }
  .section-header{display:flex;align-items:baseline;gap:12px;justify-content:space-between}
  .section-header h2{margin:0;color:var(--g1);font-size:15px}
  .meta-small{font-size:12px;color:var(--muted)}

  .summary{margin-top:10px;color:#083a2a;line-height:1.45}
  .kp ul{margin:8px 0 0 18px;color:var(--muted)}
  .code-block{background:#071612;color:#c9f8df;padding:12px;border-radius:6px;font-family:"JetBrains Mono",monospace;font-size:12px;white-space:pre-wrap;overflow:auto;border:1px solid rgba(255,255,255,0.03)}

  footer{margin-top:30px;text-align:center;color:var(--muted);font-size:13px}

  /* responsive */
  @media (max-width:950px){
    .layout{flex-direction:column}
    nav.sidebar{width:100%;height:auto;position:relative}
  }

  /* print tweaks */
  @media print{
    body{background:115, 230, 199}
    nav.sidebar{display:block;page-break-after:always}
    .doc-section{box-shadow:none;border:none;background:transparent}
    .bg-logo{display:none}
  }

  /* small helper */
  a.anchor-link{color:var(--accent);text-decoration:none;font-size:13px}
</style>
</head>
<body>
  <!-- watermark (background logo) -->
  <div class="bg-logo">Reno FMS</div>

  <div class="container">
    <header>
      <div style="font-weight:700;font-size:20px">📘 ${escapeHtml(
        projectName
      )}</div>
      <div class="meta">Generated: ${escapeHtml(now)} • Modules: ${
    modules.length
  }</div>
    </header>

    <div class="layout">
      <nav class="sidebar" aria-label="Documentation contents">
        <h3>Contents</h3>
        <ul>
          ${toc}
        </ul>
      </nav>

      <main class="content">
        ${sections}
        <footer>Generated by AI docs • ${escapeHtml(projectName)}</footer>
      </main>
    </div>
  </div>

 <script>
  (function () {
    // Wait until DOM is ready
    document.addEventListener("DOMContentLoaded", function () {
      // header offset in px should match --header-offset value in CSS
      const HEADER_OFFSET =
        parseInt(
          getComputedStyle(document.documentElement).getPropertyValue("--header-offset")
        ) || 96;

      // Polyfill for CSS.escape (simple)
      if (typeof CSS === "undefined" || typeof CSS.escape !== "function") {
        window.CSS = window.CSS || {};
        CSS.escape = function (value) {
          return String(value).replace(/([^\w-])/g, function (s) {
            return "\\" + s;
          });
        };
      }

      // Helper to find target element robustly
      function findTargetByIdOrData(id) {
        if (!id) return null;
        // try exact id first
        let el = document.getElementById(id);
        if (el) return el;
        // try data-section-id attribute (we set that on sections)
        el = document.querySelector('[data-section-id="' + CSS.escape(id) + '"]');
        if (el) return el;
        // fallback: try safe-id transformation (same as safeId in server)
        const alt = String(id)
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "");
        el = document.getElementById(alt) || document.querySelector('[data-section-id="' + CSS.escape(alt) + '"]');
        return el;
      }

      // Attach click handlers to sidebar links only
      const sidebar = document.querySelector("nav.sidebar");
      if (!sidebar) return;

      const links = Array.from(sidebar.querySelectorAll('a[href^="#"]'));
      links.forEach((a) => {
        a.addEventListener("click", function (ev) {
          // Only handle left-click + no modifier
          if (ev.button && ev.button !== 0) return;
          if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;

          const href = a.getAttribute("href");
          if (!href || !href.startsWith("#")) return;
          const raw = href.slice(1);
          // decode in case of encoded chars
          const id = decodeURIComponent(raw);

          const target = findTargetByIdOrData(id);
          if (!target) {
            // fallback to default behavior if nothing found
            return;
          }

          ev.preventDefault();

          // compute y position factoring header offset and small margin
          const rect = target.getBoundingClientRect();
          const absoluteY = rect.top + window.scrollY;
          const scrollToY = Math.max(absoluteY - HEADER_OFFSET - 12, 0);

          window.scrollTo({ top: scrollToY, behavior: "smooth" });

          // update URL hash without immediate jump
          try {
            if (history.replaceState) {
              history.replaceState(null, "", "#" + encodeURIComponent(id));
            } else {
              location.hash = id;
            }
          } catch (err) {
            // ignore
          }

          // focus and highlight briefly
          try {
            target.setAttribute("tabindex", "-1");
            target.focus({ preventScroll: true });
            const prev = target.style.boxShadow;
            target.style.transition = "box-shadow 0.25s ease";
            target.style.boxShadow = "0 0 0 6px rgba(11,107,58,0.08)";
            setTimeout(() => {
              target.style.boxShadow = prev || "";
              target.removeAttribute("tabindex");
            }, 900);
          } catch (e) {
            // ignore focus errors on some elements
          }
        });
      });
    });
  })();
</script>
</body>
</html>`;
}

export async function renderPdf(html: string, outPath: string) {
  const browser = await puppeteer.launch({
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: "networkidle2" });
  await page.pdf({
    path: outPath,
    format: "A4",
    printBackground: true,
    margin: { top: "20mm", bottom: "20mm" },
  });
  await browser.close();
}

/* --- top-level helpers exported for controller --- */
export async function generateProjectDocs(opts: {
  root?: string;
  outDir?: string;
  renderPdf?: boolean;
}) {
  const root = opts.root ?? ".";
  const outDir = opts.outDir ?? "generated_pdfs";
  await fs.mkdirp(outDir);
  const snapshots = await snapshotDir(root);
  const docs = await processFilesInBatches(snapshots);
  const summaryPath = path.join(outDir, `${path.basename(root)}.summary.json`);
  await fs.writeFile(summaryPath, JSON.stringify(docs, null, 2), "utf8");
  let pdfPath: string | undefined;
  if (opts.renderPdf ?? true) {
    const html = buildHtmlForModules(path.basename(root), docs);
    pdfPath = path.join(outDir, `${path.basename(root)}-documentation.pdf`);
    await renderPdf(html, pdfPath);
  }
  return {
    summaryPath: path.resolve(summaryPath),
    pdfPath: pdfPath ? path.resolve(pdfPath) : undefined,
  };
}

// Accept a zip path (from multer), extract and run generator
export async function generateFromZipUpload(
  zipPath: string,
  opts: { renderPdf?: boolean; isReturn?: boolean; repoName: string }
) {
  const tmpDir = path.join("tmp_uploads", opts.repoName);
  await fs.mkdirp(tmpDir);
  try {
    const zip = new AdmZip(zipPath);
    zip.extractAllTo(tmpDir, true);
    if (opts.isReturn) {
      return null;
    }

    const res = await generateProjectDocs({
      root: tmpDir,
      outDir: "generated_pdfs",
      renderPdf: opts.renderPdf,
    });
    return res;
  } finally {
    // cleanup uploaded file and tmpDir? Keep or remove as you like:
    await fs.remove(zipPath).catch(() => {});
    // await fs.remove(tmpDir).catch(()=>{}); // optionally remove
  }
}

export function groupFilesIntoModules(
  fileSummaries: FileSummary[]
): ModuleDoc[] {
  const map = new Map<string, Map<string, FileSummary[]>>();

  for (const f of fileSummaries) {
    const parts = f.relPath.split(/[\\/]/).filter(Boolean);
    const moduleName = parts[0] ?? "_root";
    const subName = parts.length > 1 ? parts[1] : "_root";

    if (!map.has(moduleName)) map.set(moduleName, new Map());
    const subMap = map.get(moduleName)!;
    if (!subMap.has(subName)) subMap.set(subName, []);
    subMap.get(subName)!.push(f);
  }

  const modules: ModuleDoc[] = [];
  for (const [moduleName, subMap] of map.entries()) {
    const submodules: SubmoduleDoc[] = [];
    for (const [subName, files] of subMap.entries()) {
      submodules.push({ name: subName, files });
    }
    modules.push({ moduleName, submodules });
  }

  // sort modules and submodules for stable order
  modules.sort((a, b) => a.moduleName.localeCompare(b.moduleName));
  for (const m of modules)
    m.submodules.sort((a, b) => a.name.localeCompare(b.name));

  return modules;
}
export async function generateHtmlFolderForModules(
  projectName: string,
  modules: ModuleDoc[],
  outDir = "generated_pdfs",
  htmlFolderName = "html"
) {
  const htmlRoot = path.resolve(outDir, htmlFolderName);
  await fs.mkdirp(htmlRoot);

  // 1) write overall index (full site)
  const fullHtml = buildHtmlForModules(projectName, modules);
  const mainIndexPath = path.join(htmlRoot, "index.html");
  await fs.writeFile(mainIndexPath, fullHtml, "utf8");

  const createdFiles: string[] = [mainIndexPath];

  // 2) per-module and per-file pages
  for (const mod of modules) {
    const modDirName = safeId(mod.moduleName || "module");
    const modDir = path.join(htmlRoot, modDirName);
    await fs.mkdirp(modDir);

    // module index: render page for this module only
    const moduleHtml = buildHtmlForModules(projectName, [mod]);
    const moduleIndexPath = path.join(modDir, "index.html");
    await fs.writeFile(moduleIndexPath, moduleHtml, "utf8");
    createdFiles.push(moduleIndexPath);

    // submodules
    for (const sub of mod.submodules) {
      const subDirName = safeId(sub.name === "_root" ? "root" : sub.name);
      const subDir = path.join(modDir, subDirName);
      await fs.mkdirp(subDir);

      // each file page
      for (const f of sub.files) {
        // create a tiny ModuleDoc with only this file to produce a clean single-file page
        const singleModule: ModuleDoc = {
          moduleName: mod.moduleName,
          submodules: [{ name: sub.name, files: [f] }],
        };
        const fileHtml = buildHtmlForModules(projectName, [singleModule]);
        // ensure filename safe
        const fileBasename = safeId(f.fileName ?? path.basename(f.relPath));
        // fallback if empty
        const fileNameFinal = fileBasename || `file-${Date.now()}`;
        const filePathHtml = path.join(subDir, `${fileNameFinal}.html`);
        await fs.writeFile(filePathHtml, fileHtml, "utf8");
        createdFiles.push(filePathHtml);
      }
    }
  }

  return {
    ok: true,
    htmlRoot,
    index: mainIndexPath,
    createdFiles,
  };
}
