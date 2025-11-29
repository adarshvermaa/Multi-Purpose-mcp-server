// src/validators/ai.ts
import { z } from "zod";

export const FileOpSchema = z.object({
  path: z.string().min(1).max(1024),
  action: z.enum(["create", "update", "delete"]),
  content: z.string().optional(),
  encoding: z.enum(["utf8", "base64"]).optional().default("utf8"),
});

export const EmitFilesSchema = z.object({
  projectId: z.string().min(1),
  operations: z.array(FileOpSchema).min(1).max(200),
  meta: z
    .object({ requestId: z.string().optional(), userId: z.string().optional() })
    .optional(),
});

export const ApplyPatchSchema = EmitFilesSchema.extend({
  approvedBy: z.string().min(1),
});

export const RunCommandSchema = z.object({
  projectId: z.string().min(1),
  cmd: z.string().min(1).max(200),
  args: z.array(z.string()).optional(),
  cwd: z.string().optional(),
  options: z
    .object({
      timeoutMs: z
        .number()
        .int()
        .min(1000)
        .max(30 * 60_000)
        .optional(),
      resourceLimits: z
        .object({
          memoryMb: z.number().int().min(32).max(64_000).optional(),
          cpuShares: z.number().int().min(1).max(1024).optional(),
        })
        .optional(),
    })
    .optional(),
});

/** File doc */
// export const FileDocSchema = z.object({
//   id: z.string(), // anchor id, must satisfy safeId
//   fileName: z.string(),
//   relPath: z.string().optional(),
//   summary: z.string().optional(),
//   key_points: z.array(z.string()).optional(),
//   important_lines: z.array(z.string()).optional(),
//   api_endpoints: z
//     .array(
//       z.object({
//         method: z.string().optional(),
//         path: z.string().optional(),
//         note: z.string().optional(),
//       })
//     )
//     .optional(),
// });
// export type FileDoc = z.infer<typeof FileDocSchema>;

/** recursive module node */
// export const ModuleNodeSchema: z.ZodType<any> = z.lazy(() =>
//   z.object({
//     id: z.string(), // anchor id (safeId)
//     title: z.string(),
//     summary: z.string().optional(),
//     description: z.string().optional(), // markdown or sanitized HTML
//     files: z.array(FileDocSchema).optional(),
//     children: z.array(ModuleNodeSchema).optional(),
//     meta: z.record(z.any()).optional(),
//   })
// );
// export type ModuleNode = z.infer<typeof ModuleNodeSchema>;

/** site manifest */
// export const SiteManifestSchema = z.object({
//   projectName: z.string(),
//   generatedAt: z.string(),
//   rootModule: ModuleNodeSchema,
//   moduleHtmlMap: z.record(z.string()), // anchorId -> html fragment
// });
// export type SiteManifest = z.infer<typeof SiteManifestSchema>;

/** ApiEndpoint schema (all strings required but may be empty) */
export const ApiEndpointSchema = z.object({
  method: z.string().default(""),
  path: z.string().default(""),
  note: z.string().default(""),
});

/** FileDoc: required fields (defaults applied when missing) */
export const FileDocSchema = z.object({
  id: z.string(),
  fileName: z.string(),
  relPath: z.string().default(""),
  summary: z.string().default(""),
  key_points: z.array(z.string()).default([]),
  important_lines: z.array(z.string()).default([]),
  api_endpoints: z.array(ApiEndpointSchema).default([]),
});
export type FileDoc = z.infer<typeof FileDocSchema>;

/** ModuleNode (recursive) - required fields with sensible defaults */
export const ModuleNodeSchema: z.ZodType<any> = z.lazy(() =>
  z.object({
    id: z.string(),
    title: z.string(),
    summary: z.string().default(""),
    description: z.string().default(""),
    files: z.array(FileDocSchema).default([]),
    children: z.array(ModuleNodeSchema).default([]),
    meta: z.record(z.any()).default({}),
  })
);
export type ModuleNode = z.infer<typeof ModuleNodeSchema>;

/** SiteManifest: top-level manifest with moduleHtmlMap required (may be empty initially) */
export const SiteManifestSchema = z.object({
  projectName: z.string(),
  generatedAt: z.string(),
  rootModule: ModuleNodeSchema,
  moduleHtmlMap: z.record(z.string()), // required: mapping id -> html fragment
});
export type SiteManifest = z.infer<typeof SiteManifestSchema>;
