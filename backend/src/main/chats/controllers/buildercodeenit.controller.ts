import { NextFunction, Response, Request } from "express";
import * as path from "path";
import CodeBuilderService from "../services/buildcode/buildcode.service";
import { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { callModelWithToolsStream } from "utils/aiClient";
import {
  FileOperation,
  FileSystemManager,
} from "../services/buildcode/fileSystem.service";
import {
  buildModuleTreeMessages,
  emitFilesMessages,
  emitPreviewMessages,
} from "../services/buildcode/prompt.service";

class BuilderCodeEmitterController {
  public buildingProject = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    const projectRoot = path.resolve(
      __dirname,
      "../../../../../client_generator/src/pages"
    );

    console.log(projectRoot);
    // const maxEmitAttempts = 2;

    try {
      const { userPrompt, socketId, thinkMode, stackType } = req.body;
      if (
        !userPrompt ||
        typeof userPrompt !== "string" ||
        !stackType ||
        typeof stackType !== "string"
      ) {
        return res
          .status(400)
          .json({ ok: false, error: "userPrompt stackType is required" });
      }

      const isThinkMode = Boolean(thinkMode);

      // snapshot existing files
      const existing = CodeBuilderService.snapshotDir(projectRoot);

      // call helper wrapper — returns toolCallArgsBuffer when tool call was emitted
      const callModelTool = async (messages: ChatCompletionMessageParam[]) => {
        const { toolCallName, toolCallArgsBuffer } =
          await callModelWithToolsStream(messages, 4000, socketId);
        return { toolCallName, toolCallArgsBuffer };
      };

      // 1) Build module tree
      const buildMessages = buildModuleTreeMessages(
        userPrompt,
        existing,
        stackType
      );

      const {
        toolCallName: buildToolName,
        toolCallArgsBuffer: moduleTreeBuffer,
      } = await callModelTool(buildMessages);

      if (
        buildToolName !== "build_module_tree_from_prompt" ||
        !moduleTreeBuffer
      ) {
        throw new Error("build_module_tree_from_prompt not returned by model");
      }

      // THINK MODE: produce preview + dry-run
      if (isThinkMode) {
        const previewMessages = emitPreviewMessages(
          moduleTreeBuffer,
          existing,
          stackType
        );

        const { toolCallArgsBuffer: previewBuffer } =
          await callModelWithToolsStream(previewMessages, 4000, socketId);

        if (!previewBuffer) {
          throw new Error("Preview JSON not returned by model");
        }

        let parsedPreview: { operations: FileOperation[]; rationale?: string };
        try {
          parsedPreview = JSON.parse(previewBuffer);
        } catch (e) {
          throw new Error("Invalid JSON returned from preview call");
        }

        // simulate application via dry-run
        const manager = new FileSystemManager(projectRoot);
        let previewApplyResult;
        try {
          previewApplyResult = await manager.applyOperations(
            parsedPreview.operations || [],
            {
              dryRun: true,
              backup: false,
              rollbackOnError: false,
              projectRoot,
            }
          );
        } catch (dryErr) {
          return res.status(500).json({
            ok: false,
            error: "Dry-run simulation failed",
            preview: parsedPreview,
            details: String(dryErr),
          });
        }

        return res.json({
          ok: true,
          mode: "think",
          moduleTree: (() => {
            try {
              return JSON.parse(moduleTreeBuffer as string);
            } catch {
              return moduleTreeBuffer;
            }
          })(),
          preview: parsedPreview,
          simulation: previewApplyResult?.results ?? null,
        });
      }

      // NORMAL FLOW: call emitFiles and apply operations
      const emitMessages = emitFilesMessages(
        moduleTreeBuffer,
        existing,
        stackType
      );

      const { toolCallName: emitToolName, toolCallArgsBuffer: emitArgs } =
        await callModelTool(emitMessages);

      if (emitToolName !== "emitFiles" || !emitArgs) {
        throw new Error("emitFiles tool not returned by model");
      }

      let parsed: { operations: FileOperation[] };
      try {
        parsed = JSON.parse(emitArgs);
      } catch (e) {
        throw new Error("Invalid JSON returned from emitFiles");
      }

      if (!Array.isArray(parsed.operations)) {
        throw new Error("emitFiles returned invalid operations");
      }

      const manager = new FileSystemManager(projectRoot);

      // try apply and retry once on failure
      let applyResult;
      try {
        applyResult = await manager.applyOperations(parsed.operations, {
          dryRun: false,
          backup: true,
          rollbackOnError: true,
          projectRoot,
        });
      } catch (applyErr) {
        console.error("applyOperations initial failure:", applyErr);

        // retry: re-emit and reapply
        const { toolCallArgsBuffer: emitArgsRetry } = await callModelTool(
          emitFilesMessages(moduleTreeBuffer, existing, stackType)
        );

        if (!emitArgsRetry) {
          return res.status(500).json({
            ok: false,
            error: "Failed to re-emit files after apply failure",
            details: String(applyErr),
          });
        }

        let parsedRetry;
        try {
          parsedRetry = JSON.parse(emitArgsRetry);
        } catch (e) {
          return res.status(500).json({
            ok: false,
            error: "Invalid JSON returned from re-emit",
            details: String(e),
          });
        }

        try {
          applyResult = await manager.applyOperations(parsedRetry.operations, {
            dryRun: false,
            backup: true,
            rollbackOnError: true,
            projectRoot,
          });
        } catch (applyErr2) {
          console.error("applyOperations retry failed:", applyErr2);
          return res.status(500).json({
            ok: false,
            error: "Failed to apply file operations after retries",
            details: String(applyErr2),
          });
        }
      }

      const backupFolder = applyResult?.backupFolder;
      res.send({ ok: true, backupFolder, results: applyResult?.results });
    } catch (err) {
      next(err);
    }
  };
}

export default new BuilderCodeEmitterController();
