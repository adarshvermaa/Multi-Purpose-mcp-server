// Main Visual Editor Page - Figma-style UI editor
import React, { useEffect, useState } from 'react';
import { useEditorStore } from '../stores/editorStore';
import { useHistory, createUpdateCommand } from '../hooks/useHistory';
import { useAIChat } from '../hooks/useAIChat';
import EditorCanvas from '../components/canvas/EditorCanvas';
import CanvasToolbar from '../components/canvas/CanvasToolbar';
import ComponentTree from '../components/panels/ComponentTree';
import AIChatPanel from '../components/panels/AIChatPanel';
import InspectorPanel from '../components/panels/InspectorPanel';
import CodeEditorPanel from '../components/panels/CodeEditorPanel';
import type { CanvasComponent } from '../types/editor.types';

export default function Editor() {
  // Store State
  const {
    components,
    selectedIds,
    tool,
    zoom,
    gridVisible,
    showChat,
    showInspector,
    showComponentTree,
    showCodeEditor,
    
    // Actions
    setTool,
    setZoom,
    toggleGrid,
    selectComponent,
    updateComponent,
    removeComponent,
    clearSelection,
    addComponent,
    toggleChat,
    toggleInspector,
    toggleComponentTree,
    toggleCodeEditor,
  } = useEditorStore();

  const history = useHistory();
  const chat = useAIChat('project-1');
  // Preview mode state
  const [previewMode, setPreviewMode] = useState(false);
  const [htmlContent, setHtmlContent] = useState('');
  const [javascriptCode, setJavascriptCode] = useState('');
  const [cssCode] = useState('');

  // Helper to get selected components
  const getSelectedComponents = () => components.filter(c => selectedIds.includes(c.id));

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Delete
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedIds.length > 0) {
          e.preventDefault();
          selectedIds.forEach(id => removeComponent(id));
        }
      }

      // Duplicate (Ctrl+D)
      if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
        e.preventDefault();
        // TODO: Implement duplicate in store
      }

      // Select All (Ctrl+A)
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault();
        components.forEach(c => selectComponent(c.id, true));
      }

      // Deselect (Escape)
      if (e.key === 'Escape') {
        clearSelection();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedIds, components, removeComponent, selectComponent, clearSelection]);

  // Handle component updates with history
  const handleUpdateComponent = (id: string, updates: Partial<CanvasComponent>) => {
    const component = components.find(c => c.id === id);
    if (!component) return;

    const command = createUpdateCommand(
      component,
      updates,
      (updated) => updateComponent(id, updated),
      `Update ${component.name}`
    );

    history.execute(command);
  };

  // Handle AI-generated code application
  const handleApplyCode = (messageId: string) => {
    chat.applyCode(messageId);
  };

  // Load HTML file from web directory
  const loadHTMLFile = async () => {
    try {
      const sampleHTML = `
        <div style="padding: 40px; font-family: Arial, sans-serif;">
          <h1 style="color: #2563eb;">Welcome to HTML Preview!</h1>
          <p>This is a sample HTML content. Replace this with actual file loading.</p>
          <button onclick="alert('JavaScript is working!')">Click Me</button>
        </div>
      `;
      
      const sampleJS = `
        console.log('JavaScript loaded successfully!');
        document.addEventListener('DOMContentLoaded', function() {
          console.log('DOM fully loaded');
        });
      `;

      setHtmlContent(sampleHTML);
      setJavascriptCode(sampleJS);
      setPreviewMode(true);
    } catch (error) {
      console.error('Error loading HTML file:', error);
    }
  };

  return (
    <div className="h-screen flex flex-col bg-gray-100">
      {/* Toolbar */}
      <div className="flex items-center gap-2 bg-white border-b border-gray-200 px-4 py-2">
        <CanvasToolbar
          activeTool={tool}
          onToolChange={setTool}
          onUndo={history.undo}
          onRedo={history.redo}
          canUndo={history.canUndo}
          canRedo={history.canRedo}
          onZoomIn={() => setZoom(Math.min(zoom + 0.1, 3))}
          onZoomOut={() => setZoom(Math.max(zoom - 0.1, 0.1))}
          onToggleGrid={toggleGrid}
          gridVisible={gridVisible}
          onToggleChat={toggleChat}
          onToggleInspector={toggleInspector}
          onToggleTree={toggleComponentTree}
          onToggleCodeEditor={toggleCodeEditor}
          showChat={showChat}
          showInspector={showInspector}
          showTree={showComponentTree}
          showCodeEditor={showCodeEditor}
        />
        
        {/* Preview Mode Toggle */}
        <div className="flex items-center gap-2 ml-auto">
          <button
            onClick={loadHTMLFile}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition"
          >
            Load HTML
          </button>
          <button
            onClick={() => setPreviewMode(!previewMode)}
            className={`px-4 py-2 rounded transition ${
              previewMode
                ? 'bg-green-500 text-white hover:bg-green-600'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            {previewMode ? 'Design Mode' : 'Preview Mode'}
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel - AI Chat */}
        {showChat && (
          <div className="w-80 p-4 border-r border-gray-200 bg-gray-50">
            <AIChatPanel
              messages={chat.messages}
              isGenerating={chat.isGenerating}
              isConnected={chat.isConnected}
              onSendMessage={chat.sendMessage}
              onApplyCode={handleApplyCode}
              onRejectCode={chat.rejectCode}
              selectedComponentCount={selectedIds.length}
            />
          </div>
        )}

        {/* Center - Canvas */}
        <div className="flex-1 flex flex-col">
          <EditorCanvas
            previewMode={previewMode}
            htmlContent={htmlContent}
            javascriptCode={javascriptCode}
            cssCode={cssCode}
          />
        </div>

        {/* Code Editor Panel */}
        {showCodeEditor && (
          <div className="w-96 border-l border-gray-200 bg-white shadow-lg z-20 flex flex-col">
            <CodeEditorPanel
              code="// Select a component to view its code"
              language="html"
              onChange={(value) => console.log(value)}
              onClose={toggleCodeEditor}
            />
          </div>
        )}

        {/* Right Panel - Inspector */}
        {showInspector && (
          <div className="w-80 p-4 border-l border-gray-200 bg-gray-50">
            <InspectorPanel
              selectedComponents={getSelectedComponents()}
              onUpdate={handleUpdateComponent}
            />
          </div>
        )}
      </div>

      {/* Bottom Panel - Component Tree */}
      {showComponentTree && (
        <div className="h-64 border-t border-gray-200 p-4 bg-gray-50">
          <ComponentTree
            components={components}
            selectedIds={selectedIds}
            onSelect={selectComponent}
            onToggleVisibility={(id) => {
              const component = components.find(c => c.id === id);
              if (component) {
                handleUpdateComponent(id, { visible: !component.visible });
              }
            }}
            onToggleLock={(id) => {
              const component = components.find(c => c.id === id);
              if (component) {
                handleUpdateComponent(id, { locked: !component.locked });
              }
            }}
            onDelete={removeComponent}
            onDuplicate={(id) => {
               // TODO: Implement duplicate
               console.log('Duplicate', id);
            }}
          />
        </div>
      )}

      {/* Quick Help Overlay */}
      <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-black/80 text-white px-4 py-2 rounded-lg text-xs space-x-4 pointer-events-none">
        <span>Del: Delete</span>
        <span>Ctrl+D: Duplicate</span>
        <span>Ctrl+Z: Undo</span>
        <span>Ctrl+Y: Redo</span>
        <span>Esc: Deselect</span>
      </div>
    </div>
  );
}
