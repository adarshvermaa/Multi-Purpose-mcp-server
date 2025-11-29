// Component tree/layers panel
import React, { useState } from 'react';
import { 
  ChevronRight, 
  ChevronDown, 
  Eye, 
  EyeOff, 
  Lock, 
  Unlock,
  Trash2,
  Copy,
} from 'lucide-react';
import type { CanvasComponent } from '../../types/editor.types';

interface ComponentTreeProps {
  components: CanvasComponent[];
  selectedIds: string[];
  onSelect: (id: string, multiSelect: boolean) => void;
  onToggleVisibility: (id: string) => void;
  onToggleLock: (id: string) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
}

export default function ComponentTree({
  components,
  selectedIds,
  onSelect,
  onToggleVisibility,
  onToggleLock,
  onDelete,
  onDuplicate,
}: ComponentTreeProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const toggleExpanded = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const renderComponent = (component: CanvasComponent, level = 0) => {
    const isSelected = selectedIds.includes(component.id);
    const isExpanded = expandedIds.has(component.id);
    const hasChildren = component.children && component.children.length > 0;

    return (
      <div key={component.id}>
        <div
          className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition ${
            isSelected
              ? 'bg-purple-100 text-purple-700'
              : 'hover:bg-gray-100 text-gray-700'
          }`}
          style={{ paddingLeft: `${level * 16 + 8}px` }}
        >
          {/* Expand/Collapse */}
          {hasChildren ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleExpanded(component.id);
              }}
              className="p-0.5 hover:bg-gray-200 rounded"
            >
              {isExpanded ? (
                <ChevronDown size={14} />
              ) : (
                <ChevronRight size={14} />
              )}
            </button>
          ) : (
            <div className="w-5" />
          )}

          {/* Component Info */}
          <div
            onClick={(e) => {
              onSelect(component.id, e.ctrlKey || e.metaKey);
            }}
            className="flex-1 flex items-center gap-2 min-w-0"
          >
            <span className="text-xs">{getComponentIcon(component.type)}</span>
            <span className="text-sm font-medium truncate">{component.name}</span>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleVisibility(component.id);
              }}
              className="p-1 hover:bg-gray-200 rounded"
              title={component.visible ? 'Hide' : 'Show'}
            >
              {component.visible ? (
                <Eye size={14} className="text-gray-500" />
              ) : (
                <EyeOff size={14} className="text-gray-400" />
              )}
            </button>

            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleLock(component.id);
              }}
              className="p-1 hover:bg-gray-200 rounded"
              title={component.locked ? 'Unlock' : 'Lock'}
            >
              {component.locked ? (
                <Lock size={14} className="text-gray-500" />
              ) : (
                <Unlock size={14} className="text-gray-400" />
              )}
            </button>

            <button
              onClick={(e) => {
                e.stopPropagation();
                onDuplicate(component.id);
              }}
              className="p-1 hover:bg-gray-200 rounded"
              title="Duplicate"
            >
              <Copy size={14} className="text-gray-500" />
            </button>

            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(component.id);
              }}
              className="p-1 hover:bg-red-100 rounded"
              title="Delete"
            >
              <Trash2 size={14} className="text-red-500" />
            </button>
          </div>
        </div>

        {/* Children */}
        {hasChildren && isExpanded && (
          <div>
            {component.children.map(child => renderComponent(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  // Sort by z-index
  const sortedComponents = [...components].sort((a, b) => b.zIndex - a.zIndex);

  return (
    <div className="bg-white rounded-lg border border-gray-200 h-full flex flex-col">
      <div className="px-4 py-3 border-b border-gray-200">
        <h3 className="font-semibold text-gray-900">Layers</h3>
        <p className="text-xs text-gray-500 mt-1">
          {components.length} component{components.length !== 1 ? 's' : ''}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {sortedComponents.length === 0 ? (
          <div className="text-center text-gray-400 text-sm py-8">
            No components yet
            <br />
            <span className="text-xs">Use AI chat to generate UI</span>
          </div>
        ) : (
          sortedComponents.map(component => renderComponent(component))
        )}
      </div>
    </div>
  );
}

function getComponentIcon(type: string): string {
  const icons: Record<string, string> = {
    div: '📦',
    button: '🔘',
    input: '📝',
    text: '✏️',
    image: '🖼️',
    card: '🎴',
    form: '📋',
    navbar: '🧭',
    custom: '🔧',
  };
  return icons[type] || '📦';
}
