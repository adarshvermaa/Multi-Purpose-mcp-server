// AI chat integration hook
import { useState, useCallback, useRef } from 'react';
import type { ChatMessage } from '../types/editor.types';
import { useEditorStore } from '../stores/editorStore';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';

export function useAIChat(projectId: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [model, setModel] = useState<'openai' | 'anthropic' | 'gemini'>('openai');
  const nextMessageIdRef = useRef(1);

  // Store helpers
  const components = useEditorStore(state => state.components);
  const selectedIds = useEditorStore(state => state.selectedIds);
  const addComponent = useEditorStore(state => state.addComponent);

  const getSelectedComponents = useCallback(
    () => components.filter(c => selectedIds.includes(c.id)),
    [components, selectedIds],
  );

  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim()) return;

      const userMessage: ChatMessage = {
        id: `msg-${nextMessageIdRef.current++}`,
        role: 'user',
        content,
        timestamp: Date.now(),
        applied: false,
      };
      setMessages(prev => [...prev, userMessage]);
      setIsGenerating(true);

      try {
        const selectedComponents = getSelectedComponents();
        const response = await fetch(`${BACKEND_URL}/api/v1/editor/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: content,
            selectedComponents,
            projectId,
            model,
          }),
        });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || 'Failed to generate component');
        }
        const { component } = data;
        const assistantMessage: ChatMessage = {
          id: `msg-${nextMessageIdRef.current++}`,
          role: 'assistant',
          content: component.explanation || 'Here is the generated component:',
          timestamp: Date.now(),
          codePreview: component.html,
          applied: false,
          componentId: JSON.stringify(component),
        };
        setMessages(prev => [...prev, assistantMessage]);
      } catch (error: any) {
        const errorMessage: ChatMessage = {
          id: `msg-${nextMessageIdRef.current++}`,
          role: 'assistant',
          content: `Error: ${error.message}`,
          timestamp: Date.now(),
          applied: false,
        };
        setMessages(prev => [...prev, errorMessage]);
      } finally {
        setIsGenerating(false);
      }
    },
    [getSelectedComponents, model, projectId],
  );

  const applyCode = useCallback(
    (messageId: string) => {
      const message = messages.find(m => m.id === messageId);
      if (!message?.componentId) return;
      try {
        const componentData = JSON.parse(message.componentId);
        const newComponent: any = {
          id: `ai-comp-${Date.now()}`,
          type: 'custom',
          name: componentData.componentType || 'AI Component',
          position: { x: 100, y: 100 },
          size: { width: 300, height: 200 },
          rotation: 0,
          styles: {},
          children: [],
          html: componentData.html,
          locked: false,
          visible: true,
          zIndex: 100,
        };
        addComponent(newComponent);
        setMessages(prev =>
          prev.map(msg => (msg.id === messageId ? { ...msg, applied: true } : msg)),
        );
      } catch (e) {
        console.error('Failed to apply component', e);
      }
    },
    [messages, addComponent],
  );

  const clearMessages = useCallback(() => setMessages([]), []);
  const rejectCode = useCallback(
    (messageId: string) => setMessages(prev => prev.filter(msg => msg.id !== messageId)),
    [],
  );

  return {
    messages,
    isGenerating,
    sendMessage,
    applyCode,
    rejectCode,
    clearMessages,
    isConnected: true,
    model,
    setModel,
  };
}
