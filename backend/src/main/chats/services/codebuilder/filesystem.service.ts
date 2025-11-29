import fs from "fs/promises";
import path from "path";
import type { EmitOperation } from "../../chat.types";

export class FileSystemService {
  readonly workspaceRoot: string;

  constructor(workspaceRoot = path.resolve(process.cwd(), "workspace")) {
    this.workspaceRoot = workspaceRoot;
  }

  // make resolve public so other services can compute the path
  public resolveProjectPath(projectId: string, rel = ""): string {
    const projectRoot = path.resolve(this.workspaceRoot, projectId);
    const full = path.resolve(projectRoot, rel);
    if (!full.startsWith(projectRoot))
      throw new Error("Path traversal detected");
    return full;
  }

  public async applyOperations(projectId: string, ops: EmitOperation[]) {
    const results: Array<{ op: EmitOperation; ok: boolean; msg?: string }> = [];
    for (const op of ops) {
      try {
        const target = this.resolveProjectPath(projectId, op.path);
        if (op.action === "delete") {
          await fs.rm(target, { force: true }).catch(() => {});
          results.push({ op, ok: true });
          continue;
        }

        const dir = path.dirname(target);
        await fs.mkdir(dir, { recursive: true });

        if (op.action === "create") {
          // if exists -> error
          try {
            await fs.access(target);
            throw new Error(`File exists: ${op.path}`);
          } catch (e) {
            // file doesn't exist -> ok
          }
        }

        if (op.action === "update" || op.action === "create") {
          if (typeof op.content !== "string")
            throw new Error("Missing content for create/update");
          const data =
            op.encoding === "base64"
              ? Buffer.from(op.content, "base64")
              : Buffer.from(op.content, "utf8");
          await fs.writeFile(target, data);
          results.push({ op, ok: true });
          continue;
        }

        results.push({ op, ok: false, msg: "Unsupported action" });
      } catch (err: any) {
        results.push({ op, ok: false, msg: err.message });
      }
    }
    return results;
  }

  public async readFile(projectId: string, relPath: string) {
    const full = this.resolveProjectPath(projectId, relPath);
    return fs.readFile(full, "utf8");
  }
}
