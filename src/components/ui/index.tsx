import { cn } from "@/lib/utils";

export { PageHeader } from "@/components/ui/PageHeader";
export { PrintButton } from "@/components/ui/PrintButton";
export { ScrollableTabs, TabPill } from "@/components/ui/ScrollableTabs";
export {
  CollapsibleSection,
  CollapsibleGroup,
  CollapsibleGroupControls,
} from "@/components/ui/Collapsible";
export type { CollapsibleDefaultExpanded } from "@/components/ui/Collapsible";
export { PageSectionShell, PageSection } from "@/components/layout/PageSections";

interface StatCardProps {
  label: string;
  value: string | number;
  subtext?: string;
  trend?: "up" | "down" | "neutral";
  className?: string;
}

export function StatCard({ label, value, subtext, className }: StatCardProps) {
  return (
    <div className={cn("card min-w-0", className)}>
      <p className="truncate text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-2 truncate text-2xl font-bold text-slate-900 sm:text-3xl">{value}</p>
      {subtext && <p className="mt-1 truncate text-xs text-slate-400">{subtext}</p>}
    </div>
  );
}

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md" | "lg";
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  children,
  ...props
}: ButtonProps) {
  const variants = {
    primary: "bg-orange-500 text-white hover:bg-orange-600 shadow-sm",
    secondary: "bg-slate-100 text-slate-700 hover:bg-slate-200",
    danger: "bg-red-500 text-white hover:bg-red-600",
    ghost: "text-slate-600 hover:bg-slate-100",
  };
  const sizes = {
    sm: "min-h-[40px] px-3 py-2 text-sm sm:min-h-0",
    md: "min-h-[44px] px-4 py-2.5 text-sm sm:min-h-0",
    lg: "min-h-[48px] px-6 py-3 text-base sm:min-h-0",
  };

  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:opacity-50",
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

interface BadgeProps {
  children: React.ReactNode;
  className?: string;
}

export function Badge({ children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        className
      )}
    >
      {children}
    </span>
  );
}

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed bg-white py-16 text-center">
      {icon && <div className="mb-4 text-slate-300">{icon}</div>}
      <h3 className="text-lg font-semibold text-slate-700">{title}</h3>
      {description && (
        <p className="mt-2 max-w-sm text-sm text-slate-500">{description}</p>
      )}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
