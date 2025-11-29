import { Request, Response, NextFunction } from "express";
import {
  generateFromZipUpload,
  generateHtmlFolderForModules,
  generateProjectDocs,
  groupFilesIntoModules,
  processFilesInBatches,
  safeId,
  snapshotDir,
} from "../services/documents/document.service";
import path from "path";

class DocumentController {
  public createDocumentsController = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const root = req.body.root ?? ".";
      const dicCwd = process.cwd();
      const result = await generateProjectDocs({
        root: dicCwd,
        renderPdf: true,
      });
      res.json({
        ok: true,
        output: result.pdfPath,
        summaryPath: result.summaryPath,
      });
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ ok: false, error: String(err?.message ?? err) });
    }
  };

  public documentUploaderController = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      if (!req.file)
        return res
          .status(400)
          .json({ ok: false, error: "file required (zip)" });
      console.log("file required (zip)");

      const result = await generateFromZipUpload(req.file.path, {
        renderPdf: true,
        isReturn: true,
        repoName: "RenoFMS",
      });
      if (result) {
        res.json({
          ok: true,
          output: result.pdfPath,
          summaryPath: result.summaryPath,
        });
      }
      res.json({
        ok: true,
        file: req.file,
      });
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ ok: false, error: String(err?.message ?? err) });
    }
  };

  public documentModuleController = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const dicCwd = process.cwd();
      const root = (req.query.root as string) || dicCwd;
      const outDir = (req.query.outDir as string) || "generated_pdfs";
      console.log(req.query);
      const snapshots = await snapshotDir(root);
      const docs = await processFilesInBatches(snapshots, 1000000000);
      console.log(docs);
      const modules = groupFilesIntoModules(docs as any);
      console.log(modules);
      const gen = await generateHtmlFolderForModules(
        path.basename(root),
        modules,
        outDir,
        "html"
      );
      // respond with modules JSON + html info
      const safeModules = modules.map((m) => ({
        moduleName: m.moduleName,
        submodules: m.submodules.map((s) => ({
          name: s.name,
          files: s.files.map((f) => ({
            fileName: f.fileName ?? f.relPath.split(/[\\/]/).pop(),
            summary: f.summary,
            key_points: f.key_points,
            api_endpoints: f.api_endpoints ?? [],
            htmlPage: path.relative(
              process.cwd(),
              path.join(
                gen.htmlRoot,
                safeId(m.moduleName),
                safeId(s.name === "_root" ? "root" : s.name),
                `${safeId(f.fileName ?? path.basename(f.relPath))}.html`
              )
            ),
          })),
        })),
      }));

      res.json({
        ok: true,
        modules: safeModules,
        htmlRoot: gen.htmlRoot,
        index: gen.index,
        createdFilesCount: gen.createdFiles.length,
      });
    } catch (err: any) {
      console.error("GET /api/docs/modules error:", err);
      res.status(500).json({ ok: false, error: String(err?.message ?? err) });
    }
  };
}

export default new DocumentController();
