import { spawn } from "child_process";
import path from "path";
import { RunCommandSchema } from "../schemas/zod/chat.schemas";

function resolveProjectRoot(projectId: string) {
  const PROJECTS_ROOT =
    process.env.PROJECTS_ROOT || path.resolve(process.cwd(), "workspaces");
  return path.resolve(PROJECTS_ROOT, projectId);
}

/**
 * Safer runCommand implementation:
 * - strict allowlist
 * - modal args enforcement (parsed.args should be array)
 * - output size guarding (maxOutput)
 * - timeout and force-kill
 */

export async function runCommandSafe(raw: unknown) {
  const parsed = RunCommandSchema.parse(raw);

  // tighten allowlist as needed
  const ALLOWED = new Set([
    "npm",
    "pnpm",
    "yarn",
    "npx",
    "node",
    "docker",
    "docker-compose",
    "git",
    "ls",
    "echo",
  ]);

  const baseCmd = (parsed.cmd || "").split(/\s+/)[0];
  if (!ALLOWED.has(baseCmd)) {
    return {
      ok: false,
      error: "command not allowed",
      code: null,
      stdout: "",
      stderr: "",
    };
  }

  const projectRoot = resolveProjectRoot(parsed.projectId);
  const cwd = parsed.cwd ? path.resolve(projectRoot, parsed.cwd) : projectRoot;

  // ensure cwd inside project root
  if (!cwd.startsWith(projectRoot)) {
    return {
      ok: false,
      error: "cwd outside project",
      code: null,
      stdout: "",
      stderr: "",
    };
  }

  const timeoutMs = parsed.options?.timeoutMs ?? 5 * 60_000;
  const maxOutput = parsed.options?.resourceLimits?.memoryMb ?? 200_000; // bytes

  return new Promise((resolve) => {
    const args = Array.isArray(parsed.args) ? parsed.args : [];
    const proc = spawn(parsed.cmd, args, {
      shell: false,
      cwd,
      env: { ...process.env },
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      try {
        proc.kill("SIGTERM");
        setTimeout(() => proc.kill("SIGKILL"), 2000);
      } catch {}
    }, timeoutMs);

    const maybeKillForSize = () => {
      if (stdout.length + stderr.length > maxOutput) {
        try {
          proc.kill("SIGTERM");
          setTimeout(() => proc.kill("SIGKILL"), 2000);
        } catch {}
      }
    };

    proc.stdout?.on("data", (b: Buffer) => {
      stdout += b.toString();
      maybeKillForSize();
    });
    proc.stderr?.on("data", (b: Buffer) => {
      stderr += b.toString();
      maybeKillForSize();
    });

    proc.on("error", (err) => {
      clearTimeout(timer);
      resolve({
        ok: false,
        error: String(err),
        code: null,
        stdout: truncate(stdout),
        stderr: truncate(stderr),
      });
    });

    proc.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        ok: true,
        error: timedOut ? "timeout" : undefined,
        code,
        stdout: truncate(stdout),
        stderr: truncate(stderr),
      });
    });

    function truncate(s: string) {
      if (!s) return "";
      if (s.length <= maxOutput) return s;
      return s.slice(0, maxOutput) + "\n...TRUNCATED...";
    }
  });
}

export default { runCommandSafe };
