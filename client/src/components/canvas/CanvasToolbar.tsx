import React from 'react';
import {
  MousePointer2,
  Hand,
  Square,
  Type,
  Image as ImageIcon,
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
  Layers,
  Code,
  Settings,
  Grid3x3,
} from 'lucide-react';
import type { EditorTool } from '../../types/editor.types';

interface CanvasToolbarProps {
  activeTool: EditorTool;
  onToolChange: (tool: EditorTool) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onToggleGrid: () => void;
  gridVisible: boolean;
  onToggleChat: () => void;
  onToggleInspector: () => void;
  onToggleTree: () => void;
  onToggleCodeEditor: () => void;
  showChat: boolean;
  showInspector: boolean;
  showTree: boolean;
  showCodeEditor: boolean;
}

export default function CanvasToolbar({
  activeTool,
  onToolChange,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onZoomIn,
  onZoomOut,
  onToggleGrid,
  gridVisible,
  onToggleChat,
  onToggleInspector,
  onToggleTree,
  onToggleCodeEditor,
  showChat,
  showInspector,
  showTree,
  showCodeEditor,
}: CanvasToolbarProps) {
  const tools = [
    { id: 'select' as EditorTool, label: 'Select', icon: MousePointer2 },
    { id: 'hand' as EditorTool, label: 'Hand', icon: Hand },
    { id: 'rectangle' as EditorTool, label: 'Rectangle', icon: Square },
    { id: 'text' as EditorTool, label: 'Text', icon: Type },
    { id: 'image' as EditorTool, label: 'Image', icon: ImageIcon },
  ];

  return (
    <div className="bg-white border-b border-gray-200 px-4 py-2 flex items-center gap-2 shadow-sm">
      {/* Tool Selection */}
      <div className="flex items-center gap-1 border-r border-gray-200 pr-3">
        {tools.map((tool) => {
          const Icon = tool.icon;
          const isActive = activeTool === tool.id;
          return (
            <button
              key={tool.id}
              onClick={() => onToolChange(tool.id)}
              className={`p-2 rounded-lg transition ${
                isActive ? 'bg-purple-100 text-purple-600' : 'text-gray-600 hover:bg-gray-100'
              }`}
              title={tool.label}
            >
              <Icon size={20} />
            </button>
          );
        })}
      </div>

      {/* Undo/Redo */}
      <div className="flex items-center gap-1 border-r border-gray-200 pr-3">
        <button
          onClick={onUndo}
          disabled={!canUndo}
          className={`p-2 rounded-lg transition ${
            canUndo ? 'text-gray-600 hover:bg-gray-100' : 'text-gray-300 cursor-not-allowed'
          }`}
          title="Undo (Ctrl+Z)"
        >
          <Undo2 size={20} />
        </button>
        <button
          onClick={onRedo}
          disabled={!canRedo}
          className={`p-2 rounded-lg transition ${
            canRedo ? 'text-gray-600 hover:bg-gray-100' : 'text-gray-300 cursor-not-allowed'
          }`}
          title="Redo (Ctrl+Y)"
        >
          <Redo2 size={20} />
        </button>
      </div>

      {/* Zoom Controls */}
      <div className="flex items-center gap-1 border-r border-gray-200 pr-3">
        <button
          onClick={onZoomOut}
          className="p-2 rounded-lg text-gray-600 hover:bg-gray-100 transition"
          title="Zoom Out"
        >
          <ZoomOut size={20} />
        </button>
        <button
          onClick={onZoomIn}
          className="p-2 rounded-lg text-gray-600 hover:bg-gray-100 transition"
          title="Zoom In"
        >
          <ZoomIn size={20} />
        </button>
      </div>

      {/* Panel Toggles */}
      <div className="flex items-center gap-1 border-r border-gray-200 pr-3">
        <button
          onClick={onToggleChat}
          className={`p-2 rounded-lg transition ${
            showChat ? 'bg-purple-100 text-purple-600' : 'text-gray-600 hover:bg-gray-100'
          }`}
          title="Toggle Chat"
        >
          <Layers size={20} />
        </button>
        <button
          onClick={onToggleCodeEditor}
          className={`p-2 rounded-lg transition ${
            showCodeEditor ? 'bg-purple-100 text-purple-600' : 'text-gray-600 hover:bg-gray-100'
          }`}
          title="Toggle Code Editor"
        >
          <Code size={20} />
        </button>
        <button
          onClick={onToggleInspector}
          className={`p-2 rounded-lg transition ${
            showInspector ? 'bg-purple-100 text-purple-600' : 'text-gray-600 hover:bg-gray-100'
          }`}
          title="Toggle Inspector"
        >
          <Settings size={20} />
        </button>
        <button
          onClick={onToggleTree}
          className={`p-2 rounded-lg transition ${
            showTree ? 'bg-purple-100 text-purple-600' : 'text-gray-600 hover:bg-gray-100'
          }`}
          title="Toggle Tree"
        >
          <Layers size={20} />
        </button>
      </div>

      {/* Grid Toggle */}
      <button
        onClick={onToggleGrid}
        className={`p-2 rounded-lg transition ${
          gridVisible ? 'bg-purple-100 text-purple-600' : 'text-gray-600 hover:bg-gray-100'
        }`}
        title="Toggle Grid"
      >
        <Grid3x3 size={20} />
      </button>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Project Name */}
      <div className="text-sm font-semibold text-gray-700">Untitled Project</div>
    </div>
  );
}
