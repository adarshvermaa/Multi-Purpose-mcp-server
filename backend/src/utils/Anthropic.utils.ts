// src/utils/Anthropic.utils.ts
import Anthropic from "@anthropic-ai/sdk";
import { ANTHROPIC_PROJECT_TOOLS } from "main/chats/schemas/ai/code.bulder";

const API_KEY = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
if (!API_KEY)
  throw new Error("Missing ANTHROPIC_API_KEY / CLAUDE_API_KEY in environment");

const ANTHROPIC_MODEL =
  process.env.ANTHROPIC_MODEL ||
  process.env.CLAUDE_MODEL ||
  "claude-sonnet-4-5-20250929";
const anthropic = new Anthropic({ apiKey: API_KEY });

type ChatMsg = {
  role: "system" | "user" | "assistant" | string;
  content: string;
};

// simple word-preserving splitter
function splitStringPreserveWords(s: string, size: number): string[] {
  if (!s || s.length <= size) return [s];
  const parts: string[] = [];
  let start = 0;
  while (start < s.length) {
    let end = Math.min(start + size, s.length);
    if (end < s.length) {
      const lastSpace = s.lastIndexOf(" ", end);
      if (lastSpace > start) end = lastSpace;
    }
    parts.push(s.slice(start, end));
    start = end;
    while (start < s.length && /\s/.test(s[start])) start++;
  }
  return parts;
}

/** Convert messages but join system messages as a preface (Anthropic messages API expects user/assistant roles). */
function toAnthropicMessages(messages: ChatMsg[]) {
  const systemPreface = messages
    .filter((m) => (m.role ?? "").toLowerCase() === "system")
    .map((m) => m.content)
    .filter(Boolean)
    .join("\n\n");

  const mapped = messages
    .filter((m) => (m.role ?? "").toLowerCase() !== "system")
    .map((m) => {
      const role =
        (m.role ?? "").toLowerCase() === "assistant" ? "assistant" : "user";
      return { role, content: String(m.content ?? "") };
    });

  if (systemPreface) {
    if (mapped.length > 0) {
      mapped[0].content = `SYSTEM INSTRUCTIONS:\n${systemPreface}\n\n${mapped[0].content}`;
    } else {
      mapped.unshift({
        role: "user",
        content: `SYSTEM INSTRUCTIONS:\n${systemPreface}`,
      });
    }
  }
  return mapped;
}

/** Emit-safe wrapper for socket */
function emitSocket(
  eventPrefix: string,
  socketId: string | undefined | null,
  event: string,
  payload: any
) {
  try {
    const io = (global as any).__expressIoInstance;
    if (!io || !socketId) return;
    io.to(socketId).emit(`${eventPrefix}:${event}`, payload);
  } catch {
    // swallow
  }
}

/** Extract text content from Anthropic message object (handles content array with text blocks) */
function extractTextContent(message: any): string {
  if (typeof message === "string") return message;
  if (!message || !Array.isArray(message.content)) return "";
  let text = "";
  for (const block of message.content) {
    if (block.type === "text" && typeof block.text === "string") {
      text += block.text;
    }
  }
  return text;
}

/** Extract JSON from text:
 *  - first tries code-fenced ```json blocks
 *  - then fenced ```...``` blocks
 *  - then balanced braces/brackets scan
 *  - finally regex-based greedy object/array match
 */
