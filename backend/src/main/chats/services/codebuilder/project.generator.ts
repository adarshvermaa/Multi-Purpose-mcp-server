import type { BuildModuleTreePayload, EmitOperation } from "../../chat.types";
import { AiService } from "./ai.service";
import { FileSystemService } from "./filesystem.service";
import { runCmd } from "./run-cmd.service";
import { v4 as uuidv4 } from "uuid";

export class ProjectGeneratorService {
  private ai = new AiService();
  private fs = new FileSystemService();

  constructor(private maxAttempts = 5) {}

  public async createProjectFromPrompt(payload: BuildModuleTreePayload) {
    const projectId = uuidv4();
    const root = await this.ai.buildModuleTree(
      payload.projectName,
      payload.prompt,
      payload.root
    );
    console.log("Generated module tree:", JSON.stringify(root, null, 2));
    const ops = this.buildOperationsFromTree(root);
    console.log("ops", ops);
    const emitResults = await this.fs.applyOperations(projectId, ops);
    return { projectId, root, ops, emitResults };
  }

  public buildOperationsFromTree(root: any): EmitOperation[] {
    const ops: EmitOperation[] = [];

    const traverse = (node: any, current = "") => {
      const folder = current ? `${current}/${node.name}` : node.name;
      if (node.files && Array.isArray(node.files)) {
        for (const f of node.files) {
          ops.push({
            path: `${folder}/${f.name}`,
            action: "create",
            content: f.content || "",
          });
        }
      }
      if (node.children && Array.isArray(node.children)) {
        for (const c of node.children) traverse(c, folder);
      }
    };

    traverse(root, "");
    return ops;
  }

  /**
   * High level: emit files, then run a test command (either provided or suggested by AI),
   * retry by asking AI to update module tree on errors and re-emitting until success (or attempts exhausted).
   */
  public async emitAndTestLoop(
    projectId: string,
    root: any,
    testCmdSchema?: any
  ) {
    let attempts = 0;
    let lastError: any = null;
    let currentRoot = root;

    while (attempts < this.maxAttempts) {
      attempts++;
      const ops = this.buildOperationsFromTree(currentRoot);
      const emitResults = await this.fs.applyOperations(projectId, ops);

      // choose run command: prefer provided testCmdSchema; else ask AI
      let runSchema = testCmdSchema;
      if (!runSchema) {
        try {
          runSchema = await this.ai.suggestRunCmd(projectId, {
            root: currentRoot,
            emitResults,
            lastError,
          });
        } catch (e) {
          // no suggested cmd — consider success if no errors in emit
          const hasEmitError = emitResults.some((r) => !r.ok);
          if (!hasEmitError) return { success: true, attempts, emitResults };
          lastError = new Error(
            "No run command suggested and emit reported errors"
          );
          currentRoot = await this.ai.buildModuleTree(
            projectId,
            { error: lastError?.message },
            currentRoot
          );
          continue;
        }
      }

      try {
        const projectRootPath = this.fs.resolveProjectPath(projectId, "");
        const runResult = await runCmd(projectRootPath, runSchema);
        const failed = runResult.code !== 0 || (runResult.timedOut ?? false);
        if (!failed) {
          return { success: true, attempts, emitResults, runResult };
        }
        lastError = new Error(
          `Run failed with code ${runResult.code}; stderr: ${runResult.stderr}`
        );
      } catch (err: any) {
        lastError = err;
      }

      // Ask AI to improve module tree using error context
      try {
        currentRoot = await this.ai.buildModuleTree(
          projectId,
          { error: lastError?.message, previousRoot: currentRoot },
          currentRoot
        );
      } catch (aiErr: any) {
        // If AI fails to provide improved tree, stop and return failure
        return { success: false, attempts, lastError: aiErr.message };
      }
    }

    return { success: false, attempts, lastError: lastError?.message };
  }
}
