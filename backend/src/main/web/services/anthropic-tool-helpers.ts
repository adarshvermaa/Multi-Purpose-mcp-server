// src/utils/anthropic-tool-helpers.ts
import {
  EmitFilesInputSchema,
  EmitFilesOutputSchema,
  BuildTreeInputSchema,
  BuildTreeOutputSchema,
  TreeNode,
} from "../schemas/builder/anthropic-tool-schemas";
import type { z } from "zod";

/**
 * Generic helper to validate input and output for tools.
 * Use these validators inside your tool runner before/after executing the tool.
 */

// Types
export type EmitFilesInput = z.infer<typeof EmitFilesInputSchema>;
export type EmitFilesOutput = z.infer<typeof EmitFilesOutputSchema>;
export type BuildTreeInput = z.infer<typeof BuildTreeInputSchema>;
export type BuildTreeOutput = z.infer<typeof BuildTreeOutputSchema>;

// validators
export const validateEmitFilesInput = (data: unknown) => EmitFilesInputSchema.parse(data);
export const validateEmitFilesOutput = (data: unknown) => EmitFilesOutputSchema.parse(data);

export const validateBuildTreeInput = (data: unknown) => BuildTreeInputSchema.parse(data);
export const validateBuildTreeOutput = (data: unknown) => BuildTreeOutputSchema.parse(data);

/**
 * Example tool descriptors you can pass into your own tool runner or register
 * with an Anthropic toolRunner wrapper (structure is up to your wrapper).
 *
 * Each descriptor contains:
 *  - name
 *  - description
 *  - validateInput(data)
 *  - validateOutput(data)
 *  - run(data) -> output (the run function should implement the real service logic)
 *
 * The 'run' implementation below are stubs — replace them with your file-service / tree-builder logic.
 */

export const EmitFilesTool = {
  name: "emitFiles",
  description:
    "Write/emit multiple files to the workspace. Input must match EmitFilesInput. Output will show per-file results.",
  validateInput: validateEmitFilesInput,
  validateOutput: validateEmitFilesOutput,
  // run should be replaced with a service that actually writes files securely (sanitize paths, check baseDir, handle dryRun)
  async run(input: EmitFilesInput): Promise<EmitFilesOutput> {
    // STUB: replace with real file-system writing logic
    const results = input.files.map((f) => {
      // naive simulation:
      return {
        path: f.path,
        status: (f.mode === "create" ? "created" : "updated") as "created" | "updated" | "skipped" | "error",
        message: `Simulated ${f.mode}`,
      };
    });

    const summary = results.reduce(
      (acc, r) => {
        if (r.status === "created") acc.created++;
        if (r.status === "updated") acc.updated++;
        if (r.status === "skipped") acc.skipped++;
        if (r.status === "error") acc.errors++;
        return acc;
      },
      { created: 0, updated: 0, skipped: 0, errors: 0 }
    );

    return {
      ok: true,
      results,
      summary,
    };
  },
};

export const BuildTreeTool = {
  name: "buildTree",
  description:
    "Generate or normalize a nested module/file tree from a prompt or partial tree. Returns a normalized array of root nodes.",
  validateInput: validateBuildTreeInput,
  validateOutput: validateBuildTreeOutput,
  // run should call your generator (LLM or deterministic rules) and return the normalized tree
  async run(input: BuildTreeInput): Promise<BuildTreeOutput> {
    // STUB: naive pass-through: if existingTree provided, return it; if prompt present, create a single-root skeleton
    let tree: TreeNode[];
    const warnings: string[] = [];
    if (input.existingTree && input.existingTree.length > 0) {
      tree = input.existingTree;
    } else if (input.prompt) {
      tree = [
        {
          id: input.options?.generateIds ? `root-${Date.now()}` : undefined,
          type: "folder" as const,
          name: input.projectName,
          description: `Generated from prompt: ${input.prompt.slice(0, 120)}`,
          children: input.options?.includeSampleFiles
            ? [
                {
                  id: `file-${Date.now()}-1`,
                  type: "file" as const,
                  name: "README.md",
                  content: `# ${input.projectName}\n\nGenerated from prompt: ${input.prompt}`,
                },
              ]
            : [],
        },
      ];
    } else {
      tree = [];
      warnings.push("No prompt or existingTree provided, returned empty tree.");
    }

    return {
      ok: true,
      tree,
      warnings: warnings.length ? warnings : undefined,
      metadata: { generatedAt: new Date().toISOString() },
    };
  },
};
