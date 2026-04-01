import React, { useState } from "react";
import { motion } from "motion/react";
import { LogIn, UserPlus, Shield, Loader2 } from "lucide-react";
import { chatApi } from "../services/api";
import { AuthUser } from "../types/chat";
import { cn } from "../lib/utils";

interface AuthPanelProps {
  onAuthenticated: (user: AuthUser) => void;
  theme: "dark" | "light";
}

export const AuthPanel: React.FC<AuthPanelProps> = ({ onAuthenticated, theme }) => {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"basic" | "advanced">("basic");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError("请输入用户名和密码");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      if (mode === "register") {
        await chatApi.register(username.trim(), password, role);
      }
      const login = await chatApi.login(username.trim(), password);
      onAuthenticated(login.user);
    } catch (err: any) {
      setError(err?.message || "认证失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-6">
      <motion.form
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        onSubmit={submit}
        className={cn(
          "w-full max-w-md border rounded-sm p-6 backdrop-blur-md",
          theme === "dark" ? "bg-[#0A0A0A]/90 border-zinc-800" : "bg-white/90 border-zinc-200",
        )}
      >
        <div className="flex items-center gap-2 mb-5">
          <Shield className="w-4 h-4 text-cyan-500" />
          <h2 className={cn("text-sm font-bold tracking-wider uppercase", theme === "dark" ? "text-zinc-100" : "text-zinc-900")}>
            M-Agent Login
          </h2>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-4">
          <button
            type="button"
            onClick={() => setMode("login")}
            className={cn(
              "px-3 py-2 text-xs rounded-sm border transition-colors",
              mode === "login"
                ? "border-cyan-500 text-cyan-500 bg-cyan-500/10"
                : theme === "dark"
                  ? "border-zinc-700 text-zinc-400"
                  : "border-zinc-200 text-zinc-600",
            )}
          >
            登录
          </button>
          <button
            type="button"
            onClick={() => setMode("register")}
            className={cn(
              "px-3 py-2 text-xs rounded-sm border transition-colors",
              mode === "register"
                ? "border-cyan-500 text-cyan-500 bg-cyan-500/10"
                : theme === "dark"
                  ? "border-zinc-700 text-zinc-400"
                  : "border-zinc-200 text-zinc-600",
            )}
          >
            注册
          </button>
        </div>

        <div className="space-y-3">
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="用户名"
            className={cn(
              "w-full px-3 py-2 text-sm rounded-sm border focus:outline-none focus:ring-1 focus:ring-cyan-500/30",
              theme === "dark"
                ? "bg-[#050505] border-zinc-800 text-zinc-200"
                : "bg-white border-zinc-200 text-zinc-900",
            )}
          />
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            placeholder="密码（至少8位）"
            className={cn(
              "w-full px-3 py-2 text-sm rounded-sm border focus:outline-none focus:ring-1 focus:ring-cyan-500/30",
              theme === "dark"
                ? "bg-[#050505] border-zinc-800 text-zinc-200"
                : "bg-white border-zinc-200 text-zinc-900",
            )}
          />

          {mode === "register" && (
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as "basic" | "advanced")}
              className={cn(
                "w-full px-3 py-2 text-sm rounded-sm border focus:outline-none focus:ring-1 focus:ring-cyan-500/30",
                theme === "dark"
                  ? "bg-[#050505] border-zinc-800 text-zinc-200"
                  : "bg-white border-zinc-200 text-zinc-900",
              )}
            >
              <option value="basic">basic</option>
              <option value="advanced">advanced</option>
            </select>
          )}
        </div>

        {error && <p className="text-xs text-rose-400 mt-3">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="mt-5 w-full flex items-center justify-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-xs uppercase tracking-wider rounded-sm transition-colors"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : mode === "login" ? <LogIn className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
          {mode === "login" ? "登录并进入" : "注册并进入"}
        </button>
      </motion.form>
    </div>
  );
};
