// Undo/redo functionality using command pattern
import { useState, useCallback, useEffect } from 'react';
import type { HistoryEntry } from '../types/editor.types';

interface Command {
  execute: () => void;
  undo: () => void;
  description: string;
}

export function useHistory() {
  const [history, setHistory] = useState<Command[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);

  const canUndo = currentIndex >= 0;
  const canRedo = currentIndex < history.length - 1;

  const execute = useCallback((command: Command) => {
    command.execute();

    setHistory(prev => {
      // Remove any history after current index (when we execute a new command)
      const newHistory = prev.slice(0, currentIndex + 1);
      return [...newHistory, command];
    });

    setCurrentIndex(prev => prev + 1);
  }, [currentIndex]);

  const undo = useCallback(() => {
    if (!canUndo) return;

    const command = history[currentIndex];
    command.undo();
    setCurrentIndex(prev => prev - 1);
  }, [canUndo, currentIndex, history]);

  const redo = useCallback(() => {
    if (!canRedo) return;

    const command = history[currentIndex + 1];
    command.execute();
    setCurrentIndex(prev => prev + 1);
  }, [canRedo, currentIndex, history]);

  const clear = useCallback(() => {
    setHistory([]);
    setCurrentIndex(-1);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (
        ((e.ctrlKey || e.metaKey) && e.key === 'y') ||
        ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'z')
      ) {
        e.preventDefault();
        redo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo]);

  return {
    execute,
    undo,
    redo,
    canUndo,
    canRedo,
    clear,
    history: history.slice(0, currentIndex + 1).map(cmd => cmd.description),
  };
}

// Helper factory functions for common commands
export function createUpdateCommand<T>(
  item: T,
  updates: Partial<T>,
  onUpdate: (updated: T) => void,
  description: string
): Command {
  const before = { ...item };
  const after = { ...item, ...updates };

  return {
    execute: () => onUpdate(after),
    undo: () => onUpdate(before),
    description,
  };
}

export function createAddCommand<T>(
  item: T,
  onAdd: (item: T) => void,
  onRemove: (item: T) => void,
  description: string
): Command {
  return {
    execute: () => onAdd(item),
    undo: () => onRemove(item),
    description,
  };
}

export function createDeleteCommand<T>(
  item: T,
  onAdd: (item: T) => void,
  onRemove: (item: T) => void,
  description: string
): Command {
  return {
    execute: () => onRemove(item),
    undo: () => onAdd(item),
    description,
  };
}
