import { BuildTreeTool, EmitFilesTool } from "./anthropic-tool-helpers";
import conversationService from "./conversation.service";
import fileSystemService from "./fileSystem.service";
import {
  BuilderRequest,
  BuilderResponse,
  formatPromptWithContext,
  generateProjectName,
} from "../schemas/builder/builder.ai";
import { TreeNode } from "../schemas/builder/anthropic-tool-schemas";
import { FileSnapshot } from "../../chats/chat.types";
import { callModelWithToolsStream } from "../../../utils/Anthropic.utils";
import { v4 as uuidv4 } from "uuid";
import * as path from "path";
import * as fs from "fs-extra";

import { OpenAI } from "openai";

const PROJECT_ROOT = path.resolve(__dirname, "../../../../../web");

// Initialize OpenAI Client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

class BuilderService {
  /**
   * Main orchestrator: Build project from user prompt
   * Flow: Prompt → RAG → AI Planning → BuildTree → EmitFiles → Store → Disk Write
   */
  async buildProject(
    userPrompt: string,
    socketId: string,
    options?: BuilderRequest["options"],
    existingSnapshot: FileSnapshot[] = []
  ): Promise<BuilderResponse> {
    const startTime = Date.now();
    const projectId = `proj_${uuidv4()}`;
    const projectName =
      options?.projectName || generateProjectName(userPrompt);

    try {
      // Emit start event
      this.emitEvent(socketId, "builder:started", {
        projectId,
        userPrompt,
        projectName,
      });

      // Step 1: Query Pinecone for similar projects (RAG)
      this.emitEvent(socketId, "builder:retrieving_context", {
        message: "Searching for similar projects...",
      });

      const ragContext = await conversationService.queryRelevantConversations(
        userPrompt,
        options?.ragTopK || 5
      );

      console.log(
        `[BuilderService] Retrieved ${ragContext.length} similar projects for RAG`
      );

      // Step 2: Plan project structure using AI
      this.emitEvent(socketId, "builder:planning", {
        message: "AI is planning your project structure...",
      });

      const tree = await this.planProjectStructure(
        userPrompt,
        projectName,
        ragContext,
        socketId,
        options,
        existingSnapshot
      );

      this.emitEvent(socketId, "builder:tree_generated", {
        tree,
        message: `Generated structure with ${tree.length} root nodes`,
      });

      // Step 3: Generate files (skip if dryRun)
      let filesEmitted: BuilderResponse["filesEmitted"] = [];

      if (!options?.dryRun) {
        this.emitEvent(socketId, "builder:generating_files", {
          message: "Generating project files...",
        });

        filesEmitted = await this.generateAndEmitFiles(
          tree,
          projectName,
          socketId,
          userPrompt,
          options
        );

        this.emitEvent(socketId, "builder:files_emitted", {
          filesEmitted,
          message: `Generated ${filesEmitted.length} files`,
        });
      }

      // Step 4: Store conversation in Pinecone
      const duration = Date.now() - startTime;
      const conversationId = await conversationService.storeConversation({
        conversationId: `conv_${projectId}`,
        projectId,
        projectName,
        userPrompt,
        tree,
        filesGenerated: filesEmitted.length,
        timestamp: new Date().toISOString(),
        metadata: {
          aiModel: options?.useOpenAI ? "gpt-4" : "claude-3-sonnet",
          duration,
          tags: this.extractTags(userPrompt),
        },
      });

      console.log(
        `[BuilderService] Stored conversation ${conversationId} in Pinecone`
      );

      // Step 5: Build response
      const response: BuilderResponse = {
        ok: true,
        projectId,
        projectName,
        tree,
        filesEmitted,
        conversationId,
      };

      this.emitEvent(socketId, "builder:completed", response);

      return response;
    } catch (error: any) {
      console.error("[BuilderService] Build error:", error);

      const errorResponse: BuilderResponse = {
        ok: false,
        projectId,
        projectName,
        tree: [],
        filesEmitted: [],
        error: error.message,
      };

      this.emitEvent(socketId, "builder:error", {
        error: error.message,
        projectId,
      });

      return errorResponse;
    }
  }

