import React, { useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, Globe, Save, AlertCircle, BookOpen, ExternalLink, UserCog } from "lucide-react";
import { cn } from "../lib/utils";
import { chatApi } from "../services/api";
import { AuthUser, UserConfigSchemaResponse } from "../types/chat";

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
type SectionDrafts = Record<SectionKey, Record<string, string>>;

interface EditableFieldView {
  key: string;
  type: string;
  description: string;
  present: boolean;
  currentValue: any;
}

const SECTION_KEYS: SectionKey[] = ["chat", "memory_agent", "memory_core"];
const SECTION_LABELS: Record<SectionKey, string> = {
  chat: "chat",
  memory_agent: "memory_agent",
  memory_core: "memory_core",
};

const emptyDrafts = (): SectionDrafts => ({
  chat: {},
  memory_agent: {},
  memory_core: {},
});

const cleanApiUrl = (raw: string) => {
  const value = String(raw || "").trim();
  if (!value) return "";
  return value.endsWith("/") ? value.slice(0, -1) : value;
};

const toRawDraft = (value: any, fieldType: string): string => {
  if (fieldType === "boolean") {
    return value ? "true" : "false";
  }
  if (fieldType === "number" || fieldType === "integer") {
    if (value === null || value === undefined) return "";
    return String(value);
  }
  if (fieldType === "string") {
    if (value === null || value === undefined) return "";
    return String(value);
  }
  if (value === undefined) return "";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

const parseFieldValue = (raw: string, fieldType: string, fieldPath: string): any => {
  const text = String(raw ?? "");
  const trimmed = text.trim();

  if (fieldType === "string") {
    return text;
  }
  if (fieldType === "boolean") {
    const normalized = trimmed.toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
    throw new Error(`${fieldPath} must be true or false`);
  }
  if (fieldType === "number") {
    if (!trimmed) throw new Error(`${fieldPath} must be a number`);
    const value = Number(trimmed);
    if (!Number.isFinite(value)) throw new Error(`${fieldPath} must be a finite number`);
    return value;
  }
  if (fieldType === "integer") {
    if (!trimmed) throw new Error(`${fieldPath} must be an integer`);
    const value = Number(trimmed);
    if (!Number.isInteger(value)) throw new Error(`${fieldPath} must be an integer`);
    return value;
  }

  if (!trimmed) {
    throw new Error(`${fieldPath} requires valid JSON`);
  }
  let parsed: any;
  try {
    parsed = JSON.parse(trimmed);
  } catch (err: any) {
    throw new Error(`${fieldPath} JSON parse failed: ${err?.message || "invalid JSON"}`);
  }
  if (fieldType === "array[string]") {
    if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string")) {
      throw new Error(`${fieldPath} must be a JSON string array`);
    }
  }
  return parsed;
};

const isJsonLikeField = (fieldType: string) => {
  return fieldType !== "string" && fieldType !== "boolean" && fieldType !== "number" && fieldType !== "integer";
};

const isLongTextField = (fieldKey: string) => {
  return fieldKey.includes("prompt") || fieldKey.includes("defaults");
};

