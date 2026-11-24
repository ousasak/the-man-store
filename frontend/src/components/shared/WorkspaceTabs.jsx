import React from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

/**
 * Global Modular Workspace Tabs
 * Provides smooth tab navigation with active underline/pill animation and optional badge counters.
 *
 * @param {Object} props
 * @param {Array<{id: string, label: string, icon?: any, count?: number|string, disabled?: boolean}>} props.tabs
 * @param {string} props.activeTab
 * @param {(id: string) => void} props.onChange
 * @param {string} [props.className]
 * @param {"underline"|"pills"|"boxed"} [props.variant="underline"]
 */
export default function WorkspaceTabs({
  tabs = [],
  activeTab,
  onChange,
  className,
  variant = "underline",
}) {
  if (!tabs || tabs.length === 0) return null;

  return (
    <div
      role="tablist"
      className={cn(
        "relative flex items-center gap-1 overflow-x-auto scrollbar-hide select-none",
        variant === "underline" && "border-b border-border/80 px-1",
        variant === "pills" && "rounded-xl bg-muted/60 p-1 border border-border/60",
        variant === "boxed" && "rounded-xl border border-border bg-card p-1 shadow-xs",
        className
      )}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab;
        const Icon = tab.icon;

        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            disabled={tab.disabled}
            onClick={() => !tab.disabled && onChange?.(tab.id)}
            className={cn(
              "group relative flex items-center gap-2 whitespace-nowrap text-sm font-semibold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-40",
              variant === "underline" && "px-4 py-3 -mb-px text-muted-foreground hover:text-foreground",
              variant === "underline" && isActive && "text-[color:var(--admin-primary,#C59B27)] font-bold",
              variant === "pills" && "rounded-lg px-3.5 py-1.5 text-xs text-muted-foreground hover:text-foreground",
              variant === "pills" && isActive && "bg-[color:var(--admin-primary,#C59B27)] text-white shadow-xs font-bold",
              variant === "boxed" && "rounded-lg px-4 py-2 text-xs text-muted-foreground hover:text-foreground",
              variant === "boxed" && isActive && "bg-muted text-foreground font-bold shadow-xs border border-border/80"
            )}
          >
            {Icon && (
              <Icon
                className={cn(
                  "h-4 w-4 shrink-0 transition-colors",
                  isActive
                    ? variant === "pills" ? "text-white" : "text-[color:var(--admin-primary,#C59B27)]"
                    : "text-muted-foreground group-hover:text-foreground"
                )}
                aria-hidden
              />
            )}

            <span>{tab.label}</span>

            {tab.count !== undefined && tab.count !== null && (
              <span
                className={cn(
                  "ml-1 inline-flex items-center justify-center rounded-full px-2 py-0.5 text-[11px] font-bold transition-colors",
                  isActive
                    ? variant === "pills"
                      ? "bg-white/20 text-white"
                      : "bg-[color:var(--admin-primary,#C59B27)]/15 text-[color:var(--admin-primary,#C59B27)] border border-[color:var(--admin-primary,#C59B27)]/30"
                    : "bg-muted text-muted-foreground group-hover:bg-muted/80"
                )}
              >
                {tab.count}
              </span>
            )}

            {/* Active underline indicator for "underline" variant */}
            {variant === "underline" && isActive && (
              <motion.div
                layoutId="workspace-tabs-active-indicator"
                className="absolute bottom-0 left-0 right-0 h-[2.5px] rounded-t-full bg-[color:var(--admin-primary,#C59B27)] shadow-xs"
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
