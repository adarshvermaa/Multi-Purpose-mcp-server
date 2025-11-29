// Global editor state management
import { useState, useCallback } from 'react';
import type { EditorTool, Position } from '../types/editor.types';

export function useEditor() {
  const [tool, setTool] = useState<EditorTool>('select');
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Position>({ x: 0, y: 0 });
  const [gridVisible, setGridVisible] = useState(true);
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [gridSize, setGridSize] = useState(10);
  const [showChat, setShowChat] = useState(false);
  const [showInspector, setShowInspector] = useState(false);
  const [showComponentTree, setShowComponentTree] = useState(false);
  const [showCode, setShowCode] = useState(false);

  const zoomIn = useCallback(() => {
    setZoom(prev => Math.min(prev + 0.1, 3));
  }, []);

  const zoomOut = useCallback(() => {
    setZoom(prev => Math.max(prev - 0.1, 0.1));
  }, []);

  const resetZoom = useCallback(() => {
    setZoom(1);
  }, []);

  const resetPan = useCallback(() => {
    setPan({ x: 0, y: 0 });
  }, []);

  const toggleGrid = useCallback(() => {
    setGridVisible(prev => !prev);
  }, []);

  const toggleSnap = useCallback(() => {
    setSnapToGrid(prev => !prev);
  }, []);

  const toggleChat = useCallback(() => {
    setShowChat(prev => !prev);
  }, []);

  const toggleInspector = useCallback(() => {
    setShowInspector(prev => !prev);
  }, []);

  const toggleComponentTree = useCallback(() => {
    setShowComponentTree(prev => !prev);
  }, []);

  const toggleCode = useCallback(() => {
    setShowCode(prev => !prev);
  }, []);

  const snapToGridValue = useCallback((value: number) => {
    if (!snapToGrid) return value;
    return Math.round(value / gridSize) * gridSize;
  }, [snapToGrid, gridSize]);

  return {
    tool,
    setTool,
    zoom,
    setZoom,
    zoomIn,
    zoomOut,
    resetZoom,
    pan,
    setPan,
    resetPan,
    gridVisible,
    setGridVisible,
    toggleGrid,
    snapToGrid,
    setSnapToGrid,
    toggleSnap,
    gridSize,
    setGridSize,
    snapToGridValue,
    showChat,
    toggleChat,
    showInspector,
    toggleInspector,
    showComponentTree,
    toggleComponentTree,
    showCode,
    toggleCode,
  };
}