const formatCurrentValue = (value: any): string => {
  if (value === undefined) return "<unset>";
  if (typeof value === "string") return value || '""';
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const createDraftsFromSchema = (schema: UserConfigSchemaResponse): SectionDrafts => {
  const drafts = emptyDrafts();
  for (const section of SECTION_KEYS) {
    const sectionSchema = schema.sections?.[section];
    const editableKeys = sectionSchema?.editable_fields || [];
    for (const key of editableKeys) {
      const field = sectionSchema?.fields?.[key];
      drafts[section][key] = toRawDraft(field?.current_value, String(field?.type || "string"));
    }
  }
  return drafts;
};

const createDraftsFromAuth = (authUser?: AuthUser | null): SectionDrafts => {
  const drafts = emptyDrafts();
  if (!authUser) return drafts;
  const editable = authUser.editable_fields || {};
  for (const section of SECTION_KEYS) {
    const keys = editable[section] || [];
    for (const key of keys) {
      drafts[section][key] = "";
    }
  }
  return drafts;
};

const deepEqual = (left: any, right: any) => JSON.stringify(left) === JSON.stringify(right);

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
  const [configSchema, setConfigSchema] = useState<UserConfigSchemaResponse | null>(null);
  const [schemaLoading, setSchemaLoading] = useState(false);
  const [schemaError, setSchemaError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<SectionDrafts>(emptyDrafts());

  React.useEffect(() => {
    setUrl(apiUrl);
  }, [apiUrl, isOpen]);

  React.useEffect(() => {
    setConfigMessage(null);
    setConfigError(null);
    setSchemaError(null);
    if (!authUser || !isOpen) {
      setDrafts(emptyDrafts());
    }
  }, [authUser, isOpen]);

  React.useEffect(() => {
    if (!isOpen || !authUser) {
      setConfigSchema(null);
      setSchemaLoading(false);
      return;
    }

    let cancelled = false;
    setSchemaLoading(true);
    setSchemaError(null);

    chatApi
      .getMyConfigSchema()
      .then((payload) => {
        if (cancelled) return;
        setConfigSchema(payload);
        setDrafts(createDraftsFromSchema(payload));
      })
      .catch((err: any) => {
        if (cancelled) return;
        setConfigSchema(null);
        setSchemaError(String(err?.message || "Failed to load config schema"));
        setDrafts(createDraftsFromAuth(authUser));
      })
      .finally(() => {
        if (!cancelled) setSchemaLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [authUser?.username, authUser?.updated_at, isOpen]);

  const editableKeys = useMemo(() => {
    if (configSchema?.sections) {
      return {
        chat: configSchema.sections.chat?.editable_fields || [],
        memory_agent: configSchema.sections.memory_agent?.editable_fields || [],
        memory_core: configSchema.sections.memory_core?.editable_fields || [],
      };
    }
    const editable = authUser?.editable_fields || {};
    return {
      chat: editable.chat || [],
      memory_agent: editable.memory_agent || [],
      memory_core: editable.memory_core || [],
    };
  }, [authUser, configSchema]);

  const fieldsBySection = useMemo<Record<SectionKey, EditableFieldView[]>>(() => {
    const result: Record<SectionKey, EditableFieldView[]> = {
      chat: [],
      memory_agent: [],
      memory_core: [],
    };
    for (const section of SECTION_KEYS) {
      const keys = editableKeys[section] || [];
      result[section] = keys.map((key) => {
        const field = configSchema?.sections?.[section]?.fields?.[key];
        return {
          key,
          type: String(field?.type || "string"),
          description: String(field?.description || ""),
          present: Boolean(field?.present),
          currentValue: field?.current_value,
        };
      });
    }
    return result;
  }, [configSchema, editableKeys]);

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

  const setDraftValue = (section: SectionKey, key: string, value: string) => {
    setDrafts((prev) => ({
      ...prev,
      [section]: {
        ...prev[section],
        [key]: value,
      },
    }));
  };

  const saveUserConfig = async () => {
    if (!authUser) return;
    setSavingConfig(true);
    setConfigMessage(null);
    setConfigError(null);
    try {
      const payload: {
        chat?: Record<string, any>;
        memory_agent?: Record<string, any>;
        memory_core?: Record<string, any>;
      } = {};

      for (const section of SECTION_KEYS) {
        const sectionPatch: Record<string, any> = {};
        for (const field of fieldsBySection[section]) {
          const raw = drafts[section]?.[field.key] ?? "";
          if (!configSchema && raw.trim() === "") continue;
          const parsedValue = parseFieldValue(raw, field.type, `${section}.${field.key}`);
          if (configSchema && deepEqual(parsedValue, field.currentValue)) continue;
          sectionPatch[field.key] = parsedValue;
        }

        if (Object.keys(sectionPatch).length <= 0) continue;
        if (section === "chat") payload.chat = sectionPatch;
        if (section === "memory_agent") payload.memory_agent = sectionPatch;
        if (section === "memory_core") payload.memory_core = sectionPatch;
      }

      if (!payload.chat && !payload.memory_agent && !payload.memory_core) {
        throw new Error("No effective change detected. Modify at least one field.");
      }

      const res = await chatApi.updateMyConfig(payload);
      onUserUpdated?.(res.user);
      try {
        const schema = await chatApi.getMyConfigSchema();
        setConfigSchema(schema);
        setDrafts(createDraftsFromSchema(schema));
      } catch {
        // fallback to editable fields only
      }
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
                <h3
                  className={cn(
                    "text-xs font-bold uppercase tracking-widest",
                    theme === "dark" ? "text-zinc-200" : "text-zinc-900",
                  )}
                >
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
                  <button
                    type="button"
                    onClick={openApiDocs}
                    className={cn(
                      "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm border text-[10px] uppercase tracking-widest transition-colors",
                      theme === "dark"
                        ? "border-zinc-700 text-zinc-300 hover:text-cyan-400 hover:border-cyan-600"
                        : "border-zinc-200 text-zinc-700 hover:text-cyan-700 hover:border-cyan-400",
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
                        : "border-zinc-200 text-zinc-700 hover:text-cyan-700 hover:border-cyan-400",
                    )}
                  >
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
                  <h3
                    className={cn(
                      "text-xs font-bold uppercase tracking-widest",
                      theme === "dark" ? "text-zinc-200" : "text-zinc-900",
                    )}
                  >
                    User Config
                  </h3>
                </div>

                {!authUser ? (
                  <p className="text-[11px] text-zinc-500">Login first to patch user config.</p>
                ) : (
                  <div className="space-y-4">
                    {schemaLoading && <p className="text-[11px] text-zinc-500">Loading config schema...</p>}
                    {schemaError && (
                      <p className="text-[11px] text-amber-500">
                        Schema unavailable, editable fields fallback is active: {schemaError}
                      </p>
                    )}
                    <div
                      className={cn(
                        "rounded-sm border p-3 text-[11px]",
                        theme === "dark" ? "border-zinc-800" : "border-zinc-200",
                      )}
                    >
                      <div className="font-semibold">{authUser.display_name || authUser.username}</div>
                      <div className="text-zinc-500">role: {authUser.role}</div>
                    </div>

                    {SECTION_KEYS.map((section) => {
                      const fields = fieldsBySection[section];
                      return (
                        <div key={section} className="space-y-2 rounded-sm border p-3 border-zinc-700/40">
                          <p className="text-[10px] uppercase tracking-widest text-zinc-500">
                            {SECTION_LABELS[section]} editable
                          </p>
                          {!fields.length ? (
                            <p className="text-[11px] text-zinc-500">No editable fields in this section.</p>
                          ) : (
                            <div className="space-y-3">
                              {fields.map((field) => {
                                const rawValue = drafts[section]?.[field.key] ?? "";
                                const renderTextarea = isJsonLikeField(field.type) || isLongTextField(field.key);
                                return (
                                  <div key={`${section}.${field.key}`} className="space-y-1">
                                    <div className="flex items-center justify-between gap-2">
                                      <p className="text-[11px] font-semibold">{field.key}</p>
                                      <span className="text-[10px] text-zinc-500">{field.type}</span>
                                    </div>
                                    {field.description && (
                                      <p className="text-[11px] text-zinc-500">{field.description}</p>
                                    )}
                                    {configSchema && (
                                      <p className="text-[11px] text-zinc-500">
                                        current: {field.present ? formatCurrentValue(field.currentValue) : "<unset>"}
                                      </p>
                                    )}

                                    {field.type === "boolean" ? (
                                      <select
                                        value={rawValue.toLowerCase() === "true" ? "true" : "false"}
                                        onChange={(e) => setDraftValue(section, field.key, e.target.value)}
                                        className={cn(
                                          "w-full px-3 py-2 rounded-sm text-sm border focus:outline-none focus:ring-1 focus:ring-cyan-500/30",
                                          theme === "dark"
                                            ? "bg-[#050505] border-zinc-800 text-zinc-200"
                                            : "bg-white border-zinc-200 text-zinc-900",
                                        )}
                                      >
                                        <option value="true">true</option>
                                        <option value="false">false</option>
                                      </select>
                                    ) : renderTextarea ? (
                                      <textarea
                                        value={rawValue}
                                        onChange={(e) => setDraftValue(section, field.key, e.target.value)}
                                        rows={isJsonLikeField(field.type) ? 4 : 3}
                                        className={cn(
                                          "w-full px-3 py-2 rounded-sm text-sm font-mono border focus:outline-none focus:ring-1 focus:ring-cyan-500/30 resize-y",
                                          theme === "dark"
                                            ? "bg-[#050505] border-zinc-800 text-zinc-200"
                                            : "bg-white border-zinc-200 text-zinc-900",
                                        )}
                                      />
                                    ) : (
                                      <input
                                        type={field.type === "number" || field.type === "integer" ? "number" : "text"}
                                        step={field.type === "number" ? "any" : field.type === "integer" ? "1" : undefined}
                                        value={rawValue}
                                        onChange={(e) => setDraftValue(section, field.key, e.target.value)}
                                        className={cn(
                                          "w-full px-3 py-2 rounded-sm text-sm border focus:outline-none focus:ring-1 focus:ring-cyan-500/30",
                                          theme === "dark"
                                            ? "bg-[#050505] border-zinc-800 text-zinc-200"
                                            : "bg-white border-zinc-200 text-zinc-900",
                                        )}
                                      />
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}

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
                    Fields are typed automatically from server schema. Object and array fields use JSON inputs.
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
