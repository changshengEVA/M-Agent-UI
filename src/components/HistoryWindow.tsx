import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  Archive,
  ArrowUpRight,
  Bot,
  ChevronRight,
  Clock3,
  FileText,
  History,
  LoaderCircle,
  MessageSquareText,
  RefreshCw,
  Search,
  Upload,
  UserRound,
  X,
} from "lucide-react";
import { cn } from "../lib/utils";
import type {
  DialogueDetail,
  DialogueSummary,
  DialogueTurn,
  HistoryRound,
} from "../types/chat";

export type HistoryWindowTab = "current" | "stored";

export interface HistoryWindowProps {
  open: boolean;
  onClose: () => void;
  theme: "dark" | "light";
  currentRounds?: HistoryRound[];
  currentRoundCount?: number;
  currentRoundsLoading?: boolean;
  currentRoundsError?: string | null;
  dialogues?: DialogueSummary[];
  dialogueCount?: number;
  dialoguesLoading?: boolean;
  dialoguesLoadingMore?: boolean;
  dialoguesError?: string | null;
  dialoguesLoadMoreError?: string | null;
  dialoguesHasMore?: boolean;
  selectedRoundId?: string | null;
  selectedDialogueId?: string | null;
  dialogueDetail?: DialogueDetail | null;
  dialogueDetailLoading?: boolean;
  dialogueDetailError?: string | null;
  initialTab?: HistoryWindowTab;
  onSelectRound?: (round: HistoryRound) => void;
  onSelectDialogue?: (dialogue: DialogueSummary) => void;
  onOpenDialogue?: (dialogue: DialogueSummary) => void;
  onOpenDialogueUpload?: () => void;
  onLoadMoreDialogues?: () => void;
  onRefresh?: (tab: HistoryWindowTab) => void;
  dialogueUploadDisabled?: boolean;
}

const toSearchText = (value: unknown): string => String(value ?? "").toLocaleLowerCase();

const formatDateTime = (value?: string | null): string => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

const formatCompactTime = (value?: string | null): string => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

const captureTone = (state: HistoryRound["capture_state"]): string => {
  if (state === "written") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-500";
  if (state === "pending") return "border-amber-500/30 bg-amber-500/10 text-amber-500";
  return "border-zinc-500/30 bg-zinc-500/10 text-zinc-500";
};

const turnLooksLikeAssistant = (turn: DialogueTurn): boolean =>
  /assistant|agent|bot/i.test(String(turn.speaker || ""));

const EmptyState: React.FC<{
  icon: React.ReactNode;
  title: string;
  description: string;
}> = ({ icon, title, description }) => (
  <div className="flex h-full min-h-40 flex-col items-center justify-center px-6 text-center">
    <div className="mb-3 text-zinc-600">{icon}</div>
    <p className="text-[11px] font-bold uppercase tracking-widest text-zinc-500">{title}</p>
    <p className="mt-1 max-w-sm text-[10px] leading-5 text-zinc-600">{description}</p>
  </div>
);

const LoadingState: React.FC<{ label: string }> = ({ label }) => (
  <div className="flex items-center justify-center gap-2 py-8 text-[10px] text-zinc-500">
    <LoaderCircle className="h-3.5 w-3.5 animate-spin text-cyan-500" />
    {label}
  </div>
);

const ErrorState: React.FC<{ message: string }> = ({ message }) => (
  <div className="m-3 flex gap-2 rounded-sm border border-rose-500/25 bg-rose-500/5 p-3 text-[10px] leading-4 text-rose-500">
    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
    <span className="break-words">{message}</span>
  </div>
);

const MessageBlock: React.FC<{
  role: "user" | "assistant";
  label: string;
  timestamp?: string | null;
  text?: string | null;
  theme: "dark" | "light";
}> = ({ role, label, timestamp, text, theme }) => {
  const isAssistant = role === "assistant";
  return (
    <article
      className={cn(
        "rounded-sm border p-3",
        isAssistant
          ? theme === "dark"
            ? "border-cyan-950 bg-cyan-950/10"
            : "border-cyan-200 bg-cyan-50/60"
          : theme === "dark"
            ? "border-zinc-800 bg-zinc-900/40"
            : "border-zinc-200 bg-zinc-50",
      )}
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        <div
          className={cn(
            "flex min-w-0 items-center gap-1.5 text-[9px] font-bold uppercase tracking-widest",
            isAssistant ? "text-cyan-500" : "text-violet-500",
          )}
        >
          {isAssistant ? <Bot className="h-3.5 w-3.5" /> : <UserRound className="h-3.5 w-3.5" />}
          <span className="truncate">{label}</span>
        </div>
        <time className="shrink-0 text-[9px] text-zinc-600">{formatDateTime(timestamp)}</time>
      </div>
      <p
        className={cn(
          "whitespace-pre-wrap break-words text-[11px] leading-5",
          theme === "dark" ? "text-zinc-300" : "text-zinc-700",
        )}
      >
        {text || "(empty message)"}
      </p>
    </article>
  );
};

