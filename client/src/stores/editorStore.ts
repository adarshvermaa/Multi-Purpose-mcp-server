import { create } from 'zustand';
import type { CanvasComponent, EditorTool, Position, Size } from '../types/editor.types';

interface EditorState {
  components: CanvasComponent[];
  selectedIds: string[];  
  tool: EditorTool;
  zoom: number;
  pan: Position;
  gridVisible: boolean;
  snapToGrid: boolean;
  gridSize: number;
  
  // UI State
  showChat: boolean;
  showInspector: boolean;
  showComponentTree: boolean;
  showCode: boolean;
  showCodeEditor: boolean;
  
  // Actions
  setComponents: (components: CanvasComponent[]) => void;
  addComponent: (component: CanvasComponent) => void;
  updateComponent: (id: string, updates: Partial<CanvasComponent>) => void;
  removeComponent: (id: string) => void;
  selectComponent: (id: string, multi?: boolean) => void;
  clearSelection: () => void;
  setTool: (tool: EditorTool) => void;
  setZoom: (zoom: number) => void;
  setPan: (pan: Position) => void;
  toggleGrid: () => void;
  toggleSnap: () => void;
  toggleChat: () => void;
  toggleInspector: () => void;
  toggleComponentTree: () => void;
  toggleCode: () => void;
  toggleCodeEditor: () => void;
}

export const useEditorStore = create<EditorState>((set) => ({
  components: [],
  selectedIds: [],
  tool: 'select',
  zoom: 1,
  pan: { x: 0, y: 0 },
  gridVisible: true,
  snapToGrid: true,
  gridSize: 20,

  setComponents: (components) => set({ components }),
  
  addComponent: (component) => set((state) => ({ 
    components: [...state.components, component] 
  })),

  updateComponent: (id, updates) => set((state) => ({
    components: state.components.map((c) => 
      c.id === id ? { ...c, ...updates } : c
    )
  })),

  removeComponent: (id) => set((state) => ({
    components: state.components.filter((c) => c.id !== id),
    selectedIds: state.selectedIds.filter((sid) => sid !== id)
  })),

  selectComponent: (id, multi = false) => set((state) => {
    if (multi) {
      const isSelected = state.selectedIds.includes(id);
      return {
        selectedIds: isSelected 
          ? state.selectedIds.filter(sid => sid !== id)
          : [...state.selectedIds, id]
      };
    }
    return { selectedIds: [id] };
  }),

  clearSelection: () => set({ selectedIds: [] }),

  setTool: (tool) => set({ tool }),

  setZoom: (zoom) => set({ zoom }),

  setPan: (pan) => set({ pan }),

  toggleGrid: () => set((state) => ({ gridVisible: !state.gridVisible })),

  toggleSnap: () => set((state) => ({ snapToGrid: !state.snapToGrid })),

  // UI State
  showChat: false,
  showInspector: false,
  showComponentTree: false,
  showCode: false,
  showCodeEditor: false,

  toggleChat: () => set((state) => ({ showChat: !state.showChat })),
  toggleInspector: () => set((state) => ({ showInspector: !state.showInspector })),
  toggleComponentTree: () => set((state) => ({ showComponentTree: !state.showComponentTree })),
  toggleCode: () => set((state) => ({ showCode: !state.showCode })),
  toggleCodeEditor: () => set((state) => ({ showCodeEditor: !state.showCodeEditor })),
}));
