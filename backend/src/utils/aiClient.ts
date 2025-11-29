// src/utils/aiClient.ts
import { PROJECT_TOOLS } from "main/chats/schemas/ai/code.bulder";
import { OpenAI } from "openai";
const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) throw new Error("Missing OPENAI_API_KEY");
const client = new OpenAI({ apiKey });

/**
 * callModelWithFunctions wrapper.
 * If forceText true -> set function_call: "none" so model must return text.
 */
export async function callModelWithFunctions(
  messages: any[],
  functions: any[],
  maxTokens = 32768,
  forceText = false
) {
  return await client.chat.completions.create({
    model: process.env.OPENAI_MODEL || "gpt-4.1-2025-04-14",
    messages,
    functions: functions as any,
    function_call: forceText ? "none" : "auto",
    max_tokens: maxTokens,
    temperature: 0.0,
    stream: false,
  });
}

type ChatMsg = {
  role: "system" | "user" | "assistant" | string;
  content: string;
};

function splitStringPreserveWords(s: string, size: number): string[] {
  if (!s || s.length <= size) return [s];
  const parts: string[] = [];
  let start = 0;
  while (start < s.length) {
    let end = Math.min(start + size, s.length);
    if (end < s.length) {
      // try to backtrack to last whitespace to avoid cutting words
      const lastSpace = s.lastIndexOf(" ", end);
      if (lastSpace > start) end = lastSpace;
    }
    parts.push(s.slice(start, end));
    start = end;
    // skip leading whitespace for next chunk
    while (start < s.length && /\s/.test(s[start])) start++;
  }
  return parts;
}

/**
 * callModelWithToolsStream with message-chunking.
 *
 * @param messages conversation messages (include system messages)
 * @param maxTokens model max tokens
 * @param tools tools / functions array
 * @param socketId optional socket id to emit chunk events (uses global __expressIoInstance)
 * @param eventPrefix event prefix for socket emits (defaults "ai")
 * @param requireAcknowledgement wait for ack after each chunk before sending next (default true)
 * @param chunkMessages whether to chunk large messages (default true)
 * @param chunkSize chunk size in characters (default 3000)
 */