export const HistoryWindow: React.FC<HistoryWindowProps> = ({
  open,
  onClose,
  theme,
  currentRounds = [],
  currentRoundCount,
  currentRoundsLoading = false,
  currentRoundsError = null,
  dialogues = [],
  dialogueCount,
  dialoguesLoading = false,
  dialoguesLoadingMore = false,
  dialoguesError = null,
  dialoguesLoadMoreError = null,
  dialoguesHasMore = false,
  selectedRoundId,
  selectedDialogueId,
  dialogueDetail = null,
  dialogueDetailLoading = false,
  dialogueDetailError = null,
  initialTab = "current",
  onSelectRound,
  onSelectDialogue,
  onOpenDialogue,
  onOpenDialogueUpload,
  onLoadMoreDialogues,
  onRefresh,
  dialogueUploadDisabled = false,
}) => {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  const [activeTab, setActiveTab] = useState<HistoryWindowTab>(initialTab);
  const [query, setQuery] = useState("");
  const [internalRoundId, setInternalRoundId] = useState<string | null>(null);
  const [internalDialogueId, setInternalDialogueId] = useState<string | null>(null);

  const effectiveRoundId = selectedRoundId === undefined ? internalRoundId : selectedRoundId;
  const effectiveDialogueId =
    selectedDialogueId === undefined ? internalDialogueId : selectedDialogueId;

  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    setActiveTab(initialTab);
    setQuery("");
    const previousActive = document.activeElement as HTMLElement | null;
    const focusTimer = window.setTimeout(() => closeButtonRef.current?.focus(), 0);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", onKeyDown);
      previousActive?.focus?.();
    };
  }, [initialTab, open]);

  useEffect(() => {
    if (selectedRoundId !== undefined || !open) return;
    setInternalRoundId((current) =>
      current && currentRounds.some((round) => round.round_id === current)
        ? current
        : currentRounds[0]?.round_id ?? null,
    );
  }, [currentRounds, open, selectedRoundId]);

  useEffect(() => {
    if (selectedDialogueId !== undefined || !open) return;
    setInternalDialogueId((current) =>
      current && dialogues.some((dialogue) => dialogue.dialogue_id === current)
        ? current
        : dialogues[0]?.dialogue_id ?? null,
    );
  }, [dialogues, open, selectedDialogueId]);

  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filteredRounds = useMemo(() => {
    if (!normalizedQuery) return currentRounds;
    return currentRounds.filter((round) =>
      [
        round.round_id,
        round.capture_state,
        round.source,
        round.user_message,
        round.assistant_message,
      ].some((value) => toSearchText(value).includes(normalizedQuery)),
    );
  }, [currentRounds, normalizedQuery]);

  const filteredDialogues = useMemo(() => {
    if (!normalizedQuery) return dialogues;
    return dialogues.filter((dialogue) =>
      [
        dialogue.dialogue_id,
        dialogue.thread_id,
        dialogue.preview,
        dialogue.source,
        dialogue.dialogue_file,
      ].some((value) => toSearchText(value).includes(normalizedQuery)),
    );
  }, [dialogues, normalizedQuery]);

  const selectedRound = useMemo(
    () => currentRounds.find((round) => round.round_id === effectiveRoundId) ?? null,
    [currentRounds, effectiveRoundId],
  );
  const selectedDialogue = useMemo(
    () => dialogues.find((dialogue) => dialogue.dialogue_id === effectiveDialogueId) ?? null,
    [dialogues, effectiveDialogueId],
  );
  const activeDialogueDetail =
    selectedDialogue && dialogueDetail?.dialogue_id === selectedDialogue.dialogue_id
      ? dialogueDetail
      : null;

  if (!open) return null;

  const tabCount = (tab: HistoryWindowTab): number =>
    tab === "current"
      ? currentRoundCount ?? currentRounds.length
      : dialogueCount ?? dialogues.length;

  const selectRound = (round: HistoryRound) => {
    if (selectedRoundId === undefined) setInternalRoundId(round.round_id);
    onSelectRound?.(round);
  };

  const selectDialogue = (dialogue: DialogueSummary) => {
    if (selectedDialogueId === undefined) setInternalDialogueId(dialogue.dialogue_id);
    onSelectDialogue?.(dialogue);
  };

  const panelBorder = theme === "dark" ? "border-zinc-800" : "border-zinc-200";
  const mutedPanel = theme === "dark" ? "bg-[#090909]" : "bg-zinc-50";

  return (
    <div
      className="fixed inset-0 z-[10018] flex items-center justify-center bg-black/55 p-3 backdrop-blur-[2px] sm:p-5"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="history-window-title"
        className={cn(
          "flex h-[min(760px,calc(100vh-2rem))] w-full max-w-6xl flex-col overflow-hidden rounded-md border font-mono text-[11px] shadow-2xl",
          theme === "dark"
            ? "border-zinc-700 bg-[#0d0d0d] text-zinc-200 shadow-black/70"
            : "border-zinc-200 bg-white text-zinc-900 shadow-zinc-900/20",
        )}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className={cn("flex items-center justify-between gap-4 border-b px-4 py-3", panelBorder)}>
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm border border-cyan-500/25 bg-cyan-500/10 text-cyan-500">
              <History className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <h2 id="history-window-title" className="truncate text-xs font-bold uppercase tracking-[0.18em]">
                History
              </h2>
              <p className="mt-0.5 truncate text-[9px] text-zinc-600">
                Inspect thread rounds and stored dialogues without leaving the active conversation
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {onRefresh && (
              <button
                type="button"
                onClick={() => onRefresh(activeTab)}
                className={cn(
                  "rounded-sm p-2 text-zinc-500 transition-colors hover:text-cyan-500",
                  theme === "dark" ? "hover:bg-zinc-900" : "hover:bg-zinc-100",
                )}
                aria-label={`Refresh ${activeTab === "current" ? "current thread" : "stored dialogues"}`}
              >
                <RefreshCw className="h-4 w-4" />
              </button>
            )}
            <button
              ref={closeButtonRef}
              type="button"
              onClick={onClose}
              className={cn(
                "rounded-sm p-2 text-zinc-500 transition-colors hover:text-zinc-200",
                theme === "dark" ? "hover:bg-zinc-900" : "hover:bg-zinc-100 hover:text-zinc-900",
              )}
              aria-label="Close history"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        <div className={cn("flex items-center gap-1 border-b px-4", panelBorder)} role="tablist">
          {(
            [
              { id: "current" as const, label: "Current Thread", icon: History },
              { id: "stored" as const, label: "Stored Dialogues", icon: Archive },
            ]
          ).map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => {
                  setActiveTab(tab.id);
                  setQuery("");
                }}
                className={cn(
                  "relative flex items-center gap-2 px-3 py-3 text-[10px] font-bold uppercase tracking-widest transition-colors",
                  active
                    ? theme === "dark"
                      ? "text-cyan-400"
                      : "text-cyan-700"
                    : "text-zinc-600 hover:text-zinc-400",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{tab.label}</span>
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-[8px]",
                    active ? "bg-cyan-500/15 text-cyan-500" : "bg-zinc-500/10 text-zinc-600",
                  )}
                >
                  {tabCount(tab.id)}
                </span>
                {active && <span className="absolute inset-x-2 bottom-0 h-px bg-cyan-500" />}
              </button>
            );
          })}
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[minmax(250px,0.36fr)_minmax(0,1fr)]">
          <aside className={cn("flex min-h-0 flex-col border-b md:border-b-0 md:border-r", panelBorder, mutedPanel)}>
            <div className={cn("space-y-2 border-b p-3", panelBorder)}>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-600" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={activeTab === "current" ? "Search current rounds…" : "Search stored dialogues…"}
                  className={cn(
                    "h-8 w-full rounded-sm border bg-transparent pl-8 pr-8 text-[10px] outline-none transition-colors placeholder:text-zinc-600 focus:border-cyan-500/60",
                    panelBorder,
                  )}
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-zinc-600 hover:text-zinc-300"
                    aria-label="Clear search"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
              {activeTab === "stored" && onOpenDialogueUpload && (
                <button
                  type="button"
                  onClick={onOpenDialogueUpload}
                  disabled={dialogueUploadDisabled}
                  className="flex h-8 w-full items-center justify-center gap-2 rounded-sm border border-cyan-500/30 bg-cyan-500/5 text-[9px] font-bold uppercase tracking-widest text-cyan-500 transition-colors hover:bg-cyan-500/10 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Upload className="h-3.5 w-3.5" />
                  Import Dialogue JSON
                </button>
              )}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {activeTab === "current" ? (
                currentRoundsLoading ? (
                  <LoadingState label="Loading thread history…" />
                ) : currentRoundsError ? (
                  <ErrorState message={currentRoundsError} />
                ) : filteredRounds.length === 0 ? (
                  <EmptyState
                    icon={<History className="h-6 w-6" />}
                    title={normalizedQuery ? "No matches" : "No thread rounds"}
                    description={normalizedQuery ? "Try a different search term." : "Live rounds will appear here as the conversation progresses."}
                  />
                ) : (
                  <div className="space-y-1.5">
                    {filteredRounds.map((round) => {
                      const selected = effectiveRoundId === round.round_id;
                      return (
                        <button
                          key={round.round_id}
                          type="button"
                          onClick={() => selectRound(round)}
                          className={cn(
                            "group w-full rounded-sm border p-2.5 text-left transition-colors",
                            selected
                              ? "border-cyan-500/55 bg-cyan-500/10"
                              : theme === "dark"
                                ? "border-zinc-800/80 bg-zinc-950/30 hover:border-zinc-700 hover:bg-zinc-900/60"
                                : "border-zinc-200 bg-white hover:border-cyan-300 hover:bg-cyan-50/40",
                          )}
                          aria-pressed={selected}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className={cn("rounded-sm border px-1.5 py-0.5 text-[8px] font-bold uppercase", captureTone(round.capture_state))}>
                              {round.capture_state}
                            </span>
                            <span className="text-[8px] text-zinc-600">{formatCompactTime(round.user_at)}</span>
                          </div>
                          <p className={cn("mt-2 line-clamp-2 text-[10px] leading-4", theme === "dark" ? "text-zinc-300" : "text-zinc-700")}>{round.user_message || "(empty user turn)"}</p>
                          <div className="mt-2 flex items-center justify-between gap-2 text-[8px] uppercase text-zinc-600">
                            <span className="truncate">{round.source || "user"}</span>
                            <ChevronRight className={cn("h-3 w-3 shrink-0 transition-transform", selected && "translate-x-0.5 text-cyan-500")} />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )
              ) : dialoguesLoading ? (
                <LoadingState label="Loading stored dialogues…" />
              ) : dialoguesError ? (
                <ErrorState message={dialoguesError} />
              ) : filteredDialogues.length === 0 && !dialoguesHasMore ? (
                <EmptyState
                  icon={<Archive className="h-6 w-6" />}
                  title={normalizedQuery ? "No matches" : "No stored dialogues"}
                  description={normalizedQuery ? "Try a dialogue ID, thread ID, or preview text." : "Imported and archived dialogues will appear here."}
                />
              ) : (
                <div className="space-y-1.5">
                    {filteredDialogues.length === 0 ? (
                      <div className="rounded-sm border border-dashed border-zinc-500/20 px-3 py-5 text-center text-[9px] leading-relaxed text-zinc-600">
                        No matches in the loaded dialogues. Load another page to continue searching.
                      </div>
                    ) : null}
                    {filteredDialogues.map((dialogue) => {
                    const selected = effectiveDialogueId === dialogue.dialogue_id;
                    return (
                      <button
                        key={dialogue.dialogue_id}
                        type="button"
                        onClick={() => selectDialogue(dialogue)}
                        className={cn(
                          "group w-full rounded-sm border p-2.5 text-left transition-colors",
                          selected
                            ? "border-cyan-500/55 bg-cyan-500/10"
                            : theme === "dark"
                              ? "border-zinc-800/80 bg-zinc-950/30 hover:border-zinc-700 hover:bg-zinc-900/60"
                              : "border-zinc-200 bg-white hover:border-cyan-300 hover:bg-cyan-50/40",
                        )}
                        aria-pressed={selected}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-[8px] font-bold uppercase tracking-widest text-cyan-500">{dialogue.thread_id || "unknown thread"}</span>
                          <span className="shrink-0 text-[8px] text-zinc-600">{formatCompactTime(dialogue.start_time)}</span>
                        </div>
                        <p className={cn("mt-2 line-clamp-2 text-[10px] leading-4", theme === "dark" ? "text-zinc-300" : "text-zinc-700")}>{dialogue.preview || dialogue.dialogue_id}</p>
                        <div className="mt-2 flex items-center justify-between gap-2 text-[8px] uppercase text-zinc-600">
                          <span>{dialogue.round_count} rounds · {dialogue.turn_count} turns</span>
                          <ChevronRight className={cn("h-3 w-3 shrink-0 transition-transform", selected && "translate-x-0.5 text-cyan-500")} />
                        </div>
                        </button>
                      );
                    })}
                    {(dialoguesHasMore || (dialogueCount ?? dialogues.length) > dialogues.length) && (
                      <div className="space-y-1.5">
                        {dialoguesLoadMoreError ? (
                          <div className="flex items-start gap-1.5 rounded-sm border border-rose-500/25 bg-rose-500/5 px-2 py-1.5 text-[8px] leading-relaxed text-rose-500">
                            <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
                            <span className="break-words">{dialoguesLoadMoreError}</span>
                          </div>
                        ) : null}
                        <button
                          type="button"
                          onClick={onLoadMoreDialogues}
                          disabled={dialoguesLoadingMore || !onLoadMoreDialogues}
                          className={cn(
                            "flex w-full items-center justify-center gap-2 rounded-sm border border-dashed px-3 py-2.5 text-[9px] uppercase tracking-wider transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                            theme === "dark"
                              ? "border-zinc-700 text-zinc-500 hover:border-cyan-800 hover:text-cyan-400"
                              : "border-zinc-300 text-zinc-500 hover:border-cyan-300 hover:text-cyan-700",
                          )}
                        >
                          {dialoguesLoadingMore ? (
                            <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Archive className="h-3.5 w-3.5" />
                          )}
                          {dialoguesLoadingMore ? "Loading…" : "Load more"}
                          <span className="normal-case opacity-60">
                            {dialogues.length}/{dialogueCount ?? dialogues.length}
                          </span>
                        </button>
                      </div>
                    )}
                  </div>
              )}
            </div>
          </aside>

          <main className="min-h-0 overflow-y-auto">
            {activeTab === "current" ? (
              selectedRound ? (
                <div className="space-y-4 p-4 sm:p-5">
                  <div className={cn("flex flex-wrap items-start justify-between gap-3 border-b pb-4", panelBorder)}>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={cn("rounded-sm border px-1.5 py-0.5 text-[8px] font-bold uppercase", captureTone(selectedRound.capture_state))}>{selectedRound.capture_state}</span>
                        <span className="rounded-sm border border-zinc-500/20 bg-zinc-500/5 px-1.5 py-0.5 text-[8px] uppercase text-zinc-500">{selectedRound.source || "user"}</span>
                      </div>
                      <h3 className="mt-2 break-all text-xs font-bold">Round {selectedRound.round_id}</h3>
                    </div>
                    <div className="flex items-center gap-1.5 text-[9px] text-zinc-600">
                      <Clock3 className="h-3.5 w-3.5" />
                      {formatDateTime(selectedRound.user_at)}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {[
                      ["Capture", selectedRound.capture_state],
                      ["Flush", selectedRound.flush_id || "Not flushed"],
                      ["Source", selectedRound.source || "user"],
                    ].map(([label, value]) => (
                      <div key={label} className={cn("min-w-0 rounded-sm border p-2.5", panelBorder, mutedPanel)}>
                        <div className="text-[8px] uppercase tracking-widest text-zinc-600">{label}</div>
                        <div className={cn("mt-1 truncate text-[10px]", theme === "dark" ? "text-zinc-300" : "text-zinc-700")} title={value}>{value}</div>
                      </div>
                    ))}
                  </div>

                  <div className="space-y-3">
                    <MessageBlock role="user" label={selectedRound.user_turn?.speaker || "User"} timestamp={selectedRound.user_turn?.timestamp || selectedRound.user_at} text={selectedRound.user_turn?.text || selectedRound.user_message} theme={theme} />
                    <MessageBlock role="assistant" label={selectedRound.assistant_turn?.speaker || "Assistant"} timestamp={selectedRound.assistant_turn?.timestamp || selectedRound.assistant_at} text={selectedRound.assistant_turn?.text || selectedRound.assistant_message} theme={theme} />
                  </div>
                </div>
              ) : (
                <EmptyState icon={<MessageSquareText className="h-7 w-7" />} title="Select a round" description="Choose a current-thread round to inspect both sides of the exchange." />
              )
            ) : selectedDialogue ? (
              <div className="space-y-4 p-4 sm:p-5">
                <div className={cn("flex flex-wrap items-start justify-between gap-3 border-b pb-4", panelBorder)}>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-[8px] uppercase tracking-widest text-zinc-600">
                      <span className="text-cyan-500">Stored Dialogue</span>
                      {selectedDialogue.source && <span>· {selectedDialogue.source}</span>}
                    </div>
                    <h3 className="mt-2 break-all text-xs font-bold">{selectedDialogue.dialogue_id}</h3>
                    <p className="mt-1 line-clamp-2 text-[10px] leading-4 text-zinc-500">{selectedDialogue.preview || "No preview available"}</p>
                  </div>
                  {onOpenDialogue && (
                    <button
                      type="button"
                      onClick={() => onOpenDialogue(selectedDialogue)}
                      className="flex shrink-0 items-center gap-2 rounded-sm border border-cyan-500/35 bg-cyan-500/10 px-3 py-2 text-[9px] font-bold uppercase tracking-widest text-cyan-500 transition-colors hover:bg-cyan-500/20"
                      title="Open this stored dialogue in the main chat view"
                    >
                      Open in Chat
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {[
                    ["Thread", selectedDialogue.thread_id || "—"],
                    ["Started", formatDateTime(selectedDialogue.start_time)],
                    ["Rounds", String(selectedDialogue.round_count)],
                    ["Turns", String(selectedDialogue.turn_count)],
                  ].map(([label, value]) => (
                    <div key={label} className={cn("min-w-0 rounded-sm border p-2.5", panelBorder, mutedPanel)}>
                      <div className="text-[8px] uppercase tracking-widest text-zinc-600">{label}</div>
                      <div className={cn("mt-1 truncate text-[10px]", theme === "dark" ? "text-zinc-300" : "text-zinc-700")} title={value}>{value}</div>
                    </div>
                  ))}
                </div>

                {dialogueDetailLoading ? (
                  <LoadingState label="Loading dialogue transcript…" />
                ) : dialogueDetailError ? (
                  <ErrorState message={dialogueDetailError} />
                ) : activeDialogueDetail ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-widest text-zinc-500">
                        <FileText className="h-3.5 w-3.5" />
                        Transcript
                      </div>
                      {activeDialogueDetail.participants.length > 0 && (
                        <span className="max-w-[60%] truncate text-[9px] text-zinc-600" title={activeDialogueDetail.participants.join(", ")}>Participants: {activeDialogueDetail.participants.join(", ")}</span>
                      )}
                    </div>
                    {activeDialogueDetail.turns.length > 0 ? (
                      activeDialogueDetail.turns.map((turn, index) => (
                        <div key={`${turn.turn_id ?? index}-${turn.timestamp ?? index}`}>
                          <MessageBlock role={turnLooksLikeAssistant(turn) ? "assistant" : "user"} label={turn.speaker || "Unknown"} timestamp={turn.timestamp} text={turn.text} theme={theme} />
                          {(turn.blip_caption || turn.img_file || turn.img_url) && (
                            <div className="ml-3 mt-1.5 border-l border-cyan-500/30 pl-3 text-[9px] text-zinc-600">Image attachment{turn.blip_caption ? ` · ${turn.blip_caption}` : ""}</div>
                          )}
                        </div>
                      ))
                    ) : (
                      <EmptyState icon={<FileText className="h-6 w-6" />} title="Empty transcript" description="This stored dialogue has no turns." />
                    )}
                  </div>
                ) : (
                  <div className={cn("rounded-sm border border-dashed p-5 text-center", panelBorder)}>
                    <FileText className="mx-auto h-5 w-5 text-zinc-600" />
                    <p className="mt-2 text-[10px] text-zinc-500">Dialogue summary selected.</p>
                    <p className="mt-1 text-[9px] leading-4 text-zinc-600">Provide <code>dialogueDetail</code> after selection to preview the transcript here. The active chat remains unchanged.</p>
                  </div>
                )}
              </div>
            ) : (
              <EmptyState icon={<Archive className="h-7 w-7" />} title="Select a dialogue" description="Choose a stored dialogue to preview its metadata and transcript. It will not replace the active chat." />
            )}
          </main>
        </div>
      </section>
    </div>
  );
};
