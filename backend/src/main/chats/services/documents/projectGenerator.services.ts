/*
  projectGenerator.service.ts
  A Node.js / NestJS-friendly service implementing AI function-calling
  and workspace operations based on JSON prompt chunks for dynamic server creation.
*/

import fs from "fs/promises";
import path from "path";
import { spawn } from "child_process";
import { callModelWithFunctions } from "utils/aiClient";

// Import your existing OpenAI functions and AI client
// Adjust these import paths to match your project structure
export const openaiFunctions = [
  {
    name: "build_module_tree_from_prompt",
    description:
      "Build a nested module tree from a natural language prompt. Return a root ModuleNode (recursive). Use safeId for ids.",
    parameters: {
      type: "object",
      properties: {
        projectName: { type: "string" },
        prompt: { type: "string" },
        options: {
          type: "object",
          properties: {
            maxDepth: { type: "integer", default: 6 },
            maxFilesPerModule: { type: "integer", default: 10 },
            verbosity: {
              type: "string",
              enum: ["short", "medium", "detailed"],
              default: "medium",
            },
          },
        },
      },
      required: ["projectName", "prompt"],
    },
  },
  {
    name: "emitFiles",
    description:
      "Emit file operations: create/update/delete files inside the project's workspace. The server must validate and sandbox all operations.",
    parameters: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        operations: {
          type: "array",
          items: {
            type: "object",
            properties: {
              path: { type: "string" },
              action: { type: "string", enum: ["create", "update", "delete"] },
              content: { type: "string" },
              encoding: {
                type: "string",
                enum: ["utf8", "base64"],
                default: "utf8",
              },
            },
            required: ["path", "action"],
            additionalProperties: false,
          },
          minItems: 1,
          maxItems: 200,
        },
        meta: {
          type: "object",
          properties: {
            requestId: { type: "string" },
            userId: { type: "string" },
          },
          additionalProperties: false,
        },
      },
      required: ["projectId", "operations"],
    },
  },
  {
    name: "applyPatch",
    description:
      "Apply an approved patch (emitFiles-like) to a project workspace. This is only callable after user approval.",
    parameters: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        operations: {
          type: "array",
          items: {
            type: "object",
            properties: {
              path: { type: "string" },
              action: { type: "string", enum: ["create", "update", "delete"] },
              content: { type: "string" },
              encoding: {
                type: "string",
                enum: ["utf8", "base64"],
                default: "utf8",
              },
            },
            required: ["path", "action"],
            additionalProperties: false,
          },
        },
        approvedBy: { type: "string" },
      },
      required: ["projectId", "operations", "approvedBy"],
    },
  },
  {
    name: "runCommand",
    description:
      "Run a sandboxed command inside the workspace and return logs and exit code.",
    parameters: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        cmd: { type: "string" },
        args: { type: "array", items: { type: "string" } },
        cwd: { type: "string" },
        options: {
          type: "object",
          properties: {
            timeoutMs: { type: "integer", minimum: 1000 },
            resourceLimits: {
              type: "object",
              properties: {
                memoryMb: { type: "integer" },
                cpuShares: { type: "integer" },
              },
            },
          },
          additionalProperties: false,
        },
      },
      required: ["projectId", "cmd"],
    },
  },
  {
    name: "runJobStatus",
    description:
      "Query a previous job by jobId. Returns status and logs (truncated).",
    parameters: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        jobId: { type: "string" },
        tailLines: { type: "integer", minimum: 0, maximum: 2000 },
      },
      required: ["projectId", "jobId"],
    },
  },
  {
    name: "listFiles",
    description:
      "List files in a project workspace (optionally path-prefixed).",
    parameters: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        path: { type: "string" },
        depth: { type: "integer", minimum: 0, maximum: 5 },
      },
      required: ["projectId"],
    },
  },
  {
    name: "getFile",
    description: "Get file content for preview (truncated if large).",
    parameters: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        path: { type: "string" },
        maxBytes: { type: "integer", minimum: 1024, maximum: 2000000 },
      },
      required: ["projectId", "path"],
    },
  },
  {
    name: "formatFile",
    description: "Run a formatting tool and return formatted content.",
    parameters: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        path: { type: "string" },
        tool: { type: "string", enum: ["prettier", "eslint"] },
      },
      required: ["projectId", "path", "tool"],
    },
  },
];

