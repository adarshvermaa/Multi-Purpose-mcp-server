export const functions = [
  {
    type: "function",
    function: {
      name: "emitFiles",
      description: "Create, update, or delete files in the project",
      parameters: {
        type: "object",
        properties: {
          operations: {
            type: "array",
            items: {
              type: "object",
              properties: {
                path: { type: "string" },
                action: {
                  type: "string",
                  enum: ["create", "update", "delete"],
                },
                content: { type: "string" },
              },
              required: ["path", "action"],
            },
          },
        },
        required: ["operations"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "runCommand",
      description: "Execute a shell command and return exit code and logs",
      parameters: {
        type: "object",
        properties: {
          cmd: { type: "string" },
          args: { type: "array", items: { type: "string" } },
        },
        required: ["cmd"],
      },
    },
  },
];
// src/schemas/ai/functions.ts
// Export functions2 in OpenAI functions format.
// Note: applyPatch.operations uses the same explicit operations schema as emitFiles.

export const operationsSchema = {
  type: "array",
  items: {
    type: "object",
    properties: {
      path: { type: "string" },
      action: { type: "string", enum: ["create", "update", "delete"] },
      content: { type: "string" },
      encoding: { type: "string", enum: ["utf8", "base64"], default: "utf8" },
    },
    required: ["path", "action"],
    additionalProperties: false,
  },
  minItems: 1,
  maxItems: 200,
};

// src/schemas/ai/openaiFunctions.ts
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

export const FUNCTIONS_DEF = [
  {
    name: "redact_secrets",
    description: "Redact obvious secrets from text",
    parameters: {
      type: "object",
      properties: { text: { type: "string" } },
      required: ["text"],
    },
  },
  {
    name: "save_summary",
    description: "Save a summary to server disk under generated_summaries",
    parameters: {
      type: "object",
      properties: { relPath: { type: "string" }, summary: { type: "string" } },
      required: ["relPath", "summary"],
    },
  },
  {
    name: "extract_api_endpoints",
    description: "Extract API endpoint lines from text",
    parameters: {
      type: "object",
      properties: { text: { type: "string" } },
      required: ["text"],
    },
  },
];

export const docFunctions = [
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
    name: "generate_module_html",
    description:
      "Given a module node, return a safe HTML fragment for that module. Return { anchorId, html } where anchorId matches moduleNode.id.",
    parameters: {
      type: "object",
      properties: {
        moduleNode: { type: "object" },
        options: {
          type: "object",
          properties: {
            style: {
              type: "string",
              enum: ["compact", "spacious"],
              default: "spacious",
            },
            includeCodeSnippets: { type: "boolean", default: true },
          },
        },
      },
      required: ["moduleNode"],
    },
  },
  {
    name: "generate_site_manifest",
    description:
      "Given projectName and a module tree return a SiteManifest: { projectName, generatedAt, rootModule, moduleHtmlMap }",
    parameters: {
      type: "object",
      properties: {
        projectName: { type: "string" },
        rootModule: { type: "object" },
      },
      required: ["projectName", "rootModule"],
    },
  },
  {
    name: "save_artifact",
    description: "Server tool: save content at relPath (server-side).",
    parameters: {
      type: "object",
      properties: {
        relPath: { type: "string" },
        content: { type: "string" },
        encoding: { type: "string", enum: ["utf8", "base64"], default: "utf8" },
      },
      required: ["relPath", "content"],
    },
  },
  {
    name: "render_pdf",
    description: "Server tool: render saved HTML to PDF and return outPath.",
    parameters: {
      type: "object",
      properties: {
        htmlPath: { type: "string" },
        outPath: { type: "string" },
      },
      required: ["htmlPath", "outPath"],
    },
  },
];

// const PROJECT_FUNCTIONS: OpenAIFunction[] = [
//   {
//     name: "build_module_tree_from_prompt",
//     description: "Build a complete project module tree from a JSON prompt",
//     parameters: {
//       type: "object",
//       properties: {
//         projectName: {
//           type: "string",
//           description: "Name of the project to create",
//         },
//         prompt: {
//           type: "object",
//           description:
//             "The original JSON prompt containing project specifications",
//         },
//         root: {
//           type: "object",
//           description:
//             "Root module node containing the complete project structure",
//           properties: {
//             name: { type: "string" },
//             children: { type: "array" },
//             files: { type: "array" },
//           },
//         },
//       },
//       required: ["projectName", "root"],
//     },
//   },
//   {
//     name: "emitFiles",
//     description: "Create, update, or delete files in a project",
//     parameters: {
//       type: "object",
//       properties: {
//         projectId: { type: "string", description: "Project identifier" },
//         operations: {
//           type: "array",
//           items: {
//             type: "object",
//             properties: {
//               path: { type: "string" },
//               action: { type: "string", enum: ["create", "update", "delete"] },
//               content: { type: "string" },
//               encoding: { type: "string", enum: ["utf8", "base64"] },
//             },
//             required: ["path", "action"],
//           },
//         },
//       },
//       required: ["projectId", "operations"],
//     },
//   },
// ];
