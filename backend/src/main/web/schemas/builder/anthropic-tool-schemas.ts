// src/utils/anthropic-tool-schemas.ts
import { z } from "zod";

/**
 * emitFiles
 * - Input: projectName, files[] (path, content, encoding?), options
 * - Output: results[] (path, status, message)
 */

// Single file descriptor
export const EmitFileSchema = z.object({
  path: z.string().min(1).describe("Relative path where the file should be created/updated"),
  content: z.string().describe("File content (string)."),
  encoding: z.enum(["utf-8", "base64"]).optional().default("utf-8"),
  mode: z
    .union([z.literal("create"), z.literal("update"), z.literal("overwrite")])
    .optional()
    .default("create")
    .describe("Create = fail if exists, update = fail if not exists, overwrite = create or replace"),
});

// emitFiles input
export const EmitFilesInputSchema = z.object({
  projectName: z.string().min(1),
  files: z.array(EmitFileSchema).min(1),
  options: z
    .object({
      dryRun: z.boolean().optional().default(false).describe("If true: validate only, don't write"),
      baseDir: z.string().optional().describe("Base directory on server for writes (sanitise in service)"),
    })
    .optional()
    .default({}),
});

// single file result
export const EmitFileResultSchema = z.object({
  path: z.string(),
  status: z.enum(["created", "updated", "skipped", "error"]),
  message: z.string().optional(),
});

// emitFiles output
export const EmitFilesOutputSchema = z.object({
  ok: z.boolean(),
  results: z.array(EmitFileResultSchema),
  summary: z.object({
    created: z.number().default(0),
    updated: z.number().default(0),
    skipped: z.number().default(0),
    errors: z.number().default(0),
  }),
});

/**
 * buildTree
 * - Builds or transforms a hierarchical tree of modules/files.
 * - We allow either providing a prompt (text) that the LLM will interpret to build the tree,
 *   or providing a partial tree to be normalized / enriched.
 */

// recursive node schema (folder or file)
export const TreeNodeSchema: z.ZodType<TreeNode> = z.lazy(() =>
  z.object({
    id: z.string().optional().describe("optional id - if omitted a server/LLM may generate one"),
    type: z.enum(["folder", "file"]),
    name: z.string().min(1).describe("Name of the node (folder or file)"),
    description: z.string().optional(),
    content: z.string().optional().describe("Only for files: initial content"),
    // children only for folders. Keep it optional so files don't need children.
    children: z.array(TreeNodeSchema).optional().describe("Nested children (folders/files)"),
    metadata: z.record(z.any()).optional().describe("Optional arbitrary metadata"),
  })
);

// We need to declare the TypeScript type for z.lazy recursive ref
export type TreeNode = {
  id?: string;
  type: "folder" | "file";
  name: string;
  description?: string;
  content?: string;
  children?: TreeNode[];
  metadata?: Record<string, any>;
};

// buildTree input: either a prompt or an existing partial tree to extend
export const BuildTreeInputSchema = z.object({
  projectName: z.string().min(1),
  prompt: z.string().optional().describe("Natural language prompt describing the desired tree"),
  existingTree: z.array(TreeNodeSchema).optional().describe("Optional partial tree to extend or normalize"),
  options: z
    .object({
      generateIds: z.boolean().optional().default(true),
      maxDepth: z.number().min(1).optional().describe("Limit depth when generating trees"),
      includeSampleFiles: z.boolean().optional().default(false),
    })
    .optional()
    .default({}),
});

// buildTree output: normalized tree, plus logs/warnings
export const BuildTreeOutputSchema = z.object({
  ok: z.boolean(),
  tree: z.array(TreeNodeSchema).describe("Normalized / generated tree (array of root nodes)"),
  warnings: z.array(z.string()).optional(),
  metadata: z.record(z.any()).optional(),
});
