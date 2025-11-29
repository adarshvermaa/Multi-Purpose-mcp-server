// prettier, modern mermaid flowchart helpers
import fs from "fs-extra";
import path from "path";
import { ModuleNode, SiteManifest } from "main/chats/schemas/zod/chat.schemas";
import { escapeHtml, safeId } from "./create.documents";

/**
 * Build a visually improved mermaid flowchart string for a whole manifest.
 * - Uses classDefs and labels to create a nicer palette and readable nodes.
 * - Adds small badges for counts and API counts.
 * - Produces click handlers for nodes to call goToModule.
 */
// export function moduleToMermaidFromManifest(
//   manifest: SiteManifest,
//   opts: { direction?: "TD" | "LR"; maxLabelLen?: number } = {}
// ): string {
//   const direction = opts.direction ?? "LR";
//   const maxLabelLen = opts.maxLabelLen ?? 60;

//   function short(s = "") {
//     const t = String(s).replace(/\s+/g, " ").trim();
//     return t.length > maxLabelLen ? t.slice(0, maxLabelLen - 1) + "…" : t;
//   }

//   const root = manifest.rootModule;
//   const lines: string[] = [
//     `flowchart ${direction}`,
//     `%% prettier mermaid generated`,
//   ];

//   // Theme-alike CSS via classDefs
//   lines.push(
//     `
// %% node classes and styles
// classDef root fill:#0b6b3a,stroke:#064829,color:#ffffff,stroke-width:2px;
// classDef module fill:#f6fff3,stroke:#a8e6c1,color:#08321a,stroke-width:1.4px;
// classDef layer fill:#fff8f3,stroke:#ffd6a5,color:#5a2e00,stroke-width:1.2px;
// classDef file fill:#ffffff,stroke:#d7e7ff,color:#02386a,stroke-width:1px;
// classDef api fill:#fff7fb,stroke:#f6c7e1,color:#59123b,stroke-width:1px;
// classDef subgraphTitle fill:#e9f7ef,stroke:#cde9d1,color:#0b6b3a,stroke-width:0.8px;
// `.trim()
//   );

//   // Nice root node label with counts
//   const rootId = safeId(root.id);
//   const rootLabel = `${escapeHtml(short(root.title))}\\n(${
//     (root.children || []).length
//   } children · ${(root.files || []).length} files)`;
//   lines.push(`${rootId}["${rootLabel}"]`);
//   lines.push(`class ${rootId} root;`);

//   // Helper to push node with a class and an optional subtitle
//   function pushNode(id: string, title: string, cls: string) {
//     const label = escapeHtml(short(title));
//     lines.push(`${id}["${label}"]`);
//     lines.push(`class ${id} ${cls};`);
//   }

//   // Walk immediate children and group where appropriate
//   for (const child of root.children || []) {
//     const childId = safeId(child.id);
//     const childLabel = `${escapeHtml(short(child.title))}\\n(${
//       (child.children || []).length
//     } ch · ${(child.files || []).length} f · ${
//       (child.api_endpoints || []).length
//     } apis)`;

//     if ((child.children || []).length > 0) {
//       // create a subgraph for this child and its descendants
//       const subName = `sg_${childId}`;
//       // mermaid subgraph title (subgraph syntax: subgraph id["title"])
//       lines.push(`subgraph ${subName}["${escapeHtml(child.title)}"]`);
//       lines.push(`${childId}["${escapeHtml(short(child.title))}"]`);
//       lines.push(`class ${childId} module;`);

//       // add grandchildren & files inside subgraph
//       (function walkInside(n: ModuleNode) {
//         for (const grand of n.children || []) {
//           const gid = safeId(grand.id);
//           const glabel = `${escapeHtml(short(grand.title))}\\n(${
//             (grand.children || []).length
//           } ch · ${(grand.files || []).length} f · ${
//             (grand.api_endpoints || []).length
//           } apis)`;
//           lines.push(`${gid}["${glabel}"]`);
//           lines.push(`class ${gid} layer;`);
//           lines.push(`${safeId(n.id)} --> ${gid}`);
//           // files under grand
//           for (const f of grand.files || []) {
//             const fid = safeId(f.id);
//             const flabel = `📄 ${escapeHtml(short(f.fileName || f.id))}`;
//             lines.push(`${fid}["${flabel}"]`);
//             lines.push(`class ${fid} file;`);
//             lines.push(`${gid} --> ${fid}`);
//           }
//           // recurse deeper
//           walkInside(grand);
//         }

//         // files attached directly to n (if any)
//         for (const f of n.files || []) {
//           const fid = safeId(f.id);
//           const flabel = `📄 ${escapeHtml(short(f.fileName || f.id))}`;
//           lines.push(`${fid}["${flabel}"]`);
//           lines.push(`class ${fid} file;`);
//           lines.push(`${safeId(n.id)} --> ${fid}`);
//         }
//       })(child);

//       lines.push("end"); // close subgraph
//       // connect root to child root node
//       lines.push(`${rootId} --> ${childId}`);
//     } else {
//       // simple node (no children)
//       lines.push(`${childId}["${childLabel}"]`);
//       lines.push(`class ${childId} module;`);
//       // connect root -> child
//       lines.push(`${rootId} --> ${childId}`);
//       // files under child
//       for (const f of child.files || []) {
//         const fid = safeId(f.id);
//         const flabel = `📄 ${escapeHtml(short(f.fileName || f.id))}`;
//         lines.push(`${fid}["${flabel}"]`);
//         lines.push(`class ${fid} file;`);
//         lines.push(`${childId} --> ${fid}`);
//       }
//     }
//   }

//   // root-level files
//   for (const f of root.files || []) {
//     const fid = safeId(f.id);
//     const flabel = `📄 ${escapeHtml(short(f.fileName || f.id))}`;
//     lines.push(`${fid}["${flabel}"]`);
//     lines.push(`class ${fid} file;`);
//     lines.push(`${rootId} --> ${fid}`);
//   }

//   // Add API nodes as small badges connected to parent nodes (if any)
//   function attachApiBadges(n: ModuleNode) {
//     for (const p of n.api_endpoints || []) {
//       const pid = safeId(`${n.id}-api-${p.path}-${p.method}`).slice(0, 64);
//       const text = `${escapeHtml(p.method)} ${escapeHtml(p.path)}`;
//       // small node with class api
//       lines.push(`${pid}["${escapeHtml(text)}"]`);
//       lines.push(`class ${pid} api;`);
//       lines.push(`${safeId(n.id)} --> ${pid}`);
//     }
//     for (const c of n.children || []) attachApiBadges(c);
//   }
//   attachApiBadges(root);

//   // collect node ids (for click directives)
//   const ids = new Set<string>();
//   const idExtractRegex = /^\s*([a-z0-9\-_]+)\[/i;
//   for (const l of lines) {
//     const m = l.match(idExtractRegex);
//     if (m && m[1]) ids.add(m[1]);
//   }
//   if (ids.size > 0) {
//     lines.push("");
//     for (const id of ids) {
//       lines.push(`click ${id} goToModule`);
//     }
//   }

//   // optional legend (small visual guide)
//   lines.push("");
//   lines.push(`%% Legend`);
//   lines.push(`subgraph legend["Legend"]`);
//   lines.push(`leg_root["Root"]`);
//   lines.push(`leg_mod["Module"]`);
//   lines.push(`leg_layer["Layer"]`);
//   lines.push(`leg_file["File"]`);
//   lines.push(`leg_api["API Endpoint"]`);
//   lines.push(
//     `class leg_root root; class leg_mod module; class leg_layer layer; class leg_file file; class leg_api api;`
//   );
//   lines.push("end");

//   return lines.join("\n");
// }

/**
 * Render Mermaid flowchart code as a standalone HTML page with nicer styling and zoom controls.
 */
/**
 * Full-viewport Mermaid HTML renderer (fills entire window)
 * Replaces previous renderMermaidHtml — drop-in replacement.
 */
// export function renderMermaidHtml(
//   mermaidCode: string,
//   projectName: string,
//   options: { theme?: string; startOnLoad?: boolean } = {}
// ) {
//   const theme = options.theme ?? "base";
//   const startOnLoad = options.startOnLoad ?? true;
//   const title =
//     typeof escapeHtml === "function"
//       ? escapeHtml(projectName)
//       : String(projectName || "Flowchart");

