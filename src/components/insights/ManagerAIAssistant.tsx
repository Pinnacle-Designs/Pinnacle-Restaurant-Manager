"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Bot,
  ChevronDown,
  ChevronRight,
  Loader2,
  MessageSquare,
  Search,
  Sparkles,
} from "lucide-react";
import { Button, Badge } from "@/components/ui";
import { cn } from "@/lib/utils";

interface DashboardCommand {
  id: string;
  label: string;
  question: string;
}

interface PromptCategory {
  id: string;
  label: string;
  promptCount: number;
}

interface ManagerAnswer {
  question: string;
  answer: string;
  categoryId: string;
  categoryLabel: string;
  confidence: "high" | "medium" | "low";
  sources: string[];
  relatedActions: string[];
  usedAI: boolean;
}

function renderAnswerText(text: string) {
  const lines = text.split("\n");
  return lines.map((line, i) => {
    const parts = line.split(/(\*\*[^*]+\*\*)/g);
    return (
      <span key={i} className="block">
        {parts.map((part, j) => {
          if (part.startsWith("**") && part.endsWith("**")) {
            return (
              <strong key={j} className="font-semibold text-slate-900">
                {part.slice(2, -2)}
              </strong>
            );
          }
          if (part.startsWith("## ")) {
            return (
              <strong key={j} className="text-base font-semibold text-slate-900">
                {part.slice(3)}
              </strong>
            );
          }
          if (part.startsWith("_") && part.endsWith("_")) {
            return (
              <em key={j} className="text-slate-500">
                {part.slice(1, -1)}
              </em>
            );
          }
          return <span key={j}>{part}</span>;
        })}
      </span>
    );
  });
}

const CONFIDENCE_COLORS = {
  high: "bg-green-100 text-green-800",
  medium: "bg-amber-100 text-amber-800",
  low: "bg-slate-100 text-slate-600",
};

