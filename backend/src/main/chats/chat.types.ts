// src/types/ai.ts
export type FileOp = {
  path: string; // relative to project root
  action: "create" | "update" | "delete";
  content?: string; // required for create/update
  encoding?: "utf8" | "base64";
};

export type EmitFilesArgs = {
  projectId: string;
  operations: FileOp[];
  meta?: { requestId?: string; userId?: string };
};

export type RunCommandArgs = {
  projectId: string;
  cmd: string;
  args?: string[];
  cwd?: string; // relative to project root
  options?: {
    timeoutMs?: number;
    resourceLimits?: { memoryMb?: number; cpuShares?: number };
  };
};

export type JobStatus = {
  jobId: string;
  status: "queued" | "running" | "success" | "failed" | "cancelled";
  exitCode?: number | null;
  startedAt?: string;
  finishedAt?: string;
  logs?: { stdout?: string; stderr?: string };
};

export type EmitAction = "create" | "update" | "delete";

export interface EmitOperation {
  path: string; // relative file path inside project
  action: EmitAction;
  content?: string; // required for create/update
  encoding?: "utf8" | "base64";
}

export interface EmitFilesPayload {
  projectId: string;
  operations: EmitOperation[];
}

export interface ModuleFile {
  name: string;
  content: string;
}

export interface ModuleNode {
  name: string;
  type?: "frontend" | "backend" | "shared" | string;
  files?: ModuleFile[];
  children?: ModuleNode[];
}

export interface BuildModuleTreePayload {
  projectName: string;
  prompt: any;
  root?: ModuleNode;
  testCmdSchema?: any;
}

export interface RunCmdSchema {
  projectId: string;
  // run command can be provided in multiple ways for flexibility
  cmd?: string; // full shell string (runs through /bin/sh -c)
  command?: string; // executable name
  args?: string[]; // args for command
  options?: {
    cwd?: string; // relative to project root
    env?: Record<string, string>;
    timeoutMs?: number;
  };
}

export interface ApiEndpoint {
  method: string;
  path: string;
  note?: string;
  example?: string;
}

export interface ArchitectureNode {
  id: string;
  title?: string;
  summary?: string;
  description?: string;
  files?: Array<{ name?: string; content?: string }>;
  children?: ArchitectureNode[];
  meta?: Record<string, any>;
  key_points?: string[];
  important_lines?: string[];
  api_endpoints?: ApiEndpoint[];
}

export interface DocumentArchitecture {
  rootModule: ArchitectureNode;
}

export interface DocumentChunk {
  documentId: string;
  chunkIndex: number;
  chunkCount: number;
  content: string;
  checksum?: string;
  metadata?: Record<string, any>;
}

export interface DocumentDescriptor {
  documentId: string;
  fullContent?: string | object;
  chunks?: DocumentChunk[];
  metadata?: Record<string, any>;
}

export interface FileSnapshot {
  path: string;
  content: string;
}