export function extractJsonFromText(text: string): any | null {
  if (!text || typeof text !== "string") return null;

  // 1) find ```json ... ``` blocks
  const jsonFenceRe = /```json\s*([\s\S]*?)```/gi;
  for (const m of text.matchAll(jsonFenceRe)) {
    const inner = (m[1] || "").trim();
    if (!inner) continue;
    try {
      return JSON.parse(inner);
    } catch {
      // try to unescape if it is a stringified JSON
      try {
        return JSON.parse(inner.replace(/\\n/g, "\n"));
      } catch {}
    }
  }

  // 2) generic fenced block ```
  const genericFenceRe = /```(?:[\s\S]*?)\n([\s\S]*?)```/gi;
  for (const m of text.matchAll(genericFenceRe)) {
    const inner = (m[1] || "").trim();
    if (!inner) continue;
    try {
      return JSON.parse(inner);
    } catch {}
  }

  // 3) Balanced brace/bracket scan
  const startIdxCandidates: { idx: number; ch: "{" | "[" }[] = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "{" || ch === "[") startIdxCandidates.push({ idx: i, ch });
  }

  for (const cand of startIdxCandidates) {
    const { idx, ch } = cand;
    const open = ch;
    const close = ch === "{" ? "}" : "]";
    let depth = 0;
    let inString = false;
    let escape = false;
    for (let j = idx; j < text.length; j++) {
      const c = text[j];
      if (escape) {
        escape = false;
      } else if (c === "\\") {
        escape = true;
      } else if (c === '"' || c === "'") {
        inString = !inString;
      } else if (!inString) {
        if (c === open) depth++;
        else if (c === close) {
          depth--;
          if (depth === 0) {
            const candidate = text.slice(idx, j + 1);
            try {
              return JSON.parse(candidate);
            } catch {
              break; // parsing failed for this candidate; try next
            }
          }
        }
      }
    }
  }

  // 4) greedy object/array
  const objRe = /(\{[\s\S]*\})/m;
  const mObj = text.match(objRe);
  if (mObj && mObj[1]) {
    try {
      return JSON.parse(mObj[1]);
    } catch {}
  }
  const arrRe = /(\[[\s\S]*\])/m;
  const mArr = text.match(arrRe);
  if (mArr && mArr[1]) {
    try {
      return JSON.parse(mArr[1]);
    } catch {}
  }

  return null;
}

/** Streaming helper using Anthropic SDK that returns the final aggregated message and a best-effort text */
async function callAnthropicStreamAndCollect(
  messages: ChatMsg[],
  maxTokens = 4000,
  socketId?: string | null,
  eventPrefix = "ai"
) {
  const anthroMsg = toAnthropicMessages(messages);
  const emit = (ev: string, payload: any) =>
    emitSocket(eventPrefix, socketId, ev, payload);

  const stream = anthropic.messages.stream({
    model: ANTHROPIC_MODEL,
    max_tokens: maxTokens,
    messages: anthroMsg as any,
  });

  let accumulatedText = "";
  let finalMessageObj: any = null;

  try {
    // Keep a minimal representation of content blocks so extractTextContent works later
    let currentContentBlocks: Array<{ type: string; text: string }> = [];

    for await (const event of stream) {
      // make evType a plain string so TS won't complain
      const ev = event as any;
      const evType = String(ev.type);

      // Debug log if you need:
      // console.debug("anthropic event:", evType, ev);

      // content block start
      if (evType === "content_block_start") {
        // nothing to do beyond ensuring we have an array
        // index = ev.index may be used if you want ordering by index
        continue;
      }

      // content block delta -> delta may be { type: 'text_delta', text: '...' }
      if (evType === "content_block_delta") {
        const delta = ev.delta ?? {};
        // delta could nest text in different ways; check common fields
        const textPiece =
          typeof delta.text === "string"
            ? delta.text
            : typeof delta?.delta === "string"
            ? delta.delta
            : undefined;

        if (textPiece) {
          accumulatedText += textPiece;
          // maintain content blocks for compatibility with extractTextContent
          currentContentBlocks.push({ type: "text", text: textPiece });
          emit("chunk", { type: "text", text: textPiece });
        }
        continue;
      }

      // content block stop
      if (evType === "content_block_stop") {
        // nothing special: content already accumulated
        continue;
      }

      // message_delta: contains e.g. { stop_reason } or other metadata
      if (evType === "message_delta") {
        // if the SDK provides a message object with content, prefer that
        if (ev.delta && ev.message) {
          finalMessageObj = ev.message;
        }
        // Also accumulate stop_reason as a finalization cue (no need to return early)
        if (ev.delta?.stop_reason) {
          // keep it but do not override content
        }
        continue;
      }

      // message_stop: finalize the message
      if (evType === "message_stop" || evType === "message_end") {
        // Some SDKs put full message on `event.message`
        if (ev.message) {
          finalMessageObj = ev.message;
        } else {
          // construct a simple message object compatible with extractTextContent
          finalMessageObj = { content: currentContentBlocks };
        }
        // end of streaming loop will happen naturally
        continue;
      }

      // Fallback: older SDK shapes may provide `delta` or `text` at top-level
      if (ev.delta && typeof ev.delta === "string") {
        accumulatedText += ev.delta;
        currentContentBlocks.push({ type: "text", text: ev.delta });
        emit("chunk", { type: "text", text: ev.delta });
      } else if (typeof ev.text === "string") {
        accumulatedText += ev.text;
        currentContentBlocks.push({ type: "text", text: ev.text });
        emit("chunk", { type: "text", text: ev.text });
      }
    }
    // end for-await
  } catch (err) {
    emit("warning", { message: `Stream failed: ${String(err)}` });
    throw err;
  }

  // If finalMessageObj is not provided by SDK, create one from text we collected
  if (!finalMessageObj)
    finalMessageObj = { content: [{ type: "text", text: accumulatedText }] };

  // prefer accumulatedText but fallback to message object content
  const finalText = accumulatedText || extractTextContent(finalMessageObj);

  if (finalText) emit("chunk", { type: "text", text: finalText, final: true });

  return { finalMessageObj, finalText };
}

