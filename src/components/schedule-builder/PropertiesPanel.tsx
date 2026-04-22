"use client";

import { useState, useMemo } from "react";
import {
  X,
  Trash2,
  Clock,
  DollarSign,
  AlertTriangle,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { BlockTypeInput } from "@/lib/engine/types";

export interface SelectedBlock {
  time: string;
  providerId: string;
  providerName: string;
  blockTypeId: string;
  blockLabel: string;
  durationSlots: number;
  timeIncrement: number;
  customProductionAmount?: number | null;
}

export interface ProductionSummaryData {
  providerName: string;
  providerColor: string;
  dailyGoal: number;
  actualScheduled: number;
  highProductionScheduled: number;
}

interface PropertiesPanelProps {
  selectedBlock: SelectedBlock | null;
  blockTypes: BlockTypeInput[];
  productionSummaries: ProductionSummaryData[];
  warnings: string[];
  onClose: () => void;
  onDelete: (time: string, providerId: string) => void;
  onUpdate: (
    time: string,
    providerId: string,
    newBlockType: BlockTypeInput,
    newDurationSlots: number,
    customProductionAmount?: number | null
  ) => void;
}

export default function PropertiesPanel({
  selectedBlock,
  blockTypes,
  productionSummaries,
  warnings,
  onClose,
  onDelete,
  onUpdate,
}: PropertiesPanelProps) {
  const [editingProduction, setEditingProduction] = useState(false);
  const [productionValue, setProductionValue] = useState("");

  // Find block type for the selected block
  const currentBlockType = useMemo(() => {
    if (!selectedBlock) return null;
    return blockTypes.find((bt) => bt.id === selectedBlock.blockTypeId) ?? null;
  }, [selectedBlock, blockTypes]);

  const durationMinutes = selectedBlock
    ? selectedBlock.durationSlots * selectedBlock.timeIncrement
    : 0;

  const handleTypeChange = (newTypeId: string) => {
    if (!selectedBlock) return;
    const newType = blockTypes.find((bt) => bt.id === newTypeId);
    if (!newType) return;
    const newDuration = Math.ceil((newType.durationMin ?? 30) / selectedBlock.timeIncrement);
    onUpdate(selectedBlock.time, selectedBlock.providerId, newType, newDuration);
  };

  const handleDurationChange = (newSlots: number) => {
    if (!selectedBlock || !currentBlockType) return;
    onUpdate(
      selectedBlock.time,
      selectedBlock.providerId,
      currentBlockType,
      newSlots,
      selectedBlock.customProductionAmount
    );
  };

  const handleProductionSave = () => {
    if (!selectedBlock || !currentBlockType) return;
    const val = parseFloat(productionValue);
    if (isNaN(val) || val < 0) return;
    onUpdate(
      selectedBlock.time,
      selectedBlock.providerId,
      currentBlockType,
      selectedBlock.durationSlots,
      val
    );
    setEditingProduction(false);
  };

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
    }).format(amount);

  return (
    <div className="flex-shrink-0 w-[280px] border-l border-border/40 bg-slate-50 flex flex-col min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/30">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
          Properties
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-slate-600 hover:text-slate-800"
          onClick={onClose}
          aria-label="Close properties panel"
        >
          <X className="w-3.5 h-3.5" aria-hidden="true" />
        </Button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {/* Block Details */}
        {selectedBlock && currentBlockType ? (
          <div className="px-4 py-3 space-y-4">
            {/* Block info header */}
            <div>
              <h3 className="text-sm font-semibold text-slate-800">
                {selectedBlock.blockLabel}
              </h3>
              <p className="text-[11px] text-slate-600 mt-0.5">
                {selectedBlock.providerName} at {selectedBlock.time}
              </p>
            </div>

            {/* Type selector */}
            <div className="space-y-1.5">
              <Label className="text-[11px] font-medium text-slate-500">Block Type</Label>
              <Select value={selectedBlock.blockTypeId} onValueChange={handleTypeChange}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {blockTypes.map((bt) => (
                    <SelectItem key={bt.id} value={bt.id} className="text-xs">
                      {bt.label}
                      {bt.minimumAmount ? ` ($${bt.minimumAmount})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Duration */}
            <div className="space-y-1.5">
              <Label className="text-[11px] font-medium text-slate-500">Duration</Label>
              <div className="flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-slate-600" aria-hidden="true" />
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-7 w-7 text-xs"
                    onClick={() => handleDurationChange(Math.max(1, selectedBlock.durationSlots - 1))}
                    disabled={selectedBlock.durationSlots <= 1}
                    aria-label="Decrease block duration"
                  >
                    -
                  </Button>
                  <span className="text-xs font-medium text-slate-700 w-12 text-center">
                    {durationMinutes}min
                  </span>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-7 w-7 text-xs"
                    onClick={() => handleDurationChange(selectedBlock.durationSlots + 1)}
                    aria-label="Increase block duration"
                  >
                    +
                  </Button>
                </div>
              </div>
            </div>

            {/* Production value */}
            <div className="space-y-1.5">
              <Label className="text-[11px] font-medium text-slate-500">Production Value</Label>
              {editingProduction ? (
                <div className="flex items-center gap-1.5">
                  <div className="relative flex-1">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-600 text-xs">$</span>
                    <Input
                      type="number"
                      value={productionValue}
                      onChange={(e) => setProductionValue(e.target.value)}
                      className="h-8 text-xs pl-5"
                      min={0}
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleProductionSave();
                        if (e.key === "Escape") setEditingProduction(false);
                      }}
                    />
                  </div>
                  <Button size="sm" className="h-8 text-xs px-2" onClick={handleProductionSave}>
                    OK
                  </Button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setProductionValue(
                      String(selectedBlock.customProductionAmount ?? currentBlockType.minimumAmount ?? 0)
                    );
                    setEditingProduction(true);
                  }}
                  className="flex items-center gap-1.5 text-xs text-slate-700 hover:text-blue-600 transition-colors"
                >
                  <DollarSign className="w-3.5 h-3.5 text-emerald-500" />
                  {formatCurrency(
                    selectedBlock.customProductionAmount ?? currentBlockType.minimumAmount ?? 0
                  )}
                  <span className="text-[11px] text-slate-600">(click to edit)</span>
                </button>
              )}
            </div>

            {/* D-time / A-time breakdown */}
            {currentBlockType.dTimeMin != null && currentBlockType.aTimeMin != null && (
              <div className="space-y-1.5">
                <Label className="text-[11px] font-medium text-slate-500">Time Breakdown</Label>
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-white rounded-md px-2.5 py-1.5 border border-border/30">
                    <p className="text-[11px] font-medium text-slate-600">D-time</p>
                    <p className="text-xs font-semibold text-slate-700">
                      {currentBlockType.dTimeMin}min
                    </p>
                  </div>
                  <div className="bg-white rounded-md px-2.5 py-1.5 border border-border/30">
                    <p className="text-[11px] font-medium text-slate-600">A-time</p>
                    <p className="text-xs font-semibold text-slate-700">
                      {currentBlockType.aTimeMin}min
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Delete button */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => onDelete(selectedBlock.time, selectedBlock.providerId)}
              className="w-full h-8 text-xs text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300 gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete Block
            </Button>
          </div>
        ) : (
          <div className="px-4 py-6 text-center">
            <p className="text-xs text-slate-600">Click a block on the grid to view its properties.</p>
          </div>
        )}

        {/* Separator */}
        <div className="h-px bg-border/30 mx-4" />

        {/* Production Summary */}
        <div className="px-4 py-3 space-y-2">
          <div className="flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5 text-slate-500" />
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              Production Summary
            </span>
          </div>

          {productionSummaries.length > 0 ? (
            <div className="space-y-2">
              {productionSummaries.map((ps, i) => {
                const pct = ps.dailyGoal > 0 ? Math.round((ps.actualScheduled / ps.dailyGoal) * 100) : 0;
                const isAtGoal = pct >= 100;
                const isNear = pct >= 75;

                return (
                  <div key={i} className="bg-white rounded-lg px-3 py-2 border border-border/30">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-1.5">
                        <span
                          className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{ backgroundColor: ps.providerColor }}
                        />
                        <span className="text-[11px] font-medium text-slate-700 truncate max-w-[120px]">
                          {ps.providerName}
                        </span>
                      </div>
                      <span
                        className={`text-[11px] font-bold ${
                          isAtGoal
                            ? "text-emerald-600"
                            : isNear
                              ? "text-amber-600"
                              : "text-red-500"
                        }`}
                      >
                        {pct}%
                      </span>
                    </div>
                    {/* Progress bar */}
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          isAtGoal
                            ? "bg-emerald-500"
                            : isNear
                              ? "bg-amber-400"
                              : "bg-red-400"
                        }`}
                        style={{ width: `${Math.min(pct, 100)}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-[11px] font-medium text-slate-700">
                        {formatCurrency(ps.actualScheduled)}
                      </span>
                      <span className="text-[11px] text-slate-600">
                        Goal: {formatCurrency(ps.dailyGoal)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-[11px] text-slate-600">Generate a schedule to see production data.</p>
          )}
        </div>

        {/* Separator */}
        <div className="h-px bg-border/30 mx-4" />

        {/* Warnings */}
        {warnings.length > 0 && (
          <div className="px-4 py-3 space-y-2">
            <div className="flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                Warnings ({warnings.length})
              </span>
            </div>
            <div className="space-y-1">
              {warnings.slice(0, 5).map((w, i) => (
                <div
                  key={i}
                  className="text-[11px] text-amber-700 bg-amber-50 rounded px-2 py-1.5 border border-amber-100"
                >
                  {w}
                </div>
              ))}
              {warnings.length > 5 && (
                <p className="text-[11px] text-slate-600">
                  +{warnings.length - 5} more warnings
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
