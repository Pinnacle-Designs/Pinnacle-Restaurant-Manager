"use client";

import { useState } from "react";
import { format } from "date-fns";
import { Button } from "@/components/ui";
import { FormField, Modal, Select, Textarea } from "@/components/ui/form";

export type FeedbackKind = "NOTE" | "SHOUT_OUT" | "COACHING";

export interface ShiftFeedbackTarget {
  staffMemberId: string;
  staffName: string;
  shiftId?: string;
  shiftLabel?: string;
}

interface ShiftFeedbackModalProps {
  open: boolean;
  onClose: () => void;
  target: ShiftFeedbackTarget | null;
  onSaved?: () => void;
}

const KIND_OPTIONS: { value: FeedbackKind; label: string; placeholder: string }[] = [
  { value: "SHOUT_OUT", label: "Shout-out", placeholder: "Great hustle on the floor tonight — guests loved your energy." },
  { value: "NOTE", label: "Performance note", placeholder: "Handled a difficult table calmly; follow up on upsell training." },
  { value: "COACHING", label: "Coaching note", placeholder: "Remind about sidework checklist before clock-out." },
];

export function ShiftFeedbackModal({ open, onClose, target, onSaved }: ShiftFeedbackModalProps) {
  const [kind, setKind] = useState<FeedbackKind>("SHOUT_OUT");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setKind("SHOUT_OUT");
    setContent("");
    setError(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSave = async () => {
    if (!target || !content.trim()) {
      setError("Write a short note or shout-out.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/retention/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          staffMemberId: target.staffMemberId,
          shiftId: target.shiftId,
          kind,
          content: content.trim(),
        }),
      });
      if (!res.ok) {
        const json = await res.json();
        setError(json.error || "Could not save feedback.");
        return;
      }
      onSaved?.();
      handleClose();
    } finally {
      setSaving(false);
    }
  };

  const placeholder = KIND_OPTIONS.find((o) => o.value === kind)?.placeholder ?? "";

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={target ? `Feedback for ${target.staffName}` : "Shift feedback"}
    >
      {target && (
        <div className="space-y-4">
          {target.shiftLabel && (
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
              Shift: {target.shiftLabel}
            </p>
          )}
          <FormField label="Type">
            <Select value={kind} onChange={(e) => setKind(e.target.value as FeedbackKind)}>
              {KIND_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Message">
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={4}
              placeholder={placeholder}
              autoFocus
            />
          </FormField>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={handleClose}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : "Save to profile"}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

export function formatShiftLabel(shift: {
  date: string | Date;
  startTime: string;
  endTime: string;
  workRole?: string | null;
}) {
  const d = typeof shift.date === "string" ? new Date(shift.date) : shift.date;
  const role = shift.workRole ? ` · ${shift.workRole}` : "";
  return `${format(d, "EEE MMM d")} · ${shift.startTime}–${shift.endTime}${role}`;
}
