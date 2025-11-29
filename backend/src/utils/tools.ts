import fs from "fs-extra";
import path from "path";

export async function runTool(name: string, argsRaw: string) {
  let args: any;
  try {
    args = argsRaw ? JSON.parse(argsRaw) : {};
  } catch {
    return { ok: false, error: "invalid json" };
  }

  if (name === "redact_secrets") {
    const text = String(args.text ?? "");
    const redacted = text
      .replace(/([A-Za-z0-9_\-]{30,})/g, "[REDACTED_LONG_TOKEN]")
      .replace(
        /(api[_-]?key|secret|private[_-]?key)\s*[:=]\s*['"]?([A-Za-z0-9-_+=\/]+)['"]?/gi,
        "$1: [REDACTED]"
      );
    return { ok: true, redacted };
  }

  if (name === "save_summary") {
    const rel = String(args.relPath ?? "").replace(/\.\.[\\/]/g, "");
    const summary = String(args.summary ?? "");
    if (!rel || !summary) return { ok: false, error: "missing" };
    await fs.mkdirp("generated_summaries");
    const safeName = rel
      .replace(/[\\/]/g, "_")
      .replace(/[^a-zA-Z0-9_\-\.]/g, "_");
    const p = path.join("generated_summaries", `${safeName}.txt`);
    await fs.writeFile(p, summary, "utf8");
    return { ok: true, path: p };
  }

  if (name === "extract_api_endpoints") {
    const text = String(args.text ?? "");
    const lines = text.split(/\r?\n/).slice(0, 1000);
    const re = /\b(GET|POST|PUT|DELETE|PATCH|OPTIONS)\b\s+([/][^\s'"]+)/i;
    const endpoints: any[] = [];
    for (const l of lines) {
      const m = re.exec(l);
      if (m)
        endpoints.push({
          method: m[1].toUpperCase(),
          path: m[2],
          note: l.trim().slice(0, 200),
        });
    }
    return { ok: true, endpoints };
  }

  return { ok: false, error: "unknown tool" };
}
