// Inspector panel for component properties
import React, { useState } from 'react';
import { Settings, Layout, Palette, Code as CodeIcon, Zap } from 'lucide-react';
import type { CanvasComponent } from '../../types/editor.types';

interface InspectorPanelProps {
  selectedComponents: CanvasComponent[];
  onUpdate: (id: string, updates: Partial<CanvasComponent>) => void;
}

type Tab = 'properties' | 'layout' | 'style' | 'code';

export default function InspectorPanel({
  selectedComponents,
  onUpdate,
}: InspectorPanelProps) {
  const [activeTab, setActiveTab] = useState<Tab>('properties');

  if (selectedComponents.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 h-full flex items-center justify-center">
        <div className="text-center text-gray-400">
          <Settings className="mx-auto mb-2" size={32} />
          <p className="text-sm">Select a component to inspect</p>
        </div>
      </div>
    );
  }

  const component = selectedComponents[0]; // For now, only support single selection

  const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: 'properties', label: 'Properties', icon: Settings },
    { id: 'layout', label: 'Layout', icon: Layout },
    { id: 'style', label: 'Style', icon: Palette },
    { id: 'code', label: 'Code', icon: CodeIcon },
  ];

  return (
    <div className="bg-white rounded-lg border border-gray-200 h-full flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200">
        <h3 className="font-semibold text-gray-900">{component.name}</h3>
        <p className="text-xs text-gray-500 mt-1">
          {component.type} • ID: {component.id.slice(0, 8)}
        </p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        {tabs.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm transition ${
                isActive
                  ? 'border-b-2 border-purple-600 text-purple-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Icon size={16} />
              <span className="hidden lg:inline">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === 'properties' && (
          <PropertiesTab component={component} onUpdate={onUpdate} />
        )}
        {activeTab === 'layout' && (
          <LayoutTab component={component} onUpdate={onUpdate} />
        )}
        {activeTab === 'style' && (
          <StyleTab component={component} onUpdate={onUpdate} />
        )}
        {activeTab === 'code' && (
          <CodeTab component={component} />
        )}
      </div>
    </div>
  );
}

function PropertiesTab({ 
  component, 
  onUpdate 
}: { 
  component: CanvasComponent; 
  onUpdate: (id: string, updates: Partial<CanvasComponent>) => void;
}) {
  return (
    <div className="space-y-4">
      <InputField
        label="Name"
        value={component.name}
        onChange={(value) => onUpdate(component.id, { name: value })}
      />
      
      <SelectField
        label="Type"
        value={component.type}
        options={[
          { value: 'div', label: 'Div' },
          { value: 'button', label: 'Button' },
          { value: 'input', label: 'Input' },
          { value: 'text', label: 'Text' },
          { value: 'card', label: 'Card' },
        ]}
        onChange={(value: any) => onUpdate(component.id, { type: value })}
      />

      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-gray-700">Visible</label>
        <input
          type="checkbox"
          checked={component.visible}
          onChange={(e) => onUpdate(component.id, { visible: e.target.checked })}
          className="rounded"
        />
      </div>

      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-gray-700">Locked</label>
        <input
          type="checkbox"
          checked={component.locked}
          onChange={(e) => onUpdate(component.id, { locked: e.target.checked })}
          className="rounded"
        />
      </div>
    </div>
  );
}

