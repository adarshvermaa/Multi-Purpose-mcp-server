/**
 * src/components/ErrorBoundary.tsx
 *
 * Enhanced cyan-themed Error Boundary that:
 * - captures runtime errors and shows a friendly UI
 * - copy-to-clipboard for error details
 * - collapsible stack trace
 * - automatic POST to a reporting endpoint on catch
 * - manual "Report" button that POSTs to the same endpoint
 *
 * Usage:
 * <ErrorBoundary reportUrl="http://localhost:4000/api/v1/chats/project/builder/emit" autoReport>
 *   <App />
 * </ErrorBoundary>
 *
 * Note: this file is pure application code (no tests).
 */

import React from "react";

export interface ErrorBoundaryProps {
  children: React.ReactNode;
  /**
   * Optional URL to POST error reports to.
   * Default: 'http://localhost:4000/api/v1/chats/project/builder/emit'
   */
  reportUrl?: string;
  /** If true, automatically POST the error when caught. Defaults to true. */
  autoReport?: boolean;
  /** Optional callback that receives the payload and fetch response (for custom handling) */
  onReport?: (payload: ReportPayload, response?: Response | null) => void;
}

export interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  info: React.ErrorInfo | null;
  expanded: boolean;
  copiedMessage: string | null;
  reportMessage: string | null;
  id: string;
}

type ReportPayload = {
  id: string;
  time: string;
  message: string | null;
  name: string | null;
  stack?: string | null;
  componentStack?: string | null;
  url?: string;
  userAgent?: string;
  // any extra context can be added here
};

const DEFAULT_REPORT_URL =
  "http://localhost:4000/api/v1/chats/project/builder/emit";

