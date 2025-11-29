// src/components/filetree/FileActions.tsx
import React, { useState } from "react";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import { DownloadCloud, Download } from "lucide-react";
import gsap from "gsap";

type Props = { files: Record<string, string>; activePath?: string };

export default function FileActions({ files, activePath }: Props) {
  const [zipping, setZipping] = useState(false);

  const downloadFile = async () => {
    if (!activePath || !files[activePath]) return;
    const blob = new Blob([files[activePath]], {
      type: "text/plain;charset=utf-8",
    });
    const name = activePath.replace(/\//g, "-");
    saveAs(blob, name);
    gsap.fromTo("#dl-file-btn", { scale: 0.96 }, { scale: 1, duration: 0.18 });
  };

  const downloadAll = async () => {
    setZipping(true);
    try {
      const zip = new JSZip();
      for (const p of Object.keys(files))
        zip.file(p.replace(/^\/+/, ""), files[p]);
      const blob = await zip.generateAsync({ type: "blob" });
      saveAs(blob, "pages_src.zip");
      gsap.fromTo("#dl-all-btn", { rotate: -6 }, { rotate: 0, duration: 0.22 });
    } catch (e) {
      console.error(e);
      alert("Zip failed");
    } finally {
      setZipping(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <button
        id="dl-file-btn"
        disabled={!activePath}
        onClick={downloadFile}
        className={`px-3 py-1 rounded-md flex items-center gap-2 text-sm border ${
          activePath ? "bg-white" : "opacity-50 cursor-not-allowed"
        }`}
      >
        <Download size={14} /> <span>File</span>
      </button>
      <button
        id="dl-all-btn"
        disabled={zipping || Object.keys(files).length === 0}
        onClick={downloadAll}
        className="px-3 py-1 rounded-md flex items-center gap-2 text-sm bg-sky-600 text-white"
      >
        <DownloadCloud size={14} />{" "}
        <span>{zipping ? "Preparing..." : "Download"}</span>
      </button>
    </div>
  );
}
