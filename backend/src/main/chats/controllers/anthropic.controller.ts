// src/controllers/AnthropicController.ts  (replace method body)
import { NextFunction, Response, Request } from "express";
import * as path from "path";
import CodeBuilderService from "../services/buildcode/buildcode.service";
import {
  callModelWithToolsStream,
  extractJsonFromText,
} from "../../../utils/Anthropic.utils";
import {
  FileOperation,
  FileSystemManager,
} from "../services/buildcode/fileSystem.service";
import {
  buildModuleTreeMessages,
  emitFilesMessages,
} from "../services/buildcode/prompt.service";

const projectRoot = path.resolve(__dirname, "../../../../../web");

function trimMessagesContent(messages: any[]) {
  // Remove trailing whitespace from every message content to avoid API errors
  return messages.map((m) => {
    if (!m || typeof m.content !== "string") return m;
    return { ...m, content: m.content.replace(/\s+$/u, "") };
  });
}

/**
 * Extract first balanced JSON object starting at the last occurrence of '{"tool"'
 * Returns parsed object or null.
 */
function extractToolJsonFromText(
  raw: string
): { tool?: string; args?: any } | null {
  if (!raw || typeof raw !== "string") return null;
  const lastIndex = raw.lastIndexOf('{"tool"');
  if (lastIndex === -1) return null;

  let i = lastIndex;
  let depth = 0;
  let inString = false;
  let escape = false;
  let endIndex = -1;
  for (; i < raw.length; i++) {
    const ch = raw[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === "\\") {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          endIndex = i;
          break;
        }
      }
    }
  }
  if (endIndex > lastIndex) {
    const jsonStr = raw.slice(lastIndex, endIndex + 1);
    try {
      const parsed = JSON.parse(jsonStr);
      return parsed;
    } catch (e) {
      return null;
    }
  }
  return null;
}

/**
 * Normalize tool call result: accept either explicit tool metadata returned by
 * callModelWithToolsStream or fallback-extract from raw assistant text fields.
 *
 * Returns object { tool, argsBuffer, raw } or throws with diagnostics.
 */
function normalizeToolResult(
  rawResult: any,
  emitFn?: (ev: string, d: any) => void
) {
  const out: { tool?: string; argsBuffer?: string; raw?: any } = {
    raw: rawResult,
  };

  // If the tool runner already detected a tool, use it:
  if (rawResult && rawResult.toolCallName) {
    out.tool = rawResult.toolCallName;
    out.argsBuffer =
      rawResult.toolCallArgsBuffer ?? rawResult.toolCallArgs ?? "";
    return out;
  }

  // Try to find common assistant text fields that may contain the JSON
  const candidateTexts: string[] = [];
  if (rawResult?.outputText) candidateTexts.push(rawResult.outputText);
  if (rawResult?.text) candidateTexts.push(rawResult.text);
  if (rawResult?.assistantMessage?.content)
    candidateTexts.push(rawResult.assistantMessage.content);
  if (rawResult?.content) candidateTexts.push(rawResult.content);
  if (rawResult?.message) candidateTexts.push(rawResult.message);
  // join them, take last
  const joined = candidateTexts.join("\n\n");

  if (!joined) {
    // nothing to extract
    const msg = "No assistant text available to extract tool call from.";
    if (emitFn) emitFn("debug", { message: msg, raw: rawResult });
    throw new Error(msg);
  }

  const parsed = extractToolJsonFromText(joined);
  if (!parsed) {
    // Try looser: perhaps the assistant returned JSON only for args (no wrapper)
    try {
      const maybeArgs = JSON.parse(joined);
      // not a wrapper, but might be args
      out.tool = undefined;
      out.argsBuffer = JSON.stringify(maybeArgs);
      return out;
    } catch (e) {
      const msg = "Failed to extract tool JSON from assistant output.";
      if (emitFn) emitFn("assistant_raw", { raw: joined.slice(0, 2000) });
      throw new Error(msg);
    }
  }

  // Successfully extracted wrapper JSON
  out.tool = parsed.tool;
  out.argsBuffer = JSON.stringify(parsed.args ?? {});
  return out;
}

class AnthropicController {
  public buildingProject = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    const { userPrompt, socketId, stackType = "enhanced-html" } = req.body;

    if (!userPrompt || !socketId) {
      return res
        .status(400)
        .json({ ok: false, error: "userPrompt and socketId are required" });
    }

    const emit = (event: string, data: any) => {
      try {
        const io = (global as any).__expressIoInstance;
        if (io && socketId) {
          io.to(socketId).emit(`ai:${event}`, data);
        }
      } catch (err) {
        console.warn("Socket emit error:", err);
      }
    };

