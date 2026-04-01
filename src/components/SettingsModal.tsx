import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, Globe, Save, AlertCircle, BookOpen, ExternalLink } from "lucide-react";
import { cn } from "../lib/utils";
import { chatApi } from "../services/api";
import { AuthUser } from "../types/chat";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  apiUrl: string;
  onSave: (url: string) => void;
  theme: "dark" | "light";
  authUser?: AuthUser | null;
  onUserUpdated?: (user: AuthUser) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  apiUrl,
  onSave,
  theme,
  authUser,
  onUserUpdated
}) => {
  const [url, setUrl] = useState(apiUrl);
  const [assistantName, setAssistantName] = useState("");
  const [personaPrompt, setPersonaPrompt] = useState("");
  const [savingConfig, setSavingConfig] = useState(false);
  const [configMessage, setConfigMessage] = useState<string | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);

  React.useEffect(() => {
    setUrl(apiUrl);
  }, [apiUrl, isOpen]);

  React.useEffect(() => {
    setAssistantName("");
    setPersonaPrompt("");
    setConfigMessage(null);
    setConfigError(null);
  }, [authUser, isOpen]);

  const handleSave = () => {
    // Basic validation: ensure it starts with http/https and has no trailing slash
    let cleanUrl = url.trim();
    if (cleanUrl.endsWith("/")) {
      cleanUrl = cleanUrl.slice(0, -1);
    }
    onSave(cleanUrl);
    onClose();
  };

  const cleanApiUrl = (raw: string) => {
    const value = String(raw || "").trim();
    if (!value) return "";
    return value.endsWith("/") ? value.slice(0, -1) : value;
  };

  const openApiDocs = () => {
    window.open("/API.md", "_blank", "noopener,noreferrer");
  };

  const openSwaggerDocs = () => {
    const base = cleanApiUrl(url);
    if (!base) return;
    window.open(`${base}/docs`, "_blank", "noopener,noreferrer");
  };

  const handleSaveUserConfig = async () => {
    if (!authUser) return;
    const editable = authUser.editable_fields?.chat || [];
    const patch: Record<string, any> = {};
    if (editable.includes("chat_assistant_name") && assistantName.trim()) {
      patch.chat_assistant_name = assistantName.trim();
    }
    if (editable.includes("chat_persona_prompt") && personaPrompt.trim()) {
      patch.chat_persona_prompt = personaPrompt.trim();
    }
    if (Object.keys(patch).length === 0) {
      setConfigError("当前用户没有可编辑的前端配置项，或你还没输入修改内容。");
      setConfigMessage(null);
      return;
    }
    setSavingConfig(true);
    setConfigError(null);
    setConfigMessage(null);
    try {
      const res = await chatApi.updateMyConfig({ chat: patch });
      onUserUpdated?.(res.user);
      setConfigMessage("用户配置已保存，新的聊天设置会在后续会话生效。");
    } catch (err: any) {
      setConfigError(err?.message || "保存用户配置失败");
    } finally {
      setSavingConfig(false);
    }
  };

  const canEditChatAssistantName = Boolean(authUser?.editable_fields?.chat?.includes("chat_assistant_name"));
  const canEditPersona = Boolean(authUser?.editable_fields?.chat?.includes("chat_persona_prompt"));

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className={cn(
              "relative w-full max-w-md border rounded-sm shadow-2xl overflow-hidden",
              theme === "dark" ? "bg-[#0A0A0A] border-zinc-800" : "bg-white border-zinc-200"
            )}
          >
            {/* Header */}
            <div className={cn(
              "px-6 py-4 border-b flex items-center justify-between",
              theme === "dark" ? "border-zinc-800" : "border-zinc-100"
            )}>
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-cyan-500" />
                <h2 className={cn(
                  "text-xs font-bold uppercase tracking-widest",
                  theme === "dark" ? "text-zinc-100" : "text-zinc-900"
                )}>Terminal Settings</h2>
              </div>
              <button 
                onClick={onClose}
                className="p-1 hover:bg-zinc-500/10 rounded-full transition-colors"
              >
                <X className="w-4 h-4 text-zinc-500" />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">
                  Agent API Endpoint
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://your-ngrok-url.ngrok-free.dev"
                    className={cn(
                      "w-full px-4 py-2.5 rounded-sm text-sm font-mono border focus:outline-none focus:ring-1 focus:ring-cyan-500/30 transition-all",
                      theme === "dark" 
                        ? "bg-[#050505] border-zinc-800 text-zinc-200 focus:border-cyan-500/50" 
                        : "bg-zinc-50 border-zinc-200 text-zinc-900 focus:border-cyan-500/50"
                    )}
                  />
                </div>
                <p className="text-[10px] text-zinc-500 leading-relaxed italic">
                  The URL of your M-Agent backend. If using ngrok, ensure the tunnel is active.
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    onClick={openApiDocs}
                    className={cn(
                      "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm border text-[10px] uppercase tracking-widest transition-colors",
                      theme === "dark"
                        ? "border-zinc-700 text-zinc-300 hover:text-cyan-400 hover:border-cyan-600"
                        : "border-zinc-200 text-zinc-700 hover:text-cyan-700 hover:border-cyan-400"
                    )}
                  >
                    <BookOpen className="w-3 h-3" />
                    API.md
                    <ExternalLink className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    onClick={openSwaggerDocs}
                    className={cn(
                      "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm border text-[10px] uppercase tracking-widest transition-colors",
                      theme === "dark"
                        ? "border-zinc-700 text-zinc-300 hover:text-cyan-400 hover:border-cyan-600"
                        : "border-zinc-200 text-zinc-700 hover:text-cyan-700 hover:border-cyan-400"
                    )}
                  >
                    <Globe className="w-3 h-3" />
                    Swagger
                    <ExternalLink className="w-3 h-3" />
                  </button>
                </div>
              </div>

              {authUser && (
                <div className="space-y-3">
                  <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">
                    User Config ({authUser.username} / {authUser.role})
                  </label>
                  <input
                    type="text"
                    value={assistantName}
                    onChange={(e) => setAssistantName(e.target.value)}
                    placeholder="Assistant Name"
                    disabled={!canEditChatAssistantName}
                    className={cn(
                      "w-full px-4 py-2.5 rounded-sm text-sm border focus:outline-none focus:ring-1 focus:ring-cyan-500/30 transition-all disabled:opacity-50",
                      theme === "dark"
                        ? "bg-[#050505] border-zinc-800 text-zinc-200 focus:border-cyan-500/50"
                        : "bg-zinc-50 border-zinc-200 text-zinc-900 focus:border-cyan-500/50"
                    )}
                  />
                  <textarea
                    value={personaPrompt}
                    onChange={(e) => setPersonaPrompt(e.target.value)}
                    placeholder="Persona Prompt (optional)"
                    disabled={!canEditPersona}
                    rows={4}
                    className={cn(
                      "w-full px-4 py-2.5 rounded-sm text-sm border focus:outline-none focus:ring-1 focus:ring-cyan-500/30 transition-all disabled:opacity-50 resize-y",
                      theme === "dark"
                        ? "bg-[#050505] border-zinc-800 text-zinc-200 focus:border-cyan-500/50"
                        : "bg-zinc-50 border-zinc-200 text-zinc-900 focus:border-cyan-500/50"
                    )}
                  />
                  <div className="flex items-center justify-between gap-3">
                    <button
                      onClick={handleSaveUserConfig}
                      disabled={savingConfig}
                      className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold uppercase tracking-widest rounded-sm transition-colors disabled:opacity-50"
                    >
                      <Save className="w-3 h-3" />
                      {savingConfig ? "Saving..." : "Save User Config"}
                    </button>
                    {configMessage && <span className="text-[10px] text-emerald-500">{configMessage}</span>}
                    {configError && <span className="text-[10px] text-rose-500">{configError}</span>}
                  </div>
                </div>
              )}

              <div className={cn(
                "p-3 rounded-sm border flex gap-3 items-start",
                theme === "dark" ? "bg-cyan-500/5 border-cyan-500/20" : "bg-cyan-50 border-cyan-200"
              )}>
                <AlertCircle className="w-4 h-4 text-cyan-500 shrink-0 mt-0.5" />
                <div className="text-[10px] text-zinc-500 leading-relaxed">
                  <span className="font-bold text-cyan-500 uppercase block mb-1">Connection Tip</span>
                  If you encounter "Network Error", visit the API URL directly in a new tab to bypass the ngrok browser warning once.
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className={cn(
              "px-6 py-4 border-t flex justify-end gap-3",
              theme === "dark" ? "bg-zinc-900/30 border-zinc-800" : "bg-zinc-50 border-zinc-100"
            )}>
              <button
                onClick={onClose}
                className={cn(
                  "px-4 py-2 text-[10px] font-bold uppercase tracking-widest rounded-sm transition-colors",
                  theme === "dark" ? "text-zinc-400 hover:text-zinc-200" : "text-zinc-500 hover:text-zinc-700"
                )}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-[10px] font-bold uppercase tracking-widest rounded-sm shadow-lg shadow-cyan-500/20 transition-all active:scale-95"
              >
                <Save className="w-3 h-3" />
                Save Changes
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
