import { readFileSync, Stats, statSync } from "fs";
import { readdirSync } from "fs-extra";
import { FileSnapshot } from "main/chats/chat.types";
import * as path from "path";

class FileSystemService {
  public snapshotDir(
    dir: string,
    prefix = "",
    ignore = ["node_modules", ".git", "dist"],
    maxFileSize = 10000 * 1024,
    maxContent = 100000
  ): FileSnapshot[] {
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
        // NOTE the `this.` prefix here
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
  }
}

export default new FileSystemService();
