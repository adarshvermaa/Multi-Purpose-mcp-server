import { Request, Response, NextFunction } from "express";
import aiService from "../services/ai.service";
import fileService from "../services/file.service";
import { runCommandSafe } from "../services/run.service";
import jobService from "../services/job.service";
import { ChatCompletionMessageParam } from "openai/resources/chat/completions";

/**
 * Helper: robustly extract assistant text from various OpenAI SDK shapes
 */
function getCircularReplacer() {
  const seen = new WeakSet();
  return (_key: string, value: any) => {
    if (typeof value === "object" && value !== null) {
      if (seen.has(value)) return "[Circular]";
      seen.add(value);
    }
    return value;
  };
}

function extractAssistantContent(resp: any): string {
  if (!resp) return "";
  const choice =
    resp.choices?.[0] ?? resp?.output?.[0] ?? resp?.message ?? null;
  if (!choice) return "";

  const msg = choice.message ?? choice;

  // content as plain string
  if (msg?.content && typeof msg.content === "string")
    return msg.content.trim();

  // message.content as array or object with parts
  if (Array.isArray(msg?.content)) return msg.content.join("").trim();
  if (msg?.content?.parts && Array.isArray(msg.content.parts))
    return msg.content.parts.join("").trim();

  // some responses use message.content as object with `text` or `segments`
  if (typeof msg?.content === "object") {
    if (typeof msg?.content?.text === "string")
      return msg?.content?.text?.trim();
    if (Array.isArray(msg?.content?.segments))
      return msg?.content?.segments?.join("").trim();
  }

  // older fields
  if (typeof choice?.text === "string") return choice.text.trim();
  if (typeof choice?.output_text === "string") return choice.output_text.trim();

  // last resort: stringify a small portion
  try {
    const s = JSON.stringify(
      choice?.message ?? choice ?? "",
      getCircularReplacer()
    );
    return typeof s === "string" ? s.slice(0, 20000) : "";
  } catch {
    return "";
  }
}

class AIController {
  public runPrompt = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const { prompt, projectId, userId } = req.body;
      if (!prompt)
        return res.status(400).json({ ok: false, error: "prompt required" });

      // Initial messages seed
      const messages: ChatCompletionMessageParam[] = [
        {
          role: "system",
          content:
            "You are an AI code generator. Use tools: createProject, emitFiles, applyPatch, runCommand, runJobStatus, listFiles, getFile, formatFile. When calling a tool, return a function_call. After the tool result is provided, respond in plain text.",
        },
        { role: "user", content: prompt },
      ];

      // Stream parse first response (may be plain text or a tool call)
      const parsed = await aiService.streamAndParseChat(messages);
      const { fullMessage, toolCallName, toolCallArgsBuffer, toolCallId } =
        parsed;
      // If no tool call, return plain assistant text
      if (!toolCallName) {
        const replyText = (fullMessage || "").toString().trim();
        return res.json({ ok: true, modelReply: replyText });
      }
      console.log(toolCallName, toolCallArgsBuffer);

      // Parse function args
      let argsObj: any = {};
      try {
        argsObj = toolCallArgsBuffer ? JSON.parse(toolCallArgsBuffer) : {};
      } catch (err) {
        // Ask model to reformat arguments
        messages.push({
          role: "assistant",
          content: `Invalid function_call arguments: ${String(
            err
          )}. Raw args: ${String(toolCallArgsBuffer).slice(0, 2000)}`,
        });
        const r2 = await aiService.callChatModel(messages);
        const fallback = extractAssistantContent(r2);
        return res.status(400).json({
          ok: false,
          error: "Invalid function_call arguments (JSON parse failed)",
          modelReply: fallback,
          rawArgsSample: String(toolCallArgsBuffer).slice(0, 2000),
        });
      }

      // Add the assistant message with tool_calls to the conversation
      messages.push({
        role: "assistant",
        content: null,
        tool_calls: [
          {
            id: toolCallId ?? "",
            type: "function",
            function: {
              name: toolCallName,
              arguments: toolCallArgsBuffer || "{}",
            },
          },
        ],
      });

      // Handle tool calls
      if (toolCallName === "createProject") {
        if (!argsObj?.title || !argsObj?.prompt) {
          return res.status(400).json({
            ok: false,
            error: "createProject requires title and prompt",
            rawArgsSample: String(toolCallArgsBuffer).slice(0, 2000),
          });
        }

        const result = await fileService.createProject(argsObj);
        messages.push({
          role: "tool",
          tool_call_id: toolCallId ?? "",
          content: JSON.stringify(result),
        });

        const r2 = await aiService.callChatModel(messages);
        const modelReply = extractAssistantContent(r2);
        return res.json({ ok: !!result?.ok, project: result, modelReply });
      }

