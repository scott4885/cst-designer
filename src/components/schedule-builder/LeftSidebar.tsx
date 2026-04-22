"use client";

import { useState } from "react";
import { PanelLeftClose, PanelLeft, Layers, Users, LayoutTemplate } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import BlockPalettePanel from "./BlockPalettePanel";
import ProviderList from "./ProviderList";
import TemplatePicker from "./TemplatePicker";
import type { BlockTypeInput } from "@/lib/engine/types";

interface LeftSidebarProps {
  blockTypes: BlockTypeInput[];
  providers: Array<{
    id: string;
    name: string;
    role: string;
    color: string;
    operatories?: string[];
    disabled?: boolean;
  }>;
  hasSchedule: boolean;
  onSelectTemplate?: (templateId: string) => void;
  onProviderVisibilityChange?: (providerId: string, visible: boolean) => void;
  /** Office id — enables the "+ Add Provider" footer link in the providers panel. */
  officeId?: string;
}

type SidebarTab = "blocks" | "providers" | "templates";

export default function LeftSidebar({
  blockTypes,
  providers,
  hasSchedule,
  onSelectTemplate,
  onProviderVisibilityChange,
  officeId,
}: LeftSidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState<SidebarTab>("blocks");

  if (collapsed) {
    return (
      <div className="flex-shrink-0 w-12 border-r border-border/40 bg-slate-50 flex flex-col items-center py-2 gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setCollapsed(false)}
              aria-label="Expand sidebar"
            >
              <PanelLeft className="w-4 h-4" aria-hidden="true" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">Expand sidebar</TooltipContent>
        </Tooltip>

        <div className="w-8 h-px bg-border/40 my-1" />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={activeTab === "blocks" ? "secondary" : "ghost"}
              size="icon"
              className="h-8 w-8"
              onClick={() => { setActiveTab("blocks"); setCollapsed(false); }}
              aria-label="Open block palette"
            >
              <Layers className="w-4 h-4" aria-hidden="true" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">Block Palette</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={activeTab === "providers" ? "secondary" : "ghost"}
              size="icon"
              className="h-8 w-8"
              onClick={() => { setActiveTab("providers"); setCollapsed(false); }}
              aria-label="Open providers panel"
            >
              <Users className="w-4 h-4" aria-hidden="true" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">Providers</TooltipContent>
        </Tooltip>

        {!hasSchedule && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={activeTab === "templates" ? "secondary" : "ghost"}
                size="icon"
                className="h-8 w-8"
                onClick={() => { setActiveTab("templates"); setCollapsed(false); }}
                aria-label="Open templates panel"
              >
                <LayoutTemplate className="w-4 h-4" aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Templates</TooltipContent>
          </Tooltip>
        )}
      </div>
    );
  }

  return (
    <div className="flex-shrink-0 w-60 border-r border-border/40 bg-slate-50 flex flex-col min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/30">
        <div className="flex items-center gap-1">
          {(["blocks", "providers", ...(hasSchedule ? [] : ["templates"])] as SidebarTab[]).map(
            (tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`px-2 py-1 text-[11px] font-medium rounded transition-all ${
                  activeTab === tab
                    ? "bg-white text-slate-800 shadow-sm"
                    : "text-slate-600 hover:text-slate-800"
                }`}
              >
                {tab === "blocks" ? "Blocks" : tab === "providers" ? "Providers" : "Templates"}
              </button>
            )
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-slate-600 hover:text-slate-800"
          onClick={() => setCollapsed(true)}
          aria-label="Collapse sidebar"
        >
          <PanelLeftClose className="w-3.5 h-3.5" aria-hidden="true" />
        </Button>
      </div>

      {/* Content */}
      <div
        className="flex-1 min-h-0 overflow-y-auto px-3 py-2"
        tabIndex={0}
        role="region"
        aria-label="Schedule builder sidebar panel"
      >
        {activeTab === "blocks" && (
          <BlockPalettePanel blockTypes={blockTypes} />
        )}
        {activeTab === "providers" && (
          <ProviderList
            providers={providers}
            onVisibilityChange={onProviderVisibilityChange}
            officeId={officeId}
          />
        )}
        {activeTab === "templates" && (
          <TemplatePicker onSelect={onSelectTemplate} />
        )}
      </div>
    </div>
  );
}
