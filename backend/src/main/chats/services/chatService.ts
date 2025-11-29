import { readdirSync, statSync, readFileSync, Stats } from "fs";
import * as path from "path";
import { spawn } from "node:child_process";
import { Observable } from "rxjs";
interface FileSnapshot {
  path: string;
  content: string;
}

class ChatService {
  constructor() {}

  public snapshotDir = (
    dir: string,
    prefix = "",
    ignore = ["node_modules", ".git", "dist"],
    maxFileSize = 10000 * 1024,
    maxContent = 100000
  ): FileSnapshot[] => {
    const files: FileSnapshot[] = [];
    let entries: string[];

    try {
      entries = readdirSync(dir);
    } catch {
      return files;
    }

    for (const name of entries) {
      if (ignore.includes(name)) continue;
      const full = path.join(dir, name);
      const rel = path.join(prefix, name);
      let stats: Stats;

      try {
        stats = statSync(full);
      } catch {
        continue;
      }

      if (stats.isDirectory()) {
        files.push(
          ...this.snapshotDir(full, rel, ignore, maxFileSize, maxContent)
        );
      } else if (stats.size <= maxFileSize) {
        let content = readFileSync(full, "utf8");
        if (content.length > maxContent) {
          content = content.slice(0, maxContent) + "\n/* ...truncated... */";
        }
        files.push({ path: rel, content });
      }
    }

    return files;
  };

  public truncate = (s?: string, max = 30_000) => {
    if (!s) return "";
    if (s.length <= max) return s;
    return s.slice(0, max) + "\n...TRUNCATED...";
  };

  /**
   * Safer stream runner for commands.
   * Default: shell disabled (useShell=false). If shell expansion is needed, pass useShell:true.
   */
  runCommandStream = (
    cmd: string,
    args: string[] = [],
    options: { cwd?: string; useShell?: boolean } = {}
  ): Observable<
    | { type: "stdout" | "stderr"; content: string }
    | { type: "error"; error: Error }
    | { type: "close"; code: number }
  > => {
    return new Observable((observer) => {
      try {
        console.log(`Spawning process: ${cmd} ${args.join(" ")}`);
        const proc = spawn(cmd, args, {
          shell: options.useShell === true ? true : false,
          cwd: options.cwd || process.cwd(),
        });

        proc.stdout.on("data", (buf: Buffer) =>
          observer.next({ type: "stdout", content: buf.toString() })
        );
        proc.stderr.on("data", (buf: Buffer) =>
          observer.next({ type: "stderr", content: buf.toString() })
        );

        proc.on("error", (err) => {
          observer.next({ type: "error", error: err });
          try {
            observer.complete();
          } catch {}
        });

        proc.on("close", (code) => {
          observer.next({ type: "close", code: code ?? -1 });
          try {
            observer.complete();
          } catch {}
        });
      } catch (err: any) {
        observer.next({ type: "error", error: err });
        try {
          observer.complete();
        } catch {}
      }
    });
  };
}

export default new ChatService();