export function ManagerAIAssistant() {
  const [commands, setCommands] = useState<DashboardCommand[]>([]);
  const [categories, setCategories] = useState<PromptCategory[]>([]);
  const [categoryPrompts, setCategoryPrompts] = useState<Record<string, string[]>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [customQuestion, setCustomQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [answer, setAnswer] = useState<ManagerAnswer | null>(null);
  const [activeQuestion, setActiveQuestion] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/ai/prompts")
      .then((r) => r.json())
      .then((data) => {
        setCommands(data.dashboardCommands ?? []);
        setCategories(data.categories ?? []);
      })
      .finally(() => setLoadingCatalog(false));
  }, []);

  const loadCategory = useCallback(async (id: string) => {
    if (categoryPrompts[id]) return;
    const res = await fetch(`/api/ai/prompts?category=${id}`);
    const data = await res.json();
    if (data.prompts) {
      setCategoryPrompts((prev) => ({ ...prev, [id]: data.prompts }));
    }
  }, [categoryPrompts]);

  const toggleCategory = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else {
        next.add(id);
        void loadCategory(id);
      }
      return next;
    });
  };

  const ask = async (question: string) => {
    const q = question.trim();
    if (!q) return;
    setLoading(true);
    setActiveQuestion(q);
    setAnswer(null);
    try {
      const res = await fetch("/api/ai/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
      });
      const data = await res.json();
      if (data.error) {
        setAnswer({
          question: q,
          answer: data.error,
          categoryId: "ai_commands",
          categoryLabel: "Error",
          confidence: "low",
          sources: [],
          relatedActions: [],
          usedAI: false,
        });
      } else {
        setAnswer(data);
      }
    } finally {
      setLoading(false);
    }
  };

  const [searchResults, setSearchResults] = useState<
    Array<{ question: string; categoryLabel: string }>
  >([]);

  useEffect(() => {
    if (!search.trim()) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(() => {
      fetch(`/api/ai/prompts?q=${encodeURIComponent(search)}`)
        .then((r) => r.json())
        .then((data) => {
          setSearchResults(
            (data.prompts ?? []).map((p: { question: string; categoryLabel: string }) => ({
              question: p.question,
              categoryLabel: p.categoryLabel,
            }))
          );
        });
    }, 200);
    return () => clearTimeout(timer);
  }, [search]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
            <Bot className="h-5 w-5 text-indigo-600" />
            Manager AI Assistant
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            350+ manager questions · 10 dashboard commands · powered by your live analytics
          </p>
        </div>
      </div>

      {/* Dashboard commands */}
      <div>
        <p className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-400">
          Dashboard AI
        </p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {loadingCatalog
            ? Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-10 animate-pulse rounded-lg bg-slate-100" />
              ))
            : commands.map((cmd) => (
                <button
                  key={cmd.id}
                  type="button"
                  onClick={() => ask(cmd.question)}
                  disabled={loading}
                  className={cn(
                    "rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-2 text-left text-sm font-medium text-indigo-900 transition hover:border-indigo-200 hover:bg-indigo-100 disabled:opacity-50",
                    activeQuestion === cmd.question && "ring-2 ring-indigo-400"
                  )}
                >
                  <Sparkles className="mb-1 h-3.5 w-3.5 text-indigo-500" />
                  {cmd.label}
                </button>
              ))}
        </div>
      </div>

      {/* Custom question */}
      <div className="card">
        <label className="text-sm font-medium text-slate-700">Ask anything</label>
        <div className="mt-2 flex gap-2">
          <input
            type="text"
            value={customQuestion}
            onChange={(e) => setCustomQuestion(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && ask(customQuestion)}
            placeholder="e.g. What should I focus on before dinner rush?"
            className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
          />
          <Button onClick={() => ask(customQuestion)} disabled={loading || !customQuestion.trim()}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquare className="h-4 w-4" />}
            Ask
          </Button>
        </div>
      </div>

      {/* Answer */}
      {(loading || answer) && (
        <div className="card border-l-4 border-l-indigo-500">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Analyzing {activeQuestion?.slice(0, 60)}...
            </div>
          ) : answer ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="bg-indigo-100 text-indigo-800">{answer.categoryLabel}</Badge>
                <Badge className={CONFIDENCE_COLORS[answer.confidence]}>
                  {answer.confidence} confidence
                </Badge>
                {answer.usedAI && (
                  <Badge className="bg-purple-100 text-purple-800">GPT</Badge>
                )}
              </div>
              <p className="text-xs text-slate-400">{answer.question}</p>
              <div className="space-y-0.5 text-sm leading-relaxed text-slate-700">
                {renderAnswerText(answer.answer)}
              </div>
              {answer.relatedActions.length > 0 && (
                <div className="mt-4 border-t border-slate-100 pt-3">
                  <p className="text-xs font-medium text-slate-500">Suggested actions</p>
                  <ul className="mt-1 space-y-1 text-sm text-slate-600">
                    {answer.relatedActions.map((a, i) => (
                      <li key={i}>• {a}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : null}
        </div>
      )}

      {/* Browse prompts */}
      <div className="card">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search 350+ manager prompts..."
            className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm focus:border-indigo-400 focus:outline-none"
          />
        </div>

        {searchResults.length > 0 && (
          <div className="mt-3 max-h-48 space-y-1 overflow-y-auto">
            {searchResults.map((r) => (
              <button
                key={r.question}
                type="button"
                onClick={() => ask(r.question)}
                className="block w-full rounded px-2 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-50"
              >
                <span className="text-xs text-slate-400">{r.categoryLabel} · </span>
                {r.question}
              </button>
            ))}
          </div>
        )}

        <div className="mt-4 divide-y divide-slate-100">
          {categories.map((cat) => (
            <div key={cat.id}>
              <button
                type="button"
                onClick={() => toggleCategory(cat.id)}
                className="flex w-full items-center justify-between py-3 text-left text-sm font-medium text-slate-800 hover:text-indigo-700"
              >
                <span>
                  {cat.label}
                  <span className="ml-2 text-xs font-normal text-slate-400">
                    ({cat.promptCount})
                  </span>
                </span>
                {expanded.has(cat.id) ? (
                  <ChevronDown className="h-4 w-4 text-slate-400" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-slate-400" />
                )}
              </button>
              {expanded.has(cat.id) && categoryPrompts[cat.id] && (
                <div className="pb-3 pl-2">
                  {categoryPrompts[cat.id].map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => ask(prompt)}
                      disabled={loading}
                      className="block w-full rounded px-2 py-1.5 text-left text-sm text-slate-600 hover:bg-indigo-50 hover:text-indigo-900 disabled:opacity-50"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