      if (toolCallName === "emitFiles") {
        const result = await fileService.createSuggestion(argsObj);
        messages.push({
          role: "tool",
          tool_call_id: toolCallId ?? "",
          content: JSON.stringify(result),
        });
        const r2 = await aiService.callChatModel(messages);
        const modelReply = extractAssistantContent(r2);
        if (!modelReply || modelReply.trim().length === 0) {
          return res.json({
            ok: true,
            suggestion: result,
            modelReply: "",
            debug: {
              note: "Model returned no textual reply after emitFiles.",
              toolResult: result,
              rawModelResp:
                r2 && typeof r2 === "object"
                  ? JSON.parse(JSON.stringify(r2, getCircularReplacer()))
                  : r2,
            },
          });
        }
        return res.json({ ok: true, suggestion: result, modelReply });
      }
      if (toolCallName === "applyPatch") {
        const result = await fileService.applyPatch(argsObj);
        messages.push({
          role: "tool",
          tool_call_id: toolCallId ?? "",
          content: JSON.stringify(result),
        });
        const r2 = await aiService.callChatModel(messages);
        const modelReply = extractAssistantContent(r2);
        if (!modelReply || modelReply.trim().length === 0) {
          return res.json({
            ok: true,
            applied: result,
            modelReply: "",
            debug: {
              note: "Model returned no textual reply after applyPatch.",
              toolResult: result,
              rawModelResp:
                r2 && typeof r2 === "object"
                  ? JSON.parse(JSON.stringify(r2, getCircularReplacer()))
                  : r2,
            },
          });
        }
        return res.json({ ok: true, applied: result, modelReply });
      }

      if (toolCallName === "runCommand") {
        if (!argsObj?.projectId || !argsObj?.cmd) {
          return res.status(400).json({
            ok: false,
            error: "runCommand requires projectId and cmd",
          });
        }
        const job = jobService.create(argsObj.projectId, "runCommand");
        jobService.update(job.id, { status: "running" });

        const runResult = await runCommandSafe(argsObj);
        jobService.update(job.id, {
          status:
            runResult &&
            typeof runResult === "object" &&
            "ok" in runResult &&
            runResult.ok
              ? "success"
              : "failed",
          result: runResult,
        });

        messages.push({
          role: "tool",
          tool_call_id: toolCallId ?? "",
          content: JSON.stringify(runResult),
        });
        const r2 = await aiService.callChatModel(messages);
        const modelReply = extractAssistantContent(r2);
        return res.json({ ok: true, jobId: job.id, runResult, modelReply });
      }

      if (toolCallName === "runJobStatus") {
        const { projectId, jobId } = argsObj;
        const job = jobService.get(jobId);
        messages.push({
          role: "tool",
          tool_call_id: toolCallId ?? "",
          content: JSON.stringify(job),
        });
        const r2 = await aiService.callChatModel(messages);
        const modelReply = extractAssistantContent(r2);
        return res.json({ ok: true, job, modelReply });
      }

      if (toolCallName === "listFiles") {
        const { projectId: pId, path: relPath = ".", depth = 2 } = argsObj;
        const list = await fileService.listFiles(pId, relPath, depth);
        messages.push({
          role: "tool",
          tool_call_id: toolCallId ?? "",
          content: JSON.stringify(list),
        });
        const r2 = await aiService.callChatModel(messages);
        const modelReply = extractAssistantContent(r2);
        return res.json({ ok: true, list, modelReply });
      }

      if (toolCallName === "getFile") {
        const { projectId: pId, path: relPath } = argsObj;
        const file = await fileService.getFile(pId, relPath);
        messages.push({
          role: "tool",
          tool_call_id: toolCallId ?? "",
          content: JSON.stringify(file),
        });
        const r2 = await aiService.callChatModel(messages);
        const modelReply = extractAssistantContent(r2);
        return res.json({ ok: true, file, modelReply });
      }

      if (toolCallName === "formatFile") {
        messages.push({
          role: "tool",
          tool_call_id: toolCallId ?? "",
          content: JSON.stringify({
            ok: false,
            error: "formatFile not implemented",
          }),
        });
        const r2 = await aiService.callChatModel(messages);
        const modelReply = extractAssistantContent(r2);
        return res.json({
          ok: true,
          modelReply,
          note: "formatFile endpoint not implemented",
        });
      }

      return res
        .status(400)
        .json({ ok: false, error: `Unknown function: ${toolCallName}` });
    } catch (err) {
      next(err);
    }
  };
}

export default new AIController();
