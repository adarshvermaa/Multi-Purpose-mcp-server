import React, { useEffect, useRef, useState } from 'react';
import { Canvas, Rect, ActiveSelection, FabricObject } from 'fabric';
import { useEditorStore } from '../../stores/editorStore';
import IframeRenderer from './IframeRenderer';
import HTMLPreview from './HTMLPreview';

interface EditorCanvasProps {
  previewMode?: boolean;
  htmlContent?: string;
  javascriptCode?: string;
  cssCode?: string;
}

export default function EditorCanvas({
  previewMode = false,
  htmlContent = '',
  javascriptCode = '',
  cssCode = '',
}: EditorCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fabricCanvasRef = useRef<Canvas | null>(null);
  const componentMapRef = useRef<Map<string, FabricObject>>(new Map());

  // Store state
  const {
    components,
    selectedIds,
    zoom,
    pan,
    // gridVisible,
    snapToGrid,
    gridSize,
    selectComponent,
    updateComponent,
    clearSelection,
    setZoom,
    setPan,
    addComponent,
  } = useEditorStore();

  // local zoom state for smooth UI updates
  const [localZoom, setLocalZoom] = useState<number>(zoom);

  // interaction refs
  // const isPanningRef = useRef(false);
  // const lastPanPosRef = useRef<{ x: number; y: number } | null>(null);

  // constants
  const MIN_ZOOM = 0.1;
  const MAX_ZOOM = 5;
  const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

  // Initialize Fabric.js canvas (Overlay only)
  useEffect(() => {
    if (previewMode) return;
    if (!canvasRef.current || !containerRef.current) return;

    const fabricCanvas = new Canvas(canvasRef.current, {
      width: window.innerWidth - 400, // Adjust based on layout
      height: window.innerHeight - 100,
      backgroundColor: 'transparent', // Transparent for overlay
      selection: true,
      preserveObjectStacking: true,
    });

    fabricCanvasRef.current = fabricCanvas;

    // Event Handlers
    fabricCanvas.on('selection:created', (e) => {
      const selected = (e as any).selected;
      if (selected && selected.length > 0) {
        const id = selected[0].get('componentId');
        if (id) selectComponent(id, false);
      }
    });

    fabricCanvas.on('selection:updated', (e) => {
      const selected = (e as any).selected;
      if (selected && selected.length > 0) {
        const id = selected[0].get('componentId');
        if (id) selectComponent(id, false);
      }
    });

    fabricCanvas.on('selection:cleared', () => clearSelection());

    fabricCanvas.on('mouse:down', (e) => {
      const tool = useEditorStore.getState().tool;
      if (tool === 'select' || tool === 'hand') return;

      const pointer = fabricCanvas.getPointer(e.e);
      const id = `component-${Date.now()}`;
      
      let newComponent: any = {
        id,
        name: 'New Component',
        position: { x: pointer.x, y: pointer.y },
        size: { width: 100, height: 100 },
        rotation: 0,
        styles: { backgroundColor: '#cccccc' },
        children: [],
        locked: false,
        visible: true,
        zIndex: components.length + 1,
      };

      if (tool === 'rectangle') {
        newComponent = { ...newComponent, type: 'div', name: 'Rectangle' };
      } else if (tool === 'text') {
        newComponent = { 
          ...newComponent, 
          type: 'text', 
          name: 'Text', 
          size: { width: 200, height: 40 },
          styles: { ...newComponent.styles, backgroundColor: 'transparent', fontSize: '16px' } 
        };
      } else if (tool === 'image') {
        newComponent = { 
          ...newComponent, 
          type: 'image', 
          name: 'Image',
          styles: { ...newComponent.styles, backgroundColor: '#e0e0e0' } 
        };
      }

      addComponent(newComponent);
      useEditorStore.getState().setTool('select');
    });

    fabricCanvas.on('object:moving', (e) => {
      if (!e.target) return;
      const obj = e.target as any;
      const id = obj.get('componentId');
      
      // Snap logic
      if (snapToGrid) {
        obj.set({
          left: Math.round((obj.left || 0) / gridSize) * gridSize,
          top: Math.round((obj.top || 0) / gridSize) * gridSize,
        });
      }
    });

    fabricCanvas.on('object:modified', (e) => {
      if (!e.target) return;
      const obj = e.target as any;
      const id = obj.get('componentId');
      if (id) {
        updateComponent(id, { 
          position: { x: obj.left || 0, y: obj.top || 0 },
          size: { 
            width: obj.width * (obj.scaleX || 1), 
            height: obj.height * (obj.scaleY || 1) 
          },
          rotation: obj.angle || 0,
        });
        
        // Reset scale to 1 after resize to keep things clean
        obj.set({ scaleX: 1, scaleY: 1 });
      }
    });

    // Resize handler
    const handleResize = () => {
      if (containerRef.current) {
        fabricCanvas.setDimensions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    };
    window.addEventListener('resize', handleResize);
    handleResize(); // Initial size

    return () => {
      window.removeEventListener('resize', handleResize);
      fabricCanvas.dispose();
      fabricCanvasRef.current = null;
    };
  }, []);

  // Sync Components to Fabric Overlay (Invisible/Transparent Rects for selection)
  useEffect(() => {
    const fabricCanvas = fabricCanvasRef.current;
    if (!fabricCanvas) return;

    // 1. Remove objects that no longer exist
    fabricCanvas.getObjects().forEach((obj) => {
      const id = (obj as any).get('componentId');
      if (id && !components.find(c => c.id === id)) {
        fabricCanvas.remove(obj);
        componentMapRef.current.delete(id);
      }
    });

    // 2. Add/Update objects
    components.forEach((component) => {
      let fabricObj = componentMapRef.current.get(component.id);

      if (!fabricObj) {
        // Create new transparent interaction rect
        fabricObj = new Rect({
          left: component.position.x,
          top: component.position.y,
          width: component.size.width,
          height: component.size.height,
          angle: component.rotation,
          fill: 'transparent',
          stroke: 'transparent', // Only show selection border
          hasBorders: true,
          hasControls: true,
          lockScalingFlip: true,
        }) as any;
        
        (fabricObj as any).set('componentId', component.id);
        fabricCanvas.add(fabricObj as any);
        componentMapRef.current.set(component.id, fabricObj as any);
      } else {
        // Update existing
        // Only update if not currently being dragged/resized by user to avoid jitter
        if (!fabricCanvas.getActiveObject() || (fabricCanvas.getActiveObject() as any).get('componentId') !== component.id) {
           fabricObj.set({
            left: component.position.x,
            top: component.position.y,
            width: component.size.width,
            height: component.size.height,
            angle: component.rotation,
           });
           fabricObj.setCoords();
        }
      }
    });

    // 3. Sync Stack Order
    const sortedComponents = [...components].sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));
    sortedComponents.forEach((comp, index) => {
      const obj = componentMapRef.current.get(comp.id);
      if (obj) {
        // Only move if necessary to avoid performance hit
        if (fabricCanvas.getObjects().indexOf(obj) !== index) {
          (obj as any).moveTo(index);
        }
      }
    });

    fabricCanvas.requestRenderAll();
  }, [components]);

  // Sync Selection
  useEffect(() => {
    const fabricCanvas = fabricCanvasRef.current;
    if (!fabricCanvas) return;

    // Avoid infinite loop if selection came from canvas
    const activeObject = fabricCanvas.getActiveObject();
    const activeIds = activeObject 
      ? (activeObject instanceof ActiveSelection 
          ? (activeObject as any).getObjects().map((o: any) => o.get('componentId'))
          : [(activeObject as any).get('componentId')])
      : [];

    const sameSelection = activeIds.length === selectedIds.length && activeIds.every((id: string) => selectedIds.includes(id));
    if (sameSelection) return;

    fabricCanvas.discardActiveObject();

    if (selectedIds.length > 0) {
      const selectedObjects = selectedIds
        .map((id) => componentMapRef.current.get(id))
        .filter((obj): obj is FabricObject => obj !== undefined);

      if (selectedObjects.length === 1) {
        fabricCanvas.setActiveObject(selectedObjects[0] as any);
      } else if (selectedObjects.length > 1) {
        const selection = new ActiveSelection(selectedObjects as any, { canvas: fabricCanvas });
        fabricCanvas.setActiveObject(selection as any);
      }
    }
    fabricCanvas.requestRenderAll();
  }, [selectedIds]);

  // Sync Zoom/Pan
  useEffect(() => {
    const fabricCanvas = fabricCanvasRef.current;
    if (!fabricCanvas) return;

    setLocalZoom(zoom);
    const vp = fabricCanvas.viewportTransform || [zoom, 0, 0, zoom, pan.x, pan.y];
    vp[0] = zoom;
    vp[3] = zoom;
    vp[4] = pan.x;
    vp[5] = pan.y;
    fabricCanvas.setViewportTransform(vp as any);
    fabricCanvas.requestRenderAll();
  }, [zoom, pan]);


  // Zoom Handlers
  const handleZoom = (factor: number) => {
    const newZoom = clamp(zoom * factor, MIN_ZOOM, MAX_ZOOM);
    setZoom(newZoom);
  };

  // Render
  if (previewMode) {
    return (
      <div className="relative w-full h-full bg-white overflow-hidden">
        <HTMLPreview htmlContent={htmlContent} javascriptCode={javascriptCode} cssCode={cssCode} />
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative w-full h-full bg-gray-100 overflow-hidden">
      {/* 1. Content Layer (Iframe) */}
      <div 
        className="absolute origin-top-left"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          width: '100%',
          height: '100%',
        }}
      >
        <IframeRenderer />
      </div>

      {/* 2. Interaction Layer (Fabric.js Overlay) */}
      <canvas ref={canvasRef} className="absolute top-0 left-0 pointer-events-auto" />

      {/* Controls */}
      <div className="absolute top-4 right-4 bg-white/90 backdrop-blur p-2 rounded-lg shadow-md flex flex-col items-center gap-2 z-50">
        <div className="text-xs">Zoom: {(localZoom * 100).toFixed(0)}%</div>
        <div className="flex gap-1">
          <button onClick={() => handleZoom(1.15)} className="px-2 py-1 rounded border">+</button>
          <button onClick={() => handleZoom(1/1.15)} className="px-2 py-1 rounded border">-</button>
          <button onClick={() => { setZoom(1); setPan({x:0, y:0}); }} className="px-2 py-1 rounded border">Reset</button>
        </div>
      </div>
    </div>
  );
}
