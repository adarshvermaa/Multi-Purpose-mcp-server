// AI Chat Panel
import React, { useState, useRef, useEffect } from 'react';
import { Send, Sparkles, Check, X, Code } from 'lucide-react';
import type { ChatMessage } from '../../types/editor.types';

interface AIChatPanelProps {
  messages: ChatMessage[];
  isGenerating: boolean;
  isConnected: boolean;
  onSendMessage: (message: string) => void;
  onApplyCode: (messageId: string) => void;
  onRejectCode: (messageId: string) => void;
  selectedComponentCount: number;
}

export default function AIChatPanel({
  messages,
  isGenerating,
  isConnected,
  onSendMessage,
  onApplyCode,
  onRejectCode,
  selectedComponentCount,
}: AIChatPanelProps) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = () => {
    if (!input.trim() || isGenerating) return;
    onSendMessage(input);
    setInput('');
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const quickActions = [
    '➕ Add a button',
    '📊 Generate a chart',
    '📝 Create a form',
    '🎴 Add a card component',
  ];

  return (
    <div className="bg-white rounded-lg border border-gray-200 h-full flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="text-purple-600" size={20} />
          <h3 className="font-semibold text-gray-900">AI Assistant</h3>
        </div>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
          <span className="text-xs text-gray-500">
            {isConnected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
      </div>

      {/* Context Info */}
      {selectedComponentCount > 0 && (
        <div className="px-4 py-2 bg-purple-50 border-b border-purple-100 text-sm text-purple-700">
          <span className="font-medium">{selectedComponentCount}</span> component
          {selectedComponentCount !== 1 ? 's' : ''} selected
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="text-center text-gray-400 py-8">
            <Sparkles className="mx-auto mb-2 text-purple-400" size={32} />
            <p className="text-sm">Ask me to generate UI components!</p>
            <div className="mt-4 space-y-2">
              {quickActions.map((action, idx) => (
                <button
                  key={idx}
                  onClick={() => setInput(action.replace(/^[^\s]+\s/, ''))}
                  className="block w-full text-left px-3 py-2 text-sm rounded-lg bg-gray-50 hover:bg-gray-100 transition"
                >
                  {action}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] rounded-lg px-4 py-2 ${
                  message.role === 'user'
                    ? 'bg-purple-600 text-white'
                    : 'bg-gray-100 text-gray-900'
                }`}
              >
                <p className="text-sm whitespace-pre-wrap">{message.content}</p>

                {/* Code Preview */}
                {message.codePreview && message.role === 'assistant' && (
                  <div className="mt-2 bg-gray-900 rounded p-3 text-xs font-mono text-gray-100 overflow-x-auto">
                    <pre>{message.codePreview.substring(0, 200)}...</pre>
                  </div>
                )}

                {/* Action Buttons */}
                {message.codePreview && message.role === 'assistant' && !message.applied && (
                  <div className="mt-2 flex gap-2">
                    <button
                      onClick={() => onApplyCode(message.id)}
                      className="flex items-center gap-1 px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-xs font-medium transition"
                    >
                      <Check size={14} />
                      Apply
                    </button>
                    <button
                      onClick={() => onRejectCode(message.id)}
                      className="flex items-center gap-1 px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-xs font-medium transition"
                    >
                      <X size={14} />
                      Reject
                    </button>
                  </div>
                )}

                {message.applied && (
                  <div className="mt-2 text-xs text-green-600 font-medium">
                    ✓ Applied to canvas
                  </div>
                )}

                <div className="text-xs opacity-70 mt-1">
                  {new Date(message.timestamp).toLocaleTimeString()}
                </div>
              </div>
            </div>
          ))
        )}

        {isGenerating && (
          <div className="flex justify-start">
            <div className="bg-gray-100 rounded-lg px-4 py-2">
              <div className="flex items-center gap-2">
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-purple-600 border-t-transparent" />
                <span className="text-sm text-gray-600">Generating...</span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-gray-200">
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Describe what you want to create..."
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
            rows={2}
            disabled={isGenerating}
          />
          <button
            onClick={handleSend}
            disabled={isGenerating || !input.trim()}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send size={18} />
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          Press Enter to send • Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}
