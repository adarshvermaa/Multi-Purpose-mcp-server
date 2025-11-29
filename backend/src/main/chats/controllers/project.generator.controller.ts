// src/controllers/codebuilder/codeBuilderModuleController.ts
import { Request, Response, NextFunction } from "express";
import { ProjectGeneratorService } from "../services/codebuilder/project.generator";
import {
  validateBuildModuleTree,
  validateEmitFiles,
  validateRunCmd,
} from "../schemas/ai/code.bulder";
import {
  BuildModuleTreePayload,
  EmitOperation,
  RunCmdSchema,
  DocumentDescriptor,
} from "../chat.types";
import { runCmd } from "../services/codebuilder/run-cmd.service";
import { IngestService } from "../services/codebuilder/ingest.service";
import * as path from "path";
import fs from "fs-extra";

const generator = new ProjectGeneratorService(5);
const ingestService = new IngestService(); // default settings

class codeBuilderModuleController {
  public generateModuleController = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    const body = req.body as BuildModuleTreePayload & {
      testCmdSchema?: RunCmdSchema;
      readFilePath?: string;
      emitOperations?: EmitOperation[];
      // new: optional documents array for ingestion (fullContent or chunks)
      documents?: DocumentDescriptor[];
    };
    let documents = undefined as any;
    let projectNameFromFile: string = "IngestedProject";
    let promptData: any = {};
    if (Array.isArray(body?.documents) && body?.documents.length > 0) {
      documents = body?.documents;
      const built = await ingestService.ingestAndBuildPrompt(
        body.projectName,
        body?.documents
      );
      body.prompt = built;
    } else {
      // try read the JSON file
      try {
        const cwd = process.cwd();
        const jsonFilePath = path.resolve(
          cwd,
          "generated_json",
          "SecureSign_Compliance_Suite",
          "response.json"
        );

        console.log("Reading JSON file:", jsonFilePath);
        const raw = await fs.readFile(jsonFilePath, "utf8");
        const parsed = JSON.parse(raw || "{}");

        // Common shapes:
        // - parsed may be { projectName, documents: [...] }
        // - or parsed itself may be a single document object
        if (Array.isArray(parsed.documents) && parsed.documents.length > 0) {
          documents = parsed.documents;
          projectNameFromFile = parsed?.projectName || "IngestedProject";
          const built = await ingestService.ingestAndBuildPrompt(
            projectNameFromFile,
            documents
          );
          promptData = built;
          // built.prompt is the structured prompt your module-tree builder expects
        } else if (parsed.documentId || parsed.rootModule || parsed.prompt) {
          // single-document shape => wrap into array
          documents = [
            {
              documentId:
                parsed.documentId ??
                projectNameFromFile ??
                parsed.projectName ??
                "doc-0",
              fullContent: parsed,
            },
          ];
          const built = await ingestService.ingestAndBuildPrompt(
            parsed.projectName,
            documents
          );
          promptData = built;
        } else {
          // fallback: try to interpret top-level keys (reasonable heuristic)
          documents = [
            {
              documentId: parsed.projectName ?? "doc-0",
              fullContent: parsed,
            },
          ];
          const built = await ingestService.ingestAndBuildPrompt(
            parsed.projectName,
            documents
          );
          promptData = built;
        }
      } catch (err: any) {
        console.warn(
          "No valid generated_json/response.json found or parse failed:",
          err?.message ?? err
        );
        // continue — documents will be undefined, validation will catch it below
      }
    }
    console.log("Validating build payload:", promptData);

    // 2) Ensure we have documents to ingest
    if (!Array.isArray(documents) || documents.length === 0) {
      return res.status(400).json({
        error: `No documents provided in request body and no valid generated_json/response.json found.`,
      });
    }

    // 3) Choose projectName: prefer body.projectName, then file, else fallback
    // Validate base build payload - now body.prompt may be set by ingestion
    const validBuild = validateBuildModuleTree(promptData);
    if (!validBuild)
      return res.status(400).json({ error: validateBuildModuleTree.errors });

    try {
      // 1) Build module tree (AI)
      const createResult = await generator.createProjectFromPrompt({
        projectName: promptData.projectName,
        prompt: promptData.prompt,
        root: promptData.root,
      } as BuildModuleTreePayload);
      const projectId = createResult.projectId;
      const moduleRoot = createResult.root;
      console.log(createResult);
      // If user supplied explicit emitOperations, apply them instead of the generated ops
      let emitResults = createResult.emitResults;
      if (
        Array.isArray(body.emitOperations) &&
        body.emitOperations.length > 0
      ) {
        // Validate emit schema if needed
        if (
          !validateEmitFiles({ projectId, operations: body.emitOperations })
        ) {
          return res.status(400).json({ error: validateEmitFiles.errors });
        }
        emitResults = await generator["fs"].applyOperations(
          projectId,
          body.emitOperations
        );
      }

      // 2) Ensure files exist by re-emitting generated ops if emitOperations override wasn't used
      // (createProjectFromPrompt already emitted, but we support re-emitting in case of adjustments)
      // emitResults already set above.

      // 3) Determine run command: prefer user-provided testCmdSchema -> ask AI for suggestion
      let runSchema: RunCmdSchema | undefined = body.testCmdSchema;
      if (runSchema) {
        if (!validateRunCmd(runSchema)) {
          return res.status(400).json({ error: validateRunCmd.errors });
        }
      } else {
        // Attempt to ask AI for a suggested command. Access AI via generator (bracket access).
        try {
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          const ai = generator["ai"];
          if (ai && typeof ai.suggestRunCmd === "function") {
            runSchema = await ai.suggestRunCmd(projectId, {
              root: moduleRoot,
              emitResults,
            });
          }
        } catch (aiErr) {
          console.warn("AI did not suggest a run command:", aiErr);
        }
      }

      let runResult: any = undefined;
      if (runSchema) {
        // runSchema may not include projectId; ensure cwd is set properly
        runSchema.projectId = runSchema.projectId ?? projectId;

        if (!validateRunCmd(runSchema)) {
          return res.status(400).json({ error: validateRunCmd.errors });
        }

        // Resolve project filesystem path
        const projectRoot = generator["fs"].resolveProjectPath(projectId, "");

        // 3.a) Run the command
        runResult = await runCmd(projectRoot, runSchema as any);
      }

      // 4) Optionally return a file's content
      let fileContent: string | null = null;
      if (body.readFilePath) {
        fileContent = await generator["fs"].readFile(
          projectId,
          body.readFilePath
        );
      }

      return res.json({
        projectId,
        root: moduleRoot,
        emitResults,
        runResult,
        fileContent,
      });
    } catch (err: any) {
      console.error("pipeline-generate error:", err);
      return res.status(500).json({ error: err?.message ?? String(err) });
    }
  };
}
export default new codeBuilderModuleController();