  /**
   * Plan project structure using AI with RAG context
   */
  private async planProjectStructure(
    userPrompt: string,
    projectName: string,
    ragContext: any[],
    socketId: string,
    options?: BuilderRequest["options"],
    existingSnapshot: FileSnapshot[] = []
  ): Promise<TreeNode[]> {
    // 1. Check for OpenAI preference
    if (options?.useOpenAI) {
      return this.planProjectStructureWithOpenAI(
        userPrompt,
        projectName,
        ragContext,
        socketId,
        existingSnapshot
      );
    }

    // 2. Check for Gemini preference
    if (options?.useGemini) {
      return this.planProjectStructureWithGemini(
        userPrompt,
        projectName,
        ragContext,
        socketId,
        existingSnapshot
      );
    }

    try {
      // Format prompt with RAG context
      const enhancedPrompt = formatPromptWithContext(userPrompt, ragContext);
      
      // Format existing files context
      const existingFilesList = existingSnapshot.map(f => `- ${f.path}`).join("\n");
      const existingContext = existingSnapshot.length > 0 
        ? `\nEXISTING FILES:\n${existingFilesList}\n\nIMPORTANT: The project already contains these files. You may update them or add new ones, but avoid creating duplicates or overwriting without reason.`
        : "";

      // Prepare messages for AI
      const messages = [
        {
          role: "system",
          content: `You are an expert web developer who creates comprehensive project structures. 
Use the buildTree tool to generate a complete, production-ready file and folder structure.

TECHNOLOGY STACK:
- Pure Vanilla HTML5, CSS3, and JavaScript (ES6+).
- GSAP (GreenSock) for animations.
- NO Frameworks (React, Vue, etc.) unless explicitly requested.

${existingContext}

IMPORTANT:
- Populate the 'tree' argument with the full project structure.
- For the 'content' field, provide a BRIEF DESCRIPTION ONLY.
- DO NOT generate full source code yet.
- Ensure a modular structure (e.g., separate 'css', 'js', 'assets' folders).
- Plan for 'index.html' to link to these files correctly.`,
        },
        {
          role: "user",
          content: enhancedPrompt,
        },
      ];

      console.log(`[BuilderService] Calling AI with maxTokens: ${options?.maxTokens || 8192}`);

      // Call AI with BuildTreeTool
      const result = await callModelWithToolsStream(
        messages,
        socketId,
        options?.maxTokens || 8192,
        [
          {
            name: "buildTree",
            description: BuildTreeTool.description,
            input_schema: {
              type: "object",
              properties: {
                projectName: { type: "string" },
                prompt: { type: "string" },
                tree: {
                  type: "array",
                  description: "The full project structure. For files, include 'content'.",
                  items: {
                    type: "object",
                    properties: {
                      name: { type: "string" },
                      type: { type: "string", enum: ["file", "folder"] },
                      content: { type: "string", description: "Full file content" },
                      children: { type: "array", items: { type: "object" } } // Simplified recursive definition
                    },
                    required: ["name", "type"]
                  }
                },
                options: {
                  type: "object",
                  properties: {
                    generateIds: { type: "boolean" },
                    includeSampleFiles: { type: "boolean" },
                  },
                },
              },
              required: ["projectName", "tree"],
            },
          },
        ],
        "ai",
        false, // requireAcknowledgement
        false // chunkMessages
      );

      // Parse tool call result
      let toolArgs: any = {};
      if (result.toolCallArgsBuffer) {
        toolArgs = JSON.parse(result.toolCallArgsBuffer);
      }

      // Execute BuildTreeTool
      const buildInput = {
        projectName,
        prompt: userPrompt,
        existingTree: toolArgs.tree, // Pass the generated tree to the tool
        options: {
          generateIds: true,
          includeSampleFiles: true,
          ...toolArgs.options,
        },
      };

      const buildOutput = await BuildTreeTool.run(buildInput);

      if (!buildOutput.ok || !buildOutput.tree) {
        throw new Error("BuildTreeTool failed to generate structure");
      }

      return buildOutput.tree;
    } catch (error: any) {
      console.error("[BuilderService] Planning error:", error);
      
      // Handle specific billing error
      if (String(error).includes("credit balance")) {
         throw new Error("Anthropic billing quota exceeded. Please switch to OpenAI in the options or add credits to your Anthropic account.");
      }

      throw new Error(`Project planning failed: ${error.message}`);
    }
  }

