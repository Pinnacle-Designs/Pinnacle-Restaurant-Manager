"use client";

import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { BookOpen, CheckCircle2, ChevronRight } from "lucide-react";
import { Button, EmptyState } from "@/components/ui";
import { Input, FormField, Modal } from "@/components/ui/form";
import { cn } from "@/lib/utils";

interface MyModule {
  id: string;
  title: string;
  summary: string;
  kind: string;
  estimatedMinutes: number;
  required: boolean;
  completed: boolean;
  needsRenewal: boolean;
  completedAt: string | null;
  expiresAt: string | null;
}

interface MyCert {
  id: string;
  certLabel: string;
  expiresAt: string | null;
  level: string;
}

export function MyTrainingPanel() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<{
    staffMember: { name: string; role: string };
    modules: MyModule[];
    certifications: MyCert[];
    pendingModules: MyModule[];
  } | null>(null);
  const [activeModuleId, setActiveModuleId] = useState<string | null>(null);
  const [moduleContent, setModuleContent] = useState<{
    title: string;
    content: string;
    summary: string;
  } | null>(null);
  const [signatureName, setSignatureName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/training/my");
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || "Failed to load");
      }
      const json = await res.json();
      setData(json);
      setSignatureName(json.staffMember?.name ?? "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openModule = async (id: string) => {
    setActiveModuleId(id);
    setError(null);
    const res = await fetch(`/api/training/modules/${id}`);
    const json = await res.json();
    if (!res.ok) {
      setError(json.error);
      return;
    }
    setModuleContent({ title: json.title, content: json.content, summary: json.summary });
  };

  const completeModule = async () => {
    if (!activeModuleId || !signatureName.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/training/modules/${activeModuleId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signatureName: signatureName.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setActiveModuleId(null);
      setModuleContent(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not submit");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p className="text-center text-slate-500 py-6">Loading your training…</p>;
  }

  if (error && !data) {
    return (
      <EmptyState
        icon={<BookOpen className="h-12 w-12" />}
        title="Training unavailable"
        description={error}
      />
    );
  }

  if (!data) return null;

  const pending = data.modules.filter((m) => m.needsRenewal);

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        Complete required compliance modules and keep certifications current. Signed completions are
        tracked for audits.
      </p>

      {pending.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-900">
            {pending.length} module{pending.length > 1 ? "s" : ""} due
          </p>
          <ul className="mt-2 space-y-2">
            {pending.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => openModule(m.id)}
                  className="flex w-full items-center justify-between rounded-lg bg-white px-3 py-2 text-left text-sm hover:border-orange-300 border"
                >
                  <span>{m.title}</span>
                  <ChevronRight className="h-4 w-4 text-slate-400" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-800">All modules</h3>
        <ul className="divide-y rounded-xl border bg-white">
          {data.modules.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => openModule(m.id)}
                className="flex w-full items-center gap-3 p-4 text-left text-sm hover:bg-slate-50"
              >
                {m.completed ? (
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600" />
                ) : (
                  <BookOpen className="h-5 w-5 shrink-0 text-slate-400" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-slate-900">{m.title}</p>
                  <p className="text-xs text-slate-500">
                    ~{m.estimatedMinutes} min
                    {m.completedAt && ` · Done ${format(new Date(m.completedAt), "MMM d, yyyy")}`}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-slate-300" />
              </button>
            </li>
          ))}
        </ul>
      </div>

      {data.certifications.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-slate-800">My certifications on file</h3>
          <ul className="divide-y rounded-xl border bg-white text-sm">
            {data.certifications.map((c) => (
              <li key={c.id} className="flex items-center justify-between p-3">
                <span>{c.certLabel}</span>
                <span
                  className={cn(
                    "text-xs font-medium",
                    c.level === "EXPIRED" && "text-red-600",
                    c.level === "EXPIRING" && "text-amber-600",
                    c.level === "OK" && "text-green-600"
                  )}
                >
                  {c.expiresAt ? format(new Date(c.expiresAt), "MMM d, yyyy") : "No expiry"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Modal
        open={!!activeModuleId && !!moduleContent}
        onClose={() => {
          setActiveModuleId(null);
          setModuleContent(null);
        }}
        title={moduleContent?.title ?? "Training"}
      >
        {moduleContent && (
          <div className="space-y-4 max-h-[60vh] overflow-y-auto">
            <p className="text-sm text-slate-600">{moduleContent.summary}</p>
            <div className="prose prose-sm max-w-none whitespace-pre-wrap text-slate-800">
              {moduleContent.content}
            </div>
            <FormField label="Type your full name to sign off">
              <Input value={signatureName} onChange={(e) => setSignatureName(e.target.value)} />
            </FormField>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button className="w-full" disabled={saving || !signatureName.trim()} onClick={completeModule}>
              I have read and understand — sign & complete
            </Button>
          </div>
        )}
      </Modal>
    </div>
  );
}
