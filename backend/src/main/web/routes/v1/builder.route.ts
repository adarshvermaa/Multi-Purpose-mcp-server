import { Router } from "express";
import builderController from "main/web/controller/builder.controller";

const builderRouter = Router();

// Main build endpoint
builderRouter.post("/emit", builderController.buildingProject);

// Conversation management
builderRouter.get("/conversation/:projectId", builderController.getConversation);

// Search similar projects
builderRouter.post("/search", builderController.searchSimilar);

// Download project as zip
builderRouter.get("/download/:projectName", builderController.downloadProject);

// Health check
builderRouter.get("/health", builderController.healthCheck);

export default builderRouter;