//   const themeVariables = {
//     primaryColor: "#0b6b3a",
//     primaryBorder: "#064829",
//     primaryTextColor: "#ffffff",
//     secondaryColor: "#f6fff3",
//     tertiaryColor: "#fff8f3",
//     lineColor: "#9bd3a3",
//     edgeLabelBackground: "#ffffff",
//     fontFamily: "Inter, system-ui, Arial, Helvetica",
//   };

//   return `<!doctype html>
// <html lang="en">
// <head>
//   <meta charset="utf-8"/>
//   <meta name="viewport" content="width=device-width,initial-scale=1"/>
//   <title>${title} — Flowchart</title>
//   <style>
//     /* Full-screen layout */
//     html, body {
//       height: 100%;
//       width: 100%;
//       margin: 0;
//       padding: 0;
//       font-family: Inter, system-ui, Arial, Helvetica;
//       background: linear-gradient(180deg,#f3fbf3,#ffffff);
//       color: #0b2e1a;
//       overflow: hidden; /* keep the flowchart panel contained */
//     }

//     /* Header overlay (controls) */
//     .header {
//       position: absolute;
//       top: 12px;
//       left: 16px;
//       right: 16px;
//       display: flex;
//       align-items: center;
//       gap: 12px;
//       pointer-events: none; /* so clicks hit the diagram except for buttons */
//       z-index: 40;
//     }
//     .header h1 { margin: 0; font-size: 14px; background: rgba(255,255,255,0.6); padding:6px 8px; border-radius:8px; pointer-events: auto; }
//     .controls { margin-left:auto; display:flex; gap:8px; pointer-events: auto; align-items:center; }

//     /* Buttons */
//     button.btn {
//       background: rgba(255,255,255,0.9);
//       border: 1px solid rgba(8,32,16,0.06);
//       padding: 6px 8px;
//       border-radius: 8px;
//       cursor: pointer;
//       box-shadow: 0 2px 6px rgba(2,6,23,0.06);
//       font-size: 13px;
//     }

//     /* Panel fills entire viewport */
//     .panel {
//       position: absolute;
//       inset: 0;
//       padding: 0;
//       margin: 0;
//       overflow: auto; /* allow panning/scroll if needed */
//       display: flex;
//       align-items: center;
//       justify-content: center;
//       -webkit-font-smoothing:antialiased;
//     }

//     /* Mermaid container: allow SVG to control size; we make it responsive */
//     .mermaid {
//       display: block;
//       margin-top: 20px;
//       box-shadow: 0 4px 12px rgba(2,6,23,0.1);
//       border-radius: 12px;
//       width: 100%;
//       height: 100%;
//       min-width: 600px; /* safe minimum */
//       min-height: 400px; /* safe minimum */
//       touch-action: none; /* we handle touch gestures */
//       background: white;
//     }
//     .mermaid svg {
//       display: block;
//       width: 100%;
//       height: 100%;
//       max-width: none;
//       max-height: none;
//     }

//     .zoom-indicator { font-size: 13px; color: #506660; margin-left: 8px; background: rgba(255,255,255,0.85); padding:4px 8px; border-radius:8px; }

//     /* small helper for legend if added inline */
//     .legend { position: absolute; left:16px; bottom:16px; background: rgba(255,255,255,0.9); padding:8px 12px; border-radius:8px; font-size:12px; color:#556; z-index:30; }
//   </style>
// </head>
// <body>
//   <div class="header" aria-hidden>
//     <h1>Module Flowchart — ${title}</h1>
//     <div class="controls" role="group" aria-label="Flowchart controls">
//       <button class="btn" id="zoom-in" title="Zoom in">+</button>
//       <button class="btn" id="zoom-out" title="Zoom out">−</button>
//       <button class="btn" id="fit" title="Fit to viewport">Fit</button>
//       <div class="zoom-indicator" id="zoom-value">100%</div>
//     </div>
//   </div>

//   <div class="panel">
//     <div class="mermaid" id="mermaid-diagram">
// ${mermaidCode}
//     </div>
//   </div>

//   <div class="legend" id="flow-legend">Click nodes to jump to docs • Wheel to zoom • Drag to pan • Pinch to zoom</div>

//   <script type="module">
//     import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs';

//     mermaid.initialize({
//       startOnLoad: ${startOnLoad},
//       theme: '${theme}',
//       themeVariables: ${JSON.stringify(themeVariables)},
//       flowchart: { useMaxWidth: false },
//       securityLevel: 'loose'
//     });

//     const container = document.getElementById('mermaid-diagram');
//     const zoomValueEl = document.getElementById('zoom-value');
//     let scale = 1;
//     let translateX = 0;
//     let translateY = 0;
//     const MIN_SCALE = 0.25;
//     const MAX_SCALE = 4;

//     function updateZoomUI() {
//       zoomValueEl.textContent = Math.round(scale * 100) + '%';
//     }

//     function getSvgAndG() {
//       const svg = container.querySelector('svg');
//       if (!svg) return { svg: null, g: null };
//       // Mermaid often places <g class="output"> or similar; find the first <g> child holding the diagram.
//       const g = svg.querySelector('g') || svg;
//       return { svg, g };
//     }

//     function setTransform() {
//       const { svg, g } = getSvgAndG();
//       if (!svg || !g) return;
//       // Apply translate and scale on the inner group for best results
//       try {
//         g.setAttribute('transform', 'translate(' + translateX + ',' + translateY + ') scale(' + scale + ')');
//       } catch (e) {
//         // fallback: style transform on svg
//         svg.style.transformOrigin = '0 0';
//         svg.style.transform = 'translate(' + translateX + 'px,' + translateY + 'px) scale(' + scale + ')';
//       }
//     }

//     function screenToSvgPoint(svg, clientX, clientY) {
//       // Convert screen coordinates to SVG coordinates (taking viewBox into account)
//       const pt = svg.createSVGPoint();
//       pt.x = clientX;
//       pt.y = clientY;
//       const ctm = svg.getScreenCTM();
//       if (!ctm) return { x: clientX, y: clientY };
//       const inv = ctm.inverse();
//       const globalPt = pt.matrixTransform(inv);
//       return { x: globalPt.x, y: globalPt.y };
//     }

//     // Zoom about a screen point (cursor) keeping that point visually stable
//     function zoomAboutPoint(deltaScale, clientX, clientY) {
//       const { svg } = getSvgAndG();
//       if (!svg) {
//         // simple zoom fallback
//         scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale * deltaScale));
//         setTransform();
//         updateZoomUI();
//         return;
//       }
//       // Current svg-space point under cursor
//       const before = screenToSvgPoint(svg, clientX, clientY);
//       const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale * deltaScale));
//       // compute how translate must change so that 'before' stays at same screen coords
//       // screenPosition = (translate + scale * svgPos)
//       // newTranslate = screenPosition - newScale * svgPos
//       const screenRect = svg.getBoundingClientRect();
//       const screenX = clientX - screenRect.left;
//       const screenY = clientY - screenRect.top;

//       // Derive current screenPosition:
//       // screenPos = translate + scale * svgPos
//       // so translate = screenPos - scale * svgPos
//       const currentTranslateX = translateX;
//       const currentTranslateY = translateY;

//       // desired newTranslate = screenPos - newScale * svgPos
//       const newTranslateX = screenX - newScale * before.x;
//       const newTranslateY = screenY - newScale * before.y;

//       // But currentTranslate might not equal screenX - scale*before.x if container was different;
//       // We'll compute delta to apply
//       translateX += (newTranslateX - (screenX - scale * before.x));
//       translateY += (newTranslateY - (screenY - scale * before.y));

//       scale = newScale;
//       setTransform();
//       updateZoomUI();
//     }

