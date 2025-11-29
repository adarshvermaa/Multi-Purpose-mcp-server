// HTMLPreview component - renders HTML and JavaScript in a sandboxed iframe
import { useEffect, useRef } from 'react';

interface HTMLPreviewProps {
  htmlContent: string;
  javascriptCode?: string;
  cssCode?: string;
  onError?: (error: Error) => void;
}

export default function HTMLPreview({
  htmlContent,
  javascriptCode = '',
  cssCode = '',
  onError,
}: HTMLPreviewProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (!iframeRef.current) return;

    const iframe = iframeRef.current;
    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;

    if (!iframeDoc) {
      onError?.(new Error('Unable to access iframe document'));
      return;
    }

    try {
      // Build complete HTML document
      const fullHTML = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Preview</title>
  ${cssCode ? `<style>${cssCode}</style>` : ''}
  <style>
    /* Reset some default styles for better preview */
    body {
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
    }
  </style>
</head>
<body>
  ${htmlContent}
  ${javascriptCode ? `<script>${javascriptCode}</script>` : ''}
  <script>
    // Capture console logs and send to parent
    const originalConsole = {
      log: console.log,
      error: console.error,
      warn: console.warn,
      info: console.info,
    };

    ['log', 'error', 'warn', 'info'].forEach(method => {
      console[method] = function(...args) {
        originalConsole[method].apply(console, args);
        window.parent.postMessage({
          type: 'console',
          method: method,
          args: args.map(arg => {
            try {
              return JSON.stringify(arg);
            } catch (e) {
              return String(arg);
            }
          }),
        }, '*');
      };
    });

    // Capture errors
    window.addEventListener('error', function(event) {
      window.parent.postMessage({
        type: 'error',
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      }, '*');
    });
  </script>
</body>
</html>
      `;

      // Write to iframe
      iframeDoc.open();
      iframeDoc.write(fullHTML);
      iframeDoc.close();
    } catch (error) {
      onError?.(error as Error);
    }
  }, [htmlContent, javascriptCode, cssCode, onError]);

  // Listen for messages from iframe
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data.type === 'console') {
        const { method, args } = event.data;
        console[method as 'log' | 'error' | 'warn' | 'info'](
          `[Preview ${method}]:`,
          ...args.map((arg: string) => {
            try {
              return JSON.parse(arg);
            } catch {
              return arg;
            }
          })
        );
      } else if (event.data.type === 'error') {
        console.error('[Preview Error]:', event.data);
        onError?.(new Error(event.data.message));
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onError]);

  return (
    <div className="w-full h-full bg-white overflow-hidden">
      <iframe
        ref={iframeRef}
        className="w-full h-full border-0"
        sandbox="allow-scripts allow-same-origin allow-forms allow-modals"
        title="HTML Preview"
      />
    </div>
  );
}
