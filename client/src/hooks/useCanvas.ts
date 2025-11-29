// Canvas state management hook
import { useState, useCallback, useRef } from 'react';
import type { CanvasComponent, Position, Size } from '../types/editor.types';

export function useCanvas() {
  const [components, setComponents] = useState<CanvasComponent[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const nextIdRef = useRef(1);

  const generateId = useCallback(() => {
    return `component-${nextIdRef.current++}`;
  }, []);

  const addComponent = useCallback((component: Omit<CanvasComponent, 'id'>) => {
    const newComponent: CanvasComponent = {
      ...component,
      id: generateId(),
    };
    setComponents(prev => [...prev, newComponent]);
    return newComponent.id;
  }, [generateId]);

  const updateComponent = useCallback((id: string, updates: Partial<CanvasComponent>) => {
    setComponents(prev =>
      prev.map(comp =>
        comp.id === id ? { ...comp, ...updates } : comp
      )
    );
  }, []);

  const deleteComponent = useCallback((id: string) => {
    setComponents(prev => prev.filter(comp => comp.id !== id));
    setSelectedIds(prev => prev.filter(selectedId => selectedId !== id));
  }, []);

  const deleteSelected = useCallback(() => {
    setComponents(prev => prev.filter(comp => !selectedIds.includes(comp.id)));
    setSelectedIds([]);
  }, [selectedIds]);

  const duplicateComponent = useCallback((id: string) => {
    const component = components.find(c => c.id === id);
    if (!component) return;

    const duplicated: CanvasComponent = {
      ...component,
      id: generateId(),
      position: {
        x: component.position.x + 20,
        y: component.position.y + 20,
      },
      name: `${component.name} (copy)`,
    };

    setComponents(prev => [...prev, duplicated]);
    return duplicated.id;
  }, [components, generateId]);

  const selectComponent = useCallback((id: string, multiSelect = false) => {
    if (multiSelect) {
      setSelectedIds(prev =>
        prev.includes(id)
          ? prev.filter(selectedId => selectedId !== id)
          : [...prev, id]
      );
    } else {
      setSelectedIds([id]);
    }
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds([]);
  }, []);

  const getComponent = useCallback((id: string) => {
    return components.find(c => c.id === id);
  }, [components]);

  const getSelectedComponents = useCallback(() => {
    return components.filter(c => selectedIds.includes(c.id));
  }, [components, selectedIds]);

  const moveComponent = useCallback((id: string, position: Position) => {
    updateComponent(id, { position });
  }, [updateComponent]);

  const resizeComponent = useCallback((id: string, size: Size) => {
    updateComponent(id, { size });
  }, [updateComponent]);

  const bringToFront = useCallback((id: string) => {
    const maxZIndex = Math.max(...components.map(c => c.zIndex), 0);
    updateComponent(id, { zIndex: maxZIndex + 1 });
  }, [components, updateComponent]);

  const sendToBack = useCallback((id: string) => {
    const minZIndex = Math.min(...components.map(c => c.zIndex), 0);
    updateComponent(id, { zIndex: minZIndex - 1 });
  }, [components, updateComponent]);

  const groupComponents = useCallback((ids: string[]) => {
    if (ids.length < 2) return;

    const componentsToGroup = components.filter(c => ids.includes(c.id));
    
    // Calculate bounding box
    const minX = Math.min(...componentsToGroup.map(c => c.position.x));
    const minY = Math.min(...componentsToGroup.map(c => c.position.y));
    const maxX = Math.max(...componentsToGroup.map(c => c.position.x + c.size.width));
    const maxY = Math.max(...componentsToGroup.map(c => c.position.y + c.size.height));

    const groupId = generateId();
    const group: CanvasComponent = {
      id: groupId,
      type: 'div',
      name: 'Group',
      position: { x: minX, y: minY },
      size: { width: maxX - minX, height: maxY - minY },
      rotation: 0,
      styles: {},
      children: componentsToGroup.map(c => ({ ...c, parentId: groupId })),
      locked: false,
      visible: true,
      zIndex: Math.max(...componentsToGroup.map(c => c.zIndex)),
    };

    // Remove grouped components and add group
    setComponents(prev => [
      ...prev.filter(c => !ids.includes(c.id)),
      group,
    ]);

    setSelectedIds([groupId]);
    return groupId;
  }, [components, generateId]);

  const clearAll = useCallback(() => {
    setComponents([]);
    setSelectedIds([]);
    nextIdRef.current = 1;
  }, []);

  return {
    components,
    selectedIds,
    addComponent,
    updateComponent,
    deleteComponent,
    deleteSelected,
    duplicateComponent,
    selectComponent,
    clearSelection,
    getComponent,
    getSelectedComponents,
    moveComponent,
    resizeComponent,
    bringToFront,
    sendToBack,
    groupComponents,
    clearAll,
    setComponents, // For loading projects
  };
}