//     // Fit to both width and height (maintain aspect ratio) and center
//     function fitToViewport() {
//       const { svg } = getSvgAndG();
//       if (!svg) return;
//       try {
//         const bbox = svg.getBBox();
//         if (!bbox.width || !bbox.height) {
//           scale = 1;
//           translateX = 0;
//           translateY = 0;
//           setTransform();
//           updateZoomUI();
//           return;
//         }
//         // compute available container size (account for small margins)
//         const cw = Math.max(320, container.clientWidth - 24);
//         const ch = Math.max(240, container.clientHeight - 24);
//         // scale to fit both dimensions
//         const scaleX = cw / bbox.width;
//         const scaleY = ch / bbox.height;
//         const newScale = Math.min(scaleX, scaleY);
//         // constrain scale
//         scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, newScale));
//         // center: we want svg content centered in container
//         // translateX = (cw - bbox.width * scale) / 2 - bbox.x * scale
//         translateX = (container.clientWidth - bbox.width * scale) / 2 - bbox.x * scale;
//         translateY = (container.clientHeight - bbox.height * scale) / 2 - bbox.y * scale;
//         // apply a gentle clamp for huge translations
//         setTransform();
//         updateZoomUI();
//       } catch (e) {
//         console.warn('fitToViewport failed', e);
//       }
//     }

//     // Button handlers
//     document.getElementById('zoom-in').addEventListener('click', () => {
//       const factor = 1.15;
//       const rect = container.getBoundingClientRect();
//       zoomAboutPoint(scale * factor / scale, rect.left + rect.width / 2, rect.top + rect.height / 2);
//     });
//     document.getElementById('zoom-out').addEventListener('click', () => {
//       const factor = 1 / 1.15;
//       const rect = container.getBoundingClientRect();
//       zoomAboutPoint(scale * factor / scale, rect.left + rect.width / 2, rect.top + rect.height / 2);
//     });
//     document.getElementById('fit').addEventListener('click', () => {
//       fitToViewport();
//     });

//     // Wheel -> zoom (when pointer over container). No modifier required.
//     container.addEventListener('wheel', (ev) => {
//       ev.preventDefault();
//       // deltaY positive means scroll down -> zoom out
//       const delta = ev.deltaY;
//       const zoomFactor = delta > 0 ? 0.9 : 1.12;
//       zoomAboutPoint(scale * zoomFactor / scale, ev.clientX, ev.clientY);
//     }, { passive: false });

//     // Drag (pointer) to pan
//     let isPanning = false;
//     let panStart = { x: 0, y: 0 };
//     let translateStart = { x: 0, y: 0 };

//     container.addEventListener('pointerdown', (ev) => {
//       // don't start pan on right-click
//       if (ev.button !== 0) return;
//       isPanning = true;
//       panStart = { x: ev.clientX, y: ev.clientY };
//       translateStart = { x: translateX, y: translateY };
//       container.setPointerCapture(ev.pointerId);
//     });

//     container.addEventListener('pointermove', (ev) => {
//       if (!isPanning) return;
//       const dx = ev.clientX - panStart.x;
//       const dy = ev.clientY - panStart.y;
//       translateX = translateStart.x + dx;
//       translateY = translateStart.y + dy;
//       setTransform();
//     });

//     container.addEventListener('pointerup', (ev) => {
//       if (!isPanning) return;
//       isPanning = false;
//       try { container.releasePointerCapture(ev.pointerId); } catch (e) {}
//     });
//     container.addEventListener('pointercancel', () => { isPanning = false; });

//     // Touch pinch-to-zoom support
//     let lastTouchDist = 0;
//     let lastTouchMid = null;
//     container.addEventListener('touchstart', (ev) => {
//       if (ev.touches && ev.touches.length === 2) {
//         ev.preventDefault();
//         const t0 = ev.touches[0];
//         const t1 = ev.touches[1];
//         const dx = t1.clientX - t0.clientX;
//         const dy = t1.clientY - t0.clientY;
//         lastTouchDist = Math.hypot(dx, dy);
//         lastTouchMid = { x: (t0.clientX + t1.clientX) / 2, y: (t0.clientY + t1.clientY) / 2 };
//       }
//     }, { passive: false });

//     container.addEventListener('touchmove', (ev) => {
//       if (ev.touches && ev.touches.length === 2 && lastTouchDist > 0) {
//         ev.preventDefault();
//         const t0 = ev.touches[0];
//         const t1 = ev.touches[1];
//         const dx = t1.clientX - t0.clientX;
//         const dy = t1.clientY - t0.clientY;
//         const dist = Math.hypot(dx, dy);
//         const mid = { x: (t0.clientX + t1.clientX) / 2, y: (t0.clientY + t1.clientY) / 2 };
//         const scaleFactor = dist / lastTouchDist;
//         zoomAboutPoint(scale * scaleFactor / scale, mid.x, mid.y);
//         lastTouchDist = dist;
//         lastTouchMid = mid;
//       }
//     }, { passive: false });

//     container.addEventListener('touchend', (ev) => {
//       if (!ev.touches || ev.touches.length < 2) {
//         lastTouchDist = 0;
//         lastTouchMid = null;
//       }
//     });

//     // When mermaid finishes rendering, the DOM inside container changes.
//     // Use MutationObserver to detect the SVG and run an initial fit.
//     const obs = new MutationObserver((mutations) => {
//       const svg = container.querySelector('svg');
//       if (svg) {
//         // style adjustments
//         svg.style.display = 'block';
//         svg.style.width = '100%';
//         svg.style.height = '100%';
//         svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
//         // reset transform state
//         scale = 1;
//         translateX = 0;
//         translateY = 0;
//         // initial fit
//         setTimeout(() => fitToViewport(), 60);
//         obs.disconnect();
//       }
//     });

//     obs.observe(container, { childList: true, subtree: true });

//     // fallback if rendered synchronously
//     setTimeout(() => {
//       if (container.querySelector('svg')) fitToViewport();
//     }, 400);

//     // goToModule helper for mermaid click directives (unchanged)
//     window.goToModule = function(id) {
//       try {
//         if (!id) return;
//         // try to find element in parent (if embedded) else current document
//         const doc = (window.parent && window.parent !== window && window.parent.document) ? window.parent.document : document;
//         const target = doc.getElementById(id) || doc.querySelector('[data-section-id=\"' + id + '\"]');
//         const root = doc.documentElement;
//         const headerOffsetStr = getComputedStyle(root).getPropertyValue('--header-offset') || '96';
//         const HEADER_OFFSET = parseInt(headerOffsetStr, 10) || 96;
//         if (target) {
//           const rect = target.getBoundingClientRect();
//           const scrollTop = (doc.defaultView && doc.defaultView.pageYOffset) || window.scrollY || 0;
//           const absoluteY = rect.top + scrollTop;
//           const y = Math.max(absoluteY - HEADER_OFFSET - 12, 0);
//           const win = (doc.defaultView && doc.defaultView) || window;
//           win.scrollTo({ top: y, behavior: 'smooth' });
//           const prev = target.style.boxShadow;
//           target.style.boxShadow = '0 0 0 6px rgba(11,107,58,0.08)';
//           setTimeout(() => target.style.boxShadow = prev || '', 900);
//         } else {
//           try { history.replaceState && history.replaceState(null, '', '#' + encodeURIComponent(id)); } catch (e) {}
//         }
//       } catch (err) {
//         console.warn('goToModule error', err);
//       }
//     };
//   </script>
// </body>
// </html>`;
// }

// src/services/docFlowchart.cytoscape.service.ts
/*
  Cytoscape-based flowchart generator for module-based documentation.
  - Generates an interactive HTML file (self-contained) that renders the manifest
    using Cytoscape.js with many UX features: zoom, pan, fit, layout switching,
    search, export PNG, node click -> jump to docs (goToModule), file-aggregation
    and a simple summary modal for aggregated files.

  Usage (from existing doc generation pipeline):
    import { generateCytoscapeHtmlFromManifest } from './docFlowchart.cytoscape.service';
    await generateCytoscapeHtmlFromManifest(manifest, 'generated_html', 'cyto_flow.html');

  This file intentionally DOES NOT modify your existing HTML generation and
  uses the helper functions `safeId` and `escapeHtml` from your docGeneration.service.ts.
*/

