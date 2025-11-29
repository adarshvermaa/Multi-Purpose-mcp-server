import { NextFunction, Response, Request } from "express";
import * as path from "path";
import fileSystemService from "../services/fileSystem.service";
import builderService from "../services/builder.service";
import conversationService from "../services/conversation.service";
import embeddingService from "../services/embedding.service";
import { BuilderRequestSchema } from "../schemas/builder/builder.ai";

const projectRoot = path.resolve(__dirname, "../../../../../web");

class BuilderController {
  /**
   * Main endpoint: Build project from user prompt
   * POST /api/v1/builder/emit
   */
  public buildingProject = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const { userPrompt, socketId, options } = req.body;

      console.log("[BuilderController] Received emit request:", JSON.stringify(req.body, null, 2));

      // Validate request
      const validatedInput = BuilderRequestSchema.parse({
        userPrompt,
        socketId,
        options,
      });

      console.log(
        `[BuilderController] Starting build for project: ${validatedInput.options?.projectName || "auto-generated"}`
      );

      // Emit start event to client
      const io = (global as any).__expressIoInstance;
      if (io && socketId) {
        io.to(socketId).emit("builder:started", {
          userPrompt: validatedInput.userPrompt,
        });
      }

      // 1. Optional: Snapshot current state (for rollback)
      const existingSnapshot = fileSystemService.snapshotDir(projectRoot);
      console.log(
        `[BuilderController] Snapshotted ${existingSnapshot.length} existing files`
      );
console.log(existingSnapshot)
      // 2. Execute builder workflow
      const result = await builderService.buildProject(
        validatedInput.userPrompt,
        validatedInput.socketId,
        validatedInput.options,
        existingSnapshot
      );

      // 3. Return response
      return res.json(result);
    } catch (err: any) {
      console.error("[BuilderController] Build error:", err);

      // Emit error event to client
      const io = (global as any).__expressIoInstance;
      if (io && req.body?.socketId) {
        io.to(req.body.socketId).emit("builder:error", {
          error: err.message || "Unknown error occurred",
        });
      }

      // Send error response
      return res.status(500).json({
        ok: false,
        error: err.message || "Build failed",
        details: err.stack,
      });
    }
  };

  /**
   * Get conversation history by project ID
   * GET /api/v1/builder/conversation/:projectId
   */
  public getConversation = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const { projectId } = req.params;

      if (!projectId) {
        return res.status(400).json({
          ok: false,
          error: "projectId is required",
        });
      }

      const history = await conversationService.getConversationHistory(
        projectId
      );

      if (!history) {
        return res.status(404).json({
          ok: false,
          error: "Conversation not found",
        });
      }

      return res.json({
        ok: true,
        history,
      });
    } catch (err: any) {
      console.error("[BuilderController] Get conversation error:", err);
      return res.status(500).json({
        ok: false,
        error: err.message,
      });
    }
  };

  /**
   * Search for similar projects
   * POST /api/v1/web/builder/search
   */
  public searchSimilar = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const { query, topK = 5 } = req.body;

      if (!query) {
        return res.status(400).json({ ok: false, error: "query is required" });
      }

      const results = await conversationService.queryRelevantConversations(
        query,
        topK
      );

      res.json({ ok: true, results });
    } catch (err) {
      next(err);
    }
  };

  /**
   * Download project as zip file
   * GET /api/v1/web/builder/download/:projectName
   */
  public downloadProject = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const { projectName } = req.params;

      if (!projectName) {
        return res
          .status(400)
          .json({ ok: false, error: "projectName is required" });
      }

      // Validate and sanitize project name
      const sanitizedName = projectName.replace(/[^a-zA-Z0-9_-]/g, "");
      const projectPath = path.join(projectRoot, sanitizedName);

      // Check if project directory exists
      const fs = await import("fs/promises");
      try {
        await fs.access(projectPath);
      } catch {
        return res
          .status(404)
          .json({ ok: false, error: "Project not found" });
      }

      // Create zip file
      const archiver = (await import("archiver")).default;
      const archive = archiver("zip", { zlib: { level: 9 } });

      // Set response headers
      res.attachment(`${sanitizedName}.zip`);
      res.setHeader("Content-Type", "application/zip");

      // Pipe archive to response
      archive.pipe(res);

      // Add project directory to archive
      archive.directory(projectPath, sanitizedName);

      // Finalize archive
      await archive.finalize();

      console.log(`[BuilderController] Downloaded project: ${sanitizedName}`);
    } catch (err) {
      next(err);
    }
  };

  /**
   * Health check endpoint
   * GET /api/v1/web/builder/health
   */
  public healthCheck = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const checks = {
        embedding: embeddingService.isConfigured(),
        conversation: conversationService.isConfigured(),
      };

      res.json({
        ok: true,
        checks,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  };
}

export default new BuilderController();
