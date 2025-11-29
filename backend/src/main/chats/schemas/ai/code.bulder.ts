import Ajv from "ajv";
import type {
  EmitFilesPayload,
  BuildModuleTreePayload,
  RunCmdSchema,
} from "../../chat.types";
import { ToolUnion } from "@anthropic-ai/sdk/resources/messages.js";

export const ajv = new Ajv({ allErrors: true, strict: false });

export const emitFilesSchema = {
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
          encoding: { type: "string", enum: ["utf8", "base64"] },
        },
        required: ["path", "action"],
      },
    },
  },
  required: ["projectId", "operations"],
};

export const buildModuleTreeSchema = {
  type: "object",
  properties: {
    projectName: { type: "string" },
    prompt: { type: "object" },
    root: { type: "object" },
  },
  required: ["projectName"],
};

export const runCmdSchema = {
  type: "object",
  properties: {
    projectId: { type: "string" },
    cmd: { type: "string" },
    command: { type: "string" },
    args: { type: "array", items: { type: "string" } },
    options: {
      type: "object",
      properties: {
        cwd: { type: "string" },
        env: { type: "object" },
        timeoutMs: { type: "number" },
      },
    },
  },
  required: ["projectId"],
};

export const validateEmitFiles = ajv.compile<EmitFilesPayload>(emitFilesSchema);
export const validateBuildModuleTree = ajv.compile<BuildModuleTreePayload>(
  buildModuleTreeSchema
);

export const validateRunCmd = ajv.compile<RunCmdSchema>(runCmdSchema);
// src/utils/tools.ts
export const PROJECT_TOOLS = [
  {
    name: "build_module_tree_from_prompt",
    type: "function",
    description:
      "Build a nested ModuleNode tree. The assistant should call this function and pass an object containing `moduleTree` (root ModuleNode).",
    function: {
      name: "build_module_tree_from_prompt",
      description: "Same as above",
      parameters: {
        type: "object",
        properties: {
          projectName: { type: "string" },
          prompt: { type: "string" },
          moduleTree: { $ref: "#/$defs/moduleNode" },
          options: { type: "object", additionalProperties: true },
        },
        required: ["moduleTree"],
        additionalProperties: false,
        $defs: {
          moduleNode: {
            type: "object",
            properties: {
              id: { type: "string" },
              name: { type: "string" },
              description: { type: "string" },
              files: { type: "array", items: { type: "string" } },
              children: {
                type: "array",
                items: { $ref: "#/$defs/moduleNode" },
              },
              meta: { type: "object", additionalProperties: true },
            },
            required: ["id", "name"],
            additionalProperties: true,
          },
        },
      },
    },
  },

  {
    name: "emitFiles",
    type: "function",
    description: "Return { operations: FileOperation[] }",
    function: {
      name: "emitFiles",
      description: "Return operations array",
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
                action: {
                  type: "string",
                  enum: ["create", "update", "delete"],
                },
                content: { type: "string" },
                encoding: { type: "string", enum: ["utf-8", "base64"] },
                meta: { type: "object", additionalProperties: true },
              },
              required: ["path", "action"],
              additionalProperties: true,
            },
            minItems: 0,
          },
        },
        required: ["operations"],
        additionalProperties: false,
      },
    },
  },

  {
    name: "run_cmd",
    type: "function",
    description: "Return a command object",
    function: {
      name: "run_cmd",
      description: "Return a command object",
      parameters: {
        type: "object",
        properties: {
          projectId: { type: "string" },
          command: { type: "string" },
          args: { type: "array", items: { type: "string" } },
          options: { type: "object", additionalProperties: true },
        },
        required: ["command"],
        additionalProperties: true,
      },
    },
  },
] as const;

export const PROJECT_FUNCTIONS = PROJECT_TOOLS;

// src/utils/anthropicTools.ts

export const ANTHROPIC_PROJECT_TOOLS: ToolUnion[] = [
  {
    name: "build_module_tree_from_prompt",
    description:
      "Build a nested module tree from the user prompt. Returns the root ModuleNode.",
    input_schema: {
      type: "object",
      properties: {
        projectName: { type: "string", description: "Optional project name" },
        prompt: { type: "string", description: "The original user prompt" },
        moduleTree: {
          $ref: "#/$defs/moduleNode",
          description: "The complete module tree with root node",
        },
        options: {
          type: "object",
          additionalProperties: true,
          description: "Any additional options",
        },
      },
      required: ["moduleTree"],
      additionalProperties: false,
      $defs: {
        moduleNode: {
          type: "object",
          properties: {
            id: { type: "string", description: "Unique identifier" },
            name: {
              type: "string",
              description: "Display name of the module/folder",
            },
            description: { type: "string", description: "Short description" },
            files: {
              type: "array",
              items: { type: "string" },
              description: "List of filenames (e.g. Index.html)",
            },
            children: {
              type: "array",
              items: { $ref: "#/$defs/moduleNode" },
              description: "Nested child modules",
            },
            meta: {
              type: "object",
              additionalProperties: true,
              description: "Any metadata",
            },
          },
          required: ["id", "name"],
          additionalProperties: true,
        },
      },
    },
  },

  {
    name: "emitFiles",
    description: "Create, update or delete files in the project.",
    input_schema: {
      type: "object",
      properties: {
        projectId: {
          type: "string",
          description: "Optional project identifier",
        },
        operations: {
          type: "array",
          description: "Array of file operations to perform",
          items: {
            type: "object",
            properties: {
              path: {
                type: "string",
                description:
                  "Relative path inside the project directory ex: src/",
              },
              action: {
                type: "string",
                enum: ["create", "update", "delete"],
                description: "File operation type",
              },
              content: {
                type: "string",
                description: "File content (required for create/update)",
              },
              encoding: {
                type: "string",
                enum: ["utf-8", "base64"],
                description: "Content encoding (default: utf-8)",
              },
              meta: {
                type: "object",
                additionalProperties: true,
                description: "Optional metadata",
              },
            },
            required: ["path", "action"],
            additionalProperties: true,
          },
          minItems: 0,
        },
      },
      required: ["operations"],
      additionalProperties: false,
    },
  },

  {
    name: "run_cmd",
    description: "Run a shell command in the project directory.",
    input_schema: {
      type: "object",
      properties: {
        projectId: {
          type: "string",
          description: "Optional project identifier",
        },
        command: { type: "string", description: "The command to execute" },
        args: {
          type: "array",
          items: { type: "string" },
          description: "Command arguments",
        },
        options: {
          type: "object",
          additionalProperties: true,
          description: "Additional exec options (cwd, env, etc.)",
        },
      },
      required: ["command"],
      additionalProperties: true,
    },
  },
] as const;

export const ANTHROPIC_PROJECT_FUNCTIONS = ANTHROPIC_PROJECT_TOOLS;
