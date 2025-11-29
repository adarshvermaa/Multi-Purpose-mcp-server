// src/hooks/useFileSystem.ts
import { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import { io, Socket } from "socket.io-client";

export type FileMap = Record<string, string>;
export type TreeNode = {
  name: string;
  path: string;
  type: "file" | "folder";
  children?: TreeNode[];
};

export default function useFileSystem(opts?: {
  apiBase?: string;
  socketUrl?: string;
}) {
  const apiBase = opts?.apiBase ?? "";
  const socketUrl =
    opts?.socketUrl ?? (import.meta.env.DEV ? "http://localhost:4000" : "");
  const [files, setFiles] = useState<FileMap>({});
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [activePath, setActivePath] = useState<string>("");
  const socketRef = useRef<Socket | null>(null);

  const buildTreeFromFiles = useCallback((flat: FileMap): TreeNode[] => {
    const root: Record<string, any> = { children: {} };
    for (const raw of Object.keys(flat)) {
      const rel = raw.replace(/^\/+/, "");
      const parts = rel.split("/").filter(Boolean);
      let node = root;
      let cur: string[] = [];
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        cur.push(part);
        node.children = node.children ?? {};
        if (!node.children[part]) {
          const isLeaf = i === parts.length - 1;
          node.children[part] = {
            __meta: {
              name: part,
              path: cur.join("/"),
              type: isLeaf ? "file" : "folder",
            },
            children: isLeaf ? undefined : {},
          };
        }
        node = node.children[part];
      }
    }
    function convert(n: any): TreeNode[] {
      if (!n || !n.children) return [];
      return Object.keys(n.children)
        .map((k) => {
          const c = n.children[k];
          const meta = c.__meta;
          return {
            name: meta.name,
            path: meta.path,
            type: meta.type,
            children: meta.type === "folder" ? convert(c) : undefined,
          } as TreeNode;
        })
        .sort((a, b) =>
          a.type === b.type
            ? a.name.localeCompare(b.name)
            : a.type === "folder"
            ? -1
            : 1
        );
    }
    return convert(root);
  }, []);

  const loadFiles = useCallback(async () => {
    try {
      const resp = await axios.get(`${apiBase}/api/pages-files`);
      const map = resp.data.files ?? {};
      const normalized: FileMap = {};
      for (const k of Object.keys(map))
        normalized[k.replace(/^\/+/, "")] = map[k];
      setFiles(normalized);
      setTree(buildTreeFromFiles(normalized));
      setActivePath((cur) => (cur || Object.keys(normalized)[0]) ?? "");
    } catch (err) {
      console.warn("[useFileSystem] loadFiles failed", err);
      setFiles({});
      setTree([]);
      setActivePath("");
    }
  }, [apiBase, buildTreeFromFiles]);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  // socket handling: update map on file.operation and summary
  useEffect(() => {
    if (!socketUrl) return;
    const s = io(socketUrl);
    socketRef.current = s;

    const handleOp = async (payload: any) => {
      try {
        const raw = String(payload?.path ?? "");
        if (!raw) return;
        const path = raw.replace(/^\/+/, "");
        if (payload.action === "delete") {
          setFiles((prev) => {
            const cp = { ...prev };
            delete cp[path];
            setTree(buildTreeFromFiles(cp));
            setActivePath((cur) =>
              cur === path ? Object.keys(cp)[0] ?? "" : cur
            );
            return cp;
          });
        } else if (payload.action === "create" || payload.action === "update") {
          if (typeof payload.content === "string") {
            setFiles((prev) => {
              const cp = { ...prev, [path]: payload.content };
              setTree(buildTreeFromFiles(cp));
              return cp;
            });
            setActivePath((cur) => cur || path);
          } else {
            // fallback: full reload
            await loadFiles();
          }
        }
      } catch (e) {
        console.error("[useFileSystem] handleOp", e);
      }
    };

    const handleSummary = () => {
      loadFiles();
    };

    s.on("file.operation", handleOp);
    s.on("file.operations.summary", handleSummary);

    s.on("connect", () => console.log("[useFileSystem] socket connected"));
    s.on("disconnect", () =>
      console.log("[useFileSystem] socket disconnected")
    );

    return () => {
      s.off("file.operation", handleOp);
      s.off("file.operations.summary", handleSummary);
      s.disconnect();
      socketRef.current = null;
    };
  }, [socketUrl, buildTreeFromFiles, loadFiles]);

  const reload = useCallback(() => loadFiles(), [loadFiles]);

  return {
    files,
    tree,
    activePath,
    setActivePath,
    reload,
    socket: socketRef.current,
    hasFiles: Object.keys(files).length > 0,
  };
}
