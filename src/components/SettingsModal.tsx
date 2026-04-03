import React, { useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, Globe, Save, AlertCircle, BookOpen, ExternalLink, UserCog } from "lucide-react";
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

type SectionKey = "chat" | "memory_agent" | "memory_core";

const cleanApiUrl = (raw: string) => {
  const value = String(raw || "").trim();
  if (!value) return "";
  return value.endsWith("/") ? value.slice(0, -1) : value;
};

const parseJsonObjectOrNull = (raw: string, label: string): Record<string, any> | null => {
  const text = String(raw || "").trim();
  if (!text || text === "{}") return null;
  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch (err: any) {
    throw new Error(err?.message || `${label} is invalid JSON`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON object`);
  }
  return parsed as Record<string, any>;
};

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  apiUrl,
  onSave,
  theme,
  authUser,
  onUserUpdated,
}) => {
  const [url, setUrl] = useState(apiUrl);
  const [savingConfig, setSavingConfig] = useState(false);
  const [configMessage, setConfigMessage] = useState<string | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);

  const [chatPatchText, setChatPatchText] = useState("{}");
  const [memoryAgentPatchText, setMemoryAgentPatchText] = useState("{}");
  const [memoryCorePatchText, setMemoryCorePatchText] = useState("{}");

  React.useEffect(() => {
    setUrl(apiUrl);
  }, [apiUrl, isOpen]);

  React.useEffect(() => {
    setConfigMessage(null);
    setConfigError(null);
    setChatPatchText("{}");
    setMemoryAgentPatchText("{}");
    setMemoryCorePatchText("{}");
  }, [authUser, isOpen]);

  const editableSets = useMemo(() => {
    const editable = authUser?.editable_fields || {};
    return {
      chat: new Set<string>(editable.chat || []),
      memory_agent: new Set<string>(editable.memory_agent || []),
      memory_core: new Set<string>(editable.memory_core || []),
    };
  }, [authUser]);

  const getEditableText = (section: SectionKey) => {
    const keys = [...editableSets[section]];
    if (!keys.length) return "No editable fields in this section";
    return keys.join(", ");
  };

  const saveEndpoint = () => {
    const normalized = cleanApiUrl(url);
    onSave(normalized);
    onClose();
  };

  const openApiDocs = () => {
    window.open("/API.md", "_blank", "noopener,noreferrer");
  };

  const openSwaggerDocs = () => {
    const base = cleanApiUrl(url);
    if (!base) return;
    window.open(`${base}/docs`, "_blank", "noopener,noreferrer");
  };

  const validateSectionPatch = (
    section: SectionKey,
    patch: Record<string, any> | null,
  ): Record<string, any> | null => {
    if (!patch) return null;
    const editable = editableSets[section];
    const denied = Object.keys(patch).filter((key) => !editable.has(key));
    if (denied.length > 0) {
      throw new Error(`${section} contains non-editable keys: ${denied.join(", ")}`);
    }
    return patch;
  };

  const saveUserConfig = async () => {
    if (!authUser) return;
    setSavingConfig(true);
    setConfigMessage(null);
    setConfigError(null);
    try {
      const chatPatch = validateSectionPatch(
        "chat",
        parseJsonObjectOrNull(chatPatchText, "chat patch"),
      );
      const memoryAgentPatch = validateSectionPatch(
        "memory_agent",
        parseJsonObjectOrNull(memoryAgentPatchText, "memory_agent patch"),
      );
      const memoryCorePatch = validateSectionPatch(
        "memory_core",
        parseJsonObjectOrNull(memoryCorePatchText, "memory_core patch"),
      );

      const payload: {
        chat?: Record<string, any>;
        memory_agent?: Record<string, any>;
        memory_core?: Record<string, any>;
      } = {};
      if (chatPatch && Object.keys(chatPatch).length > 0) payload.chat = chatPatch;
      if (memoryAgentPatch && Object.keys(memoryAgentPatch).length > 0) payload.memory_agent = memoryAgentPatch;
      if (memoryCorePatch && Object.keys(memoryCorePatch).length > 0) payload.memory_core = memoryCorePatch;

      if (!payload.chat && !payload.memory_agent && !payload.memory_core) {
        throw new Error("No patch content detected. Edit at least one section.");
      }

      const res = await chatApi.updateMyConfig(payload);
      onUserUpdated?.(res.user);
      setConfigMessage("Config saved. New values will apply to subsequent runs.");
    } catch (err: any) {
      setConfigError(String(err?.message || "Failed to save user config"));
    } finally {
      setSavingConfig(false);
    }
  };

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
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            className={cn(
              "relative w-full max-w-5xl max-h-[92vh] overflow-y-auto border rounded-sm shadow-2xl",
              theme === "dark" ? "bg-[#0A0A0A] border-zinc-800" : "bg-white border-zinc-200",
            )}
          >
            <div
              className={cn(
                "sticky top-0 z-10 px-6 py-4 border-b flex items-center justify-between backdrop-blur",
                theme === "dark"
                  ? "border-zinc-800 bg-[#0A0A0A]/95"
                  : "border-zinc-100 bg-white/95",
              )}
            >
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-cyan-500" />
                <h2
                  className={cn(
                    "text-xs font-bold uppercase tracking-widest",
                    theme === "dark" ? "text-zinc-100" : "text-zinc-900",
                  )}
                >
                  Workspace Settings
                </h2>
              </div>
              <button onClick={onClose} className="p-1 hover:bg-zinc-500/10 rounded-full transition-colors">
                <X className="w-4 h-4 text-zinc-500" />
              </button>
            </div>

            <div className="p-6 grid gap-6 lg:grid-cols-2">
              <section
                className={cn(
                  "rounded-sm border p-4 space-y-4",
                  theme === "dark" ? "border-zinc-800 bg-zinc-950/40" : "border-zinc-200 bg-zinc-50/70",
                )}
              >
                <h3 className={cn("text-xs font-bold uppercase tracking-widest", theme === "dark" ? "text-zinc-200" : "text-zinc-900")}>
                  API Connection
                </h3>
                <input
                  type="text"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://your-ngrok-url.ngrok-free.app"
                  className={cn(
                    "w-full px-4 py-2.5 rounded-sm text-sm font-mono border focus:outline-none focus:ring-1 focus:ring-cyan-500/30",
                    theme === "dark" ? "bg-[#050505] border-zinc-800 text-zinc-200" : "bg-white border-zinc-200 text-zinc-900",
                  )}
                />
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={openApiDocs} className={cn("inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm border text-[10px] uppercase tracking-widest transition-colors", theme === "dark" ? "border-zinc-700 text-zinc-300 hover:text-cyan-400 hover:border-cyan-600" : "border-zinc-200 text-zinc-700 hover:text-cyan-700 hover:border-cyan-400")}>
                    <BookOpen className="w-3 h-3" />
                    API.md
                    <ExternalLink className="w-3 h-3" />
                  </button>
                  <button type="button" onClick={openSwaggerDocs} className={cn("inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm border text-[10px] uppercase tracking-widest transition-colors", theme === "dark" ? "border-zinc-700 text-zinc-300 hover:text-cyan-400 hover:border-cyan-600" : "border-zinc-200 text-zinc-700 hover:text-cyan-700 hover:border-cyan-400")}>
                    <Globe className="w-3 h-3" />
                    Swagger
                    <ExternalLink className="w-3 h-3" />
                  </button>
                </div>
                <button
                  onClick={saveEndpoint}
                  className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-[10px] font-bold uppercase tracking-widest rounded-sm transition-colors"
                >
                  <Save className="w-3 h-3" />
                  Save Endpoint
                </button>
              </section>

              <section
                className={cn(
                  "rounded-sm border p-4 space-y-4",
                  theme === "dark" ? "border-zinc-800 bg-zinc-950/40" : "border-zinc-200 bg-zinc-50/70",
                )}
              >
                <div className="flex items-center gap-2">
                  <UserCog className="w-4 h-4 text-emerald-500" />
                  <h3 className={cn("text-xs font-bold uppercase tracking-widest", theme === "dark" ? "text-zinc-200" : "text-zinc-900")}>
                    User Config
                  </h3>
                </div>

                {!authUser ? (
                  <p className="text-[11px] text-zinc-500">Login first to patch user config.</p>
                ) : (
                  <div className="space-y-4">
                    <div className={cn("rounded-sm border p-3 text-[11px]", theme === "dark" ? "border-zinc-800" : "border-zinc-200")}>
                      <div className="font-semibold">{authUser.display_name || authUser.username}</div>
                      <div className="text-zinc-500">role: {authUser.role}</div>
                    </div>

                    <div className="space-y-1">
                      <p className="text-[10px] uppercase tracking-widest text-zinc-500">chat editable</p>
                      <p className="text-[11px] text-zinc-500">{getEditableText("chat")}</p>
                      <textarea
                        value={chatPatchText}
                        onChange={(e) => setChatPatchText(e.target.value)}
                        rows={4}
                        className={cn(
                          "w-full px-3 py-2 rounded-sm text-sm font-mono border focus:outline-none focus:ring-1 focus:ring-cyan-500/30 resize-y",
                          theme === "dark" ? "bg-[#050505] border-zinc-800 text-zinc-200" : "bg-white border-zinc-200 text-zinc-900",
                        )}
                      />
                    </div>

                    <div className="space-y-1">
                      <p className="text-[10px] uppercase tracking-widest text-zinc-500">memory_agent editable</p>
                      <p className="text-[11px] text-zinc-500">{getEditableText("memory_agent")}</p>
                      <textarea
                        value={memoryAgentPatchText}
                        onChange={(e) => setMemoryAgentPatchText(e.target.value)}
                        rows={4}
                        className={cn(
                          "w-full px-3 py-2 rounded-sm text-sm font-mono border focus:outline-none focus:ring-1 focus:ring-cyan-500/30 resize-y",
                          theme === "dark" ? "bg-[#050505] border-zinc-800 text-zinc-200" : "bg-white border-zinc-200 text-zinc-900",
                        )}
                      />
                    </div>

                    <div className="space-y-1">
                      <p className="text-[10px] uppercase tracking-widest text-zinc-500">memory_core editable</p>
                      <p className="text-[11px] text-zinc-500">{getEditableText("memory_core")}</p>
                      <textarea
                        value={memoryCorePatchText}
                        onChange={(e) => setMemoryCorePatchText(e.target.value)}
                        rows={4}
                        className={cn(
                          "w-full px-3 py-2 rounded-sm text-sm font-mono border focus:outline-none focus:ring-1 focus:ring-cyan-500/30 resize-y",
                          theme === "dark" ? "bg-[#050505] border-zinc-800 text-zinc-200" : "bg-white border-zinc-200 text-zinc-900",
                        )}
                      />
                    </div>

                    <button
                      onClick={saveUserConfig}
                      disabled={savingConfig}
                      className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold uppercase tracking-widest rounded-sm transition-colors disabled:opacity-50"
                    >
                      <Save className="w-3 h-3" />
                      {savingConfig ? "Saving..." : "Apply Config Patch"}
                    </button>
                    {configMessage && <p className="text-[11px] text-emerald-500">{configMessage}</p>}
                    {configError && <p className="text-[11px] text-rose-500">{configError}</p>}
                  </div>
                )}

                <div
                  className={cn(
                    "p-3 rounded-sm border flex gap-3 items-start",
                    theme === "dark" ? "bg-cyan-500/5 border-cyan-500/20" : "bg-cyan-50 border-cyan-200",
                  )}
                >
                  <AlertCircle className="w-4 h-4 text-cyan-500 shrink-0 mt-0.5" />
                  <div className="text-[10px] text-zinc-500 leading-relaxed">
                    Use JSON object patch only. Example: <code>{'{"chat_assistant_name":"Nova"}'}</code>
                  </div>
                </div>
              </section>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