// src/services/docFlowchart.cytoscape.service.ts
/*
  Cytoscape-based flowchart generator for module-based documentation.
  - Generates an interactive HTML file (self-contained) that renders the manifest
    using Cytoscape.js with many UX features: zoom, pan, layout switching,
    search, export PNG, node click -> jump to docs (goToModule), file-aggregation
    and a right-hand detail panel that shows *all* keys & values from the manifest
    (summary, description, key_points, important_lines, api_endpoints, meta, files).

  Usage (from existing doc generation pipeline):
    import { generateCytoscapeHtmlFromManifest } from './docFlowchart.cytoscape.service';
    await generateCytoscapeHtmlFromManifest(manifest, 'generated_html', 'cyto_flow.html');

  This file intentionally DOES NOT modify your existing HTML generation and
  uses the helper functions `safeId` and `escapeHtml` from your docGeneration.service.ts.
*/

// export function moduleTreeToCytoscapeElements(
//   root: ModuleNode,
//   options: { maxFilesPerModule?: number } = {}
// ) {
//   const maxFiles = options.maxFilesPerModule ?? 8;
//   const elements: Array<any> = [];

//   function addModuleNode(node: ModuleNode) {
//     const id = safeId(node.id);
//     elements.push({
//       data: {
//         id,
//         label: node.title || node.id,
//         type: "module",
//         targetId: node.id,
//         title: node.title || "",
//         summary: node.summary || "",
//         description: node.description || "",
//         key_points: Array.isArray((node as any).key_points)
//           ? (node as any).key_points
//           : [],
//         important_lines: Array.isArray((node as any).important_lines)
//           ? (node as any).important_lines
//           : [],
//         api_endpoints: Array.isArray((node as any).api_endpoints)
//           ? (node as any).api_endpoints
//           : [],
//         meta: node.meta || {},
//         files_count: (node.files || []).length,
//       },
//     });

//     // files handling: include full file objects for detail panel
//     const files = node.files || [];
//     if (files.length > 0) {
//       if (files.length <= maxFiles) {
//         for (const f of files) {
//           const fid = safeId(f.id);
//           elements.push({
//             data: {
//               id: fid,
//               label: "📄 " + (f.fileName || f.id),
//               type: "file",
//               targetId: f.id,
//               fileName: f.fileName || "",
//               summary: f.summary || "",
//               relPath: f.relPath || "",
//               key_points: Array.isArray(f.key_points) ? f.key_points : [],
//               important_lines: Array.isArray(f.important_lines)
//                 ? f.important_lines
//                 : [],
//               api_endpoints: Array.isArray(f.api_endpoints)
//                 ? f.api_endpoints
//                 : [],
//             },
//           });
//           elements.push({
//             data: { id: `${id}___${fid}__edge`, source: id, target: fid },
//           });
//         }
//       } else {
//         // aggregated summary node
//         const sumId = `${id}-files-summary`;
//         const fileList = files.map((f: any) => ({
//           id: safeId(f.id),
//           origId: f.id,
//           fileName: f.fileName,
//           relPath: f.relPath,
//         }));
//         elements.push({
//           data: {
//             id: sumId,
//             label: `📄 ${files.length} files`,
//             type: "summary",
//             targetId: null,
//             parentModule: id,
//             __files: fileList,
//           },
//         });
//         elements.push({
//           data: { id: `${id}___${sumId}__edge`, source: id, target: sumId },
//         });
//       }
//     }

//     // children modules
//     for (const c of node.children || []) {
//       const childId = safeId(c.id);
//       // add edge linking parent -> child; ensure child node will be added by recursion
//       elements.push({
//         data: {
//           id: `${id}--to--${childId}__edge`,
//           source: id,
//           target: childId,
//         },
//       });
//       addModuleNode(c);
//     }
//   }

//   addModuleNode(root);

//   // de-duplicate by data.id
//   const seen = new Set<string>();
//   const unique: Array<any> = [];
//   for (const el of elements) {
//     const did = el && el.data && el.data.id ? el.data.id : JSON.stringify(el);
//     if (!seen.has(did)) {
//       seen.add(did);
//       unique.push(el);
//     }
//   }

//   return unique;
// }

// export async function generateCytoscapeHtmlFromManifest(
//   manifest: SiteManifest,
//   outDir = "generated_html",
//   fileName = "cyto_flow.html",
//   options: { maxFilesPerModule?: number } = {}
// ) {
//   const htmlRoot = path.resolve(outDir);
//   await fs.mkdirp(htmlRoot);

//   const elements = moduleTreeToCytoscapeElements(manifest.rootModule, {
//     maxFilesPerModule: options.maxFilesPerModule,
//   });

//   const html = renderCytoscapeHtml(
//     JSON.stringify(elements),
//     manifest.projectName,
//     {
//       theme: "light",
//     }
//   );

//   const filePath = path.join(htmlRoot, fileName);
//   await fs.writeFile(filePath, html, "utf8");
//   return { ok: true, path: filePath };
// }

// // Corrected generateCytoscapeHtmlFromManifest + renderCytoscapeHtml

// export function renderCytoscapeHtml(
//   elementsJson: string,
//   projectName: string,
//   opts: { theme?: string } = {}
// ): string {
//   const title =
//     typeof escapeHtml === "function"
//       ? escapeHtml(projectName)
//       : projectName || "Flowchart";

//   return `<!doctype html>
// <html lang="en">
// <head>
//   <meta charset="utf-8" />
//   <meta name="viewport" content="width=device-width,initial-scale=1" />
//   <title>${title} — Module Graph</title>
//   <style>
//     :root { --panel-gap: 12px; }
//     html,body { height:100%; margin:0; font-family: Inter, system-ui, Arial; background: linear-gradient(180deg,#f7fbf7,#ffffff); }
//     .topbar { position: absolute; left:12px; right:12px; top:12px; display:flex; gap:8px; align-items:center; z-index:60; }
//     .topbar .title { padding:8px 10px; background:rgba(255,255,255,0.98); border-radius:10px; font-weight:700; box-shadow:0 6px 20px rgba(2,6,12,0.06); }
//     .controls { margin-left:auto; display:flex; gap:8px; align-items:center; }
//     .btn { background:white; border:1px solid rgba(0,0,0,0.06); padding:6px 10px; border-radius:8px; cursor:pointer; }
//     .search { padding:8px 10px; border-radius:8px; border:1px solid rgba(0,0,0,0.08); min-width:260px; }

//     /* layout: cy on left, details on right */
//     .workspace { position:absolute; inset:64px 12px 12px 12px; display:flex; gap:var(--panel-gap); }
//     #cy { flex:1 1 auto; border-radius:12px; background: rgba(255,255,255,0.96); box-shadow: 0 12px 40px rgba(2,6,12,0.06); overflow:hidden; position:relative; }
//     #detail-panel { width:360px; flex:0 0 360px; background: #fff; border-radius:12px; box-shadow: 0 12px 40px rgba(2,6,12,0.08); padding:14px; overflow:auto; }

//     .detail-header { display:flex; gap:8px; align-items:center; }
//     .detail-header h2 { margin:0; font-size:16px; }
//     .badge { background:#eef7ee; color:#0b6b3a; padding:6px 8px; border-radius:8px; font-size:13px; }

//     .section { margin-top:12px; }
//     .section h4 { margin:0 0 8px 0; font-size:13px; }
//     .list { display:flex; flex-direction:column; gap:6px; }
//     .file-item { padding:8px; border-radius:8px; background:#f6fff6; cursor:pointer; }
//     .code { font-family: monospace; background:#f3f7f3; padding:8px; border-radius:8px; overflow:auto; }

//     .legend { position:absolute; left:18px; bottom:18px; background:rgba(255,255,255,0.95); padding:8px 12px; border-radius:8px; font-size:13px; z-index:35; }
//     .modal { display:none; }

//     @media (max-width: 900px) {
//       #detail-panel { display:none; }
//     }
//   </style>
// </head>
// <body>
//   <div class="topbar" role="toolbar">
//     <div class="title">📘 ${title} — Module Graph</div>
//     <div class="controls">
//       <input id="search" class="search" placeholder="Search modules, files, endpoints..." />
//       <select id="layout" class="btn">
//         <option value="breadthfirst">Hierarchical</option>
//         <option value="cose">Force</option>
//         <option value="concentric">Concentric</option>
//         <option value="grid">Grid</option>
//         <option value="circle">Circle</option>
//       </select>
//       <button class="btn" id="zoom-in">Zoom +</button>
//       <button class="btn" id="zoom-out">Zoom −</button>
//       <button class="btn" id="fit">Fit</button>
//       <button class="btn" id="export-png">Export PNG</button>
//     </div>
//   </div>

