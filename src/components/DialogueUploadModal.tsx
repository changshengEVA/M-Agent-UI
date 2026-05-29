import React, { useCallback, useRef, useState } from "react";
import { Upload, X, FolderOpen, FileJson, AlertCircle } from "lucide-react";
import { cn } from "../lib/utils";
import { chatApi } from "../services/api";
import type { DialogueUploadCompletePayload } from "../types/chat";

interface DialogueUploadModalProps {
  open: boolean;
  onClose: () => void;
  theme: "dark" | "light";
  onCompleted: (result: DialogueUploadCompletePayload) => void;
  onApiError?: (message: string) => void;
}

const filterJsonFiles = (list: FileList | File[]): File[] =>
  Array.from(list).filter((f) => f.name.toLowerCase().endsWith(".json"));

export const DialogueUploadModal: React.FC<DialogueUploadModalProps> = ({
  open,
  onClose,
  theme,
  onCompleted,
  onApiError,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [progressCurrent, setProgressCurrent] = useState(0);
  const [progressTotal, setProgressTotal] = useState(0);
  const [statusLine, setStatusLine] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [rebuildRag, setRebuildRag] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const resetProgress = () => {
    setProgressCurrent(0);
    setProgressTotal(0);
    setStatusLine(null);
    setLocalError(null);
  };

  const addFiles = useCallback((incoming: File[]) => {
    const jsonOnly = filterJsonFiles(incoming);
    if (!jsonOnly.length) {
      setLocalError("请选择 .json 格式的 Dialogue 文件");
      return;
    }
    setLocalError(null);
    setSelectedFiles((prev) => {
      const seen = new Set(prev.map((f) => `${f.name}:${f.size}`));
      const merged = [...prev];
      for (const file of jsonOnly) {
        const key = `${file.name}:${file.size}`;
        if (!seen.has(key)) {
          seen.add(key);
          merged.push(file);
        }
      }
      return merged;
    });
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      if (e.dataTransfer.files?.length) {
        addFiles(Array.from(e.dataTransfer.files));
      }
    },
    [addFiles],
  );

  const handleUpload = async () => {
    if (!selectedFiles.length || isUploading) return;
    setIsUploading(true);
    resetProgress();
    setStatusLine("校验并上传…");
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const result = await chatApi.uploadDialogues(selectedFiles, {
        rebuildRag,
        indexRag: true,
        signal: controller.signal,
        onEvent: (event) => {
          const payload = event?.payload || {};
          if (event.type === "upload_started") {
            setProgressTotal(Number(payload.total || 0));
            setProgressCurrent(0);
            const rejected = Number(payload.rejected_count || 0);
            if (rejected > 0) {
              setStatusLine(`已跳过 ${rejected} 个无效文件`);
            }
          }
          if (event.type === "upload_progress") {
            setProgressCurrent(Number(payload.current || 0));
            setProgressTotal(Number(payload.total || 0));
            const name = String(payload.filename || payload.dialogue_id || "");
            setStatusLine(
              payload.status === "running"
                ? `索引中 ${payload.current}/${payload.total}: ${name}`
                : payload.status === "ok"
                  ? `完成 ${payload.current}/${payload.total}: ${name}`
                  : `失败 ${payload.current}/${payload.total}: ${name}`,
            );
          }
        },
      });
      setStatusLine(`完成：成功导入 ${result.imported_count} 个 Dialogue`);
      onCompleted(result);
      setSelectedFiles([]);
      setTimeout(() => onClose(), 600);
    } catch (err: any) {
      const message = String(err?.message || "上传失败");
      setLocalError(message);
      onApiError?.(message);
    } finally {
      setIsUploading(false);
      abortRef.current = null;
    }
  };

  const handleClose = () => {
    if (isUploading) {
      abortRef.current?.abort();
    }
    setSelectedFiles([]);
    resetProgress();
    onClose();
  };

  if (!open) return null;

  const pct =
    progressTotal > 0 ? Math.min(100, Math.round((progressCurrent / progressTotal) * 100)) : isUploading ? 8 : 0;

  return (
    <div className="fixed inset-0 z-[10020] flex items-center justify-center p-4 bg-black/50" onClick={handleClose}>
      <div
        role="dialog"
        aria-label="Upload dialogues"
        className={cn(
          "w-full max-w-md rounded-md border shadow-2xl font-mono text-[11px]",
          theme === "dark" ? "bg-[#0d0d0d] border-zinc-700 text-zinc-200" : "bg-white border-zinc-200 text-zinc-900",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className={cn(
            "flex items-center justify-between px-3 py-2 border-b",
            theme === "dark" ? "border-zinc-800" : "border-zinc-200",
          )}
        >
          <span className="uppercase tracking-widest text-[10px] text-cyan-500">Import Dialogues</span>
          <button type="button" onClick={handleClose} className="p-1 rounded hover:bg-zinc-800/50" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-3 space-y-3">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            className={cn(
              "border border-dashed rounded-sm p-4 text-center transition-colors",
              dragOver
                ? "border-cyan-500 bg-cyan-500/10"
                : theme === "dark"
                  ? "border-zinc-700 bg-zinc-950/40"
                  : "border-zinc-300 bg-zinc-50",
            )}
          >
            <Upload className="w-6 h-6 mx-auto mb-2 text-cyan-500/80" />
            <p className="text-[10px] text-zinc-500 mb-2">拖放 .json 文件或文件夹到此处</p>
            <div className="flex flex-wrap gap-2 justify-center">
              <button
                type="button"
                disabled={isUploading}
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1 px-2 py-1 rounded border border-cyan-500/40 text-cyan-400 hover:bg-cyan-500/10 disabled:opacity-50"
              >
                <FileJson className="w-3 h-3" />
                选择文件
              </button>
              <button
                type="button"
                disabled={isUploading}
                onClick={() => folderInputRef.current?.click()}
                className="inline-flex items-center gap-1 px-2 py-1 rounded border border-zinc-600 text-zinc-400 hover:bg-zinc-800/40 disabled:opacity-50"
              >
                <FolderOpen className="w-3 h-3" />
                选择文件夹
              </button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files) addFiles(Array.from(e.target.files));
                e.target.value = "";
              }}
            />
            <input
              ref={folderInputRef}
              type="file"
              multiple
              className="hidden"
              {...({ webkitdirectory: "", directory: "" } as React.InputHTMLAttributes<HTMLInputElement>)}
              onChange={(e) => {
                if (e.target.files) addFiles(Array.from(e.target.files));
                e.target.value = "";
              }}
            />
          </div>

          <label className="flex items-center gap-2 text-[10px] text-zinc-500 cursor-pointer">
            <input
              type="checkbox"
              checked={rebuildRag}
              disabled={isUploading}
              onChange={(e) => setRebuildRag(e.target.checked)}
              className="accent-cyan-500"
            />
            导入前清空并重建情景记忆索引（rebuild RAG）
          </label>

          {selectedFiles.length > 0 && (
            <div
              className={cn(
                "max-h-28 overflow-y-auto rounded border p-2 space-y-1",
                theme === "dark" ? "border-zinc-800" : "border-zinc-200",
              )}
            >
              {selectedFiles.map((f) => (
                <div key={`${f.name}-${f.size}`} className="flex justify-between gap-2 text-[10px] text-zinc-400">
                  <span className="truncate">{f.name}</span>
                  <span>{(f.size / 1024).toFixed(1)} KB</span>
                </div>
              ))}
            </div>
          )}

          {isUploading && (
            <div className="space-y-1">
              <div className="flex justify-between text-[9px] text-zinc-500 uppercase">
                <span>索引进度</span>
                <span>
                  {progressCurrent}/{progressTotal || "—"}
                </span>
              </div>
              <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                <div className="h-full bg-cyan-500 transition-all duration-300" style={{ width: `${pct}%` }} />
              </div>
              {statusLine && <p className="text-[10px] text-zinc-500">{statusLine}</p>}
            </div>
          )}

          {(localError || statusLine) && !isUploading && localError && (
            <div className="flex items-start gap-2 text-rose-400 text-[10px]">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>{localError}</span>
            </div>
          )}
        </div>

        <div
          className={cn(
            "flex justify-end gap-2 px-3 py-2 border-t",
            theme === "dark" ? "border-zinc-800" : "border-zinc-200",
          )}
        >
          <button
            type="button"
            onClick={handleClose}
            disabled={isUploading}
            className="px-3 py-1 rounded text-zinc-500 hover:text-zinc-300 disabled:opacity-50"
          >
            取消
          </button>
          <button
            type="button"
            disabled={!selectedFiles.length || isUploading}
            onClick={handleUpload}
            className="px-3 py-1 rounded bg-cyan-500/20 border border-cyan-500/40 text-cyan-400 hover:bg-cyan-500/30 disabled:opacity-50"
          >
            {isUploading ? "导入中…" : `导入并索引 (${selectedFiles.length})`}
          </button>
        </div>
      </div>
    </div>
  );
};