export default class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  static defaultProps = {
    reportUrl: DEFAULT_REPORT_URL,
    autoReport: true,
  };

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      info: null,
      expanded: false,
      copiedMessage: null,
      reportMessage: null,
      id: this.makeId(),
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Save component stack info
    this.setState({ info });

    // Log locally for fast dev feedback
    console.error("ErrorBoundary caught an error:", {
      id: this.state.id,
      message: error.message,
      stack: error.stack,
      componentStack: info.componentStack,
    });

    // Auto-post to remote endpoint if enabled
    if (this.props.autoReport) {
      const payload = this.buildPayload(error, info);
      // fire-and-forget (we still await to update UI with result)
      this.sendReport(payload).catch((e) => {
        // swallow to avoid throwing during error handling
        console.warn("Auto report failed:", e);
      });
    }

    // If caller passed onReport callback, call it (non-blocking)
    if (this.props.onReport) {
      try {
        const payload = this.buildPayload(error, info);
        // call callback (no response)
        this.props.onReport(payload, null);
      } catch (e) {
        console.warn("onReport callback threw:", e);
      }
    }
  }

  makeId(): string {
    const t = Date.now().toString(36);
    const r = Math.random().toString(36).slice(2, 8);
    return `err_${t}_${r}`;
  }

  buildPayload(error: Error, info: React.ErrorInfo): ReportPayload {
    return {
      id: this.state.id,
      time: new Date().toISOString(),
      message: error?.message ?? null,
      name: error?.name ?? null,
      stack: error?.stack ?? null,
      componentStack: info?.componentStack ?? null,
      url: typeof window !== "undefined" ? window.location.href : undefined,
      userAgent:
        typeof navigator !== "undefined" ? navigator.userAgent : undefined,
    };
  }

  // sendReport is used by componentDidCatch (auto) and by the manual report() button.
  // Replace the current sendReport implementation with this.
  // It expects the existing buildPayload(...) to return the error details object.

  async sendReport(payload: ReportPayload): Promise<Response | null> {
    const url = this.props.reportUrl ?? DEFAULT_REPORT_URL;

    // Build the server envelope required by your emit endpoint
    const serverBody = {
      // required by server
      userPrompt: `Automatic error report (id=${payload.id}): ${
        payload.message ?? "runtime error"
      }`,
      thinkMode: false,
      stackType: "reactVite", // <--- required, adjust if you use a different stack string
      // attach error details under a separate field so the server can use it
      errorPayload: payload,
    };

    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(serverBody),
      });

      if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        const msg = `Report failed: ${resp.status} ${resp.statusText} ${
          text ? " " + text : ""
        }`;
        this.setState({ reportMessage: msg });
      } else {
        this.setState({ reportMessage: "Reported successfully" });
      }

      if (this.props.onReport) {
        try {
          this.props.onReport(payload, resp);
        } catch (e) {
          console.warn("onReport handler threw:", e);
        }
      }

      window.setTimeout(() => this.setState({ reportMessage: null }), 2500);

      return resp;
    } catch (err) {
      console.error("ErrorBoundary: sendReport error", err);
      this.setState({ reportMessage: "Report failed (network)" });
      window.setTimeout(() => this.setState({ reportMessage: null }), 2500);
      return null;
    }
  }

  toggleDetails = () => {
    this.setState((s) => ({ expanded: !s.expanded }));
  };

  copyError = async () => {
    const { error, info, id } = this.state;
    const payload = [
      `Error ID: ${id}`,
      `Time: ${new Date().toISOString()}`,
      `Message: ${error?.message ?? "N/A"}`,
      `Name: ${error?.name ?? "N/A"}`,
      `Stack: ${error?.stack ?? "N/A"}`,
      `ComponentStack: ${info?.componentStack ?? "N/A"}`,
      `URL: ${typeof window !== "undefined" ? window.location.href : "N/A"}`,
    ].join("\n\n");

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(payload);
        this.setState({ copiedMessage: "Copied to clipboard" });
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = payload;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand("copy");
        textArea.remove();
        this.setState({ copiedMessage: "Copied (fallback)" });
      }
    } catch (err) {
      console.error("Copy failed", err);
      this.setState({ copiedMessage: "Copy failed" });
    }

    window.setTimeout(() => this.setState({ copiedMessage: null }), 2000);
  };

  // invoked by "Report" button
  report = async () => {
    const { error, info } = this.state;
    if (!error) {
      this.setState({ reportMessage: "No error to report" });
      window.setTimeout(() => this.setState({ reportMessage: null }), 2000);
      return;
    }

    const payload = this.buildPayload(error, info!);
    await this.sendReport(payload);
  };

  render() {
    if (this.state.hasError) {
      const message = this.state.error?.message ?? "Unknown runtime error";
      const stack = this.state.error?.stack ?? "No stack available";
      const componentStack = this.state.info?.componentStack ?? "";

      return (
        <div
          className="min-h-screen flex items-center justify-center bg-white-50 dark:bg-gray-900 font-[Inter] p-6 sm:p-10"
          role="alert"
          aria-live="assertive"
        >
          <div className="relative w-full max-w-2xl animate-fade-in">
            <div
              className="
        relative 
        bg-white/80 dark:bg-gray-900/80 
        backdrop-blur-xl 
        border border-cyan-200 dark:border-gray-700 
        shadow-cyan dark:shadow-cyan-500/20 
        rounded-3xl p-8 md:p-10 text-center overflow-hidden
      "
            >
              {/* animated glow */}
              <div
                className="
          absolute -inset-10 rounded-3xl 
          bg-cyan-200/30 dark:bg-cyan-500/10 
          blur-3xl -z-10 animate-pulse-slow
        "
              />

              {/* icon */}
              <div
                className="
            flex items-center justify-center 
            w-20 h-20 rounded-full 
            bg-cyan-gradient dark:bg-cyan-600 
            text-white text-3xl 
            mb-5 shadow-lg shadow-cyan-400/40 dark:shadow-cyan-900/40
          "
                aria-hidden
              >
                ⚠️
              </div>

              {/* title */}
              <h2 className="text-3xl md:text-4xl font-extrabold text-cyan-800 dark:text-cyan-400 mb-2 tracking-tight">
                Something Went Wrong
              </h2>

              {/* subtitle */}
              <p className="text-cyan-700 dark:text-gray-300 text-sm md:text-base mb-6 leading-relaxed max-w-prose mx-auto">
                Don’t worry — this issue has been logged automatically. You can
                copy the details, report it, or simply refresh the page.
              </p>

              {/* error summary */}
              <div className="w-full text-left">
                <div
                  className="
            rounded-2xl 
            border border-cyan-100 dark:border-gray-700 
            bg-cyan-50 dark:bg-gray-800 
            p-4 md:p-5 text-xs md:text-sm font-mono 
            text-cyan-900 dark:text-gray-200 
            shadow-cyan-inner whitespace-pre-wrap wrap-break-word
          "
                >
                  <strong className="block text-cyan-700 dark:text-cyan-400 mb-1 uppercase tracking-wide">
                    Error
                  </strong>
                  <div className="truncate">{message}</div>
                </div>
              </div>

              {/* action buttons */}
              <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center items-center">
                <button
                  onClick={() => window.location.reload()}
                  className="
              inline-flex items-center gap-2 px-5 py-2.5 rounded-xl 
              bg-cyan-gradient dark:bg-cyan-600 
              hover:shadow-cyan hover:brightness-110 
              text-white font-semibold transition-all active:scale-95
            "
                >
                  🔄 Refresh
                </button>

                <button
                  onClick={this.copyError}
                  className="
              inline-flex items-center gap-2 px-5 py-2.5 rounded-xl 
              border border-cyan-300 dark:border-gray-700 
              bg-white dark:bg-gray-800 
              text-cyan-700 dark:text-gray-200 
              font-medium hover:shadow-cyan transition-all active:scale-95
            "
                >
                  📋 Copy Details
                </button>

                <button
                  onClick={this.report}
                  className="
              inline-flex items-center gap-2 px-5 py-2.5 rounded-xl 
              bg-cyan-50 dark:bg-gray-700 
              text-cyan-700 dark:text-gray-100 
              border border-cyan-200 dark:border-gray-600 
              hover:bg-cyan-100 dark:hover:bg-gray-600 
              font-medium transition-all active:scale-95
            "
                >
                  🧭 Report
                </button>

                <button
                  onClick={this.toggleDetails}
                  aria-expanded={this.state.expanded}
                  className="
              inline-flex items-center px-4 py-2 rounded-xl text-sm 
              text-cyan-700 dark:text-cyan-300 
              hover:text-cyan-900 dark:hover:text-cyan-200 
              transition-colors active:scale-95
            "
                >
                  {this.state.expanded ? "Hide Details ▲" : "Show Details ▼"}
                </button>
              </div>

              {(this.state.copiedMessage || this.state.reportMessage) && (
                <div className="mt-3 text-xs text-cyan-700 dark:text-cyan-300 animate-fade-in">
                  {this.state.copiedMessage ?? this.state.reportMessage}
                </div>
              )}

              {this.state.expanded && (
                <div className="mt-6 w-full text-left animate-fade-in">
                  <div
                    className="
              rounded-2xl border border-cyan-100 dark:border-gray-700 
              bg-white dark:bg-gray-800 
              p-4 text-xs md:text-sm 
              text-cyan-900 dark:text-gray-200 
              font-mono max-h-64 overflow-auto shadow-cyan-inner
            "
                  >
                    <div className="mb-2 text-xs text-cyan-600 dark:text-cyan-400 uppercase tracking-wide">
                      Error Stack
                    </div>
                    <pre className="whitespace-pre-wrap">{stack}</pre>

                    {componentStack && (
                      <>
                        <div className="mt-3 mb-1 text-xs text-cyan-600 dark:text-cyan-400 uppercase tracking-wide">
                          Component Stack
                        </div>
                        <pre className="whitespace-pre-wrap text-xs">
                          {componentStack}
                        </pre>
                      </>
                    )}
                  </div>

                  <div className="mt-4 text-right">
                    <a
                      href="/"
                      className="text-sm text-cyan-700 dark:text-cyan-400 hover:text-cyan-500 dark:hover:text-cyan-300 transition-colors"
                    >
                      ← Go Back Home
                    </a>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