//   <div class="workspace">
//     <div id="cy"></div>
//     <aside id="detail-panel" aria-hidden="true">
//       <div class="detail-header">
//         <h2 id="detail-title">Select a node</h2>
//         <div id="detail-badge" class="badge"> </div>
//       </div>
//       <div id="detail-summary" class="section"></div>
//       <div id="detail-description" class="section"></div>
//       <div id="detail-keypoints" class="section"></div>
//       <div id="detail-important" class="section"></div>
//       <div id="detail-api" class="section"></div>
//       <div id="detail-files" class="section"></div>
//       <div id="detail-meta" class="section"></div>
//       <div style="margin-top:12px;text-align:right;"><button id="detail-close" class="btn">Close</button></div>
//     </aside>
//   </div>

//   <div class="legend">Module = rounded node • File = document node • Summary = aggregated files (click to open)</div>

//   <!-- Cytoscape from CDN -->
//   <script src="https://unpkg.com/cytoscape@3.24.0/dist/cytoscape.min.js"></script>

//   <script>
//     const elements = ${elementsJson};

//     function applyStyles() {
//       return [
//         { selector: 'node', style: { 'label': 'data(label)', 'text-valign': 'center', 'text-halign': 'center', 'font-size': 12, 'text-wrap': 'wrap', 'text-max-width': 150 } },
//         { selector: 'node[type="module"]', style: { 'shape': 'roundrectangle', 'background-color': '#0b6b3a', 'color': '#fff', 'text-outline-width': 0, 'padding': '10px', 'background-opacity': 1 } },
//         { selector: 'node[type="file"]', style: { 'shape': 'roundrectangle', 'background-color': '#ffffff', 'border-width': 1, 'border-color': '#dfeee0', 'color': '#062916', 'padding': '6px' } },
//         { selector: 'node[type="summary"]', style: { 'shape': 'roundrectangle', 'background-color': '#fff7e6', 'border-style': 'dashed', 'border-color': '#f0c86a', 'color': '#5a3b00', 'padding': '8px' } },
//         { selector: 'edge', style: { 'curve-style': 'bezier', 'target-arrow-shape': 'none', 'line-color': '#cfe9d0', 'width': 2 } },
//         { selector: '.highlight', style: { 'overlay-color': '#ffd97a', 'overlay-opacity': 0.4 } }
//       ];
//     }

//     const cy = cytoscape({
//       container: document.getElementById('cy'),
//       elements: elements,
//       style: applyStyles(),
//       layout: { name: 'breadthfirst', fit: true, padding: 30 },
//       wheelSensitivity: 0.15,
//       minZoom: 0.2,
//       maxZoom: 4
//     });

//     // helper to populate detail panel with full key/values
//     function renderDetail(data) {
//       document.getElementById('detail-title').textContent = data.title || data.label || data.id || '';
//       document.getElementById('detail-badge').textContent = (data.type || '').toUpperCase();

//       const summary = document.getElementById('detail-summary');
//       summary.innerHTML = data.summary ? '<h4>Summary</h4><div>' + escapeHtml(data.summary) + '</div>' : '';

//       const desc = document.getElementById('detail-description');
//       desc.innerHTML = data.description ? '<h4>Description</h4><div class=\"code\">' + escapeHtml(data.description) + '</div>' : '';

//       const kp = document.getElementById('detail-keypoints');
//       kp.innerHTML = (data.key_points && data.key_points.length) ? '<h4>Key points</h4><ul>' + data.key_points.map(p => '<li>' + escapeHtml(p) + '</li>').join('') + '</ul>' : '';

//       const imp = document.getElementById('detail-important');
//       imp.innerHTML = (data.important_lines && data.important_lines.length) ? '<h4>Important lines</h4><div class=\"code\">' + escapeHtml(data.important_lines.join('\\n')) + '</div>' : '';

//       const api = document.getElementById('detail-api');
//       api.innerHTML = (data.api_endpoints && data.api_endpoints.length) ? '<h4>API endpoints</h4><div class=\"list\">' + data.api_endpoints.map(ep => '<div style=\"padding:6px;background:#fff; border-radius:6px;border:1px solid #eef9ee\"><strong>' + escapeHtml(ep.method) + '</strong> <code>' + escapeHtml(ep.path) + '</code><div style=\"font-size:12px;color:#445;padding-top:4px\">' + escapeHtml(ep.note || '') + '</div></div>').join('') + '</div>' : '';

//       const files = document.getElementById('detail-files');
//       if (data.files_count) {
//         const fEls = cy.nodes().filter(n => n.data('parentModule') === data.id);
//         if (fEls.length) {
//           files.innerHTML = '<h4>Files</h4><div class=\"list\">' + fEls.map(n => '<div class=\"file-item\" data-id=\"' + escapeHtml(n.data('targetId')||n.id()) + '\">' + escapeHtml(n.data('fileName')||n.data('label')||n.id()) + '</div>').join('') + '</div>';
//         } else if (data.__files && data.__files.length) {
//           files.innerHTML = '<h4>Files</h4><div class=\"list\">' + data.__files.map(f => '<div class=\"file-item\" data-id=\"' + escapeHtml(f.origId||f.id) + '\">' + escapeHtml(f.fileName||f.id) + '</div>').join('') + '</div>';
//         } else {
//           files.innerHTML = '<h4>Files</h4><div>' + data.files_count + ' files</div>';
//         }
//       } else {
//         files.innerHTML = '';
//       }

//       const meta = document.getElementById('detail-meta');
//       if (data.meta && Object.keys(data.meta).length) {
//         meta.innerHTML = '<h4>Meta</h4><pre class=\"code\">' + escapeHtml(JSON.stringify(data.meta, null, 2)) + '</pre>';
//       } else {
//         meta.innerHTML = '';
//       }

//       document.querySelectorAll('.file-item').forEach(el => {
//         el.addEventListener('click', () => {
//           const id = el.getAttribute('data-id');
//           if (window.goToModule) window.goToModule(id);
//         });
//       });

//       document.getElementById('detail-panel').setAttribute('aria-hidden', 'false');
//     }

//     // marshall data on node tap
//     cy.on('tap', 'node', function(evt) {
//       const node = evt.target;
//       const type = node.data('type');

//       if (type === 'summary') {
//         const files = node.data('__files') || [];
//         renderDetail({ title: node.data('label'), label: node.data('label'), type: 'summary', __files: files, files_count: files.length, id: node.id() });
//         return;
//       }

//       const payload = Object.assign({}, node.data());
//       payload.key_points = payload.key_points || [];
//       payload.important_lines = payload.important_lines || [];
//       payload.api_endpoints = payload.api_endpoints || [];

//       renderDetail(payload);

//       if (payload.targetId && payload.type !== 'summary') {
//         if (window.goToModule) {
//           try { window.goToModule(payload.targetId); } catch (e) {}
//         }
//       }
//     });

//     // UI controls
//     document.getElementById('zoom-in').addEventListener('click', () => cy.zoom({ level: Math.min(cy.zoom() * 1.2, cy.maxZoom()) }));
//     document.getElementById('zoom-out').addEventListener('click', () => cy.zoom({ level: Math.max(cy.zoom() / 1.2, cy.minZoom()) }));
//     document.getElementById('fit').addEventListener('click', () => cy.fit(40));

//     document.getElementById('export-png').addEventListener('click', () => {
//       const png = cy.png({ full: true, scale: 2 });
//       const a = document.createElement('a');
//       a.href = png;
//       a.download = (document.title || 'graph') + '.png';
//       a.click();
//     });

//     // layout switcher
//     document.getElementById('layout').addEventListener('change', (ev) => {
//       const name = ev.target.value;
//       const opts = { name };
//       if (name === 'breadthfirst') opts['directed'] = true;
//       if (name === 'cose') opts['idealEdgeLength'] = 50;
//       cy.layout(opts).run();
//     });

