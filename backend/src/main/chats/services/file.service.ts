import fs from "fs";
import path from "path";
import { EmitFilesSchema, ApplyPatchSchema } from "../schemas/zod/chat.schemas";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";

type FileOp = z.infer<typeof EmitFilesSchema>["operations"][number];

const PROJECTS_ROOT =
  process.env.PROJECTS_ROOT || path.resolve(process.cwd(), "workspaces");
console.log(PROJECTS_ROOT);

// helper to ensure resolved path is inside project
export function isPathInside(root: string, resolved: string) {
  const rootNormalized = path.resolve(root) + path.sep;
  const resolvedNormalized = path.resolve(resolved) + path.sep;
  return resolvedNormalized.startsWith(rootNormalized);
}

function resolveProjectRoot(projectId: string) {
  // e.g. /var/ai/workspaces/{projectId}
  const p = path.resolve(PROJECTS_ROOT, projectId);
  return p;
}

export class FileService {
  // store suggestions in memory for demo; replace with DB in production
  private suggestions: Record<string, any> = {};

  public createSuggestion = async (raw: unknown) => {
    const parsed = EmitFilesSchema.parse(raw);
    const suggestionId = uuidv4();
    // compute simple summary (files count)
    const summary = {
      suggestionId,
      projectId: parsed.projectId,
      operationsCount: parsed.operations.length,
      createdAt: new Date().toISOString(),
      operations: parsed.operations.map((o) => ({
        path: o.path,
        action: o.action,
      })),
    };

    this.suggestions[suggestionId] = {
      ...summary,
      operations: parsed.operations,
      status: "pending",
    };

    return { ok: true, suggestion: summary };
  };

  /**
   * Create a new project workspace.
   * Accepts an object with { title, prompt, stack?, options? }.
   * Returns { ok, projectId, projectRoot, files: [{ path, content }] }
   */
  public createProject = async (raw: unknown) => {
    const payload: any = raw ?? {};
    if (!payload.title || !payload.prompt) {
      return { ok: false, error: "title and prompt are required" };
    }

    const projectId = uuidv4();
    const projectRoot = resolveProjectRoot(projectId);

    try {
      fs.mkdirSync(projectRoot, { recursive: true });

      const readmeContent = `# ${payload.title}\n\n${
        payload.prompt
      }\n\nGenerated: ${new Date().toISOString()}\n`;
      fs.writeFileSync(
        path.join(projectRoot, "README.md"),
        readmeContent,
        "utf8"
      );

      const stack = (payload.stack || "").toLowerCase();
      const files: { path: string; content: string }[] = [
        { path: "README.md", content: readmeContent },
      ];

      if (
        stack.includes("node") ||
        stack.includes("express") ||
        stack.includes("next")
      ) {
        const pkg = {
          name: payload.title.toLowerCase().replace(/\s+/g, "-"),
          version: "0.1.0",
          description: (payload.prompt || "").slice(0, 140),
          scripts: { start: "node index.js" },
        };
        const pkgContent = JSON.stringify(pkg, null, 2);
        fs.writeFileSync(
          path.join(projectRoot, "package.json"),
          pkgContent,
          "utf8"
        );
        files.push({ path: "package.json", content: pkgContent });
      }

      if (stack.includes("node") || stack.includes("express")) {
        const indexContent = `// ${
          payload.title
        }\n// scaffold generated on ${new Date().toISOString()}\nconsole.log("Hello from ${
          payload.title
        }");\n`;
        fs.writeFileSync(
          path.join(projectRoot, "index.js"),
          indexContent,
          "utf8"
        );
        files.push({ path: "index.js", content: indexContent });
      }

      return {
        ok: true,
        projectId,
        projectRoot,
        files,
      };
    } catch (err: any) {
      return { ok: false, error: String(err) };
    }
  };

  // Apply patch (called after user approves) - writes files to disk with guard
  public applyPatch = async (raw: unknown) => {
    const parsed = ApplyPatchSchema.parse(raw);
    const projectRoot = resolveProjectRoot(parsed.projectId);
    // ensure project root exists
    fs.mkdirSync(projectRoot, { recursive: true });

    const MAX_BYTES_PER_FILE = 5 * 1024 * 1024; // 5MB per file
    const results: {
      path: string;
      action: string;
      success: boolean;
      error?: string;
    }[] = [];

    for (const op of parsed.operations) {
      try {
        // normalize and sanitize path
        const normalized = path.normalize(op.path || "");
        const sanitizedRel = normalized.replace(/^([\\/]*\.\.([\\/]|$))+/, "");
        const target = path.resolve(projectRoot, sanitizedRel);

        if (!isPathInside(projectRoot, target)) {
          results.push({
            path: op.path,
            action: op.action,
            success: false,
            error: "Path escapes project root",
          });
          continue;
        }

        // size checks
        if (op.content && op.encoding !== "base64") {
          const bufSize = Buffer.byteLength(String(op.content), "utf8");
          if (bufSize > MAX_BYTES_PER_FILE) {
            results.push({
              path: op.path,
              action: op.action,
              success: false,
              error: "file too large",
            });
            continue;
          }
        }
        if (op.content && op.encoding === "base64") {
          const est = Math.ceil((String(op.content).length * 3) / 4);
          if (est > MAX_BYTES_PER_FILE) {
            results.push({
              path: op.path,
              action: op.action,
              success: false,
              error: "file too large (base64)",
            });
            continue;
          }
        }

        if (op.action === "delete") {
          if (fs.existsSync(target)) {
            fs.unlinkSync(target);
          }
          results.push({ path: op.path, action: "delete", success: true });
        } else {
          // create/update -> ensure dir
          fs.mkdirSync(path.dirname(target), { recursive: true });
          const content = op.content ?? "";
          if (op.encoding === "base64") {
            fs.writeFileSync(target, Buffer.from(content, "base64"));
          } else {
            fs.writeFileSync(target, content, "utf8");
          }
          results.push({ path: op.path, action: op.action, success: true });
        }
      } catch (err: any) {
        results.push({
          path: op.path,
          action: op.action,
          success: false,
          error: String(err),
        });
      }
    }

    // mark suggestion (if exists)
    // optionally write audit log to DB/file
    return { ok: true, results };
  };

  public listFiles = async (projectId: string, relPath = ".", depth = 2) => {
    const projectRoot = resolveProjectRoot(projectId);
    const out: { path: string; isDir: boolean }[] = [];
    const start = path.resolve(projectRoot, relPath);

    function walk(dir: string, level: number) {
      if (level < 0) return;
      const items = fs.readdirSync(dir, { withFileTypes: true });
      for (const it of items) {
        const p = path.relative(projectRoot, path.join(dir, it.name));
        out.push({ path: p, isDir: it.isDirectory() });
        if (it.isDirectory()) {
          walk(path.join(dir, it.name), level - 1);
        }
      }
    }

    if (fs.existsSync(start)) walk(start, depth);
    return out;
  };

  public getFile = async (
    projectId: string,
    relPath: string,
    maxBytes = 200_000
  ) => {
    const projectRoot = resolveProjectRoot(projectId);
    const target = path.resolve(projectRoot, relPath);
    if (!isPathInside(projectRoot, target))
      throw new Error("Path escapes project root");
    if (!fs.existsSync(target)) throw new Error("File not found");
    const buf = fs.readFileSync(target);
    const out = buf.slice(0, maxBytes).toString("utf8");
    return { content: out, size: buf.length };
  };
}

export default new FileService();