export async function callModelWithToolsStream(
  messages: any[],
  maxTokens = 32768,
  socketId?: string | null,
  tools = PROJECT_TOOLS,
  eventPrefix = "ai",
  requireAcknowledgement = true,
  chunkMessages = true,
  chunkSize = 3000
) {
  // helper: socket emit
  function emit(event: string, payload: any) {
    try {
      const io = (global as any).__expressIoInstance;
      if (!io || !socketId) return;
      io.to(socketId).emit(`${eventPrefix}:${event}`, payload);
    } catch {
      // ignore
    }
  }

  // ack detection
  let acknowledged = false;
  const ackRegex =
    /\b(?:understand|understood|acknowledge|acknowledged|got it|i understand|ready to proceed|ready to continue|will proceed|proceeding)\b/i;

  // 1) Separate system messages (always included) and other messages (subject to chunking)
  const systemMessages: ChatMsg[] = messages.filter(
    (m: any) => m.role === "system"
  );
  const otherMessages: ChatMsg[] = messages
    .filter((m: any) => m.role !== "system")
    .map((m: any) => ({ role: m.role, content: String(m.content ?? "") }));

  // 2) Expand otherMessages into `expandedMessages` by splitting any long content
  const expandedMessages: ChatMsg[] = [];
  for (const m of otherMessages) {
    if (chunkMessages && m.content.length > chunkSize) {
      const parts = splitStringPreserveWords(m.content, chunkSize);
      parts.forEach((part, idx) => {
        // keep the same role; annotate chunk index for clarity
        const prefix = `[CHUNK ${idx + 1}/${parts.length}] `;
        expandedMessages.push({ role: m.role, content: prefix + part });
      });
    } else {
      expandedMessages.push(m);
    }
  }

  // 3) If no chunking needed or only small messages, we will still follow the final-call path.
  // Prepare to send chunk-by-chunk: for each expanded message, send conversation upto that message and wait for ack.
  let accumulatedFullMessage = "";
  let finalToolCallName = "";
  let finalToolCallArgsBuffer = "";

  // chunk-phase: send each expanded message one-by-one to the model (text-only)
  for (let i = 0; i < expandedMessages.length; i++) {
    const msgsSoFar: ChatMsg[] = [
      ...systemMessages,
      // include the expanded messages up to index i (so model sees all prior chunks as context)
      ...expandedMessages.slice(0, i + 1),
    ];

    // stream this chunk and wait for acknowledgement
    const stream = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4.1-2025-04-14",
      messages: msgsSoFar as any,
      // during chunking we force text only to get acknowledgement
      // note: don't pass tools here to prevent premature function calls
      max_tokens: Math.min(2048, maxTokens),
      temperature: 0.0,
      stream: true,
      tools: tools as unknown as any,
    });

    try {
      // parse streaming chunk for this partial message
      let chunkFull = "";
      for await (const c of stream as any) {
        const choice = c.choices?.[0] ?? {};
        const delta = choice.delta ?? {};

        if (typeof delta.content === "string") {
          chunkFull += delta.content;
          emit("chunk", {
            type: "text",
            text: delta.content,
            index: i,
            total: expandedMessages.length,
          });
        } else if (Array.isArray(delta.content)) {
          for (const block of delta.content) {
            if (
              block?.type === "output_text" &&
              typeof block.text === "string"
            ) {
              chunkFull += block.text;
              emit("chunk", {
                type: "text",
                text: block.text,
                index: i,
                total: expandedMessages.length,
              });
            }
          }
        }

        // detect ack in this chunk's cumulative text
        if (!acknowledged && ackRegex.test(chunkFull)) {
          acknowledged = true;
          emit("ack", {
            index: i,
            total: expandedMessages.length,
            matched: chunkFull.match(ackRegex)?.[0] ?? null,
          });
        }
      }

      // append chunk-level full message to accumulatedFullMessage for debugging/logging
      accumulatedFullMessage +=
        `\n[chunk ${i + 1}/${expandedMessages.length} reply]:\n` + chunkFull;

      // if ack required but not seen yet, check the chunkFull too
      if (requireAcknowledgement && !acknowledged) {
        // allow some leniency: check aggregated accumulatedFullMessage
        if (ackRegex.test(accumulatedFullMessage)) {
          acknowledged = true;
          emit("ack", {
            index: i,
            total: expandedMessages.length,
            matched: (accumulatedFullMessage.match(ackRegex) || [null])[0],
          });
        }
      }

      // If acknowledgement is required and still not observed, we retry a limited amount: emit warning then continue
      if (requireAcknowledgement && !acknowledged) {
        emit("warning", {
          message: `No acknowledgement for chunk ${i + 1}/${
            expandedMessages.length
          }. Proceeding to next chunk anyway after buffer.`,
        });
        // we still continue; model may ack later or we'll rely on final ack rules
      }
    } finally {
      try {
        if (typeof (stream as any).return === "function")
          await (stream as any).return();
      } catch {}
    }
  } // end chunk-phase

  // 4) Final call: send the full expanded conversation and allow tools/function calls (final step)
  const finalMessages = [...systemMessages, ...expandedMessages];

  // Optional: append an explicit finalizing user message to signal "now produce the function call"
  finalMessages.push({
    role: "user",
    content:
      "END_OF_CHUNKS: You have now received all chunks. Please perform the requested action and produce the function call with valid JSON arguments.",
  });

  // Now call the model with tools enabled and streaming to capture the function call
  const finalStream = await client.chat.completions.create({
    model: process.env.OPENAI_MODEL || "gpt-4.1-2025-04-14",
    messages: finalMessages as any,
    tools: tools as unknown as any,
    max_tokens: maxTokens,
    temperature: 0.0,
    stream: true,
    // allow function calls automatically
    // note: some SDKs use `function_call` key; omit to let model choose
  });

  let finalFullMessage = "";
  let toolCallName = "";
  let toolCallArgsBuffer = "";

  try {
    for await (const chunk of finalStream as any) {
      const choice = chunk.choices?.[0] ?? {};
      const delta = choice.delta ?? {};

      // accumulate plain text
      if (typeof delta.content === "string") {
        finalFullMessage += delta.content;
        emit("chunk", { type: "text", text: delta.content, final: true });
      } else if (Array.isArray(delta.content)) {
        for (const block of delta.content) {
          if (block?.type === "output_text" && typeof block.text === "string") {
            finalFullMessage += block.text;
            emit("chunk", { type: "text", text: block.text, final: true });
          }
        }
      }

      // tool_calls style (array)
      if (Array.isArray(delta.tool_calls)) {
        for (const toolCallDelta of delta.tool_calls as any[]) {
          if (toolCallDelta?.index !== 0) continue;
          const fn =
            toolCallDelta.function ?? toolCallDelta.tool ?? toolCallDelta;
          if (!toolCallName && typeof fn?.name === "string") {
            toolCallName = fn.name;
            emit("tool_name", { name: toolCallName });
          }

          if (typeof fn?.arguments === "string") {
            toolCallArgsBuffer += fn.arguments;
            emit("tool_args", { argsChunk: fn.arguments });
          } else if (Array.isArray(fn?.arguments)) {
            for (const a of fn.arguments) {
              if (a?.type === "output_text" && typeof a.text === "string") {
                toolCallArgsBuffer += a.text;
                emit("tool_args", { argsChunk: a.text });
              }
            }
          }

          if (typeof toolCallDelta.arguments === "string") {
            toolCallArgsBuffer += toolCallDelta.arguments;
            emit("tool_args", { argsChunk: toolCallDelta.arguments });
          } else if (Array.isArray(toolCallDelta.arguments)) {
            for (const a of toolCallDelta.arguments) {
              if (a?.type === "output_text" && typeof a.text === "string") {
                toolCallArgsBuffer += a.text;
                emit("tool_args", { argsChunk: a.text });
              }
            }
          }
        }
      }

      // single-tool variant
      if (!toolCallArgsBuffer && delta.tool_call) {
        const single = delta.tool_call;
        if (typeof single.arguments === "string") {
          toolCallArgsBuffer += single.arguments;
          emit("tool_args", { argsChunk: single.arguments });
        } else if (Array.isArray(single.arguments)) {
          for (const a of single.arguments) {
            if (a?.type === "output_text" && typeof a.text === "string") {
              toolCallArgsBuffer += a.text;
              emit("tool_args", { argsChunk: a.text });
            }
          }
        }
        if (!toolCallName && typeof single.name === "string") {
          toolCallName = single.name;
          emit("tool_name", { name: toolCallName });
        }
      }

      // if final ack / done possible
      if (acknowledged && toolCallName && toolCallArgsBuffer) {
        emit("done", {
          toolCallName,
          toolCallArgsBuffer,
          fullMessage: finalFullMessage,
        });
      }
    }
  } finally {
    try {
      if (typeof (finalStream as any).return === "function")
        await (finalStream as any).return();
    } catch {}
  }

  // Normalise strings
  const fullMessage = String(finalFullMessage ?? accumulatedFullMessage ?? "");
  finalToolCallName = String(toolCallName ?? "");
  finalToolCallArgsBuffer = String(toolCallArgsBuffer ?? "");

  // Post-stream safety checks, fallbacks & warnings (same logic as prior helper)
  if (!finalToolCallName) {
    const inferred =
      /build_module_tree_from_prompt|emitFiles|emit_files|build_tree/i.exec(
        fullMessage
      );
    finalToolCallName = inferred?.[0] ?? "unknown";
    emit("warning", {
      message: `No explicit tool call detected; inferred '${finalToolCallName}'`,
      fullMessage,
    });
  }

  if (requireAcknowledgement && !acknowledged) {
    if (finalToolCallArgsBuffer && finalToolCallArgsBuffer.trim().length > 0) {
      emit("warning", {
        message:
          "No acknowledgement detected before final tool args — accepting buffered args anyway.",
      });
    } else {
      if (/emitfiles|emit_files|emitFiles/i.test(finalToolCallName)) {
        finalToolCallArgsBuffer = JSON.stringify({ operations: [] });
        emit("warning", {
          message: "No args detected; defaulting to empty operations.",
        });
      } else {
        finalToolCallArgsBuffer = JSON.stringify({
          id: "root",
          name: "Root Module",
          description: "Fallback root module (no output from model).",
          children: [],
        });
        emit("warning", {
          message: "No args detected; defaulting to fallback module tree.",
        });
      }
    }
  }

  if (!finalToolCallArgsBuffer || finalToolCallArgsBuffer.trim().length === 0) {
    if (/emitfiles|emit_files|emitFiles/i.test(finalToolCallName)) {
      finalToolCallArgsBuffer = JSON.stringify({ operations: [] });
    } else {
      finalToolCallArgsBuffer = JSON.stringify({
        id: "root",
        name: "Root Module",
        description: "Fallback root module (empty buffer).",
        children: [],
      });
    }
  }

  // final done emit
  emit("done", {
    toolCallName: finalToolCallName,
    toolCallArgsBuffer: finalToolCallArgsBuffer,
    fullMessage,
    acknowledged,
  });

  console.log(
    "fullMessage",
    fullMessage,
    "finalToolCallName",
    finalToolCallName,
    "finalToolCallArgsBuffer",
    finalToolCallArgsBuffer,
    "acknowledged",
    acknowledged
  );

  return {
    fullMessage,
    toolCallName: finalToolCallName,
    toolCallArgsBuffer: finalToolCallArgsBuffer,
    acknowledged,
  };
}
//
