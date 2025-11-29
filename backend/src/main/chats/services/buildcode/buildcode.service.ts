import { FileSnapshot } from "main/chats/chat.types";
import { readdirSync, statSync, readFileSync, Stats } from "fs";
import path from "path";
// import { ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import fs from "fs";
import { spawn, exec } from "child_process";
import { platform } from "os";
// In your AppService
import { Observable } from "rxjs";
export type RunCmdOptions = {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  shell?: boolean;
};

export type RunCmdResult = {
  success: boolean;
  exitCode?: number;
  stdout: string;
  stderr: string;
  errorStack?: string;
  attempts?: Array<{ method: string; error?: string; exitCode?: number }>;
};
class CodeBuilderService {
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

  public async runCommand(
    command: string,
    args: string[] = [],
    options: RunCmdOptions = {}
  ): Promise<RunCmdResult> {
    const cwd = options.cwd ?? process.cwd();
    const env = { ...process.env, ...(options.env ?? {}) };

    // Defensive normalization & logging
    if (!command || typeof command !== "string") {
      return {
        success: false,
        stdout: "",
        stderr: "",
        errorStack: `Invalid command argument: ${String(command)}`,
        attempts: [
          { method: "validate", error: "command must be a non-empty string" },
        ],
      };
    }

    const normalizedArgs = (args || []).map((a) => {
      if (a === null || typeof a === "undefined") return "";
      if (typeof a === "string") return a;
      try {
        return String(a);
      } catch {
        return JSON.stringify(a);
      }
    });

    // quick debug log — remove or lower verbosity in production
    console.log("[runCommand] platform:", platform());
    console.log("[runCommand] cwd:", cwd);
    console.log("[runCommand] command:", command);
    console.log("[runCommand] args:", normalizedArgs);
    // avoid printing huge env, but include PATH for diagnosis
    console.log(
      "[runCommand] PATH snippet:",
      (process.env.PATH || "").slice(0, 300)
    );

    const attempts: RunCmdResult["attempts"] = [];

    const trySpawn = (cmd: string, argv: string[], shellFlag: boolean) =>
      new Promise<RunCmdResult>((resolve) => {
        let stdout = "";
        let stderr = "";

        try {
          const child = spawn(cmd, argv, { cwd, env, shell: shellFlag });

          child.stdout?.on("data", (d) => (stdout += d.toString()));
          child.stderr?.on("data", (d) => (stderr += d.toString()));

          child.on("error", (err: NodeJS.ErrnoException) => {
            attempts.push({
              method: `spawn:${shellFlag ? "shell" : "noshell"}:${cmd}`,
              error: err.message,
            });
            resolve({
              success: false,
              exitCode: undefined,
              stdout,
              stderr,
              errorStack: err.stack,
              attempts,
            });
          });

          child.on("close", (code) => {
            attempts.push({
              method: `spawn:${shellFlag ? "shell" : "noshell"}:${cmd}`,
              exitCode: code ?? undefined,
            });
            resolve({
              success: code === 0,
              exitCode: code ?? undefined,
              stdout,
              stderr,
              attempts,
              errorStack: code !== 0 ? stderr || stdout : undefined,
            });
          });
        } catch (syncErr: any) {
          // spawn itself threw synchronously (rare)
          attempts.push({
            method: `spawn_sync:${cmd}`,
            error: String(syncErr),
          });
          resolve({
            success: false,
            stdout: "",
            stderr: "",
            errorStack: syncErr?.stack || String(syncErr),
            attempts,
          });
        }
      });

    const tryExec = (cmdline: string) =>
      new Promise<RunCmdResult>((resolve) => {
        exec(
          cmdline,
          { cwd, env, maxBuffer: 10 * 1024 * 1024 },
          (err, stdout = "", stderr = "") => {
            if (err) {
              attempts.push({
                method: `exec:${cmdline}`,
                error: err.message,
                exitCode: (err as any).code,
              });
              resolve({
                success: false,
                exitCode: (err as any).code,
                stdout,
                stderr,
                errorStack: err.stack,
                attempts,
              });
            } else {
              attempts.push({ method: `exec:${cmdline}`, exitCode: 0 });
              resolve({ success: true, exitCode: 0, stdout, stderr, attempts });
            }
          }
        );
      });

    // 1) Try spawn with requested shell option (prefer shell true by default for package managers)
    const requestedShell =
      typeof options.shell === "boolean" ? options.shell : true;
    let result = await trySpawn(command, normalizedArgs, requestedShell);
    if (result.success) return result;

    // 2) If Windows ENOENT or spawn failure, and command is npm/pnpm/npx/yarn, try .cmd shim
    const isWin = platform() === "win32";
    const sawENOVariant =
      (result.errorStack || "").toLowerCase().includes("enoent") ||
      (result.attempts &&
        result.attempts.some(
          (a) => a.error && a.error.toLowerCase().includes("enoent")
        ));
    if (!result.success && isWin && sawENOVariant) {
      if (/^(npm|npx|pnpm|yarn)$/i.test(command)) {
        const cmdWithCmd = command.endsWith(".cmd")
          ? command
          : `${command}.cmd`;
        result = await trySpawn(cmdWithCmd, normalizedArgs, requestedShell);
        if (result.success) return result;
      }
    }

    // 3) Shell fallback — *do not* pass a combined string as command; call spawn with the same command & args but shell:true
    if (!result.success) {
      result = await trySpawn(command, normalizedArgs, true);
      if (result.success) return result;
    }

    // 4) Final fallback: exec the whole command line in a shell (less structured but works as last resort)
    if (!result.success) {
      const cmdlineSafe = [command, ...normalizedArgs]
        .map((p) => (typeof p === "string" ? p : JSON.stringify(p)))
        .join(" ");
      result = await tryExec(cmdlineSafe);
      return result;
    }

    return result;
  }
}

