import { NextFunction, Request, Response } from "express";
import path from "path";
import ChatService from "../services/chatService";
import {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/chat/completions";
import { OpenAI } from "openai";
import { functions } from "../../chats/schemas/ai/functions";
import { unlinkSync } from "node:fs";
import { platform } from "os";
import { spawn } from "child_process";
import { mkdirSync, writeFileSync } from "fs";
import { EmitFilesSchema } from "../schemas/zod/chat.schemas";

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  throw new Error("Missing OpenAI API key in environment variables");
}
const openai = new OpenAI({ apiKey });

class MainChatsController {
  public addChats = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const {
        body: { userPrompt, socketId },
      } = req;

      console.log(
        "🚀 ~ file: chat.controller.ts:22 ~ MainChatsController ~ addChats ~ userPrompt:",
        userPrompt
      );
      if (!userPrompt) {
        throw new Error('Missing "userPrompt" or "socketId" in request body');
      }

      const projectRoot =
        (process.env.AI_SERVER_ROOT &&
          path.resolve(process.env.AI_SERVER_ROOT)) ||
        path.resolve(__dirname, "../../../../../../aiServer");

      function isPathInside(root: string, resolved: string) {
        const rootNormalized = path.resolve(root) + path.sep;
        const resolvedNormalized = path.resolve(resolved) + path.sep;
        return resolvedNormalized.startsWith(rootNormalized);
      }
      const existing = ChatService.snapshotDir(projectRoot);
      const messages: ChatCompletionMessageParam[] = [
        {
          role: "system",
          content: [
            "You are an AI Code Generator & Debugger.",
            "Use project snapshot and user prompt to emit only tool calls: emitFiles or runCommand.",
          ].join(" "),
        },
        { role: "user", content: userPrompt },
        {
          role: "assistant",
          content: `Snapshot paths:\n${JSON.stringify(
            existing.map((f) => f.path),
            null,
            2
          )}`,
        },
      ];

      const functionsSchemas = functions as ChatCompletionTool[];

      const maxAttempts = 50;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const stream = await openai.chat.completions.create({
          model: "gpt-4.1-2025-04-14",
          messages,
          tools: functionsSchemas,
          tool_choice: "auto",
          stream: true,
        });

        let fullMessage = "";
        let toolCallName = "";
        let toolCallArgsBuffer = "";

        for await (const chunk of stream) {
          const choice = chunk.choices[0];
          const delta = choice.delta;
          if (delta?.content) {
            fullMessage += delta.content;
            // this.gateway.sendMessageChunk(socketId, delta.content);
          }

          if (delta?.tool_calls) {
            for (const toolCallDelta of delta.tool_calls) {
              if (toolCallDelta.index === 0) {
                // Handle first tool call
                if (toolCallDelta.function?.name && !toolCallName) {
                  toolCallName = toolCallDelta.function.name;
                }
                if (toolCallDelta.function?.arguments) {
                  toolCallArgsBuffer += toolCallDelta.function.arguments;
                }
              }
            }
          }
        }

        // this.gateway.sendFinalMessage(socketId, fullMessage);

