import { OpenAI } from "openai";
import { openaiFunctions } from "../schemas/ai/functions";
import { ChatCompletionMessageParam } from "openai/resources/chat/completions";

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) throw new Error("Missing OPENAI_API_KEY");
const client = new OpenAI({ apiKey });

/**
 * Non-streaming call
 */
export async function callChatModel(
  messages: ChatCompletionMessageParam[],
  model = process.env.OPENAI_MODEL || "gpt-4o",
  maxTokens = 1500
) {
  console.log(
    "Passing functions to OpenAI (non-stream):",
    openaiFunctions.map((f) => f.name)
  );
  const resp = await client.chat.completions.create({
    model,
    messages,
    tools: openaiFunctions.map((fn) => ({ type: "function", function: fn })),
    tool_choice: "auto",
    stream: false,
    max_tokens: maxTokens,
  });
  return resp;
}

/**
 * Stream and parse chat completion
 */
export async function streamAndParseChat(
  messages: ChatCompletionMessageParam[],
  model = process.env.OPENAI_MODEL || "gpt-4o"
): Promise<{
  fullMessage: string;
  toolCallName?: string;
  toolCallArgsBuffer?: string;
  toolCallId?: string;
}> {
  console.log(
    "Passing functions to OpenAI (stream):",
    openaiFunctions.map((f) => f.name)
  );

  const stream = await client.chat.completions.create({
    model,
    messages,
    tools: openaiFunctions.map((fn) => ({ type: "function", function: fn })),
    tool_choice: "auto",
    stream: true,
  });

  let fullMessage = "";
  let toolCallName = "";
  let toolCallArgsBuffer = "";
  let toolCallId = "";

  for await (const chunk of stream) {
    const choice = chunk.choices?.[0];
    if (!choice) continue;
    const delta = choice.delta ?? {};

    // Handle streaming text
    if (delta.content) {
      fullMessage += delta.content;
    }

    // Handle streaming tool calls
    if (delta.tool_calls && Array.isArray(delta.tool_calls)) {
      for (const toolCall of delta.tool_calls) {
        if (toolCall.index === 0) {
          // Handle only the first tool call
          if (toolCall.id && !toolCallId) toolCallId = toolCall.id;
          if (toolCall.function?.name && !toolCallName)
            toolCallName = toolCall.function.name;
          if (toolCall.function?.arguments)
            toolCallArgsBuffer += toolCall.function.arguments;
        }
      }
    }
  }

  return {
    fullMessage,
    toolCallName: toolCallName || undefined,
    toolCallArgsBuffer: toolCallArgsBuffer || undefined,
    toolCallId: toolCallId || undefined,
  };
}

export default { callChatModel, streamAndParseChat };