/**
 * callModelWithToolsStream
 * - chunking -> ack detection -> final tool-call extraction
 * - improved JSON extraction from fenced code and many response shapes
 */
export async function callModelWithToolsStream(
  messages: any[],
  socketId?: string | null,
  maxTokens = 4000,
  tools = ANTHROPIC_PROJECT_TOOLS,
  eventPrefix = "ai",
  requireAcknowledgement = true,
  chunkMessages = true,
  chunkSize = 3000
) {
  const emit = (ev: string, payload: any) =>
    emitSocket(eventPrefix, socketId, ev, payload);

  let acknowledged = false;
  const ackRegex =
    /\b(?:understand|understood|acknowledge|acknowledged|got it|i understand|ready to proceed|ready to continue|will proceed|proceeding)\b/i;

  const systemMessages: ChatMsg[] = messages.filter(
    (m: any) => (m.role ?? "").toLowerCase() === "system"
  );
  const otherMessages: ChatMsg[] = messages
    .filter((m: any) => (m.role ?? "").toLowerCase() !== "system")
    .map((m: any) => ({
      role: m.role ?? "user",
      content: String(m.content ?? m.message ?? ""),
    }));

  // expand into chunks
  const expandedMessages: ChatMsg[] = [];
  for (const m of otherMessages) {
    if (chunkMessages && m.content.length > chunkSize) {
      const parts = splitStringPreserveWords(m.content, chunkSize);
      parts.forEach((part, idx) =>
        expandedMessages.push({
          role: m.role,
          content: `[CHUNK ${idx + 1}/${parts.length}] ${part}`,
        })
      );
    } else expandedMessages.push(m);
  }

  // chunk-phase: stream each chunk and watch for ack
  let accumulatedFullMessage = "";
  for (let i = 0; i < expandedMessages.length; i++) {
    const msgsSoFar: ChatMsg[] = [
      ...systemMessages,
      ...expandedMessages.slice(0, i + 1),
    ];

    const ackInstruction: ChatMsg = {
      role: "system",
      content:
        "Please acknowledge when you understand the content by replying with a short phrase like 'Understood' or 'I understand'. If not, summarize what you understood.",
    };

    const toSend = [ackInstruction, ...msgsSoFar];
    try {
      const { finalText } = await callAnthropicStreamAndCollect(
        toSend,
        Math.min(2048, maxTokens),
        socketId,
        eventPrefix
      );
      accumulatedFullMessage +=
        `\n[chunk ${i + 1}/${expandedMessages.length} reply]:\n` + finalText;
      if (!acknowledged && ackRegex.test(finalText)) {
        acknowledged = true;
        emit("ack", {
          index: i,
          total: expandedMessages.length,
          matched: finalText.match(ackRegex)?.[0] ?? null,
        });
      }
    } catch (err: any) {
      emit("chunk", {
        type: "text",
        text: `\n\n⚠️ Chunk error: ${String(err)}`,
      });
      emit("warning", { message: `Chunk ${i + 1} failed: ${String(err)}` });
    }

    if (requireAcknowledgement && !acknowledged) {
      emit("warning", {
        message: `No acknowledgement after chunk ${i + 1}/${
          expandedMessages.length
        }; proceeding anyway.`,
      });
    }
  }

  // FINAL PHASE
  const finalMsgs: ChatMsg[] = [
    ...systemMessages,
    {
      role: "system",
      content:
        "You must use exactly one of the available tools by outputting a tool_use content block. Do not output any other text.",
    },
    ...expandedMessages,
    {
      role: "user",
      content:
        "END_OF_CHUNKS: You have received all chunks. Now call the appropriate tool using a tool_use block.",
    },
  ];

  let finalFullMessage = "";
  let finalToolCallName = "";
  let finalToolCallArgsBuffer = "";
  let rawFinalMessageObj: any = null;

  try {
    const anthroMsg = toAnthropicMessages(finalMsgs);

    // Use native tools parameter for tool_use support
    const stream = anthropic.messages.stream({
      model: ANTHROPIC_MODEL,
      max_tokens: maxTokens,
      messages: anthroMsg as any,
      tools: tools.length > 0 ? tools : undefined, // Pass tools only if non-empty
    });
    let accumulatedText = "";
    let toolUseBlock: any = null;
    // keep content blocks to build a final message object if needed
    const contentBlocks: Array<{ type: string; text: string }> = [];

    let currentToolUse: { name: string; id: string; inputJson: string } | null = null;

    for await (const event of stream) {
      const ev = event as any;
      const evType = String(ev.type);
      
      console.log("[Anthropic Stream Debug]", evType, JSON.stringify(ev).slice(0, 200)); // Log event type and partial payload

      // Handle content_block_start for tool_use
      if (evType === "content_block_start") {
         if (ev.content_block?.type === "tool_use") {
            currentToolUse = {
              name: ev.content_block.name,
              id: ev.content_block.id,
              inputJson: "",
            };
         }
      }

      // Handle content_block_delta
      if (evType === "content_block_delta") {
         const delta = ev.delta ?? {};
         // Handle tool input JSON delta
         if (delta.type === "input_json_delta" && currentToolUse) {
            currentToolUse.inputJson += delta.partial_json;
            continue;
         }
         
         // Handle text delta
         const textPiece =
           typeof delta.text === "string"
             ? delta.text
             : typeof delta?.delta === "string"
             ? delta.delta
             : undefined;

         if (textPiece) {
           accumulatedText += textPiece;
           contentBlocks.push({ type: "text", text: textPiece });
           emit("chunk", { type: "text", text: textPiece });
         }
         continue;
      }
      
      // Handle content_block_stop
      if (evType === "content_block_stop") {
         if (currentToolUse) {
            try {
               const input = JSON.parse(currentToolUse.inputJson);
               toolUseBlock = {
                  name: currentToolUse.name,
                  input: input,
               };
               emit("chunk", { type: "tool_use", toolUse: toolUseBlock });
            } catch (e) {
               console.warn("Failed to parse tool input JSON", e);
            }
            currentToolUse = null;
         }
         continue;
      }

      // message_delta and message_stop can be used to detect termination
      if (evType === "message_delta") {
        if (ev.delta?.stop_reason) {
          console.log("[Anthropic Stream Debug] Stop reason:", ev.delta.stop_reason);
          // If we have a pending tool use, try to parse it even if incomplete (it will likely fail, but worth a try)
          if (currentToolUse) {
             try {
                const input = JSON.parse(currentToolUse.inputJson);
                toolUseBlock = {
                  name: currentToolUse.name,
                  input: input,
               };
               emit("chunk", { type: "tool_use", toolUse: toolUseBlock });
             } catch (e) {
                console.warn("Failed to parse incomplete tool input JSON:", e);
             }
             currentToolUse = null;
          }
        }
        continue;
      }
      if (evType === "message_stop" || evType === "message_end") {
        // Ensure any pending tool use is processed
        if (currentToolUse) {
             try {
                const input = JSON.parse(currentToolUse.inputJson);
                toolUseBlock = {
                  name: currentToolUse.name,
                  input: input,
               };
               emit("chunk", { type: "tool_use", toolUse: toolUseBlock });
             } catch (e) {
                console.warn("Failed to parse final tool input JSON:", e);
             }
             currentToolUse = null;
        }
        continue;
      }
      if (evType === "tool_use" || ev.tool_use) {
        toolUseBlock =
          ev.tool_use ?? ev.content?.[0] ?? ev.tool ?? toolUseBlock;
        emit("chunk", { type: "tool_use", toolUse: toolUseBlock });
        continue;
      }

      if (ev.delta && typeof ev.delta === "string") {
        accumulatedText += ev.delta;
        contentBlocks.push({ type: "text", text: ev.delta });
        emit("chunk", { type: "text", text: ev.delta });
      } else if (typeof ev.text === "string") {
        accumulatedText += ev.text;
        contentBlocks.push({ type: "text", text: ev.text });
        emit("chunk", { type: "text", text: ev.text });
      }
    } // end for-await

    // Build a raw message object for fallback parsing
    rawFinalMessageObj = { content: contentBlocks };

    // finalFullMessage is the human readable result
    finalFullMessage =
      accumulatedText || JSON.stringify(rawFinalMessageObj, null, 2);

    // Prefer native tool_use block if available
    if (toolUseBlock) {
      finalToolCallName = toolUseBlock.name ?? "";
      finalToolCallArgsBuffer = JSON.stringify(toolUseBlock.input ?? {});
      emit("tool_name", { name: finalToolCallName });
      emit("tool_args", { args: finalToolCallArgsBuffer });
    } else {
      // Fallback: try to parse JSON out of the accumulated text (fenced ```json or balanced braces)
      const parsed = extractJsonFromText(accumulatedText);
      if (parsed && typeof parsed === "object") {
        if (parsed.tool && (parsed.args || parsed.arguments)) {
          finalToolCallName = String(parsed.tool ?? parsed.name ?? "unknown");
          finalToolCallArgsBuffer = JSON.stringify(
            parsed.args ?? parsed.arguments ?? {}
          );
        } else if (parsed.operations || Array.isArray(parsed.operations)) {
          finalToolCallName = "emitFiles";
          finalToolCallArgsBuffer = JSON.stringify(parsed);
        } else if (parsed.moduleTree || (parsed.id && parsed.name)) {
          finalToolCallName = "build_module_tree_from_prompt";
          finalToolCallArgsBuffer = JSON.stringify(parsed.moduleTree ?? parsed);
        } else {
          // fallback: store whatever object we found
          finalToolCallName = "unknown";
          finalToolCallArgsBuffer = JSON.stringify(parsed);
        }
      } else {
        // as before, nothing parsed — keep finalFullMessage so inference step can attempt detection
      }
    }

    if (finalToolCallName) emit("tool_name", { name: finalToolCallName });
    if (finalToolCallArgsBuffer)
      emit("tool_args", { args: finalToolCallArgsBuffer });
  } catch (err: any) {
    emit("warning", { message: "Final call failed: " + String(err) });
    finalFullMessage = String(err);
  }

  // sensible defaults
  if (!finalToolCallName) {
    const infer = tools
      .map((t: any) => t.name)
      .find((n: string) =>
        new RegExp(`\\b${n}\\b`, "i").test(finalFullMessage)
      );
    finalToolCallName = infer ?? "unknown";
    emit("warning", {
      message: "No explicit tool call parsed; inferred: " + finalToolCallName,
      fullMessage: finalFullMessage,
    });
  }

  if (!finalToolCallArgsBuffer || finalToolCallArgsBuffer.trim().length === 0) {
    if (/emitfiles|emit_files|emitFiles/i.test(finalToolCallName)) {
      finalToolCallArgsBuffer = JSON.stringify({ operations: [] });
    } else if (/build_module_tree_from_prompt/i.test(finalToolCallName)) {
      finalToolCallArgsBuffer = JSON.stringify({
        id: "root",
        name: "Root Module",
        description: "Fallback root module (empty)",
        children: [],
      });
    } else {
      finalToolCallArgsBuffer = JSON.stringify({});
    }
    emit("warning", { message: "No tool args found; using safe default." });
  }

  emit("done", {
    toolCallName: finalToolCallName,
    toolCallArgsBuffer: finalToolCallArgsBuffer,
    fullMessage: finalFullMessage,
    acknowledged,
  });

  console.log(
    "fullMessage",
    finalFullMessage,
    "finalToolCallName",
    finalToolCallName,
    "finalToolCallArgsBuffer",
    finalToolCallArgsBuffer,
    "acknowledged",
    acknowledged
  );

  return {
    fullMessage: finalFullMessage,
    toolCallName: finalToolCallName,
    toolCallArgsBuffer: finalToolCallArgsBuffer,
    acknowledged,
    raw: rawFinalMessageObj,
  };
}