function LayoutTab({ 
  component, 
  onUpdate 
}: { 
  component: CanvasComponent; 
  onUpdate: (id: string, updates: Partial<CanvasComponent>) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <InputField
          label="X"
          type="number"
          value={component.position.x}
          onChange={(value) => 
            onUpdate(component.id, { 
              position: { ...component.position, x: Number(value) }
            })
          }
        />
        <InputField
          label="Y"
          type="number"
          value={component.position.y}
          onChange={(value) => 
            onUpdate(component.id, { 
              position: { ...component.position, y: Number(value) }
            })
          }
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <InputField
          label="Width"
          type="number"
          value={component.size.width}
          onChange={(value) => 
            onUpdate(component.id, { 
              size: { ...component.size, width: Number(value) }
            })
          }
        />
        <InputField
          label="Height"
          type="number"
          value={component.size.height}
          onChange={(value) => 
            onUpdate(component.id, { 
              size: { ...component.size, height: Number(value) }
            })
          }
        />
      </div>

      <InputField
        label="Rotation"
        type="number"
        value={component.rotation}
        onChange={(value) => onUpdate(component.id, { rotation: Number(value) })}
      />

      <InputField
        label="Z-Index"
        type="number"
        value={component.zIndex}
        onChange={(value) => onUpdate(component.id, { zIndex: Number(value) })}
      />
    </div>
  );
}

function StyleTab({ 
  component, 
  onUpdate 
}: { 
  component: CanvasComponent; 
  onUpdate: (id: string, updates: Partial<CanvasComponent>) => void;
}) {
  const updateStyle = (key: string, value: any) => {
    onUpdate(component.id, {
      styles: { ...component.styles, [key]: value }
    });
  };

  return (
    <div className="space-y-4">
      <InputField
        label="Background Color"
        type="color"
        value={(component.styles.backgroundColor as string) || '#ffffff'}
        onChange={(value) => updateStyle('backgroundColor', value)}
      />

      <InputField
        label="Text Color"
        type="color"
        value={(component.styles.color as string) || '#000000'}
        onChange={(value) => updateStyle('color', value)}
      />

      <InputField
        label="Border Width"
        type="number"
        value={(component.styles.borderWidth as number) || 0}
        onChange={(value) => updateStyle('borderWidth', `${value}px`)}
      />

      <InputField
        label="Border Color"
        type="color"
        value={(component.styles.borderColor as string) || '#000000'}
        onChange={(value) => updateStyle('borderColor', value)}
      />

      <InputField
        label="Border Radius"
        type="number"
        value={parseInt((component.styles.borderRadius as string) || '0')}
        onChange={(value) => updateStyle('borderRadius', `${value}px`)}
      />

      <InputField
        label="Padding"
        type="number"
        value={parseInt((component.styles.padding as string) || '0')}
        onChange={(value) => updateStyle('padding', `${value}px`)}
      />

      <InputField
        label="Font Size"
        type="number"
        value={parseInt((component.styles.fontSize as string) || '16')}
        onChange={(value) => updateStyle('fontSize', `${value}px`)}
      />
    </div>
  );
}

function CodeTab({ component }: { component: CanvasComponent }) {
  const generateCSS = () => {
    return Object.entries(component.styles)
      .map(([key, value]) => {
        const cssKey = key.replace(/([A-Z])/g, '-$1').toLowerCase();
        return `  ${cssKey}: ${value};`;
      })
      .join('\n');
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="text-sm font-medium text-gray-700 mb-2 block">CSS</label>
        <pre className="bg-gray-900 text-gray-100 p-3 rounded text-xs font-mono overflow-x-auto">
{`.${component.name.toLowerCase().replace(/\s+/g, '-')} {
${generateCSS()}
}`}
        </pre>
      </div>

      {component.html && (
        <div>
          <label className="text-sm font-medium text-gray-700 mb-2 block">HTML</label>
          <pre className="bg-gray-900 text-gray-100 p-3 rounded text-xs font-mono overflow-x-auto">
            {component.html}
          </pre>
        </div>
      )}
    </div>
  );
}

function InputField({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string;
  value: any;
  onChange: (value: any) => void;
  type?: string;
}) {
  return (
    <div>
      <label className="text-sm font-medium text-gray-700 mb-1 block">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
      />
    </div>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: any;
  options: { value: any; label: string }[];
  onChange: (value: any) => void;
}) {
  return (
    <div>
      <label className="text-sm font-medium text-gray-700 mb-1 block">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
      >
        {options.map(option => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