  /**
   * OpenAI Implementation for Project Planning (JSON Mode)
   */
  private async planProjectStructureWithOpenAI(
    userPrompt: string,
    projectName: string,
    ragContext: any[],
    socketId: string,
    existingSnapshot: FileSnapshot[]
  ): Promise<TreeNode[]> {
    try {
      const enhancedPrompt = formatPromptWithContext(userPrompt, ragContext);
      
      const existingFilesList = existingSnapshot.map(f => `- ${f.path}`).join("\n");
      const existingContext = existingSnapshot.length > 0 
        ? `\nEXISTING FILES:\n${existingFilesList}\n`
        : "";

      const systemPrompt = `You are an expert web developer.
Plan the complete file structure for the project: "${projectName}".

TECHNOLOGY STACK:
- Pure Vanilla HTML5, CSS3, and JavaScript (ES6+).
- GSAP (GreenSock) for animations.
- NO Frameworks unless requested.

${existingContext}

OUTPUT FORMAT:
Return a JSON object with a single property "tree" which is an array of file nodes.
Each node must have:
- name: string
- type: "file" | "folder"
- content: string (BRIEF DESCRIPTION ONLY)
- children: array of nodes (if folder)

Example:
{
  "tree": [
    { "name": "index.html", "type": "file", "content": "Main entry point" },
    { "name": "css", "type": "folder", "children": [...] }
  ]
}`;

      console.log(`[BuilderService] Calling OpenAI (JSON Mode) for planning...`);

      const completion = await openai.chat.completions.create({
        model: "gpt-4-turbo-preview", // Use a capable model
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: enhancedPrompt }
        ],
        stream: false // No streaming for structure plan to keep it simple
      });

      const content = completion.choices[0].message.content;
      if (!content) throw new Error("OpenAI returned empty content");

      const parsed = JSON.parse(content);
      if (!parsed.tree || !Array.isArray(parsed.tree)) {
        throw new Error("OpenAI returned invalid JSON structure (missing 'tree' array)");
      }

