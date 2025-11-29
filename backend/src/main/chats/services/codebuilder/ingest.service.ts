// src/services/codebuilder/ingest.service.ts
import { callModelWithFunctions } from "utils/aiClient";
import type { DocumentChunk } from "../../chat.types";
import type { DocumentArchitecture, ArchitectureNode } from "../../chat.types";
import { buildPromptFromArchitecture } from "./arch-to-prompt";

export class IngestService {
  private ACK_FN = {
    name: "ack_document",
    description:
      "Confirm ingestion of a document chunk set and return a short summary and readiness flag",
    parameters: {
      type: "object",
      properties: {
        documentId: { type: "string" },
        summary: { type: "string" },
        ready: { type: "boolean" },
      },
      required: ["documentId", "summary", "ready"],
    },
  };

  private BUILD_PROMPT_FN = {
    name: "build_prompt_from_documents",
    description: "Produce a final `prompt` object for project generation",
    parameters: {
      type: "object",
      properties: {
        projectName: { type: "string" },
        documentsSummary: { type: "object" },
        prompt: { type: "object" },
      },
      required: ["projectName", "prompt"],
    },
  };

  private modelMaxTokens: number;
  constructor(modelMaxTokens = 32768) {
    this.modelMaxTokens = modelMaxTokens;
  }

  private reassembleChunks(chunks: DocumentChunk[]): string {
    if (!chunks || !chunks.length) throw new Error("No chunks to reassemble");
    const sorted = [...chunks].sort((a, b) => a.chunkIndex - b.chunkIndex);
    const expected = sorted[0].chunkCount;
    if (sorted.length !== expected) {
      throw new Error(
        `Missing chunks: expected ${expected}, received ${sorted.length}`
      );
    }
    return sorted.map((c) => c.content).join("");
  }

  /** Try to parse the json text to an object */
  private tryParseJsonMaybe(text: string) {
    try {
      // some documents might be already JSON objects -> return as-is
      if (typeof text !== "string") return text;
      return JSON.parse(text);
    } catch {
      // not JSON — return raw text
      return text;
    }
  }

  /**
   * If the document is architecture JSON (has rootModule) convert it into prompt directly.
   * Otherwise return null to indicate fallback to AI builder.
   */
  private detectAndBuildPromptIfArchitecture(doc: any): { prompt: any } | null {
    if (!doc) return null;
    // The architecture you provided uses top-level "rootModule"
    if (doc.rootModule && typeof doc.rootModule === "object") {
      // convert
      const root = doc.rootModule as ArchitectureNode;
      const prompt = buildPromptFromArchitecture(root);
      return { prompt };
    }
    // Also accept doc being the root node itself (if user sent only the root)
    if (doc.id && (doc.title || doc.summary) && (doc.children || doc.files)) {
      const prompt = buildPromptFromArchitecture(doc as ArchitectureNode);
      return { prompt };
    }
    return null;
  }

  /**
   * Ingest provided documents (each a descriptor) and produce a single structured prompt.
   * - If any document is recognized as architecture, convert it automatically.
   * - If none are architecture, call the model with function-calling to build a prompt.
   */
  public async ingestAndBuildPrompt(
    projectName: string,
    documents: Array<{
      documentId: string;
      fullContent?: string | object;
      chunks?: DocumentChunk[];
      metadata?: any;
    }>
  ) {
    // Try fast-path: if at least one doc contains architecture, produce prompt from it (prefer first such doc)
    for (const doc of documents) {
      try {
        let contentText: string;
        if (doc.fullContent) {
          contentText =
            typeof doc.fullContent === "string"
              ? doc.fullContent
              : JSON.stringify(doc.fullContent);
        } else if (doc.chunks) {
          contentText = this.reassembleChunks(doc.chunks);
        } else continue;

        const parsed = this.tryParseJsonMaybe(contentText);
        const archCheck = this.detectAndBuildPromptIfArchitecture(parsed);
        if (archCheck) {
          // Found architecture — we return the prompt immediately
          return {
            projectName,
            prompt: archCheck.prompt,
            documentsSummary: {
              detectedAs: "architecture",
              documentId: doc.documentId,
            },
          };
        }
      } catch {
        continue; // try next doc
      }
    }

    // No architecture doc found — fallback to AI ingestion and build_prompt_from_documents
    // Build messages: system + each doc as user message
    const systemMsg = {
      role: "system",
      content:
        "You will ingest documents and produce a structured prompt for project scaffolding. Respond by calling build_prompt_from_documents with JSON arguments.",
    };
    const messages: any[] = [systemMsg];
    for (const doc of documents) {
      let bodyContent: string;
      if (doc.fullContent) {
        bodyContent =
          typeof doc.fullContent === "string"
            ? doc.fullContent
            : JSON.stringify(doc.fullContent, null, 2);
      } else if (doc.chunks) {
        bodyContent = this.reassembleChunks(doc.chunks);
      } else {
        bodyContent = "";
      }
      messages.push({
        role: "user",
        name: `document-${doc.documentId}`,
        content: bodyContent,
      });
    }

    messages.push({
      role: "user",
      content: `All documents for project "${projectName}" provided. Please call the function build_prompt_from_documents with arguments:
{
  "projectName": "${projectName}",
  "documentsSummary": { /* short summary */ },
  "prompt": { /* structured prompt: language, framework, routes, dependencies, tests, run_cmd hints, etc */ }
}
Respond ONLY by calling the function with JSON args.`,
    });

    const functions = [this.ACK_FN, this.BUILD_PROMPT_FN];
    const resp = await callModelWithFunctions(
      messages,
      functions,
      this.modelMaxTokens,
      false
    );
    const choice = resp.choices?.[0];
    const msg = choice?.message ?? {};

    if ((msg as any).function_call?.arguments) {
      try {
        const args = JSON.parse((msg as any).function_call.arguments);
        if (args.prompt) {
          return {
            projectName: args.projectName ?? projectName,
            prompt: args.prompt,
            documentsSummary: args.documentsSummary,
          };
        }
      } catch {
        // fallthrough
      }
    }

    if (msg.content) {
      try {
        const parsed = JSON.parse(msg.content);
        if (parsed.prompt)
          return {
            projectName: parsed.projectName ?? projectName,
            prompt: parsed.prompt,
            documentsSummary: parsed.documentsSummary,
          };
      } catch {
        // fallthrough
      }
    }

    throw new Error("AI did not return a usable prompt from documents");
  }
}
