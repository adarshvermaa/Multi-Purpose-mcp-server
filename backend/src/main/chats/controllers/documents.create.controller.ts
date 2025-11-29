import { Request, Response, NextFunction } from "express";
import docGenerationService from "../services/documents/create.documents";
import fs from "fs-extra";
import * as path from "path";
import { ProjectGeneratorService } from "../services/documents/projectGenerator.services";
import { SqlService } from "../services/documents/sql.services";
class documentCreateModuleController {
  public createDocumentModuleController = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const { usePrompt, projectName } = req.body;
      if (
        !usePrompt ||
        usePrompt.trim().length === 0 ||
        projectName.trim().length === 0
      ) {
        return res
          .status(400)
          .json({ ok: false, error: "usePrompt and projectName are required" });
      }
      console.log(req.body);
      const result = await docGenerationService.generateDocsFromPrompt(
        projectName,
        usePrompt
      );

      const jsonRoot = path.resolve(
        "generated_json",
        projectName.replace(/\s+/g, "_")
      );

      await fs.mkdirp(jsonRoot);
      const pathJon = await fs.writeFile(
        path.join(jsonRoot, "response.json"),
        JSON.stringify(result?.manifest, null, 2),
        "utf-8"
      );

      res.json({ ...result, pathJon });
    } catch (err: any) {
      console.error(" error:", err);
      res.status(500).json({ ok: false, error: String(err?.message ?? err) });
    }
  };
  public generateProjectModuleController = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const { usePath, projectId } = req.body;
      if (
        !usePath ||
        usePath.trim().length === 0 ||
        projectId.trim().length === 0
      ) {
        return res
          .status(400)
          .json({ ok: false, error: "usePath and projectId are required" });
      }
      console.log(req.body);
      const svc = new ProjectGeneratorService("./workspaces");
      const cwdir = process.cwd();
      const promptJson = JSON.parse(
        await fs.readFile(path.join(cwdir, usePath), "utf-8")
      );

      console.log("CWDIR", promptJson);

      const result = await svc.createProjectFromJsonPrompt(
        promptJson,
        projectId
      );
      res.json(result);
    } catch (err: any) {
      console.error(" error:", err);
      res.status(500).json({ ok: false, error: String(err?.message ?? err) });
    }
  };
  public generateSqlTableController = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const { userPrompt, projectId } = req.body;

      if (!userPrompt || !projectId) {
        return res
          .status(400)
          .json({ ok: false, error: "userPrompt and projectId are required" });
      }

      const sqlService = new SqlService();

      const result = await sqlService.generateSqlFromPrompt(
        userPrompt,
        projectId,
        { debug: true }
      );

      res.json({
        ok: true,
        paths: {
          sql: result.sqlPath,
          json: result.jsonPath,
          html: result.htmlPath,
        },
        tables: result.schema.tables.map((t: any) => t.tableName),
      });
    } catch (err: any) {
      console.error("generateSqlTableController error:", err);
      return res
        .status(500)
        .json({ ok: false, error: String(err?.message ?? err) });
    }
  };
}
export default new documentCreateModuleController();
