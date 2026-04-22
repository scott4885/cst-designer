"use client";

import { useState } from "react";
import Link from "next/link";
import { Eye, EyeOff, Plus } from "lucide-react";

interface Provider {
  id: string;
  name: string;
  role: string;
  color: string;
  operatories?: string[];
  disabled?: boolean;
}

interface ProviderListProps {
  providers: Provider[];
  onVisibilityChange?: (providerId: string, visible: boolean) => void;
  /** When provided, renders an "+ Add Provider" footer button linking to the office edit page. */
  officeId?: string;
}

export default function ProviderList({
  providers,
  onVisibilityChange,
  officeId,
}: ProviderListProps) {
  const [hiddenProviders, setHiddenProviders] = useState<Set<string>>(new Set());

  const toggleVisibility = (id: string) => {
    setHiddenProviders((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        onVisibilityChange?.(id, true);
      } else {
        next.add(id);
        onVisibilityChange?.(id, false);
      }
      return next;
    });
  };

  // Group by role
  const doctors = providers.filter((p) => p.role === "DOCTOR");
  const hygienists = providers.filter((p) => p.role === "HYGIENIST");
  const others = providers.filter(
    (p) => p.role !== "DOCTOR" && p.role !== "HYGIENIST"
  );

  const renderGroup = (label: string, group: Provider[]) => {
    if (group.length === 0) return null;
    return (
      <div key={label} className="mb-3">
        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
          {label}
        </p>
        <div className="space-y-0.5">
          {group.map((p) => {
            const isHidden = hiddenProviders.has(p.id);
            // Strip virtual ID suffix for display
            const displayName = p.name;
            const ops = p.operatories?.join(", ") || "";

            return (
              <div
                key={p.id}
                className={`flex items-center gap-2 px-2 py-1.5 rounded-md transition-all group cursor-default ${
                  p.disabled
                    ? "opacity-40"
                    : isHidden
                      ? "opacity-50"
                      : "hover:bg-white/80"
                }`}
              >
                {/* Color dot */}
                <span
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0 ring-1 ring-black/5"
                  style={{ backgroundColor: p.color }}
                />
                {/* Name + ops */}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-slate-700 truncate">
                    {displayName}
                  </p>
                  {ops && (
                    <p className="text-[10px] text-slate-600 truncate">
                      {ops}
                    </p>
                  )}
                </div>
                {/* Visibility toggle */}
                {!p.disabled && (
                  <button
                    type="button"
                    onClick={() => toggleVisibility(p.id)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5"
                    title={isHidden ? "Show column" : "Hide column"}
                  >
                    {isHidden ? (
                      <EyeOff className="w-3 h-3 text-slate-600" aria-hidden="true" />
                    ) : (
                      <Eye className="w-3 h-3 text-slate-700" aria-hidden="true" />
                    )}
                  </button>
                )}
                {/* OFF badge */}
                {p.disabled && (
                  <span className="text-[10px] font-semibold text-slate-700 bg-slate-200 px-1.5 py-0.5 rounded">
                    OFF
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div>
      <p className="text-[10px] text-slate-600 font-medium uppercase tracking-wider mb-3">
        {providers.length} provider{providers.length !== 1 ? "s" : ""} today
      </p>
      {renderGroup("Doctors", doctors)}
      {renderGroup("Hygienists", hygienists)}
      {renderGroup("Other", others)}
      {officeId && (
        <div className="mt-2 pt-2 border-t border-slate-200">
          <Link
            href={`/offices/${officeId}/edit`}
            className="flex items-center justify-center gap-1.5 w-full px-2 py-1.5 rounded-md text-xs font-medium text-slate-600 hover:text-slate-800 hover:bg-white/80 transition-colors"
            title="Manage providers (opens office edit page)"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            Add Provider
          </Link>
        </div>
      )}
    </div>
  );
}
