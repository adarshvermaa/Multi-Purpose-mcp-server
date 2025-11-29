// src/services/fileSystemManager.ts
import fs from "fs/promises";
import path from "path";

export type FileOperation = {
  path: string; // relative to project root
  action: "create" | "update" | "delete";
  content?: string; // required for create/update
};

export type FileOperationResult = {
  path: string;
  action: "create" | "update" | "delete";
  status: "applied" | "skipped" | "failed";
  message?: string;
  backupPath?: string | null;
};

export type ApplyOptions = {
  dryRun?: boolean;
  backup?: boolean;
  rollbackOnError?: boolean;
  projectRoot?: string;
  // publish events over socket/kafka? default true
  publishEvents?: boolean;
};

export type EmitterFn = (eventName: string, payload: any) => void;

async function pathInfo(fullPath: string) {
  try {
    const st = await fs.stat(fullPath);
    return { exists: true, isFile: st.isFile(), isDirectory: st.isDirectory() };
  } catch {
    return { exists: false, isFile: false, isDirectory: false };
  }
}
export class FileSystemManager {
  private projectRoot: string;
  private emitter?: EmitterFn;

  /**
   * @param projectRoot project root to resolve file ops (default process.cwd())
   * @param emitter optional function to call for events: (eventName, payload) => void
   */
  constructor(projectRoot?: string, emitter?: EmitterFn) {
    this.projectRoot = path.resolve(projectRoot ?? process.cwd());
    this.emitter = emitter;
  }

  private emit(eventName: string, payload: any) {
    try {
      if (typeof this.emitter === "function") this.emitter(eventName, payload);
    } catch (e) {
      // swallow emitter errors to avoid breaking file operations
      // optionally log in real app
      console.warn("[FileSystemManager] emitter error", e);
    }
  }