export default new CodeBuilderService();

// const maxAttemptsRun = 3;
// for (let attempt = 1; attempt <= maxAttemptsRun; attempt++) {
//   const messagesRunCmd: ChatCompletionMessageParam[] = [
//     {
//       role: "system",
//       content: [
//         "You are an expert DevOps-aware AI Assistant that chooses the single best CLI command to satisfy a developer's request.",
//         "You MUST return exactly one structured function call to `run_cmd` with JSON arguments only (no additional text).",
//         "The JSON MUST match this shape:",
//         "{",
//         "  projectId: string,",
//         "  cmd: string, // short human-friendly description",
//         "  command: string, // executable (e.g. 'pnpm','npm','npx','node')",
//         "  args: string[], // argument array (no shell concatenation)",
//         "  options?: { cwd?: string, env?: Record<string,string>, shell?: boolean, suggestions?: Array<{cmd:string,reason:string}> }",
//         "}",
//         "",
//         "Decision rules (follow in priority order):",
//         "1) Detect preferred package manager by presence of lockfiles: pnpm-lock.yaml -> pnpm, yarn.lock -> yarn, package-lock.json -> npm. If none, prefer npm.",
//         "2) If package.json contains a matching script (e.g. 'dev','start','build','test','typecheck'), prefer invoking the script via the chosen package manager: e.g. ['run','dev'] for npm/pnpm/yarn.",
//         "3) Use cwd to point to the correct subproject if the repo is monorepo-style (detect 'package.json' location under subfolders).",
//         "4) Prefer safe, deterministic flags for CI/builds (e.g. '--frozen-lockfile' for pnpm/yarn/npm where appropriate) and fast dev flags for local dev (e.g. '--watch' only when asked).",
//         "5) If multiple commands match the goal, choose the least-destructive option (typecheck or run tests) and include others as structured `options.suggestions` (not text).",
//         "6) Do NOT include secret values in `env`. Use '<REDACTED>' placeholders when a value is needed but not provided.",
//         "",
//         "Fallback rules (apply if you cannot confidently pick a single best command):",
//         "- If ambiguous, return a TypeScript typecheck: { command: chosenPackageManagerOrNpx, args: ['tsc','--noEmit'] }",
//         "- If project is JS-only and has no test/build scripts, return: { command: chosenPackageManager, args: ['run','start'] } if start script exists; else a safe `node` or `npx` invocation.",
//         "",
//         "Strict output rules:",
//         "- Do NOT return any plain language explanation in assistant content — only the function call must be used to return the JSON arguments.",
//         "- `args` must be an array of individual arguments (no combined shell string).",
//         "- `options.shell` should be true only if the command requires shell features; prefer `false` for portability.",
//         "- Include `options.suggestions` (array of {cmd, reason}) if there are helpful alternative commands.",
//         "- For long-running dev servers include `options.env` placeholders (e.g., PORT) if useful.",
//       ].join(" "),
//     },
//     {
//       role: "user",
//       content: [
//         "User request:",
//         userPrompt,
//         "",
//         "Use the project snapshot and package.json(s) to decide the best command.",
//         "If you need to assume the environment, use conservative defaults (NODE_ENV=development for dev, NODE_ENV=production for build).",
//       ].join("\n"),
//     },
//     {
//       role: "assistant",
//       content: [
//         "Project snapshot (paths + short content previews):",
//         JSON.stringify(
//           existing.map((f) => ({
//             path: f.path,
//             // include package.json content fully when present so model can pick scripts
//             content: /package\.json$/i.test(f.path)
//               ? f.content || ""
//               : f.content?.slice(0, 200) || "",
//           })),
//           null,
//           2
//         ),
//       ].join("\n"),
//     },
//   ];

//   const options = {
//     cwd: projectRoot,
//   };

//   const { fullMessage, toolCallName, toolCallArgsBuffer } =
//     await callModelWithToolsStream(messagesRunCmd, 32768);
//   const runCmd = JSON.parse(toolCallArgsBuffer);
//   const reverStream = CodeBuilderService.runCommandStream(
//     runCmd.command,
//     runCmd.args,
//     options
//   );

//   console.log("Tool call:", JSON.stringify(reverStream));
//   res.json({ ok: true, reverStream, runCmd });
// }
