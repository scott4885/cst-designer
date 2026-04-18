"use client";

import { Calendar, Sparkles, LayoutTemplate } from "lucide-react";
import { Button } from "@/components/ui/button";

interface EmptyStateProps {
  officeName: string;
  onGenerate: () => void;
  onSelectTemplate: () => void;
  isGenerating: boolean;
}

export default function EmptyState({
  officeName,
  onGenerate,
  onSelectTemplate,
  isGenerating,
}: EmptyStateProps) {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center max-w-sm px-6">
        {/* Illustration */}
        <div className="mx-auto w-16 h-16 rounded-2xl bg-blue-50 flex items-center justify-center mb-5">
          <Calendar className="w-8 h-8 text-blue-600" />
        </div>

        <h2 className="text-lg font-semibold text-slate-800 mb-2">
          Start building your schedule
        </h2>
        <p className="text-sm text-slate-500 mb-6 leading-relaxed">
          Generate an optimized schedule template for {officeName}, or start from a preset template.
        </p>

        {/* Actions */}
        <div className="flex flex-col gap-2.5">
          <Button
            onClick={onGenerate}
            disabled={isGenerating}
            className="w-full h-10 gap-2 bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
          >
            <Sparkles className="w-4 h-4" />
            Generate Schedule
          </Button>
          <Button
            variant="outline"
            onClick={onSelectTemplate}
            className="w-full h-10 gap-2 text-slate-500 hover:text-slate-700 border-border/60"
          >
            <LayoutTemplate className="w-4 h-4" />
            Choose a Starter Template
          </Button>
        </div>

        <p className="text-[11px] text-slate-300 mt-4">
          The schedule engine uses your office&apos;s providers, goals, and block types to build an optimal template.
        </p>
      </div>
    </div>
  );
}