  private resolveSafe(p: string) {
    if (!p || typeof p !== "string") {
      throw new Error(`Invalid path: ${String(p)}`);
    }

    // Normalize separators, remove leading slashes or leading "./"
    // so "/index.html" or "./src/app.js" become "index.html" / "src/app.js"
    let normalized = p
      .replace(/\\/g, "/")
      .replace(/^\/*/, "")
      .replace(/^\.\//, "");

    // Prevent accidental traversal attempts like "../secret"
    // The candidate will be inside projectRoot if relative resolves to within it
    const candidate = path.resolve(this.projectRoot, normalized);
    const rel = path.relative(this.projectRoot, candidate).replace(/\\/g, "/");

    // rel === "" means the same root path (unlikely for a file),
    // otherwise ensure it doesn't start with '..' (escape) or absolute-like
    if (rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel))) {
      return candidate;
    }
    throw new Error(
      `Path escapes project root: "${p}" -> resolved to "${candidate}"`
    );
  }

  private async ensureDir(dir: string) {
    await fs.mkdir(dir, { recursive: true });
  }

  private async writeAtomic(target: string, content: string | Buffer) {
    const dir = path.dirname(target);
    await this.ensureDir(dir);
    const tmp = `${target}.${Date.now()}.${Math.random()
      .toString(36)
      .slice(2, 8)}.tmp`;
    // write Buffer or string
    await fs.writeFile(tmp, content);
    await fs.rename(tmp, target);
  }

  private async backupFile(originalPath: string, backupDir: string) {
    await this.ensureDir(backupDir);
    const rel = path
      .relative(this.projectRoot, originalPath)
      .replace(/[/\\]/g, "_");
    const backupPath = path.join(backupDir, `${rel}.${Date.now()}.bak`);
    await this.ensureDir(path.dirname(backupPath));
    await fs.copyFile(originalPath, backupPath);
    return backupPath;
  }

  // Only publish events for files under this relative prefix (safe default)

  public async applyOperations(
    operations: FileOperation[],
    opts: ApplyOptions = {}
  ): Promise<{ results: FileOperationResult[]; backupFolder?: string | null }> {
    const {
      dryRun = false,
      backup = true,
      rollbackOnError = true,
      publishEvents = true,
    } = opts;
    const backupFolder = backup
      ? path.join(this.projectRoot, `.mcp_backups`, `${Date.now()}`)
      : null;
    if (backup && backupFolder) await this.ensureDir(backupFolder);

    const appliedStack: Array<{ op: FileOperation; meta?: any }> = [];
    const results: FileOperationResult[] = [];

    for (const op of operations) {
      try {
        if (
          !op ||
          typeof op.path !== "string" ||
          !["create", "update", "delete"].includes(op.action)
        ) {
          results.push({
            path: op?.path ?? "<unknown>",
            action: op?.action ?? ("create" as any),
            status: "failed",
            message: `Invalid operation shape`,
          });
          if (rollbackOnError) await this.rollback(appliedStack, backupFolder);
          return { results, backupFolder };
        }

        const fullPath = this.resolveSafe(op.path);
        const relPath = path
          .relative(this.projectRoot, fullPath)
          .replace(/\\/g, "/");

        // CREATE (replace your existing CREATE branch)
        if (op.action === "create") {
          const info = await pathInfo(fullPath);

          if (info.exists) {
            if (!info.isFile) {
              // path exists but is a directory (name conflict) — treat as failure
              results.push({
                path: op.path,
                action: "create",
                status: "failed",
                message: "Path exists and is a directory (name conflict)",
              });
              // rollback if required
              if (rollbackOnError)
                await this.rollback(appliedStack, backupFolder);
              continue;
            }

            results.push({
              path: op.path,
              action: "create",
              status: "skipped",
              message: "File already exists",
            });
            continue;
          }

          // prepare content (support base64)
          const contentToWrite =
            (op as any).encoding === "base64"
              ? Buffer.from(op.content ?? "", "base64")
              : String(op.content ?? "");

          if (!dryRun) {
            try {
              await this.writeAtomic(fullPath, contentToWrite);
            } catch (writeErr: any) {
              results.push({
                path: op.path,
                action: "create",
                status: "failed",
                message: `Write failed: ${
                  writeErr?.message ?? String(writeErr)
                }`,
              });
              if (rollbackOnError)
                await this.rollback(appliedStack, backupFolder);
              return { results, backupFolder };
            }

            results.push({
              path: op.path,
              action: "create",
              status: "applied",
            });
            appliedStack.push({ op, meta: { created: true } });
          } else {
            results.push({
              path: op.path,
              action: "create",
              status: "applied",
              message: "dry-run (no write)",
            });
            appliedStack.push({ op, meta: { created: false } });
          }

          // emit event for create
          if (publishEvents) {
            const payload = {
              path: relPath,
              action: "create",
              content: dryRun
                ? op.content
                : op.content ??
                  (await fs.readFile(fullPath, "utf8")).toString(),
              ts: new Date().toISOString(),
            };
            this.emit("file.operation", payload);
          }
        }

        // UPDATE (replace your existing UPDATE branch with checks)
        else if (op.action === "update") {
          const info = await pathInfo(fullPath);

          if (!info.exists) {
            // create as update behavior in your original code
            const contentToWrite =
              (op as any).encoding === "base64"
                ? Buffer.from(op.content ?? "", "base64")
                : String(op.content ?? "");
            if (!dryRun) {
              try {
                await this.writeAtomic(fullPath, contentToWrite);
              } catch (writeErr: any) {
                results.push({
                  path: op.path,
                  action: "update",
                  status: "failed",
                  message: `Write failed: ${
                    writeErr?.message ?? String(writeErr)
                  }`,
                });
                if (rollbackOnError)
                  await this.rollback(appliedStack, backupFolder);
                return { results, backupFolder };
              }
              results.push({
                path: op.path,
                action: "update",
                status: "applied",
                message: "file created (was missing)",
              });
              appliedStack.push({ op, meta: { created: true } });
            } else {
              results.push({
                path: op.path,
                action: "update",
                status: "applied",
                message: "dry-run (create)",
              });
              appliedStack.push({ op, meta: { created: false } });
            }

            if (publishEvents) {
              this.emit("file.operation", {
                path: relPath,
                action: "update",
                content: op.content,
                ts: new Date().toISOString(),
              });
            }
            continue;
          }

          // If exists but is a directory, fail
          if (info.isDirectory) {
            results.push({
              path: op.path,
              action: "update",
              status: "failed",
              message:
                "Target path exists and is a directory (cannot update file)",
            });
            if (rollbackOnError)
              await this.rollback(appliedStack, backupFolder);
            return { results, backupFolder };
          }

          // compare if not dry run
          if (!dryRun) {
            const current = await fs.readFile(fullPath, "utf8");
            if (current === (op.content ?? "")) {
              results.push({
                path: op.path,
                action: "update",
                status: "skipped",
                message: "content identical",
              });
              continue;
            }
          }

          const backupPath = backup
            ? await this.backupFile(fullPath, backupFolder!)
            : null;

          const contentToWrite =
            (op as any).encoding === "base64"
              ? Buffer.from(op.content ?? "", "base64")
              : String(op.content ?? "");

          if (!dryRun) {
            try {
              await this.writeAtomic(fullPath, contentToWrite);
            } catch (writeErr: any) {
              results.push({
                path: op.path,
                action: "update",
                status: "failed",
                message: `Write failed: ${
                  writeErr?.message ?? String(writeErr)
                }`,
              });
              if (rollbackOnError)
                await this.rollback(appliedStack, backupFolder);
              return { results, backupFolder };
            }

            results.push({
              path: op.path,
              action: "update",
              status: "applied",
              backupPath,
            });
            appliedStack.push({ op, meta: { backupPath, updated: true } });
          } else {
            results.push({
              path: op.path,
              action: "update",
              status: "applied",
              message: "dry-run (backup simulated)",
              backupPath,
            });
            appliedStack.push({ op, meta: { backupPath, updated: false } });
          }

          if (publishEvents) {
            const payload = {
              path: relPath,
              action: "update",
              content: dryRun
                ? op.content
                : await fs.readFile(fullPath, "utf8"),
              backupPath: backupPath ?? null,
              ts: new Date().toISOString(),
            };
            this.emit("file.operation", payload);
          }
        }

        // DELETE
        else if (op.action === "delete") {
          let exists = true;
          try {
            await fs.access(fullPath);
          } catch {
            exists = false;
          }

          if (!exists) {
            results.push({
              path: op.path,
              action: "delete",
              status: "skipped",
              message: "file not found",
            });
            continue;
          }

          const backupPath = backup
            ? await this.backupFile(fullPath, backupFolder!)
            : null;

          if (!dryRun) {
            await fs.rm(fullPath, { force: true });
            results.push({
              path: op.path,
              action: "delete",
              status: "applied",
              backupPath,
            });
            appliedStack.push({ op, meta: { backupPath, deleted: true } });
          } else {
            results.push({
              path: op.path,
              action: "delete",
              status: "applied",
              message: "dry-run (no delete)",
              backupPath,
            });
            appliedStack.push({ op, meta: { backupPath, deleted: false } });
          }

          if (publishEvents) {
            this.emit("file.operation", {
              path: relPath,
              action: "delete",
              backupPath: backupPath ?? null,
              ts: new Date().toISOString(),
            });
          }
        }
      } catch (err: any) {
        const message = err?.message ?? String(err);
        results.push({
          path: op?.path ?? "<unknown>",
          action: op?.action ?? ("create" as any),
          status: "failed",
          message,
        });

        if (rollbackOnError) {
          try {
            await this.rollback(appliedStack, backupFolder);
          } catch (rbErr) {
            results.push({
              path: "<rollback>",
              action: "delete",
              status: "failed",
              message: `Rollback failed: ${(rbErr as Error).message}`,
            });
          }
        }
        // emit failure summary for observers
        if (this.emitter) {
          this.emit("file.operations.summary", {
            results,
            backupFolder,
            ts: new Date().toISOString(),
          });
        }
        return { results, backupFolder };
      }
    }

    // final summary emit (all operations)
    if (this.emitter) {
      this.emit("file.operations.summary", {
        results,
        backupFolder,
        ts: new Date().toISOString(),
      });
    }

    return { results, backupFolder };
  }

  private async rollback(
    appliedStack: Array<{ op: FileOperation; meta?: any }>,
    backupFolder?: string | null
  ) {
    if (!appliedStack || appliedStack.length === 0) return;
    for (let i = appliedStack.length - 1; i >= 0; i--) {
      const { op, meta } = appliedStack[i];
      try {
        const fullPath = this.resolveSafe(op.path);
        if (meta?.created) {
          await fs.rm(fullPath, { force: true });
        }
        if (meta?.backupPath) {
          const b = meta.backupPath;
          try {
            await fs.access(b);
            await this.ensureDir(path.dirname(fullPath));
            await fs.copyFile(b, fullPath);
          } catch {
            // ignore missing backups
          }
        }
        if (meta?.deleted && meta?.backupPath) {
          const b = meta.backupPath;
          try {
            await fs.access(b);
            await this.ensureDir(path.dirname(fullPath));
            await fs.copyFile(b, fullPath);
          } catch {
            // ignore
          }
        }
      } catch {
        // continue best-effort
      }
    }
  }
}