    try {
      console.log(`Building project in: ${projectRoot}`);
      emit("status", {
        message: "Starting new project build...",
        stage: "init",
      });

      // 1. Snapshot current state
      const existingSnapshot = CodeBuilderService.snapshotDir(projectRoot);
      emit("snapshot", { files: existingSnapshot.length });

      // 2. Phase 1: Build Module Tree
      emit("status", {
        message: "Designing architecture with AI...",
        stage: "planning",
      });

      // Prepare messages and trim trailing whitespace on each message content
      const buildMsgs = trimMessagesContent(
        buildModuleTreeMessages(userPrompt, existingSnapshot, stackType)
      );

      const rawTreeResult = await callModelWithToolsStream(buildMsgs, socketId);
      console.log("rawTreeResult:", rawTreeResult);
      emit("debug", {
        rawTreeResult:
          typeof rawTreeResult === "object"
            ? JSON.stringify(rawTreeResult).slice(0, 2000)
            : String(rawTreeResult),
      });

      // normalize/fallback-extract
      let treeTool;
      try {
        const normalized = normalizeToolResult(rawTreeResult, (e, d) =>
          emit(e, d)
        );
        treeTool = normalized;
      } catch (err: any) {
        emit("error", {
          message: "Failed to parse module-tree tool call",
          detail: err.message,
        });
        throw new Error(
          "Failed to parse module-tree tool call: " + err.message
        );
      }

      if (treeTool.tool !== "build_module_tree_from_prompt") {
        throw new Error(
          `Expected build_module_tree_from_prompt, got ${
            treeTool.tool ?? "unknown"
          }`
        );
      }

      let moduleTreeObj;
      try {
        moduleTreeObj = JSON.parse(treeTool.argsBuffer ?? "{}");
      } catch (err) {
        throw new Error("Failed to JSON.parse moduleTree argsBuffer");
      }

      // moduleTree might be nested under .moduleTree
      const moduleTree = moduleTreeObj.moduleTree ?? moduleTreeObj;
      emit("module_tree", { tree: moduleTree, stage: "tree_complete" });
      console.log(
        "Module tree generated:",
        JSON.stringify(moduleTree, null, 2)
      );

      // --- Replace the current filesResult handling with this block ---
      // 3. Phase 2: Generate Files
      emit("status", {
        message:
          "Generating stunning UI with GSAP + Tailwind + Alpine + Premium CDNs...",
        stage: "generating",
      });

      const rawFilesResult: any = await callModelWithToolsStream(
        emitFilesMessages(moduleTree, existingSnapshot, stackType),
        socketId
      );
      console.log("rawFilesResult:", rawFilesResult);
      emit("debug", {
        rawFilesResult:
          typeof rawFilesResult === "object"
            ? JSON.stringify(rawFilesResult).slice(0, 2000)
            : String(rawFilesResult),
      });

      // helper: loose parse JSON substring
      function tryParseJsonLoose(s?: string): any | null {
        if (!s) return null;
        try {
          return JSON.parse(s);
        } catch {}
        // try balanced braces/array
        const firstObj = s.indexOf("{");
        const lastObj = s.lastIndexOf("}");
        if (firstObj !== -1 && lastObj !== -1 && lastObj > firstObj) {
          try {
            return JSON.parse(s.slice(firstObj, lastObj + 1));
          } catch {}
        }
        const firstArr = s.indexOf("[");
        const lastArr = s.lastIndexOf("]");
        if (firstArr !== -1 && lastArr !== -1 && lastArr > firstArr) {
          try {
            return JSON.parse(s.slice(firstArr, lastArr + 1));
          } catch {}
        }
        return null;
      }

      // Normalize values from callModelWithToolsStream
      let filesToolName: string | undefined = rawFilesResult?.toolCallName;
      let filesArgsBuffer: string | undefined =
        rawFilesResult?.toolCallArgsBuffer;
      const fullMessage: string = String(rawFilesResult?.fullMessage ?? "");
      const rawObj = rawFilesResult?.raw ?? null;

      // If toolName is unknown, try robust extraction from fullMessage
      if (!filesToolName || filesToolName === "unknown") {
        // 1) try the extractor (handles fenced ```json and balanced braces)
        const parsedFromFull = extractJsonFromText(fullMessage);
        if (parsedFromFull && typeof parsedFromFull === "object") {
          // wrapper with tool + args
          if (
            parsedFromFull.tool &&
            (parsedFromFull.args || parsedFromFull.arguments)
          ) {
            filesToolName = String(parsedFromFull.tool);
            filesArgsBuffer = JSON.stringify(
              parsedFromFull.args ?? parsedFromFull.arguments ?? {}
            );
            emit("debug", {
              message: "extractJsonFromText: found wrapper with tool",
              tool: filesToolName,
            });
          }
          // or an args-like object (emitFiles args with operations)
          else if (
            Array.isArray(parsedFromFull.operations) ||
            Array.isArray(parsedFromFull)
          ) {
            filesToolName = "emitFiles";
            filesArgsBuffer = JSON.stringify(
              Array.isArray(parsedFromFull.operations)
                ? parsedFromFull
                : { operations: parsedFromFull }
            );
            emit("debug", {
              message: "extractJsonFromText: found operations object",
              operations:
                (parsedFromFull.operations ?? parsedFromFull).length ?? null,
            });
          }
        }

        // 2) fallback: maybe toolCallArgsBuffer already contains a single operation object (common bug)
        if (
          (!filesToolName || filesToolName === "unknown") &&
          filesArgsBuffer
        ) {
          const tryArgs = tryParseJsonLoose(filesArgsBuffer);
          if (tryArgs && typeof tryArgs === "object") {
            // if this looks like a single op (has path + action), wrap it into operations array
            if (tryArgs.path && tryArgs.action) {
              filesToolName = "emitFiles";
              filesArgsBuffer = JSON.stringify({ operations: [tryArgs] });
              emit("debug", {
                message:
                  "Wrapped single op into operations array (from toolCallArgsBuffer)",
              });
            } else if (Array.isArray(tryArgs.operations)) {
              filesToolName = "emitFiles";
              filesArgsBuffer = JSON.stringify(tryArgs);
            }
          }
        }

        // 3) last resort: try to find a ```json fenced block that mentions "tool":"emitFiles"
        if ((!filesToolName || filesToolName === "unknown") && fullMessage) {
          const fenceMatch =
            fullMessage.match(/```json\s*([\s\S]*?)```/i) ||
            fullMessage.match(/```([\s\S]*?)```/i);
          if (fenceMatch && fenceMatch[1]) {
            const inner = fenceMatch[1].trim();
            const parsedInner = tryParseJsonLoose(inner);
            if (parsedInner && parsedInner.tool && parsedInner.args) {
              filesToolName = String(parsedInner.tool);
              filesArgsBuffer = JSON.stringify(parsedInner.args);
              emit("debug", { message: "Parsed fenced JSON block" });
            } else if (parsedInner && Array.isArray(parsedInner.operations)) {
              filesToolName = "emitFiles";
              filesArgsBuffer = JSON.stringify(parsedInner);
              emit("debug", { message: "Parsed fenced JSON operations block" });
            }
          }
        }
      }

      // still unknown -> emit raw snippet + throw helpful error
      if (filesToolName !== "emitFiles") {
        emit("assistant_raw_files_result", {
          rawSnippet: fullMessage?.slice(0, 4000),
          inferredTool: filesToolName ?? null,
          toolCallArgsBuffer: filesArgsBuffer?.slice?.(0, 2000) ?? null,
          rawObjPreview: rawObj ? JSON.stringify(rawObj).slice(0, 2000) : null,
        });
        throw new Error(
          `Expected emitFiles, got ${filesToolName ?? "unknown"}`
        );
      }

      // parse args (now guaranteed to exist)
      let parsedFilesArgs: any = {};
      try {
        parsedFilesArgs = filesArgsBuffer ? JSON.parse(filesArgsBuffer) : {};
      } catch (err) {
        // fallback: try to parse fullMessage for operations
        const fallback = tryParseJsonLoose(fullMessage);
        if (fallback) parsedFilesArgs = fallback;
        else throw new Error("Failed to parse emitFiles args buffer JSON");
      }

      // operations may be under parsedFilesArgs.operations or parsedFilesArgs may itself be an array
      let operations: FileOperation[] | null = null;
      if (Array.isArray(parsedFilesArgs.operations))
        operations = parsedFilesArgs.operations;
      else if (Array.isArray(parsedFilesArgs)) operations = parsedFilesArgs;
      else if (
        parsedFilesArgs?.operations &&
        Array.isArray(parsedFilesArgs.operations)
      )
        operations = parsedFilesArgs.operations;

      if (!Array.isArray(operations)) {
        throw new Error(
          "Invalid operations format: operations must be an array"
        );
      }

      // Basic validation of ops
      const invalidOps = operations.filter((op) => {
        if (
          !op ||
          typeof op.path !== "string" ||
          !["create", "update", "delete"].includes(op.action)
        )
          return true;
        if (
          (op.action === "create" || op.action === "update") &&
          typeof op.content !== "string"
        )
          return true;
        return false;
      });
      if (invalidOps.length > 0) {
        emit("debug", {
          invalidOpsCount: invalidOps.length,
          invalidOpsSample: invalidOps.slice(0, 3),
        });
        throw new Error(
          "Operations failed validation (missing path/action/content)"
        );
      }

      emit("file_operations", { operations, count: operations.length });

      // Apply operations as before
      const fileManager = new FileSystemManager(
        projectRoot,
        (eventName, payload) => {
          emit(eventName, payload);
        }
      );

      const { results } = await fileManager.applyOperations(operations, {
        dryRun: false,
        backup: false,
        rollbackOnError: true,
        publishEvents: true,
      });

      const successCount = results.filter(
        (r) => r.status === "applied" || r.status === "skipped"
      ).length;
      emit("build_complete", {
        success: true,
        message: `✨ Project built successfully! ${successCount}/${operations.length} files applied`,
        results,
        moduleTree,
        operations,
      });

      return res.json({
        ok: true,
        message: "Project built successfully",
        filesApplied: successCount,
        totalFiles: operations.length,
        moduleTree,
      });
    } catch (error: any) {
      console.error("Build failed:", error);
      emit("error", {
        message: error.message || "Unknown error during build",
        fullError: error.stack,
      });

      return res.status(500).json({
        ok: false,
        error: error.message || "Build failed",
      });
    }
  };
}

export default new AnthropicController();
