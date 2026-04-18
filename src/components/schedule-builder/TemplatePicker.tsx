"use client";

import { Building2, Users, Building } from "lucide-react";

interface Template {
  id: string;
  label: string;
  description: string;
  icon: typeof Building2;
  providers: string;
}

const TEMPLATES: Template[] = [
  {
    id: "small",
    label: "Small Office",
    description: "1 doctor, 2 hygienists, 4 operatories",
    icon: Building2,
    providers: "1D / 2H",
  },
  {
    id: "medium",
    label: "Medium Office",
    description: "1 doctor, 3 hygienists, 5 operatories",
    icon: Users,
    providers: "1D / 3H",
  },
  {
    id: "large",
    label: "Large Office",
    description: "2+ doctors, 3+ hygienists, 6+ operatories",
    icon: Building,
    providers: "2D / 3H+",
  },
];

interface TemplatePickerProps {
  onSelect?: (templateId: string) => void;
}

export default function TemplatePicker({ onSelect }: TemplatePickerProps) {
  return (
    <div className="space-y-3">
      <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">
        Starter Templates
      </p>
      <p className="text-[11px] text-slate-500 leading-relaxed">
        Choose a template that matches your office size. You can customize everything after.
      </p>

      <div className="space-y-2">
        {TEMPLATES.map((template) => {
          const Icon = template.icon;
          return (
            <button
              key={template.id}
              type="button"
              onClick={() => onSelect?.(template.id)}
              className="w-full text-left p-3 rounded-lg border border-border/40 bg-white hover:border-blue-600/30
                hover:shadow-sm transition-all duration-150 group"
            >
              <div className="flex items-start gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0 group-hover:bg-blue-100 transition-colors">
                  <Icon className="w-4 h-4 text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-slate-700 group-hover:text-blue-600 transition-colors">
                    {template.label}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    {template.description}
                  </p>
                  <span className="inline-block mt-1 text-[9px] font-medium text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-full">
                    {template.providers}
                  </span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
