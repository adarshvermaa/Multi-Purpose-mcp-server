import React, { useState, useEffect, useRef, type JSX } from 'react';
import { io, Socket } from 'socket.io-client';
import gsap from 'gsap';

interface TreeNode {
  id?: string;
  type: 'folder' | 'file';
  name: string;
  description?: string;
  content?: string;
  children?: TreeNode[];
}

interface BuildResponse {
  ok: boolean;
  projectId: string;
  projectName: string;
  tree: TreeNode[];
  filesEmitted: Array<{
    path: string;
    status: 'created' | 'updated' | 'skipped' | 'error';
    message?: string;
  }>;
  conversationId?: string;
  error?: string;
}

export default function Builder() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [socketId, setSocketId] = useState<string>('');
  const [isConnected, setIsConnected] = useState(false);
  const [userPrompt, setUserPrompt] = useState('');
  const [projectName, setProjectName] = useState('');
  const [aiProvider, setAiProvider] = useState<'anthropic' | 'openai' | 'gemini'>('anthropic');
  const [isBuilding, setIsBuilding] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressSteps, setProgressSteps] = useState<Array<{title: string, message: string, active: boolean}>>([]);
  const [buildResult, setBuildResult] = useState<BuildResponse | null>(null);
  const [logs, setLogs] = useState<Array<{timestamp: string, message: string, type: string}>>([]);
  const [previewFile, setPreviewFile] = useState<{name: string, content: string, path: string} | null>(null);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  
  const logsRef = useRef<HTMLDivElement>(null);

  // Backend API URL - since backend runs on port 4000 (from .env SERVER_PORT=4000)
  // and Vite dev server also on 4000, we need to proxy or use correct backend port
  const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';

  // Initialize Socket.io
  useEffect(() => {
    const newSocket = io(BACKEND_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
    });

    newSocket.on('connect', () => {
      setSocketId(newSocket.id || '');
      setIsConnected(true);
      addLog('✅ Connected to server', 'success');
    });

    newSocket.on('disconnect', () => {
      setIsConnected(false);
      addLog('❌ Disconnected from server', 'error');
    });

    // Builder events
    newSocket.on('builder:started', (data) => {
      addProgressStep('🚀 Started', 'Build initiated', true);
      setProgress(10);
    });

    newSocket.on('builder:retrieving_context', (data) => {
      addProgressStep('🔍 Searching', data.message, true);
      setProgress(20);
    });

    newSocket.on('builder:planning', (data) => {
      addProgressStep('🤖 Planning', data.message, true);
      setProgress(40);
    });

    newSocket.on('builder:tree_generated', (data) => {
      addProgressStep('✅ Tree Generated', data.message, false);
      setProgress(60);
    });

    newSocket.on('builder:generating_files', (data) => {
      addProgressStep('📝 Generating Files', data.message, true);
      setProgress(70);
    });

    newSocket.on('builder:file_progress', (data) => {
      setProgress(70 + (data.progress * 20));
      addLog(`📄 ${data.status}: ${data.path}`, 'info');
    });

    newSocket.on('builder:files_emitted', (data) => {
      addProgressStep('✅ Files Created', data.message, false);
      setProgress(90);
    });

    newSocket.on('builder:completed', (data) => {
      addProgressStep('🎉 Completed', 'Build successful!', false);
      setProgress(100);
      setBuildResult(data);
      setIsBuilding(false);
      showToast('✅ Project built successfully!');
    });

    newSocket.on('builder:error', (data) => {
      addProgressStep('❌ Error', data.error, false);
      setIsBuilding(false);
      showToast(`❌ Error: ${data.error}`);
      addLog(`❌ Error: ${data.error}`, 'error');
    });

    setSocket(newSocket);

    return () => {
      newSocket.close();
    };
  }, []);

  const addLog = (message: string, type: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, { timestamp, message, type }]);
    setTimeout(() => {
      if (logsRef.current) {
        logsRef.current.scrollTop = logsRef.current.scrollHeight;
      }
    }, 0);
  };

  const addProgressStep = (title: string, message: string, active: boolean) => {
    setProgressSteps(prev => {
      const updated = prev.map(step => ({ ...step, active: false }));
      return [...updated, { title, message, active }];
    });
  };

  const showToast = (message: string) => {
    // Simple alert for now, can be enhanced with a proper toast library
    console.log(message);
  };

  const handleBuild = async () => {
    if (!userPrompt.trim()) {
      alert('⚠️ Please enter a project description');
      return;
    }

    if (!isConnected) {
      alert('❌ Not connected to server');
      return;
    }

    setIsBuilding(true);
    setProgress(0);
    setProgressSteps([]);
    setBuildResult(null);
    addLog(`🚀 Starting build: ${userPrompt}`, 'info');

    try {
      const response = await fetch(`${BACKEND_URL}/api/v1/web/builder/emit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userPrompt,
          socketId,
          options: {
            projectName: projectName || undefined,
            useOpenAI: aiProvider === 'openai',
            useGemini: aiProvider === 'gemini',
            maxTokens: 8192,
            ragTopK: 5,
            dryRun: false,
          },
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Build request failed');
      }
    } catch (error: any) {
      addLog(`❌ Build error: ${error.message}`, 'error');
      showToast(`❌ Error: ${error.message}`);
      setIsBuilding(false);
    }
  };

  const handleDownload = () => {
    if (!buildResult?.projectName) return;
    const url = `${BACKEND_URL}/api/v1/web/builder/download/${buildResult.projectName}`;
    window.open(url, '_blank');
    addLog(`📥 Downloaded project: ${buildResult.projectName}.zip`, 'success');
  };

  const toggleNode = (nodePath: string) => {
    const newExpanded = new Set(expandedNodes);
    if (newExpanded.has(nodePath)) {
      newExpanded.delete(nodePath);
    } else {
      newExpanded.add(nodePath);
    }
    setExpandedNodes(newExpanded);
  };

  const viewFile = (node: TreeNode, nodePath: string) => {
    if (node.type === 'file' && node.content) {
      setPreviewFile({
        name: node.name,
        content: node.content,
        path: nodePath
      });
    }
  };

  const renderTree = (nodes: TreeNode[], level: number = 0, parentPath: string = ''): JSX.Element[] => {
    return nodes.map((node, idx) => {
      const nodePath = `${parentPath}/${node.name}`;
      const isExpanded = expandedNodes.has(nodePath);
      const hasContent = node.type === 'file' && node.content;
      
      return (
        <div key={idx} style={{ paddingLeft: `${level * 20}px` }}>
          <div 
            className="flex items-center gap-2 py-1 px-2 hover:bg-purple-600/10 rounded cursor-pointer transition"
            onClick={() => {
              if (node.type === 'folder') {
                toggleNode(nodePath);
              } else if (hasContent) {
                viewFile(node, nodePath);
              }
            }}
          >
            {node.type === 'folder' && (
              <span className="text-xs">{isExpanded ? '▼' : '▶'}</span>
            )}
            <span>{node.type === 'folder' ? '📁' : '📄'}</span>
            <span className={node.type === 'folder' ? 'text-purple-400 font-semibold' : 'text-gray-300'}>
              {node.name}
            </span>
            {hasContent && (
              <span className="text-xs text-purple-400 ml-auto">👁️ View</span>
            )}
          </div>
          {node.type === 'folder' && isExpanded && node.children && renderTree(node.children, level + 1, nodePath)}
        </div>
      );
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-purple-950 to-slate-900 text-white p-6">
      {/* Header */}
      <header className="mb-8 border-b border-purple-500/20 pb-4">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-400 to-pink-600 bg-clip-text text-transparent">
            🚀 AI Web Builder
          </h1>
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></span>
            <span className="text-sm text-gray-400">{isConnected ? 'Connected' : 'Disconnected'}</span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Input Section */}
        <div className="space-y-6">
          <div className="bg-white/5 backdrop-blur-md rounded-2xl border border-purple-500/20 p-6">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <span className="text-2xl">💡</span>
              Describe Your Project
            </h2>

            <textarea
              value={userPrompt}
              onChange={(e) => setUserPrompt(e.target.value)}
              className="w-full h-40 bg-black/30 border border-purple-500/30 rounded-lg p-4 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
              placeholder="E.g., Create a modern real estate company portfolio website with React, Tailwind CSS, property listings, contact form, and image gallery..."
            />

            <div className="mt-4 grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm mb-2 text-gray-300">Project Name (Optional)</label>
                <input
                  type="text"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  className="w-full bg-black/30 border border-purple-500/30 rounded-lg p-2 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  placeholder="my-awesome-project"
                />
              </div>
              <div>
                <label className="block text-sm mb-2 text-gray-300">AI Model</label>
                <select
                  value={aiProvider}
                  onChange={(e) => setAiProvider(e.target.value as 'anthropic' | 'openai' | 'gemini')}
                  className="w-full bg-black/30 border border-purple-500/30 rounded-lg p-2 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  <option value="anthropic">Anthropic Claude 3.5 Sonnet</option>
                  <option value="openai">OpenAI GPT-4o</option>
                  <option value="gemini">Google Gemini 2.0 Flash</option>
                </select>
              </div>
            </div>

            <button
              onClick={handleBuild}
              disabled={isBuilding}
              className="mt-6 w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 px-6 py-3 rounded-lg font-semibold transition shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isBuilding ? '⏳ Building...' : '🚀 Build Project'}
            </button>
          </div>

          {/* Example Prompts */}
          <div className="bg-white/5 backdrop-blur-md rounded-2xl border border-purple-500/20 p-6">
            <h3 className="text-lg font-semibold mb-3">💡 Example Prompts</h3>
            <div className="space-y-2">
              {[
                'Create a real estate portfolio with property listings and contact form',
                'Build a personal blog with React, Markdown support, and dark mode',
                'E-commerce landing page with product showcase and checkout flow'
              ].map((prompt, idx) => (
                <button
                  key={idx}
                  onClick={() => setUserPrompt(prompt)}
                  className="w-full text-left p-3 rounded-lg bg-black/20 hover:bg-black/40 transition text-sm border border-purple-500/10"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Output Section */}
        <div className="space-y-6">
          {/* Progress Card */}
          {isBuilding && (
            <div className="bg-white/5 backdrop-blur-md rounded-2xl border border-purple-500/20 p-6">
              <h2 className="text-xl font-semibold mb-4">⚡ Building...</h2>
              <div className="space-y-3">
                {progressSteps.map((step, idx) => (
                  <div
                    key={idx}
                    className={`flex items-center gap-3 p-2 rounded ${step.active ? 'bg-purple-600/20' : 'opacity-60'}`}
                  >
                    <span>{step.active ? '⏳' : '✓'}</span>
                    <div className="flex-1">
                      <div className="font-semibold text-sm">{step.title}</div>
                      <div className="text-xs text-gray-400">{step.message}</div>
                    </div>
                  </div>
                ))}
                <div className="mt-4">
                  <div className="bg-black/30 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-purple-600 to-pink-600 h-full transition-all duration-500"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Results Card */}
          {buildResult && (
            <div className="bg-white/5 backdrop-blur-md rounded-2xl border border-purple-500/20 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <span className="text-2xl">✨</span>
                  Project Structure
                </h2>
                <button
                  onClick={handleDownload}
                  className="bg-green-600 hover:bg-green-700 px-4 py-2 rounded-lg text-sm font-semibold transition flex items-center gap-2"
                >
                  <span>📥</span> Download ZIP
                </button>
              </div>
              <div className="bg-black/30 rounded-lg p-4 max-h-96 overflow-y-auto">
                {renderTree(buildResult.tree)}
              </div>
              <p className="mt-3 text-sm text-gray-400">
                💡 Click folders to expand, click files to preview
              </p>
            </div>
          )}

          {/* Logs Section */}
          <div className="mt-6 bg-white/5 backdrop-blur-md rounded-2xl border border-purple-500/20 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">📜 Activity Log</h3>
              <button onClick={() => setLogs([])} className="text-sm text-gray-400 hover:text-white transition">
                Clear
              </button>
            </div>
            <div
              ref={logsRef}
              className="bg-black/30 rounded-lg p-4 h-48 overflow-y-auto font-mono text-sm text-gray-300"
            >
              {logs.length === 0 ? (
                <div className="text-gray-500">Waiting for activity...</div>
              ) : (
                logs.map((log, idx) => (
                  <div key={idx} className={`text-${log.type === 'error' ? 'red' : log.type === 'success' ? 'green' : 'blue'}-400`}>
                    <span className="text-gray-500">[{log.timestamp}]</span> {log.message}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* File Preview Modal */}
      {previewFile && (
        <div 
          className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-6 z-50"
          onClick={() => setPreviewFile(null)}
        >
          <div 
            className="bg-slate-900 rounded-2xl border border-purple-500/30 p-6 max-w-4xl w-full max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-xl font-semibold text-purple-400">{previewFile.name}</h3>
                <p className="text-sm text-gray-400">{previewFile.path}</p>
              </div>
              <button
                onClick={() => setPreviewFile(null)}
                className="text-gray-400 hover:text-white text-2xl"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-auto bg-black/50 rounded-lg p-4">
              <pre className="text-sm text-gray-300 whitespace-pre-wrap font-mono">
                <code>{previewFile.content}</code>
              </pre>
            </div>
            <div className="mt-4 flex gap-3">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(previewFile.content);
                  addLog(`📋 Copied ${previewFile.name} to clipboard`, 'success');
                }}
                className="bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded-lg text-sm font-semibold transition"
              >
                📋 Copy to Clipboard
              </button>
              <button
                onClick={() => setPreviewFile(null)}
                className="bg-gray-600 hover:bg-gray-700 px-4 py-2 rounded-lg text-sm font-semibold transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Logs Section */}
      <div className="mt-6 bg-white/5 backdrop-blur-md rounded-2xl border border-purple-500/20 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">📜 Activity Log</h3>
          <button onClick={() => setLogs([])} className="text-sm text-gray-400 hover:text-white transition">
            Clear
          </button>
        </div>
        <div
          ref={logsRef}
          className="bg-black/30 rounded-lg p-4 h-48 overflow-y-auto font-mono text-sm text-gray-300"
        >
          {logs.length === 0 ? (
            <div className="text-gray-500">Waiting for activity...</div>
          ) : (
            logs.map((log, idx) => (
              <div key={idx} className={`text-${log.type === 'error' ? 'red' : log.type === 'success' ? 'green' : 'blue'}-400`}>
                <span className="text-gray-500">[{log.timestamp}]</span> {log.message}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
