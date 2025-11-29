import { TreeNode } from "../schemas/builder/anthropic-tool-schemas";

/**
 * Builder Session - tracks active build sessions
 */
export interface BuilderSession {
  sessionId: string;
  userPrompt: string;
  socketId: string;
  createdAt: string;
  status: "planning" | "building" | "completed" | "failed";
  projectId?: string;
}

/**
 * Project Metadata - stored with conversation in Pinecone
 */
export interface ProjectMetadata {
  projectId: string;
  projectName: string;
  userPrompt: string;
  tree: TreeNode[];
  filesGenerated: number;
  createdAt: string;
  embeddings?: number[];
  tags?: string[];
}

/**
 * Conversation Step - individual step in build workflow
 */
export interface ConversationStep {
  stepId: string;
  type: "query" | "plan" | "emit" | "store";
  input: any;
  output: any;
  timestamp: string;
  duration?: number;
}

/**
 * Build Statistics - summary of build operation
 */
export interface BuildStatistics {
  totalFiles: number;
  totalFolders: number;
  filesCreated: number;
  filesSkipped: number;
  filesErrored: number;
  duration: number;
  ragContextUsed: number;
}