        if (toolCallName && toolCallArgsBuffer) {
          let functionArgs: {
            operations?: { action: string; path: string; content?: string }[];
            cmd?: string;
            args?: string[];
          };
          try {
            // console.log('funcArgsBuffer:', toolCallArgsBuffer); // Debug log
            functionArgs = JSON.parse(toolCallArgsBuffer) as {
              operations?: { action: string; path: string; content?: string }[];
              cmd?: string;
              args?: string[];
            };
            console.log("functionArgs:", functionArgs);
            // path,
            for (const { content } of functionArgs?.operations ?? []) {
              if (content !== undefined) {
                console.log(content);
                // this.gateway.sendFinalMessage(socketId, content);
                // this.gateway.sendMessageChunk(socketId, content);
              }
            }
          } catch (err) {
            // console.error('Failed to parse funcArgsBuffer:', toolCallArgsBuffer);
            const errorMessage =
              err instanceof Error ? err.message : "Unknown error";
            throw new Error(`Invalid function_call arguments: ${errorMessage}`);
          }

          if (toolCallName === "emitFiles") {
            const operations = functionArgs.operations || [];
            if (!Array.isArray(operations) || operations.length === 0) {
              messages.push({
                role: "assistant",
                content: "emitFiles called with no operations.",
              });
              continue;
            }
            for (const op of operations) {
              console.log(op);
              if (!op || typeof op.path !== "string" || !op.path.trim()) {
                console.warn("Skipping operation with invalid path:", op);
                messages.push({
                  role: "assistant",
                  content: `Skipped operation with invalid or missing path: ${JSON.stringify(
                    op
                  )}`,
                });
                continue;
              }
              const action = String(op.action || "").toLowerCase();
              if (!["create", "update", "delete"].includes(action)) {
                console.warn("Skipping operation with invalid action:", op);
                messages.push({
                  role: "assistant",
                  content: `Skipped operation with invalid action: ${JSON.stringify(
                    op
                  )}`,
                });
                continue;
              }
              const sanitizedRel = op.path.replace(/^[\\/]*(\.\.[\\/])+/, "");
              const target = path.resolve(projectRoot, sanitizedRel);
              if (!isPathInside(projectRoot, target)) {
                console.warn(
                  "Rejected operation outside project root:",
                  op.path,
                  "->",
                  target
                );
                messages.push({
                  role: "assistant",
                  content: `Rejected operation: path escapes project root (${op.path})`,
                });
                continue;
              }
              try {
                if (action === "delete") {
                  try {
                    unlinkSync(target);
                    messages.push({
                      role: "assistant",
                      content: `Deleted: ${op.path}`,
                    });
                  } catch (err) {
                    console.error("Delete failed:", target, err);
                    messages.push({
                      role: "assistant",
                      content: `Delete failed for ${op.path}: ${String(err)}`,
                    });
                  }
                } else {
                  // create/update -> ensure directory and write file
                  mkdirSync(path.dirname(target), { recursive: true });
                  writeFileSync(target, op.content ?? "", "utf8");
                  messages.push({
                    role: "assistant",
                    content: `${action === "create" ? "Created" : "Updated"}: ${
                      op.path
                    }`,
                  });
                }
              } catch (err) {
                console.error("emitFiles operation error:", op, err);
                messages.push({
                  role: "assistant",
                  content: `Error processing operation for ${op.path}: ${String(
                    err
                  )}`,
                });
              }
            }
            messages.push({
              role: "assistant",
              content:
                "emitFiles executed (see messages for per-operation results).",
            });
            continue;
          }

          // In your controller / handler:
          if (toolCallName === "runCommand") {
            const { cmd, args = [] } = functionArgs;
            if (typeof cmd !== "string") {
              // add failure message to conversation so model knows
              messages.push({
                role: "assistant",
                content: `runCommand failed: invalid cmd argument`,
              });
              continue; // try next attempt or let model decide
            }

            // Security: enforce allowlist (example)
            const ALLOWED_COMMANDS = new Set([
              "npm",
              "yarn",
              "git",
              "pnpm",
              "ls",
              "node",
              // "cd",
            ]);
            const baseCmd = cmd.split(/\s+/)[0];
            if (!ALLOWED_COMMANDS.has(baseCmd)) {
              messages.push({
                role: "assistant",
                content: `runCommand blocked: '${baseCmd}' is not allowed by server policy.`,
              });
              continue;
            }

            // const options = { cwd: path.join(projectRoot, "backend") };

            // Run command and capture logs
            const stream$ = ChatService.runCommandStream(cmd, args);
            let stdoutLog = "";
            let stderrLog = "";
            let exitCode: number | null = null;
            let streamError: any = null;

            // collect events into buffers
            await new Promise<void>((resolve) => {
              interface StreamEventStdout {
                type: "stdout";
                content: string;
              }
              interface StreamEventStderr {
                type: "stderr";
                content: string;
              }
              interface StreamEventError {
                type: "error";
                error: any;
              }
              interface StreamEventClose {
                type: "close";
                code: number;
              }
              type StreamEvent =
                | StreamEventStdout
                | StreamEventStderr
                | StreamEventError
                | StreamEventClose;

              interface StreamSubscription {
                unsubscribe(): void;
              }

              const sub: StreamSubscription = stream$.subscribe({
                next: (event: StreamEvent) => {
                  if (event.type === "stdout") {
                    stdoutLog += event.content;
                    // Optionally push incremental updates to clients via socket:
                    // this.gateway?.sendMessageChunk(socketId, event.content);
                  } else if (event.type === "stderr") {
                    stderrLog += event.content;
                    // this.gateway?.sendMessageChunk(socketId, event.content);
                  } else if (event.type === "error") {
                    streamError = event.error;
                  } else if (event.type === "close") {
                    exitCode = event.code;
                  }
                },
                error: (err: any) => {
                  streamError = err;
                },
                complete: () => {
                  sub.unsubscribe();
                  resolve();
                },
              });
            });
            console.log(streamError, stderrLog);
            // prepare assistant content summarizing result
            if (streamError) {
              const errMsg =
                streamError instanceof Error
                  ? streamError.message
                  : String(streamError);
              messages.push({
                role: "assistant",
                content: `Command execution errored: ${errMsg}\n\nSTDOUT:\n${ChatService.truncate(
                  stdoutLog
                )}\n\nSTDERR:\n${ChatService.truncate(stderrLog)}`,
              });
            } else {
              messages.push({
                role: "assistant",
                content: `Command finished (exit code: ${exitCode})\n\nSTDOUT:\n${ChatService.truncate(
                  stdoutLog
                )}\n\nSTDERR:\n${ChatService.truncate(stderrLog)}`,
              });
            }

            // continue the outer model loop so the model can use this information
            continue;
          }

          throw new Error(`Unexpected function_call: ${toolCallName}`);
        } else if (fullMessage) {
          messages.push({ role: "assistant", content: fullMessage });
          continue;
        } else {
          throw new Error("No response from model");
        }
      }
      res.send({ messages });
      throw new Error(`Failed after ${maxAttempts} attempts`);
    } catch (error) {
      next(error);
    }
  };
}

export default new MainChatsController();
