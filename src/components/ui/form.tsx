"use client";

import { cn } from "@/lib/utils";

export function Input({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "w-full min-h-[44px] rounded-lg border border-slate-200 px-3 py-2.5 text-base sm:min-h-0 sm:py-2 sm:text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500",
        className
      )}
      {...props}
    />
  );
}

export function Select({
  className,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "w-full min-h-[44px] rounded-lg border border-slate-200 px-3 py-2.5 text-base sm:min-h-0 sm:py-2 sm:text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500",
        className
      )}
      {...props}
    >
      {children}
    </select>
  );
}

export function Textarea({
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "w-full min-h-[44px] rounded-lg border border-slate-200 px-3 py-2.5 text-base sm:min-h-0 sm:py-2 sm:text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500",
        className
      )}
      {...props}
    />
  );
}

interface FormFieldProps {
  label: string;
  children: React.ReactNode;
  className?: string;
}

export function FormField({ label, children, className }: FormFieldProps) {
  return (
    <div className={cn("space-y-1", className)}>
      <label className="block text-sm font-medium text-slate-700">{label}</label>
      {children}
    </div>
  );
}

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  size?: "md" | "lg" | "xl" | "full" | "fullscreen";
}

const MODAL_SIZES = {
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
  full: "max-w-5xl",
  fullscreen: "max-w-6xl",
};

export function Modal({ open, onClose, title, children, size = "md" }: ModalProps) {
  if (!open) return null;

  const fullscreen = size === "fullscreen";

  return (
    <div
      className={
        fullscreen
          ? "fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-3"
          : "fixed inset-0 z-50 flex items-center justify-center p-4"
      }
    >
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div
        className={
          fullscreen
            ? "relative flex h-[94vh] w-full flex-col rounded-t-2xl bg-white shadow-xl sm:h-[92vh] sm:max-w-6xl sm:rounded-xl"
            : `relative w-full ${MODAL_SIZES[size]} max-h-[92vh] overflow-y-auto rounded-xl bg-white shadow-xl max-sm:mx-0`
        }
      >
        <div className="flex shrink-0 items-center justify-between border-b px-4 py-3 sm:px-6 sm:py-4">
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <div
          className={
            fullscreen
              ? "flex min-h-0 flex-1 flex-col overflow-hidden px-4 py-3 sm:px-6 sm:py-4"
              : "px-4 py-4 sm:px-6"
          }
        >
          {children}
        </div>
      </div>
    </div>
  );
}