//     // search
//     const searchInput = document.getElementById('search');
//     let searchTimeout = null;
//     searchInput.addEventListener('input', (ev) => {
//       clearTimeout(searchTimeout);
//       searchTimeout = setTimeout(() => {
//         const q = ev.target.value.trim().toLowerCase();
//         cy.nodes().removeClass('highlight');
//         if (!q) { cy.nodes().style('opacity', 1); return; }
//         const match = cy.nodes().filter(n => (n.data('label') || '').toLowerCase().includes(q) || (n.data('title')||'').toLowerCase().includes(q));
//         cy.nodes().style('opacity', 0.12);
//         match.style('opacity', 1);
//         match.addClass('highlight');
//         if (match.length) cy.fit(match, 40);
//       }, 180);
//     });

//     // keyboard: +/- for zoom; f for fit; esc to close detail
//     window.addEventListener('keydown', (ev) => {
//       if (ev.key === '+') cy.zoom({ level: Math.min(cy.zoom() * 1.15, cy.maxZoom()) });
//       if (ev.key === '-') cy.zoom({ level: Math.max(cy.zoom() / 1.15, cy.minZoom()) });
//       if (ev.key === 'f') cy.fit(50);
//       if (ev.key === 'Escape') document.getElementById('detail-panel').setAttribute('aria-hidden', 'true');
//     });

//     document.getElementById('detail-close').addEventListener('click', () => {
//       document.getElementById('detail-panel').setAttribute('aria-hidden', 'true');
//     });

//     function escapeHtml(s) {
//       if (!s && s !== 0) return '';
//       return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
//     }

//     cy.ready(() => {
//       setTimeout(() => cy.fit(40), 80);
//     });

//     window._cy = cy;

//     window.goToModule = window.goToModule || function(id) {
//       try {
//         const doc = (window.parent && window.parent !== window && window.parent.document) ? window.parent.document : document;
//         const target = doc.getElementById(id) || doc.querySelector('[data-section-id=\"' + id + '\"]');
//         const root = doc.documentElement;
//         const headerOffsetStr = (doc && doc.defaultView) ? (getComputedStyle(root).getPropertyValue('--header-offset') || '96') : '96';
//         const HEADER_OFFSET = parseInt(headerOffsetStr, 10) || 96;
//         if (target) {
//           const rect = target.getBoundingClientRect();
//           const scrollTop = (doc.defaultView && doc.defaultView.pageYOffset) || window.scrollY || 0;
//           const absoluteY = rect.top + scrollTop;
//           const y = Math.max(absoluteY - HEADER_OFFSET - 12, 0);
//           const win = (doc.defaultView && doc.defaultView) || window;
//           win.scrollTo({ top: y, behavior: 'smooth' });
//           const prev = target.style.boxShadow;
//           target.style.boxShadow = '0 0 0 6px rgba(11,107,58,0.08)';
//           setTimeout(() => target.style.boxShadow = prev || '', 900);
//         } else {
//           try { history.replaceState && history.replaceState(null, '', '#' + encodeURIComponent(id)); } catch (e) {}
//         }
//       } catch (err) { console.warn('goToModule error', err); }
//     };
//   </script>
// </body>
// </html>`;
// }

// src/services/docFlowchart.cytoscape.service.ts
/*
  Cytoscape-based flowchart generator for module-based documentation.
  - Generates an interactive HTML file (self-contained) that renders the manifest
    using Cytoscape.js with many UX features: zoom, pan, layout switching,
    search, export PNG, node click -> jump to docs (goToModule), file-aggregation
    and a right-hand detail panel that shows *all* keys & values from the manifest
    (summary, description, key_points, important_lines, api_endpoints, meta, files).

  Updates (2025-09-26):
  - Fixed node label truncation by increasing text-wrap width and ensuring nodes
    expand properly to show multi-line labels.
  - Added a top-left logo button that toggles the right-hand detail drawer open/closed.
  - The drawer toggles with a smooth flex transition so the graph area expands
    when the drawer is closed and shrinks when opened — no changes required to
    your existing index.html besides linking to the generated file.

  Usage (from existing doc generation pipeline):
    import { generateCytoscapeHtmlFromManifest } from './docFlowchart.cytoscape.service';
    await generateCytoscapeHtmlFromManifest(manifest, 'generated_html', 'cyto_flow.html');

  This file intentionally DOES NOT modify your existing HTML generation and
  uses the helper functions `safeId` and `escapeHtml` from your docGeneration.service.ts.
*/

