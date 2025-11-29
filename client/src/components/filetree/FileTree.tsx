// src/components/filetree/FileTree.tsx
import React, { useState } from "react";
import { ChevronDown, ChevronRight, Folder, FileText } from "lucide-react";
import type { TreeNode } from "../../hooks/useFileSystem";

type Props = {
  tree: TreeNode[];
  activePath?: string;
  onSelect: (p: string) => void;
};

function FileRow({ node, onSelect, activePath }: any) {
  const isActive = activePath === node.path;
  return (
    <div
      onClick={() => onSelect(node.path)}
      className={`flex items-center gap-2 py-1 px-1 rounded cursor-pointer ${
        isActive ? "bg-slate-100 font-medium" : "hover:bg-slate-50"
      }`}
      title={node.path}
    >
      <div className="w-4">
        <FileText size={14} />
      </div>
      <div className="truncate text-sm">{node.name}</div>
    </div>
  );
}

function FolderNode({
  node,
  level,
  expandedMap,
  toggle,
  onSelect,
  activePath,
}: any) {
  const expanded = !!expandedMap[node.path];
  return (
    <div className="pl-1">
      <div
        className={`flex items-center gap-2 py-1 cursor-pointer select-none ${
          activePath?.startsWith(node.path) ? "font-medium" : ""
        }`}
        onClick={() => toggle(node.path)}
      >
        <div className="w-4">
          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </div>
        <Folder size={16} />
        <div className="truncate">{node.name}</div>
      </div>
      {expanded && node.children && (
        <div className="pl-4 border-l border-dashed border-slate-100">
          {node.children.map((c: any) =>
            c.type === "folder" ? (
              <FolderNode
                key={c.path}
                node={c}
                level={level + 1}
                expandedMap={expandedMap}
                toggle={toggle}
                onSelect={onSelect}
                activePath={activePath}
              />
            ) : (
              <FileRow
                key={c.path}
                node={c}
                onSelect={onSelect}
                activePath={activePath}
              />
            )
          )}
        </div>
      )}
    </div>
  );
}

export default function FileTree({ tree, activePath, onSelect }: Props) {
  const [expandedMap, setExpandedMap] = useState<Record<string, boolean>>(
    () => {
      const map: Record<string, boolean> = {};
      tree.forEach((t) => {
        if (t.type === "folder") map[t.path] = true;
      });
      return map;
    }
  );

  const toggle = (p: string) => setExpandedMap((m) => ({ ...m, [p]: !m[p] }));

  return (
    <div className="p-2 text-sm">
      {tree.length === 0 ? (
        <div className="text-slate-500 text-sm p-3">
          No files under <code>/src/pages</code>
        </div>
      ) : (
        tree.map((n) =>
          n.type === "folder" ? (
            <FolderNode
              key={n.path}
              node={n}
              level={0}
              expandedMap={expandedMap}
              toggle={toggle}
              onSelect={onSelect}
              activePath={activePath}
            />
          ) : (
            <FileRow
              key={n.path}
              node={n}
              onSelect={onSelect}
              activePath={activePath}
            />
          )
        )
      )}
    </div>
  );
}
