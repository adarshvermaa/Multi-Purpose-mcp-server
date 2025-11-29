import { Router } from "express";
import mainChatsController from "../../controllers/chat.controller";
import aiController from "main/chats/controllers/ai.controller";
import documentsController from "main/chats/controllers/documents.controller";
import documentCreateModuleController from "main/chats/controllers/documents.create.controller";
import codeBuilderModuleController from "main/chats/controllers/project.generator.controller";
import multer from "multer";
import BuilderCodeEmitterController from "main/chats/controllers/buildercodeenit.controller";
import anthropicController from "main/chats/controllers/anthropic.controller";

// create user router instance
const chatRouter = Router();
const upload = multer({
  dest: "tmp_uploads/",
  limits: { fileSize: 200 * 1024 * 1024 },
});

chatRouter.post("/", mainChatsController.addChats);
chatRouter.post("/agent/run-prompt", aiController.runPrompt);
chatRouter.post("/documents", documentsController.createDocumentsController);
chatRouter.post(
  "/documents/uploads",
  upload.single("repo"),
  documentsController.documentUploaderController
);
chatRouter.get(
  "/documents/modules",
  documentsController.documentModuleController
);
chatRouter.post(
  "/documents/modules/create",
  documentCreateModuleController.createDocumentModuleController
);
chatRouter.post(
  "/project/create",
  documentCreateModuleController.generateProjectModuleController
);
chatRouter.post(
  "/project/create/sql",
  documentCreateModuleController.generateSqlTableController
);
chatRouter.post(
  "/project/codebuilder",
  codeBuilderModuleController.generateModuleController
);

chatRouter.post(
  "/project/codebuilder",
  codeBuilderModuleController.generateModuleController
);

// chatRouter.post(
//   "/project/builder/emit",
//   BuilderCodeEmitterController.buildingProject
// );

chatRouter.post("/project/builder/emit", anthropicController.buildingProject);
export default chatRouter;
