// Type definitions for the visual editor

import type { CSSProperties } from 'react';

export type ComponentType = 
  | 'div' 
  | 'button' 
  | 'input' 
  | 'text' 
  | 'image' 
  | 'card'
  | 'form'
  | 'navbar'
  | 'custom';

export type EditorTool = 'select' | 'hand' | 'rectangle' | 'text' | 'image';

export interface Position {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface CanvasComponent {
  id: string;
  type: ComponentType;
  name: string;
  position: Position;
  size: Size;
  rotation: number;
  styles: CSSProperties;
  children: CanvasComponent[];
  html?: string;
  locked: boolean;
  visible: boolean;
  zIndex: number;
  parentId?: string;
}

export interface EditorState {
  components: CanvasComponent[];
  selectedIds: string[];
  tool: EditorTool;
  zoom: number;
  pan: Position;
  gridVisible: boolean;
  snapToGrid: boolean;
  gridSize: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  codePreview?: string;
  applied: boolean;
  componentId?: string; // Reference to generated/modified component
}

export interface HistoryEntry {
  id: string;
  timestamp: number;
  action: string;
  before: any;
  after: any;
}

export interface ProjectMetadata {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  version: number;
}

export interface Project {
  metadata: ProjectMetadata;
  components: CanvasComponent[];
  files: Record<string, string>;
  history: HistoryEntry[];
}

// Socket event payloads
export interface SelectComponentPayload {
  componentIds: string[];
  projectId: string;
}

export interface UpdateComponentPayload {
  componentId: string;
  updates: Partial<CanvasComponent>;
  projectId: string;
}

export interface ChatMessagePayload {
  message: string;
  projectId: string;
  selectedComponentIds: string[];
  context?: {
    components: CanvasComponent[];
    files: Record<string, string>;
  };
}

export interface GenerateResponsePayload {
  messageId: string;
  code: string;
  componentType: ComponentType;
  html: string;
  css: string;
  js?: string;
}

export interface ApplyCodePayload {
  messageId: string;
  projectId: string;
  insertPosition?: Position;
}
