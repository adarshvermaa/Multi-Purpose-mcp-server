import React, { useEffect, useRef } from 'react';
import { useEditorStore } from '../../stores/editorStore';
import type { CanvasComponent } from '../../types/editor.types';

export default function IframeRenderer() {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const components = useEditorStore((state) => state.components);

  // Generate full HTML document
  const generateHTML = (components: CanvasComponent[]) => {
    const bodyContent = components.map(comp => {
      // Basic rendering logic - this will be enhanced
      const style = `
        position: absolute;
        left: ${comp.position.x}px;
        top: ${comp.position.y}px;
        width: ${comp.size.width}px;
        height: ${comp.size.height}px;
        z-index: ${comp.zIndex};
        transform: rotate(${comp.rotation}deg);
        ${Object.entries(comp.styles).map(([k, v]) => `${k.replace(/[A-Z]/g, m => `-${m.toLowerCase()}`)}: ${v};`).join(' ')}
      `;
      
      if (comp.html) {
        return `<div id="${comp.id}" style="${style}">${comp.html}</div>`;
      }
      
      // Fallback for basic types
      if (comp.type === 'button') {
        return `<button id="${comp.id}" style="${style}">${comp.name}</button>`;
      }
      if (comp.type === 'text') {
        return `<div id="${comp.id}" style="${style}">${comp.name}</div>`;
      }
      
      return `<div id="${comp.id}" style="${style}"></div>`;
    }).join('\n');

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { margin: 0; overflow: hidden; }
            * { box-sizing: border-box; }
          </style>
          <script src="https://cdn.tailwindcss.com"></script>
        </head>
        <body>
          ${bodyContent}
        </body>
      </html>
    `;
  };

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const doc = iframe.contentDocument;
    if (!doc) return;

    doc.open();
    doc.write(generateHTML(components));
    doc.close();

  }, [components]);

  return (
    <iframe
      ref={iframeRef}
      className="absolute inset-0 w-full h-full border-none pointer-events-none" // pointer-events-none so clicks go to overlay
      title="Canvas Content"
    />
  );
}
