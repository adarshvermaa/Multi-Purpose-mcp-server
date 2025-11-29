import { spawn } from "child_process";
import path from "path";

export interface RunResult {
  stdout: string;
  stderr: string;
  code: number | null;
  timedOut?: boolean;
}

export async function runCmd(
  projectRoot: string,
  schema: {
    cmd?: string;
    command?: string;
    args?: string[];
    options?: {
      cwd?: string;
      env?: Record<string, string>;
      timeoutMs?: number;
    };
  }
): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const base = path.resolve(projectRoot);
    let cmd: string;
    let args: string[] = [];

    // Determine how to spawn
    if (schema.command) {
      cmd = schema.command;
      args = schema.args ?? [];
    } else if (schema.args && schema.args.length > 0) {
      cmd = schema.args[0];
      args = schema.args.slice(1);
    } else if (schema.cmd) {
      // run via shell
      cmd = "/bin/sh";
      args = ["-c", schema.cmd];
    } else {
      return reject(new Error("No command specified"));
    }

    const options: any = { cwd: base };
    if (schema.options?.cwd)
      options.cwd = path.resolve(base, schema.options.cwd);
    if (schema.options?.env)
      options.env = { ...process.env, ...schema.options.env };

    const child = spawn(cmd, args, {
      cwd: options.cwd,
      env: options.env,
      shell: false,
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let finished = false;

    const onFinish = (code: number | null) => {
      if (finished) return;
      finished = true;
      resolve({ stdout, stderr, code, timedOut });
    };

    child.stdout?.on("data", (d) => {
      stdout += d.toString();
    });
    child.stderr?.on("data", (d) => {
      stderr += d.toString();
    });

    child.on("error", (err) => {
      if (finished) return;
      finished = true;
      reject(err);
    });

    child.on("close", (code) => onFinish(code));

    if (schema.options?.timeoutMs && schema.options.timeoutMs > 0) {
      setTimeout(() => {
        if (!finished) {
          timedOut = true;
          child.kill("SIGKILL");
        }
      }, schema.options!.timeoutMs);
    }
  });
}