// --- Types ---
interface OpenAIMessage {
  role: "system" | "user" | "assistant" | "function";
  content: string;
  name?: string;
  function_call?: {
    name: string;
    arguments: string;
  };
}

interface OpenAIResponse {
  choices: Array<{
    message: {
      role: string;
      content?: string;
      function_call?: {
        name: string;
        arguments: string;
      };
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface AIClientOptions {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}

interface FileOperation {
  path: string;
  action: "create" | "update" | "delete";
  content?: string;
  encoding?: "utf8" | "base64";
}

interface ModuleNode {
  id?: string;
  name: string;
  safeId?: string;
  type?: string;
  description?: string;
  files?: Array<{
    name: string;
    path: string;
    content: string;
    type?: string;
  }>;
  children?: ModuleNode[];
}

interface ProjectGenerationResult {
  success: boolean;
  projectId: string;
  moduleTree?: ModuleNode;
  filesCreated: number;
  errors: Array<{ path: string; error: string }>;
  executionTime?: number;
}

// --- AI Client Helper (Mock implementation - replace with your actual implementation) ---
// async function callModel(
//   messages: OpenAIMessage[],
//   functions: any[],
//   maxTokens = 32768,
//   forceText = false
// ) {
//   const requestBody: any = {
//     model: "gpt-4o",
//     messages,
//     max_tokens: maxTokens,
//     temperature: 0.1,
//   };

//   if (!forceText && functions && functions.length > 0) {
//     requestBody.functions = functions;
//     requestBody.function_call = "auto";
//   }

//   return await callModelWithFunctions(
//     messages,
//     functions,
//     maxTokens,
//     forceText
//   );
// }

export class ProjectGeneratorService {
  private readonly workspacesRoot: string;
  private readonly jobs = new Map<string, any>();
  private readonly aiOptions: AIClientOptions;

  constructor(
    workspacesRoot = path.resolve(process.cwd(), "workspaces"),
    aiOptions: AIClientOptions = {}
  ) {
    this.workspacesRoot = workspacesRoot;
    this.aiOptions = {
      model: "gpt-4o",
      baseUrl: "https://api.openai.com/v1",
      ...aiOptions,
    };

    // Ensure workspaces directory exists
    this.ensureWorkspacesRoot();
  }

  private async ensureWorkspacesRoot(): Promise<void> {
    try {
      await fs.mkdir(this.workspacesRoot, { recursive: true });
    } catch (error) {
      console.error("Failed to create workspaces root:", error);
    }
  }

  // --- File system helpers ---
  private ensureProjectRoot(projectId: string): string {
    const root = path.join(this.workspacesRoot, projectId);
    const normalized = path.resolve(root);

    if (!normalized.startsWith(path.resolve(this.workspacesRoot))) {
      throw new Error("Invalid project path - potential path traversal attack");
    }

    return normalized;
  }

  private sanitizePath(filePath: string): string {
    if (path.isAbsolute(filePath)) {
      throw new Error("Absolute paths not allowed");
    }

    if (filePath.includes("..")) {
      throw new Error("Parent path segments not allowed");
    }

    return filePath.replace(/^\/+/, "");
  }

  // --- Chunk processing ---
  private splitIntoChunks(text: string, chunkSize = 28000): string[] {
    const chunks: string[] = [];
    let i = 0;

    while (i < text.length) {
      chunks.push(text?.slice(i, i + chunkSize));
      i += chunkSize;
    }

    return chunks;
  }

  // --- Main method for creating projects from JSON prompts ---
  async createProjectFromJsonPrompt(
    jsonFilePath: string,
    userId?: string,
    options: {
      maxDepth?: number;
      maxFilesPerModule?: number;
      verbosity?: "short" | "medium" | "detailed";
      generateServer?: boolean;
    } = {}
  ): Promise<ProjectGenerationResult> {
    const startTime = Date.now();

    try {
      console.log(`🚀 Starting project generation from: ${jsonFilePath}`);

      // Read and parse the JSON prompt
      const raw = await fs.readFile(jsonFilePath, "utf8");
      const payload = JSON.parse(raw);
      const payloadText = JSON.stringify(payload, null, 2);

      console.log(`📋 JSON payload size: ${payloadText.length} characters`);

      // Extract project name
      const projectName =
        payload.projectName ||
        payload.title ||
        payload.name ||
        `project-${Date.now()}`;
      console.log(`📂 Project name: ${projectName}`);

      // System message for AI
      const systemMessage: OpenAIMessage = {
        role: "system",
        content: `You are an expert project generator assistant specialized in creating dynamic server applications.

WORKFLOW:
1. First, you'll receive JSON chunks marked as "INGEST_CHUNK i/N" - acknowledge each with "CHUNK i/N ACKNOWLEDGED"
2. After all chunks are ingested, you'll be asked to call the 'build_module_tree_from_prompt' function
3. Generate a complete, production-ready server project structure

REQUIREMENTS FOR DYNAMIC SERVER CREATION:
- Create modular, scalable server architecture
- Include proper routing, middleware, controllers
- Add database models/schemas if specified
- Include configuration files, environment setup
- Add proper error handling and logging
- Include API documentation and testing setup
- Consider security, validation, and performance

The module tree should represent a complete server application with all necessary components.`,
      };

      // Process chunks
      const chunks = this.splitIntoChunks(payloadText, 28000);
      const messages: OpenAIMessage[] = [systemMessage];

      console.log(`📦 Processing ${chunks.length} chunks...`);

      // Ingest chunks
      for (let i = 0; i < chunks.length; i++) {
        messages.push({
          role: "user",
          content: `INGEST_CHUNK ${i + 1}/${chunks.length}

Do NOT create the project yet. Only acknowledge that you have ingested this chunk with "CHUNK ${
            i + 1
          }/${chunks.length} ACKNOWLEDGED"

${chunks[i]}`,
        });

        console.log(`📤 Sending chunk ${i + 1}/${chunks.length}...`);

        const response = await callModelWithFunctions(
          messages,
          openaiFunctions,
          28000,
          false
        );
        const ackMessage =
          response.choices?.[0]?.message?.content ||
          `CHUNK ${i + 1}/${chunks.length} ACKNOWLEDGED`;

        console.log(
          `✅ Chunk ${i + 1} acknowledged: ${ackMessage.substring(0, 100)}...`
        );

        messages.push({
          role: "assistant",
          content: ackMessage,
        });
      }

      // Generate project structure
      console.log(`🧠 Generating project structure for: ${projectName}`);

      messages.push({
        role: "user",
        content: `All chunks have been ingested successfully. Now use the 'build_module_tree_from_prompt' function to create a complete server project structure.

Requirements:
- projectName: "${projectName}"
- Generate a comprehensive server application structure
- Include all necessary files for a production-ready server
- Consider the specifications from the ingested JSON
- Create proper module hierarchy with appropriate files

Options:
- maxDepth: ${options.maxDepth || 6}
- maxFilesPerModule: ${options.maxFilesPerModule || 10}
- verbosity: "${options.verbosity || "detailed"}"

Call the function now.`,
      });

      const finalResponse = await callModelWithFunctions(
        messages,
        openaiFunctions,
        32768,
        false
      );
      const choice = finalResponse.choices?.[0];

      if (!choice) {
        throw new Error("No response received from AI model");
      }

      // Parse function call
      const functionCall = choice.message?.function_call;
      if (
        !functionCall ||
        functionCall.name !== "build_module_tree_from_prompt"
      ) {
        console.log("AI Response:", choice.message?.content);
        throw new Error(
          `Expected build_module_tree_from_prompt function call, got: ${
            functionCall?.name || "none"
          }`
        );
      }

      let functionArgs: any;
      try {
        functionArgs = JSON.parse(functionCall.arguments || "{}");
      } catch (error) {
        console.error("Function arguments:", functionCall.arguments);
        throw new Error("Failed to parse function call arguments");
      }

      console.log(`🏗️ Generated module tree for: ${functionArgs.projectName}`);

      // Create the project workspace
      const projectId = await this.createProjectWorkspace(
        functionArgs.projectName,
        userId
      );
      console.log(`📁 Created workspace: ${projectId}`);

      // Process the module tree - the AI should return a complete ModuleNode structure
      const moduleTree =
        functionArgs.root || functionArgs.moduleTree || functionArgs;
      if (!moduleTree) {
        throw new Error("No module tree found in AI response");
      }

      // Convert module tree to file operations
      const operations: FileOperation[] = [];
      this.processModuleTree(moduleTree, "", operations);

      console.log(`📝 Generated ${operations.length} file operations`);

      // Execute file operations
      const emitResult = await this.handleEmitFiles({
        projectId,
        operations,
        meta: { requestId: `gen-${Date.now()}`, userId },
      });

      const errors = emitResult.results
        .filter((r) => !r.ok)
        .map((r) => ({
          path: r.path,
          error: r.error || "Unknown error",
        }));

      const successCount = emitResult.results.filter((r) => r.ok).length;
      console.log(`✅ Successfully created ${successCount} files`);

      if (errors.length > 0) {
        console.warn(`⚠️ ${errors.length} file operation errors:`, errors);
      }

      // Generate server startup files if requested
      if (options.generateServer !== false) {
        await this.generateServerStartupFiles(projectId, projectName);
      }

      const executionTime = Date.now() - startTime;
      console.log(`🎉 Project generation completed in ${executionTime}ms`);

      return {
        success: true,
        projectId,
        moduleTree,
        filesCreated: successCount,
        errors,
        executionTime,
      };
    } catch (error) {
      console.error("❌ Project generation failed:", error);
      throw error;
    }
  }

  private async createProjectWorkspace(
    projectName: string,
    userId?: string
  ): Promise<string> {
    const projectId = `${projectName
      .toLowerCase()
      .replace(/[^a-z0-9-_]/g, "-")}-${Date.now()}`;

    const root = this.ensureProjectRoot(projectId);
    await fs.mkdir(root, { recursive: true });

    // Create project metadata
    const metadata = {
      projectId,
      projectName,
      createdAt: new Date().toISOString(),
      createdBy: userId,
      version: "1.0.0",
    };

    await fs.writeFile(
      path.join(root, ".project-meta.json"),
      JSON.stringify(metadata, null, 2),
      "utf8"
    );

    return projectId;
  }

  private processModuleTree(
    node: ModuleNode,
    parentPath: string,
    operations: FileOperation[]
  ) {
    const nodeName = (node.safeId || node.id || node.name || "module")
      .toString()
      .replace(/[^a-zA-Z0-9-_]/g, "-");

    const currentPath = parentPath
      ? path.posix.join(parentPath, nodeName)
      : nodeName;

    // Process files for this node
    if (Array.isArray(node.files) && node.files.length > 0) {
      for (const file of node.files) {
        const fileName = file.path || file.name || "index.js";
        const filePath = path.posix.join(currentPath, fileName);

        operations.push({
          path: filePath,
          action: "create",
          content:
            file.content ||
            this.generateDefaultFileContent(fileName, node.name),
          encoding: "utf8",
        });
      }
    } else if (!node.children || node.children.length === 0) {
      // Create default file for leaf nodes without files
      const defaultFileName = this.getDefaultFileName(node.name, node.type);
      operations.push({
        path: path.posix.join(currentPath, defaultFileName),
        action: "create",
        content: this.generateDefaultFileContent(
          defaultFileName,
          node.name,
          node.description
        ),
        encoding: "utf8",
      });
    }

    // Process child nodes
    if (Array.isArray(node.children)) {
      for (const child of node.children) {
        this.processModuleTree(child, currentPath, operations);
      }
    }
  }

  private getDefaultFileName(nodeName: string, nodeType?: string): string {
    if (nodeType === "config") return "config.js";
    if (nodeType === "model") return "model.js";
    if (nodeType === "controller") return "controller.js";
    if (nodeType === "route") return "routes.js";
    if (nodeType === "middleware") return "middleware.js";
    if (nodeType === "service") return "service.js";
    if (nodeType === "util") return "utils.js";

    return "index.js";
  }

  private generateDefaultFileContent(
    fileName: string,
    moduleName: string,
    description?: string
  ): string {
    const ext = path.extname(fileName);
    const comment = ext === ".js" ? "//" : ext === ".py" ? "#" : "//";

    return `${comment} ${moduleName} - ${description || "Generated module"}
${comment} File: ${fileName}
${comment} Created: ${new Date().toISOString()}

${
  ext === ".js"
    ? this.generateJavaScriptTemplate(moduleName, fileName)
    : ext === ".py"
    ? this.generatePythonTemplate(moduleName)
    : ext === ".json"
    ? this.generateJsonTemplate(moduleName)
    : `${comment} ${moduleName} implementation`
}
`;
  }

  private generateJavaScriptTemplate(
    moduleName: string,
    fileName: string
  ): string {
    if (fileName.includes("server") || fileName.includes("app")) {
      return `
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.get('/', (req, res) => {
  res.json({ message: 'Welcome to ${moduleName} server' });
});

app.listen(PORT, () => {
  console.log(\`${moduleName} server running on port \${PORT}\`);
});

module.exports = app;
`;
    }

    return `
// ${moduleName} module implementation

class ${moduleName?.charAt(0)?.toUpperCase() + moduleName?.slice(1)} {
  constructor() {
    // Initialize ${moduleName}
  }
  
  // Add methods here
}

module.exports = ${moduleName?.charAt(0)?.toUpperCase() + moduleName?.slice(1)};
`;
  }

  private generatePythonTemplate(moduleName: string): string {
    return `
class ${moduleName?.charAt(0)?.toUpperCase() + moduleName?.slice(1)}:
    def __init__(self):
        # Initialize ${moduleName}
        pass
    
    # Add methods here
`;
  }

  private generateJsonTemplate(moduleName: string): string {
    return JSON.stringify(
      {
        name: moduleName,
        version: "1.0.0",
        description: `${moduleName} configuration`,
        createdAt: new Date().toISOString(),
      },
      null,
      2
    );
  }

  private async generateServerStartupFiles(
    projectId: string,
    projectName: string
  ) {
    const root = this.ensureProjectRoot(projectId);

    // Generate package.json
    const packageJson = {
      name: projectName.toLowerCase().replace(/[^a-z0-9-_]/g, "-"),
      version: "1.0.0",
      description: `${projectName} - Generated server application`,
      main: "server.js",
      scripts: {
        start: "node server.js",
        dev: "nodemon server.js",
        test: "jest",
      },
      dependencies: {
        express: "^4.18.2",
        dotenv: "^16.3.1",
        cors: "^2.8.5",
        helmet: "^7.1.0",
      },
      devDependencies: {
        nodemon: "^3.0.1",
        jest: "^29.7.0",
      },
    };

    // Generate .env file
    const envContent = `PORT=3000
NODE_ENV=development
DB_HOST=localhost
DB_PORT=5432
DB_NAME=${projectName.toLowerCase()}
DB_USER=user
DB_PASS=password
JWT_SECRET=your-secret-key
`;

    // Generate README
    const readmeContent = `# ${projectName}

Generated server application created dynamically.

## Installation

\`\`\`bash
npm install
\`\`\`

## Usage

\`\`\`bash
# Development
npm run dev

# Production
npm start
\`\`\`

## API Endpoints

- GET / - Welcome message
- Add your API endpoints here

## Environment Variables

Copy \`.env.example\` to \`.env\` and configure your environment variables.

Generated at: ${new Date().toISOString()}
`;

    await Promise.all([
      fs.writeFile(
        path.join(root, "package.json"),
        JSON.stringify(packageJson, null, 2)
      ),
      fs.writeFile(path.join(root, ".env"), envContent),
      fs.writeFile(path.join(root, "README.md"), readmeContent),
      fs.writeFile(
        path.join(root, ".gitignore"),
        "node_modules/\n.env\n*.log\ndist/\n.DS_Store\n"
      ),
    ]);
  }

  // --- Handler methods (implement all the functions from openaiFunctions) ---
  async handleEmitFiles(payload: {
    projectId: string;
    operations: FileOperation[];
    meta?: any;
  }) {
    const root = this.ensureProjectRoot(payload.projectId);
    const results: Array<{
      path: string;
      action: string;
      ok: boolean;
      error?: string;
    }> = [];

    for (const operation of payload.operations) {
      try {
        const relativePath = this.sanitizePath(operation.path);
        const fullPath = path.join(root, relativePath);

        switch (operation.action) {
          case "create":
          case "update":
            await fs.mkdir(path.dirname(fullPath), { recursive: true });
            const content =
              operation.encoding === "base64"
                ? Buffer.from(operation.content || "", "base64")
                : operation.content || "";

            await fs.writeFile(
              fullPath,
              content as any,
              operation.encoding === "base64" ? undefined : "utf8"
            );
            results.push({
              path: relativePath,
              action: operation.action,
              ok: true,
            });
            break;

          case "delete":
            try {
              await fs.rm(fullPath, { force: true });
              results.push({
                path: relativePath,
                action: operation.action,
                ok: true,
              });
            } catch (e: any) {
              if (e.code === "ENOENT") {
                results.push({
                  path: relativePath,
                  action: operation.action,
                  ok: true,
                });
              } else {
                throw e;
              }
            }
            break;

          default:
            results.push({
              path: operation.path,
              action: operation.action,
              ok: false,
              error: `Unknown action: ${operation.action}`,
            });
        }
      } catch (error: any) {
        results.push({
          path: operation.path,
          action: operation.action,
          ok: false,
          error: error.message,
        });
      }
    }

    return { projectId: payload.projectId, results };
  }

  async handleApplyPatch(payload: {
    projectId: string;
    operations: FileOperation[];
    approvedBy: string;
  }) {
    if (!payload.approvedBy) {
      throw new Error("Patch must be approved by a user");
    }

    return this.handleEmitFiles({
      projectId: payload.projectId,
      operations: payload.operations,
      meta: {
        approvedBy: payload.approvedBy,
        timestamp: new Date().toISOString(),
      },
    });
  }

  async handleListFiles(projectId: string, relativePath = "", depth = 2) {
    const root = this.ensureProjectRoot(projectId);
    const startPath = path.join(root, this.sanitizePath(relativePath || ""));

    const walkDirectory = async (
      currentPath: string,
      basePath: string,
      remainingDepth: number
    ): Promise<any[]> => {
      if (remainingDepth < 0) return [];

      try {
        const stat = await fs.stat(currentPath);

        if (stat.isFile()) {
          return [
            {
              path: path.relative(basePath, currentPath),
              type: "file",
              size: stat.size,
              modified: stat.mtime.toISOString(),
            },
          ];
        }

        if (stat.isDirectory()) {
          const files = await fs.readdir(currentPath);
          const items: any[] = [];

          for (const fileName of files) {
            const childPath = path.join(currentPath, fileName);
            const childStat = await fs.stat(childPath);

            if (childStat.isDirectory()) {
              items.push({
                path: path.relative(basePath, childPath) + path.sep,
                type: "dir",
                modified: childStat.mtime.toISOString(),
              });

              if (remainingDepth > 0) {
                const children = await walkDirectory(
                  childPath,
                  basePath,
                  remainingDepth - 1
                );
                items.push(...children);
              }
            } else {
              items.push({
                path: path.relative(basePath, childPath),
                type: "file",
                size: childStat.size,
                modified: childStat.mtime.toISOString(),
              });
            }
          }

          return items;
        }
      } catch (error: any) {
        console.warn(`Error reading directory ${currentPath}:`, error.message);
        return [];
      }

      return [];
    };

    const listing = await walkDirectory(startPath, root, depth);
    return { projectId, path: relativePath, listing };
  }

  async handleGetFile(
    projectId: string,
    relativePath: string,
    maxBytes = 64000
  ) {
    const root = this.ensureProjectRoot(projectId);
    const fullPath = path.join(root, this.sanitizePath(relativePath));

    const stat = await fs.stat(fullPath);
    if (!stat.isFile()) {
      throw new Error("Path is not a file");
    }

    const bytesToRead = Math.min(stat.size, maxBytes);
    const buffer = Buffer.alloc(bytesToRead);

    const fileHandle = await fs.open(fullPath, "r");
    try {
      await fileHandle.read(buffer, 0, bytesToRead, 0);
    } finally {
      await fileHandle.close();
    }

    const truncated = stat.size > maxBytes;

    return {
      projectId,
      path: relativePath,
      content: buffer.toString("utf8"),
      truncated,
      size: stat.size,
      modified: stat.mtime.toISOString(),
    };
  }

  async handleFormatFile(
    projectId: string,
    relativePath: string,
    tool: "prettier" | "eslint"
  ) {
    const root = this.ensureProjectRoot(projectId);
    const fullPath = path.join(root, this.sanitizePath(relativePath));
    const code = await fs.readFile(fullPath, "utf8");

    if (tool === "prettier") {
      try {
        const prettier = require("prettier");
        const formatted = await prettier.format(code, { filepath: fullPath });
        return { projectId, path: relativePath, formatted };
      } catch (e) {
        return {
          projectId,
          path: relativePath,
          formatted: code,
          warning: "Prettier not available or formatting failed",
        };
      }
    }

    return {
      projectId,
      path: relativePath,
      formatted: code,
      warning: `${tool} formatting not implemented`,
    };
  }

  async handleRunCommand(payload: {
    projectId: string;
    cmd: string;
    args?: string[];
    cwd?: string;
    options?: {
      timeoutMs?: number;
      resourceLimits?: {
        memoryMb?: number;
        cpuShares?: number;
      };
    };
  }) {
    const root = this.ensureProjectRoot(payload.projectId);
    const workingDir = payload.cwd
      ? path.join(root, this.sanitizePath(payload.cwd))
      : root;

    if (!workingDir.startsWith(root)) {
      throw new Error("Working directory outside project root not allowed");
    }

    const jobId = `${payload.projectId}-${Date.now()}`;
    const timeoutMs = payload.options?.timeoutMs || 30000;

    return new Promise((resolve, reject) => {
      const child = spawn(payload.cmd, payload.args || [], {
        cwd: workingDir,
        shell: true,
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";

      child.stdout?.on("data", (data) => {
        stdout += data.toString();
      });

      child.stderr?.on("data", (data) => {
        stderr += data.toString();
      });

      const timeoutHandle = setTimeout(() => {
        child.kill("SIGKILL");
        reject(new Error(`Command timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      child.on("close", (code) => {
        clearTimeout(timeoutHandle);

        const result = {
          jobId,
          projectId: payload.projectId,
          cmd: payload.cmd,
          args: payload.args || [],
          cwd: payload.cwd,
          exitCode: code,
          stdout: stdout?.slice(-20000),
          stderr: stderr?.slice(-20000),
          finishedAt: new Date().toISOString(),
        };

        this.jobs.set(jobId, result);
        resolve(result);
      });

      child.on("error", (error) => {
        clearTimeout(timeoutHandle);
        reject(error);
      });
    });
  }

  async handleRunJobStatus(projectId: string, jobId: string, tailLines = 200) {
    const job = this.jobs.get(jobId);

    if (!job) {
      return { projectId, jobId, status: "not_found" };
    }

    const stdout = job.stdout?.split("\n")?.slice(-tailLines).join("\n") || "";
    const stderr = job.stderr?.split("\n")?.slice(-tailLines).join("\n") || "";

    return {
      projectId,
      jobId,
      status: "finished",
      exitCode: job.exitCode,
      stdout,
      stderr,
      finishedAt: job.finishedAt,
    };
  }

  // --- Function call dispatcher ---
  async dispatchFunctionCall(fnName: string, args: any, userId?: string) {
    switch (fnName) {
      case "build_module_tree_from_prompt":
        // This function is handled internally by the AI
        throw new Error(
          "build_module_tree_from_prompt is handled by AI, not directly callable"
        );

      case "emitFiles":
        return this.handleEmitFiles(args);

      case "applyPatch":
        return this.handleApplyPatch(args);

      case "listFiles":
        return this.handleListFiles(args.projectId, args.path, args.depth);

      case "getFile":
        return this.handleGetFile(args.projectId, args.path, args.maxBytes);

      case "formatFile":
        return this.handleFormatFile(args.projectId, args.path, args.tool);

      case "runCommand":
        return this.handleRunCommand(args);

      case "runJobStatus":
        return this.handleRunJobStatus(
          args.projectId,
          args.jobId,
          args.tailLines
        );

      default:
        throw new Error(`Unknown function: ${fnName}`);
    }
  }
}

// Usage example:
/*
const service = new ProjectGeneratorService("./workspaces", {
  apiKey: process.env.OPENAI_API_KEY,
  model: "gpt-4o"
});

// Create a dynamic server from JSON prompt
const result = await service.createProjectFromJsonPrompt(
  "./prompts/my-server.json",
  "user-123",
  {
    maxDepth: 6,
    verbosity: "detailed",
    generateServer: true
  }
);

console.log("Generated server:", result);
*/