      return parsed.tree;

    } catch (error: any) {
      console.error("[BuilderService] OpenAI Planning error:", error);
      throw new Error(`OpenAI planning failed: ${error.message}`);
    }
  }

  /**
   * Gemini Implementation for Project Planning
   */
  private async planProjectStructureWithGemini(
    userPrompt: string,
    projectName: string,
    ragContext: any[],
    socketId: string,
    existingSnapshot: FileSnapshot[]
  ): Promise<TreeNode[]> {
    try {
      const enhancedPrompt = formatPromptWithContext(userPrompt, ragContext);
      
      const existingFilesList = existingSnapshot.map(f => `- ${f.path}`).join("\n");
      const existingContext = existingSnapshot.length > 0 
        ? `\nEXISTING FILES:\n${existingFilesList}\n`
        : "";

      const systemPrompt = `You are an expert web developer.
Plan the complete file structure for the project: "${projectName}".

TECHNOLOGY STACK:
- Pure Vanilla HTML5, CSS3, and JavaScript (ES6+).
- GSAP (GreenSock) for animations.
- NO Frameworks unless requested.

${existingContext}

OUTPUT FORMAT:
Return a JSON object with a single property "tree" which is an array of file nodes.
Each node must have:
- name: string
- type: "file" | "folder"
- content: string (BRIEF DESCRIPTION ONLY)
- children: array of nodes (if folder)

IMPORTANT: Return ONLY valid JSON. No markdown formatting.

Example:
{
  "tree": [
    { "name": "index.html", "type": "file", "content": "Main entry point" },
    { "name": "css", "type": "folder", "children": [...] }
  ]
}`;

      console.log(`[BuilderService] Calling Gemini for planning...`);

      const responseText = await this.callGemini(systemPrompt, enhancedPrompt);
      const cleanedJson = this.extractCode(responseText); // Reuse extractCode to handle potential markdown blocks

      const parsed = JSON.parse(cleanedJson);
      if (!parsed.tree || !Array.isArray(parsed.tree)) {
        // Try to handle case where Gemini returns array directly
        if (Array.isArray(parsed)) {
             return parsed;
        }
        throw new Error("Gemini returned invalid JSON structure (missing 'tree' array)");
      }

      return parsed.tree;

    } catch (error: any) {
      console.error("[BuilderService] Gemini Planning error:", error);
      throw new Error(`Gemini planning failed: ${error.message}`);
    }
  }

  /**
   * Generate and emit files to disk
   */
  private async generateAndEmitFiles(
    tree: TreeNode[],
    projectName: string,
    socketId: string,
    userPrompt: string,
    options?: BuilderRequest["options"]
  ): Promise<BuilderResponse["filesEmitted"]> {
    try {
      // Convert tree to file operations
      const files = this.treeToFiles(tree, "");

      // Validate we have files to generate
      if (files.length === 0) {
        return [];
      }

      // Execute EmitFilesTool
      const emitInput = {
        projectName,
        files: files.map((f) => ({
          path: f.path,
          content: f.content,
          encoding: "utf-8" as const,
          mode: "create" as const,
        })),
        options: {
          dryRun: false,
          baseDir: PROJECT_ROOT,
        },
      };

      const emitOutput = await EmitFilesTool.run(emitInput);

      // Write files to disk
      const results: BuilderResponse["filesEmitted"] = [];

      for (const fileOp of emitInput.files) {
        try {
          // Emit generation progress
          this.emitEvent(socketId, "builder:file_progress", {
            path: fileOp.path,
            status: "generating",
            progress: results.length / emitInput.files.length,
          });

          // Generate full content for the file
          const fullContent = await this.generateFileContent(
            fileOp.path,
            fileOp.content, // This is now the description
            userPrompt,
            socketId,
            options
          );

          const fullPath = await this.writeFileToDisk(
            fileOp.path,
            fullContent,
            socketId
          );

          results.push({
            path: fileOp.path,
            status: "created",
            message: `Created at ${fullPath}`,
          });

          this.emitEvent(socketId, "builder:file_progress", {
            path: fileOp.path,
            status: "created",
            progress: (results.length + 1) / emitInput.files.length,
          });
        } catch (error: any) {
          results.push({
            path: fileOp.path,
            status: "error",
            message: error.message,
          });
        }
      }

      return results;
    } catch (error: any) {
      console.error("[BuilderService] File generation error:", error);
      throw new Error(`File generation failed: ${error.message}`);
    }
  }

  /**
   * Convert tree structure to flat file list
   */
  private treeToFiles(
    nodes: TreeNode[],
    parentPath: string
  ): Array<{ path: string; content: string }> {
    const files: Array<{ path: string; content: string }> = [];

    for (const node of nodes) {
      const nodePath = path.join(parentPath, node.name);

      if (node.type === "file" && node.content) {
        files.push({
          path: nodePath,
          content: node.content,
        });
      } else if (node.type === "folder" && node.children) {
        files.push(...this.treeToFiles(node.children, nodePath));
      }
    }

    return files;
  }

  /**
   * Write file to disk with path validation
   */
  private async writeFileToDisk(
    relativePath: string,
    content: string,
    socketId: string
  ): Promise<string> {
    try {
      // Validate path (prevent directory traversal)
      const fullPath = path.resolve(PROJECT_ROOT, relativePath);

      if (!fullPath.startsWith(path.resolve(PROJECT_ROOT))) {
        throw new Error(
          `Invalid path: ${relativePath} (path traversal detected)`
        );
      }

      // Ensure directory exists
      const dir = path.dirname(fullPath);
      await fs.ensureDir(dir);

      // Write file
      await fs.writeFile(fullPath, content, "utf-8");

      console.log(`[BuilderService] Created file: ${fullPath}`);

      return fullPath;
    } catch (error: any) {
      console.error(`[BuilderService] File write error for ${relativePath}:`, error);
      throw new Error(`Failed to write ${relativePath}: ${error.message}`);
    }
  }

  /**
   * Extract tags from user prompt for categorization
   */
  private extractTags(userPrompt: string): string[] {
    const commonTags = [
      "react",
      "vue",
      "angular",
      "next.js",
      "portfolio",
      "blog",
      "ecommerce",
      "dashboard",
      "landing-page",
      "real-estate",
      "authentication",
      "api",
      "typescript",
      "javascript",
    ];

    const promptLower = userPrompt.toLowerCase();
    return commonTags.filter((tag) => promptLower.includes(tag));
  }

  /**
   * Generate full content for a single file using AI
   */
  private async generateFileContent(
    filePath: string,
    description: string,
    userPrompt: string,
    socketId: string,
    options?: BuilderRequest["options"]
  ): Promise<string> {
    // Check for OpenAI preference
    if (options?.useOpenAI) {
       return this.generateFileContentWithOpenAI(filePath, description, userPrompt, socketId);
    }

    // Check for Gemini preference
    if (options?.useGemini) {
       return this.generateFileContentWithGemini(filePath, description, userPrompt, socketId);
    }

    const fileName = path.basename(filePath);
    const messages = [
      {
        role: "system",
        content: `You are an expert web developer specializing in high-performance, visually stunning websites.
Your task is to generate the FULL source code for the file: "${fileName}".

TECHNOLOGY STACK REQUIREMENTS:
1.  **HTML**: Use semantic HTML5.
2.  **CSS**: Use pure CSS3 (Vanilla CSS). Do NOT use Tailwind unless explicitly requested. Use modern features like Flexbox, Grid, and CSS Variables.
3.  **JavaScript**: Use pure Vanilla JavaScript (ES6+).
4.  **Animations**: You MUST use **GSAP (GreenSock)** for all animations. This is a strict requirement.
    - Include GSAP via CDN in HTML files: <script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/gsap.min.js"></script>
    - Use GSAP for entrance animations, scroll triggers, and hover effects.
    - Make the site feel "alive" and premium.

CONTEXT:
- User Request: "${userPrompt}"
- File Description: "${description}"
- File Path: "${filePath}"

IMPORTANT:
- Ensure proper ES Module syntax (import/export) if this is a JavaScript module.
- If this is an HTML file, ensure all CSS and JS files are correctly linked (relative paths).
- Output ONLY the source code. Do not include conversational text.`,
      },
      {
        role: "user",
        content: `Generate code for ${fileName}`,
      },
    ];

    try {
      const result = await callModelWithToolsStream(
        messages,
        socketId,
        8192,
        [], // No tools, just text generation
        "ai_file", // event prefix
        false, // ack
        false // chunk
      );

      return this.extractCode(result.fullMessage);
    } catch (error) {
      console.error(`[BuilderService] Failed to generate content for ${fileName}:`, error);
      return `// Error generating content: ${error}`;
    }
  }

  /**
   * OpenAI Implementation for Content Generation
   */
  private async generateFileContentWithOpenAI(
    filePath: string,
    description: string,
    userPrompt: string,
    socketId: string
  ): Promise<string> {
    const fileName = path.basename(filePath);
    const messages = [
      {
        role: "system",
        content: `You are an expert web developer specializing in high-performance, visually stunning websites.
Your task is to generate the FULL source code for the file: "${fileName}".

TECHNOLOGY STACK REQUIREMENTS:
1.  **HTML**: Use semantic HTML5.
2.  **CSS**: Use pure CSS3 (Vanilla CSS). Do NOT use Tailwind unless explicitly requested. Use modern features like Flexbox, Grid, and CSS Variables.
3.  **JavaScript**: Use pure Vanilla JavaScript (ES6+).
4.  **Animations**: You MUST use **GSAP (GreenSock)** for all animations. This is a strict requirement.
    - Include GSAP via CDN in HTML files: <script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/gsap.min.js"></script>
    - Use GSAP for entrance animations, scroll triggers, and hover effects.
    - Make the site feel "alive" and premium.

CONTEXT:
- User Request: "${userPrompt}"
- File Description: "${description}"
- File Path: "${filePath}"

IMPORTANT:
- Ensure proper ES Module syntax (import/export) if this is a JavaScript module.
- If this is an HTML file, ensure all CSS and JS files are correctly linked (relative paths).
- Output ONLY the source code. Do not include conversational text.`,
      },
      {
        role: "user",
        content: `Generate code for ${fileName}`,
      },
    ];

    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o", // Use GPT-4o for best code generation
        messages: messages as any,
        stream: false // No streaming for now to keep it simple
      });

      const content = completion.choices[0].message.content || "";
      return this.extractCode(content);

    } catch (error) {
      console.error(`[BuilderService] OpenAI Content Generation error for ${fileName}:`, error);
      return `// Error generating content with OpenAI: ${error}`;
    }
  }

  /**
   * Gemini Implementation for Content Generation
   */
  private async generateFileContentWithGemini(
    filePath: string,
    description: string,
    userPrompt: string,
    socketId: string
  ): Promise<string> {
    const fileName = path.basename(filePath);
    const systemPrompt = `You are an expert web developer specializing in high-performance, visually stunning websites.
Your task is to generate the FULL source code for the file: "${fileName}".

TECHNOLOGY STACK REQUIREMENTS:
1.  **HTML**: Use semantic HTML5.
2.  **CSS**: Use pure CSS3 (Vanilla CSS). Do NOT use Tailwind unless explicitly requested. Use modern features like Flexbox, Grid, and CSS Variables.
3.  **JavaScript**: Use pure Vanilla JavaScript (ES6+).
4.  **Animations**: You MUST use **GSAP (GreenSock)** for all animations. This is a strict requirement.
    - Include GSAP via CDN in HTML files: <script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/gsap.min.js"></script>
    - Use GSAP for entrance animations, scroll triggers, and hover effects.
    - Make the site feel "alive" and premium.

CONTEXT:
- User Request: "${userPrompt}"
- File Description: "${description}"
- File Path: "${filePath}"

IMPORTANT:
- Ensure proper ES Module syntax (import/export) if this is a JavaScript module.
- If this is an HTML file, ensure all CSS and JS files are correctly linked (relative paths).
- Output ONLY the source code. Do not include conversational text.`;

    try {
      const responseText = await this.callGemini(systemPrompt, `Generate code for ${fileName}`);
      return this.extractCode(responseText);
    } catch (error) {
      console.error(`[BuilderService] Gemini Content Generation error for ${fileName}:`, error);
      return `// Error generating content with Gemini: ${error}`;
    }
  }

  /**
   * Helper to call Gemini API
   */
  private async callGemini(systemPrompt: string, userPrompt: string): Promise<string> {
    const apiKey = process.env.GEMINI_API_KEY || "AIzaSyAkptd80FbJT8cwKbghiv57ppoDvQPSfHo";
    const GEMINI_MODEL = process.env.GEMINI_MODEL || "AIzaSyAkptd80FbJT8cwKbghiv57ppoDvQPSfHo";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

    const payload = {
      contents: [
        {
          parts: [{ text: systemPrompt + "\n\n" + userPrompt }]
        }
      ]
    };

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
          const errText = await response.text();
          throw new Error(`Gemini API Error ${response.status}: ${errText}`);
      }

      const data = await response.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    } catch (error: any) {
      console.error("[BuilderService] Gemini API Call Failed:", error);
      throw error;
    }
  }

  /**
   * Extract code from markdown code blocks if present
   */
  private extractCode(text: string): string {
    // Match code block with optional language identifier
    const match = text.match(/```[\w]*\n([\s\S]*?)```/);
    if (match) {
      return match[1];
    }
    // If no code block, return full text (assuming it's raw code)
    return text;
  }

  /**
   * Emit Socket.io event (uses global io instance)
   */
  private emitEvent(socketId: string, event: string, payload: any) {
    try {
      const io = (global as any).__expressIoInstance;
      if (io && socketId) {
        io.to(socketId).emit(event, payload);
      }
    } catch (error) {
      console.warn(`[BuilderService] Failed to emit event ${event}:`, error);
    }
  }
}

export default new BuilderService();