export function moduleTreeToCytoscapeElements(
  root: ModuleNode,
  options: { maxFilesPerModule?: number } = {}
) {
  const maxFiles = options.maxFilesPerModule ?? 8;
  const elements: Array<any> = [];

  function addModuleNode(node: ModuleNode) {
    const id = safeId(node.id);
    elements.push({
      data: {
        id,
        label: node.title || node.id,
        type: "module",
        targetId: node.id,
        title: node.title || "",
        summary: node.summary || "",
        description: node.description || "",
        key_points: Array.isArray((node as any).key_points)
          ? (node as any).key_points
          : [],
        important_lines: Array.isArray((node as any).important_lines)
          ? (node as any).important_lines
          : [],
        api_endpoints: Array.isArray((node as any).api_endpoints)
          ? (node as any).api_endpoints
          : [],
        meta: node.meta || {},
        files_count: (node.files || []).length,
      },
    });

    // files handling: include full file objects for detail panel
    const files = node.files || [];
    if (files.length > 0) {
      if (files.length <= maxFiles) {
        for (const f of files) {
          const fid = safeId(f.id);
          elements.push({
            data: {
              id: fid,
              label: "📄 " + (f.fileName || f.id),
              type: "file",
              targetId: f.id,
              fileName: f.fileName || "",
              summary: f.summary || "",
              relPath: f.relPath || "",
              key_points: Array.isArray(f.key_points) ? f.key_points : [],
              important_lines: Array.isArray(f.important_lines)
                ? f.important_lines
                : [],
              api_endpoints: Array.isArray(f.api_endpoints)
                ? f.api_endpoints
                : [],
            },
          });
          elements.push({
            data: { id: `${id}___${fid}__edge`, source: id, target: fid },
          });
        }
      } else {
        // aggregated summary node
        const sumId = `${id}-files-summary`;
        const fileList = files.map((f: any) => ({
          id: safeId(f.id),
          origId: f.id,
          fileName: f.fileName,
          relPath: f.relPath,
        }));
        elements.push({
          data: {
            id: sumId,
            label: `📄 ${files.length} files`,
            type: "summary",
            targetId: null,
            parentModule: id,
            __files: fileList,
          },
        });
        elements.push({
          data: { id: `${id}___${sumId}__edge`, source: id, target: sumId },
        });
      }
    }

    // children modules
    for (const c of node.children || []) {
      const childId = safeId(c.id);
      // add edge linking parent -> child; ensure child node will be added by recursion
      elements.push({
        data: {
          id: `${id}--to--${childId}__edge`,
          source: id,
          target: childId,
        },
      });
      addModuleNode(c);
    }
  }

  addModuleNode(root);

  // de-duplicate by data.id
  const seen = new Set<string>();
  const unique: Array<any> = [];
  for (const el of elements) {
    const did = el && el.data && el.data.id ? el.data.id : JSON.stringify(el);
    if (!seen.has(did)) {
      seen.add(did);
      unique.push(el);
    }
  }

  return unique;
}
export function renderCytoscapeHtml(
  elementsJson: string,
  projectName: string,
  opts: { theme?: string } = {}
): string {
  const title =
    typeof escapeHtml === "function"
      ? escapeHtml(projectName)
      : projectName || "Flowchart";

  // NOTE: only ${title} and ${elementsJson} are intentionally interpolated here.
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${title} — Module Graph</title>
  <style>
    :root { --panel-gap: 12px; }
    html,body { height:100%; margin:0; font-family: Inter, system-ui, Arial; background: linear-gradient(180deg,#f7fbf7,#ffffff); }
    .topbar { position: absolute; left:12px; right:12px; top:12px; display:flex; gap:8px; align-items:center; z-index:60; }
    .topbar .title { padding:8px 10px; background:rgba(255,255,255,0.98); border-radius:10px; font-weight:700; box-shadow:0 6px 20px rgba(2,6,12,0.06); }
    .controls { margin-left:auto; display:flex; gap:8px; align-items:center; }
    .btn { background:white; border:1px solid rgba(0,0,0,0.06); padding:6px 10px; border-radius:8px; cursor:pointer; }
    .search { padding:8px 10px; border-radius:8px; border:1px solid rgba(0,0,0,0.08); min-width:260px; }

    /* layout: cy on left, details on right */
    .workspace { position:absolute; inset:64px 12px 12px 12px; display:flex; gap:var(--panel-gap); }
    #cy { flex:1 1 auto; border-radius:12px; background: rgba(255,255,255,0.96); box-shadow: 0 12px 40px rgba(2,6,12,0.06); overflow:hidden; position:relative; transition: flex-basis 240ms ease; }
    #detail-panel { flex: 0 0 360px; width:360px; background: #fff; border-radius:12px; box-shadow: 0 12px 40px rgba(2,6,12,0.08); padding:14px; overflow:auto; transition: flex-basis 240ms ease, width 240ms ease, padding 200ms ease; }
    #detail-panel.closed { flex: 0 0 0; width: 0; padding: 0; overflow: hidden; }

    .detail-header { display:flex; gap:8px; align-items:center; }
    .detail-header h2 { margin:0; font-size:16px; }
    .badge { background:#eef7ee; color:#0b6b3a; padding:6px 8px; border-radius:8px; font-size:13px; }

    .section { margin-top:12px; }
    .section h4 { margin:0 0 8px 0; font-size:13px; }
    .list { display:flex; flex-direction:column; gap:6px; }
    .file-item { padding:8px; border-radius:8px; background:#f6fff6; cursor:pointer; }
    .code { font-family: monospace; background:#f3f7f3; padding:8px; border-radius:8px; overflow:auto; }

    .legend { position:absolute; left:18px; bottom:18px; background:rgba(255,255,255,0.95); padding:8px 12px; border-radius:8px; font-size:13px; z-index:35; }

    .logo-btn { background: transparent; border: none; font-size: 18px; display: inline-flex; align-items: center; justify-content: center; padding: 6px; border-radius:8px; cursor:pointer; }

    @media (max-width: 900px) {
      #detail-panel { display:none; }
    }
  </style>
</head>
<body>
  <div class="topbar" role="toolbar">
    <button id="toggle-detail" class="logo-btn" title="Toggle details">📘</button>
    <div class="title">${title} — Module Graph</div>
    <div class="controls">
      <input id="search" class="search" placeholder="Search modules, files, endpoints..." />
      <select id="layout" class="btn">
        <option value="breadthfirst">Hierarchical</option>
        <option value="cose">Force</option>
        <option value="concentric">Concentric</option>
        <option value="grid">Grid</option>
        <option value="circle">Circle</option>
      </select>
      <button class="btn" id="zoom-in">Zoom +</button>
      <button class="btn" id="zoom-out">Zoom −</button>
      <button class="btn" id="fit">Fit</button>
      <button class="btn" id="export-png">Export PNG</button>
    </div>
  </div>

  <div class="workspace">
    <div id="cy"></div>
    <aside id="detail-panel" aria-hidden="true">
      <div class="detail-header">
        <h2 id="detail-title">Select a node</h2>
        <div id="detail-badge" class="badge"> </div>
      </div>
      <div id="detail-summary" class="section"></div>
      <div id="detail-description" class="section"></div>
      <div id="detail-keypoints" class="section"></div>
      <div id="detail-important" class="section"></div>
      <div id="detail-api" class="section"></div>
      <div id="detail-files" class="section"></div>
      <div id="detail-meta" class="section"></div>
      <div style="margin-top:12px;text-align:right;"><button id="detail-close" class="btn">Close</button></div>
    </aside>
  </div>

  <div class="legend">Module = rounded node • File = document node • Summary = aggregated files (click to open)</div>

  <!-- Cytoscape from CDN -->
  <script src="https://unpkg.com/cytoscape@3.24.0/dist/cytoscape.min.js"></script>

  <script>
    const elements = ${elementsJson};

    function applyStyles() {
      return [
        { selector: 'node', style: { 'label': 'data(label)', 'text-valign': 'center', 'text-halign': 'center', 'font-size': 13, 'text-wrap': 'wrap', 'text-max-width': 260 } },
        { selector: 'node[type="module"]', style: { 'shape': 'roundrectangle', 'background-color': '#0b6b3a', 'color': '#fff', 'text-outline-width': 0, 'padding': '12px', 'text-wrap': 'wrap', 'text-max-width': 260, 'width': 'label', 'height': 'label' } },
        { selector: 'node[type="file"]', style: { 'shape': 'roundrectangle', 'background-color': '#ffffff', 'border-width': 1, 'border-color': '#dfeee0', 'color': '#062916', 'padding': '6px', 'text-wrap': 'wrap', 'text-max-width': 180 } },
        { selector: 'node[type="summary"]', style: { 'shape': 'roundrectangle', 'background-color': '#fff7e6', 'border-style': 'dashed', 'border-color': '#f0c86a', 'color': '#5a3b00', 'padding': '8px', 'text-wrap': 'wrap', 'text-max-width': 160 } },
        { selector: 'edge', style: { 'curve-style': 'bezier', 'target-arrow-shape': 'none', 'line-color': '#cfe9d0', 'width': 2 } },
        { selector: '.highlight', style: { 'overlay-color': '#ffd97a', 'overlay-opacity': 0.4 } }
      ];
    }

    const cy = cytoscape({
      container: document.getElementById('cy'),
      elements: elements,
      style: applyStyles(),
      layout: { name: 'breadthfirst', fit: true, padding: 30 },
      wheelSensitivity: 0.15,
      minZoom: 0.2,
      maxZoom: 4
    });

    // helper to populate detail panel with full key/values
    function renderDetail(data) {
      document.getElementById('detail-title').textContent = data.title || data.label || data.id || '';
      document.getElementById('detail-badge').textContent = (data.type || '').toUpperCase();

      const summary = document.getElementById('detail-summary');
      summary.innerHTML = data.summary ? '<h4>Summary</h4><div>' + escapeHtml(data.summary) + '</div>' : '';

      const desc = document.getElementById('detail-description');
      desc.innerHTML = data.description ? '<h4>Description</h4><div class="code">' + escapeHtml(data.description) + '</div>' : '';

      const kp = document.getElementById('detail-keypoints');
      kp.innerHTML = (data.key_points && data.key_points.length) ? '<h4>Key points</h4><ul>' + data.key_points.map(p => '<li>' + escapeHtml(p) + '</li>').join('') + '</ul>' : '';

      const imp = document.getElementById('detail-important');
      imp.innerHTML = (data.important_lines && data.important_lines.length) ? '<h4>Important lines</h4><div class="code">' + escapeHtml(data.important_lines.join('\\n')) + '</div>' : '';

      const api = document.getElementById('detail-api');
      api.innerHTML = (data.api_endpoints && data.api_endpoints.length) ? '<h4>API endpoints</h4><div class="list">' + data.api_endpoints.map(ep => '<div style="padding:6px;background:#fff; border-radius:6px;border:1px solid #eef9ee"><strong>' + escapeHtml(ep.method) + '</strong> <code>' + escapeHtml(ep.path) + '</code><div style="font-size:12px;color:#445;padding-top:4px">' + escapeHtml(ep.note || '') + '</div></div>').join('') + '</div>' : '';

      const files = document.getElementById('detail-files');
      if (data.files_count) {
        const fEls = cy.nodes().filter(n => n.data('parentModule') === data.id);
        if (fEls.length) {
          files.innerHTML = '<h4>Files</h4><div class="list">' + fEls.map(n => '<div class="file-item" data-id="' + escapeHtml(n.data('targetId')||n.id()) + '">' + escapeHtml(n.data('fileName')||n.data('label')||n.id()) + '</div>').join('') + '</div>';
        } else if (data.__files && data.__files.length) {
          files.innerHTML = '<h4>Files</h4><div class="list">' + data.__files.map(f => '<div class="file-item" data-id="' + escapeHtml(f.origId||f.id) + '">' + escapeHtml(f.fileName||f.id) + '</div>').join('') + '</div>';
        } else {
          files.innerHTML = '<h4>Files</h4><div>' + data.files_count + ' files</div>';
        }
      } else {
        files.innerHTML = '';
      }

      const meta = document.getElementById('detail-meta');
      if (data.meta && Object.keys(data.meta).length) {
        meta.innerHTML = '<h4>Meta</h4><pre class="code">' + escapeHtml(JSON.stringify(data.meta, null, 2)) + '</pre>';
      } else {
        meta.innerHTML = '';
      }

      document.querySelectorAll('.file-item').forEach(el => {
        el.addEventListener('click', () => {
          const id = el.getAttribute('data-id');
          if (window.goToModule) window.goToModule(id);
        });
      });

      document.getElementById('detail-panel').setAttribute('aria-hidden', 'false');
    }

    // marshall data on node tap
    cy.on('tap', 'node', function(evt) {
      const node = evt.target;
      const type = node.data('type');

      if (type === 'summary') {
        const files = node.data('__files') || [];
        renderDetail({ title: node.data('label'), label: node.data('label'), type: 'summary', __files: files, files_count: files.length, id: node.id() });
        return;
      }

      const payload = Object.assign({}, node.data());
      payload.key_points = payload.key_points || [];
      payload.important_lines = payload.important_lines || [];
      payload.api_endpoints = payload.api_endpoints || [];

      renderDetail(payload);

      if (payload.targetId && payload.type !== 'summary') {
        if (window.goToModule) {
          try { window.goToModule(payload.targetId); } catch (e) { /* ignore */ }
        }
      }
    });

    // UI controls
    document.getElementById('zoom-in').addEventListener('click', () => cy.zoom({ level: Math.min(cy.zoom() * 1.2, cy.maxZoom()) }));
    document.getElementById('zoom-out').addEventListener('click', () => cy.zoom({ level: Math.max(cy.zoom() / 1.2, cy.minZoom()) }));
    document.getElementById('fit').addEventListener('click', () => cy.fit(40));

    document.getElementById('export-png').addEventListener('click', () => {
      const png = cy.png({ full: true, scale: 2 });
      const a = document.createElement('a');
      a.href = png;
      a.download = (document.title || 'graph') + '.png';
      a.click();
    });

    // layout switcher
    document.getElementById('layout').addEventListener('change', (ev) => {
      const name = ev.target.value;
      const layoutOpts = { name };
      if (name === 'breadthfirst') layoutOpts['directed'] = true;
      if (name === 'cose') layoutOpts['idealEdgeLength'] = 50;
      cy.layout(layoutOpts).run();
    });

    // search
    const searchInput = document.getElementById('search');
    let searchTimeout = null;
    searchInput.addEventListener('input', (ev) => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        const q = ev.target.value.trim().toLowerCase();
        cy.nodes().removeClass('highlight');
        if (!q) { cy.nodes().style('opacity', 1); return; }
        const match = cy.nodes().filter(n => (n.data('label') || '').toLowerCase().includes(q) || (n.data('title')||'').toLowerCase().includes(q));
        cy.nodes().style('opacity', 0.12);
        match.style('opacity', 1);
        match.addClass('highlight');
        if (match.length) cy.fit(match, 40);
      }, 180);
    });

    // keyboard: +/- for zoom; f for fit; esc to close detail
    window.addEventListener('keydown', (ev) => {
      if (ev.key === '+') cy.zoom({ level: Math.min(cy.zoom() * 1.15, cy.maxZoom()) });
      if (ev.key === '-') cy.zoom({ level: Math.max(cy.zoom() / 1.15, cy.minZoom()) });
      if (ev.key === 'f') cy.fit(50);
      if (ev.key === 'Escape') document.getElementById('detail-panel').setAttribute('aria-hidden', 'true');
    });

    document.getElementById('detail-close').addEventListener('click', () => {
      document.getElementById('detail-panel').setAttribute('aria-hidden', 'true');
    });

    // toggle detail drawer with logo button
    document.getElementById('toggle-detail').addEventListener('click', () => {
      const panel = document.getElementById('detail-panel');
      const closed = panel.classList.toggle('closed');
      panel.setAttribute('aria-hidden', closed ? 'true' : 'false');
    });

    // helper escape for inner HTML (small runtime helper - mirrors server escapeHtml)
    function escapeHtml(s) {
      if (!s && s !== 0) return '';
      return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
    }

    // initial fit
    cy.ready(() => {
      setTimeout(() => cy.fit(40), 80);
    });

    // expose cy for debugging
    window._cy = cy;

    // ensure goToModule exists
    window.goToModule = window.goToModule || function(id) {
      try {
        const doc = (window.parent && window.parent !== window && window.parent.document) ? window.parent.document : document;
        const target = doc.getElementById(id) || doc.querySelector('[data-section-id=\"' + id + '\"]');
        const root = doc.documentElement;
        const headerOffsetStr = (doc && doc.defaultView) ? (getComputedStyle(root).getPropertyValue('--header-offset') || '96') : '96';
        const HEADER_OFFSET = parseInt(headerOffsetStr, 10) || 96;
        if (target) {
          const rect = target.getBoundingClientRect();
          const scrollTop = (doc.defaultView && doc.defaultView.pageYOffset) || window.scrollY || 0;
          const absoluteY = rect.top + scrollTop;
          const y = Math.max(absoluteY - HEADER_OFFSET - 12, 0);
          const win = (doc.defaultView && doc.defaultView) || window;
          win.scrollTo({ top: y, behavior: 'smooth' });
          const prev = target.style.boxShadow;
          target.style.boxShadow = '0 0 0 6px rgba(11,107,58,0.08)';
          setTimeout(() => target.style.boxShadow = prev || '', 900);
        } else {
          try { history.replaceState && history.replaceState(null, '', '#' + encodeURIComponent(id)); } catch (e) {}
        }
      } catch (err) { console.warn('goToModule error', err); }
    };
  </script>
</body>
</html>`;
}

export async function generateCytoscapeHtmlFromManifest(
  manifest: SiteManifest,
  outDir = "generated_html",
  fileName = "cyto_flow.html",
  options: { maxFilesPerModule?: number } = {}
): Promise<{ ok: boolean; path: string }> {
  try {
    const htmlRoot = path.resolve(outDir);
    await fs.mkdirp(htmlRoot);

    const elements = moduleTreeToCytoscapeElements(manifest.rootModule, {
      maxFilesPerModule: options.maxFilesPerModule,
    });

    const html = renderCytoscapeHtml(
      JSON.stringify(elements),
      manifest.projectName,
      { theme: "light" }
    );

    const filePath = path.join(htmlRoot, fileName);
    await fs.writeFile(filePath, html, "utf8");

    return { ok: true, path: filePath };
  } catch (err: any) {
    throw new Error(
      "generateCytoscapeHtmlFromManifest failed: " +
        (err && err.message ? err.message : String(err))
    );
  }
}

/**
 * Generate a single combined Mermaid flowchart for the whole manifest and write it to disk.
 */
// export async function generateAllModuleFlowcharts(
//   manifest: SiteManifest,
//   outDir = "generated_flowcharts",
//   outFileName = "module_workflow.html",
//   opts: { direction?: "TD" | "LR" } = {}
// ) {
//   const htmlRoot = path.resolve(outDir);
//   await fs.mkdirp(htmlRoot);

//   const mermaidCode = moduleToMermaidFromManifest(manifest, {
//     direction: opts.direction ?? "LR",
//   });
//   const html = renderMermaidHtml(mermaidCode, manifest.projectName, {
//     theme: "base",
//     startOnLoad: true,
//   });

//   const filePath = path.join(htmlRoot, outFileName);
//   await fs.writeFile(filePath, html, "utf8");

//   return { ok: true, path: filePath, mermaidCode };
// }
export async function generateAllModuleFlowcharts(
  manifest: SiteManifest,
  outDir = "generated_flowcharts",
  outFileName = "module_workflow.html",
  opts: { maxFilesPerModule?: number; layout?: string } = {}
) {
  const htmlRoot = path.resolve(outDir);
  await fs.mkdirp(htmlRoot);

  // generateCytoscapeHtmlFromManifest writes the HTML and returns { ok, path }
  const res = await generateCytoscapeHtmlFromManifest(
    manifest,
    htmlRoot,
    outFileName,
    {
      maxFilesPerModule: opts.maxFilesPerModule ?? 6,
    }
  );

  return { ok: true, path: res.path };
}
