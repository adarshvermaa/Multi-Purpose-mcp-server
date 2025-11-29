import { z } from "zod";
import { TreeNodeSchema } from "./anthropic-tool-schemas";

/**
 * Builder Request Schema - validates incoming build requests
 */
export const BuilderRequestSchema = z.object({
  userPrompt: z.string().min(1).describe("User's natural language prompt describing the project to build"),
  socketId: z.string().min(1).describe("Socket.io connection ID for real-time updates"),
  options: z
    .object({
      projectName: z.string().optional().describe("Optional custom project name (derived from prompt if not provided)"),
      useOpenAI: z.boolean().optional().default(false).describe("Use OpenAI instead of Anthropic"),
      useGemini: z.boolean().optional().default(false).describe("Use Gemini API"),
      maxTokens: z.number().optional().default(8192).describe("Maximum tokens for AI response"),
      ragTopK: z.number().optional().default(5).describe("Number of similar projects to retrieve from Pinecone"),
      dryRun: z.boolean().optional().default(false).describe("If true, plan only without emitting files"),
    })
    .optional()
    .default({}),
});

/**
 * Builder Response Schema - validates build operation results
 */
export const BuilderResponseSchema = z.object({
  ok: z.boolean(),
  projectId: z.string(),
  projectName: z.string(),
  tree: z.array(TreeNodeSchema).describe("Generated project structure tree"),
  filesEmitted: z
    .array(
      z.object({
        path: z.string(),
        status: z.enum(["created", "updated", "skipped", "error"]),
        message: z.string().optional(),
      })
    )
    .describe("File emission results"),
  conversationId: z.string().optional().describe("Pinecone conversation ID for retrieval"),
  warnings: z.array(z.string()).optional(),
  error: z.string().optional(),
});

/**
 * Conversation Schema - for storing in Pinecone
 */
export const ConversationSchema = z.object({
  conversationId: z.string(),
  projectId: z.string(),
  projectName: z.string(),
  userPrompt: z.string(),
  tree: z.array(TreeNodeSchema),
  filesGenerated: z.number(),
  timestamp: z.string(),
  metadata: z
    .object({
      aiModel: z.string().optional(),
      tokensUsed: z.number().optional(),
      duration: z.number().optional(),
      tags: z.array(z.string()).optional(),
    })
    .optional(),
});

// Type exports
export type BuilderRequest = z.infer<typeof BuilderRequestSchema>;
export type BuilderResponse = z.infer<typeof BuilderResponseSchema>;
export type Conversation = z.infer<typeof ConversationSchema>;

/**
 * Format prompt with RAG context from similar projects
 */
export function formatPromptWithContext(
  userPrompt: string,
  ragContext: Array<{ projectName: string; prompt: string; tree: any }>
): string {
  if (!ragContext || ragContext.length === 0) {
    return userPrompt;
  }

  const contextExamples = ragContext
    .map(
      (ctx, idx) =>
        `Example ${idx + 1}:
Prompt: ${ctx.prompt}
Project: ${ctx.projectName}
Structure: ${JSON.stringify(ctx.tree, null, 2)}`
    )
    .join("\n\n");

  return `You are a web builder assistant. Here are some similar projects as reference:

${contextExamples}

Now, based on the user's request below, generate a complete project structure:

User Request: ${userPrompt}

Generate a comprehensive, production-ready project structure using the BuildTreeTool format.`;
}

/**
 * Parse AI response to extract tool calls
 * Handles both Anthropic and OpenAI response formats
 */
export function parseAIResponse(rawResponse: any): {
  toolName: string;
  toolArgs: any;
} {
  // Anthropic format: content blocks with tool_use type
  if (rawResponse.content && Array.isArray(rawResponse.content)) {
    for (const block of rawResponse.content) {
      if (block.type === "tool_use") {
        return {
          toolName: block.name,
          toolArgs: block.input || {},
        };
      }
    }
  }

  // OpenAI format: tool_calls array
  if (rawResponse.tool_calls && Array.isArray(rawResponse.tool_calls)) {
    const toolCall = rawResponse.tool_calls[0];
    if (toolCall) {
      return {
        toolName: toolCall.function?.name || "unknown",
        toolArgs: JSON.parse(toolCall.function?.arguments || "{}"),
      };
    }
  }

  // Fallback: try to extract from message content
  if (rawResponse.message?.content) {
    const content = rawResponse.message.content;
    // Simple heuristic: look for JSON blocks
    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[1]);
        return {
          toolName: parsed.tool || "buildTree",
          toolArgs: parsed.args || parsed,
        };
      } catch (e) {
        console.warn("[parseAIResponse] Failed to parse JSON block", e);
      }
    }
  }

  throw new Error("Could not extract tool call from AI response");
}

/**
 * Generate project name from user prompt (fallback if not provided)
 */
export function generateProjectName(userPrompt: string): string {
  // Extract key words from prompt
  const words = userPrompt
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !["create", "build", "make", "with"].includes(w))
    .slice(0, 3);

  if (words.length === 0) {
    return `project-${Date.now()}`;
  }

  return words.join("-");
}
