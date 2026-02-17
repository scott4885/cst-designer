"use client";

import { useState, useEffect } from "react";
import { Download, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  transformToOpenDental,
  loadProviderMappings,
  saveProviderMappings,
  loadBlockTypeMappings,
  saveBlockTypeMappings,
  ProviderMapping,
  BlockTypeMapping,
} from "@/lib/export/open-dental";
import type { GenerationResult, ProviderInput, BlockTypeInput } from "@/lib/engine/types";

interface OpenDentalExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  officeId: string;
  officeName: string;
  schedule: GenerationResult;
  providers: ProviderInput[];
  blockTypes: BlockTypeInput[];
  schedDate?: string;
  timeIncrement?: number;
}

export default function OpenDentalExportDialog({
  open,
  onOpenChange,
  officeId,
  officeName,
  schedule,
  providers,
  blockTypes,
  schedDate,
  timeIncrement = 10,
}: OpenDentalExportDialogProps) {
  const [providerMappings, setProviderMappings] = useState<ProviderMapping[]>([]);
  const [blockTypeMappings, setBlockTypeMappings] = useState<BlockTypeMapping[]>([]);
  const [isExporting, setIsExporting] = useState(false);

  // Load persisted mappings when dialog opens
  useEffect(() => {
    if (!open) return;

    const savedProviders = loadProviderMappings(officeId);
    const savedBlockTypes = loadBlockTypeMappings(officeId);

    // Merge: keep saved values, add any new providers/block types
    const pMappings: ProviderMapping[] = providers.map((p) => ({
      providerId: p.id,
      providerName: p.name,
      provNum: savedProviders.find((s) => s.providerId === p.id)?.provNum ?? "",
    }));

    const btMappings: BlockTypeMapping[] = blockTypes.map((bt) => ({
      blockTypeId: bt.id,
      blockTypeLabel: bt.label,
      defNum: savedBlockTypes.find((s) => s.blockTypeId === bt.id)?.defNum ?? "",
    }));

    setProviderMappings(pMappings);
    setBlockTypeMappings(btMappings);
  }, [open, officeId, providers, blockTypes]);

  const handleProvNumChange = (idx: number, value: string) => {
    setProviderMappings((prev) =>
      prev.map((m, i) => (i === idx ? { ...m, provNum: value } : m))
    );
  };

  const handleDefNumChange = (idx: number, value: string) => {
    setBlockTypeMappings((prev) =>
      prev.map((m, i) => (i === idx ? { ...m, defNum: value } : m))
    );
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      // Persist mappings
      saveProviderMappings(officeId, providerMappings);
      saveBlockTypeMappings(officeId, blockTypeMappings);

      const date =
        schedDate ??
        new Date().toISOString().slice(0, 10);

      const result = transformToOpenDental({
        schedule,
        schedDate: date,
        timeIncrement,
        providerMappings,
        blockTypeMappings,
      });

      // Download JSON
      const jsonBlob = new Blob([result.json], { type: "application/json" });
      downloadBlob(
        jsonBlob,
        `OD_Schedule_${officeName}_${date}.json`
      );

      // Download CSV
      await new Promise((r) => setTimeout(r, 200));
      const csvBlob = new Blob([result.csv], { type: "text/csv" });
      downloadBlob(csvBlob, `OD_Mappings_${officeName}_${date}.csv`);

      onOpenChange(false);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <div className="space-y-5">
          <div>
            <h2 className="text-lg font-semibold">Export for Open Dental</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Map your providers and block types to Open Dental IDs, then download
              the JSON + CSV files for import.
            </p>
          </div>

          {/* Provider Mappings */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">
              Provider → Open Dental ProvNum
            </h3>
            <p className="text-xs text-muted-foreground">
              Enter the numeric ProvNum from Open Dental for each provider.
            </p>
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">
                      Provider
                    </th>
                    <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground w-36">
                      ProvNum
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {providerMappings.map((m, i) => (
                    <tr key={m.providerId}>
                      <td className="px-3 py-2 text-foreground">{m.providerName}</td>
                      <td className="px-3 py-1.5">
                        <Input
                          value={m.provNum}
                          onChange={(e) => handleProvNumChange(i, e.target.value)}
                          placeholder="e.g. 3"
                          className="h-7 text-sm"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Block Type Mappings */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">
              Block Type → Open Dental BlockoutType DefNum
            </h3>
            <p className="text-xs text-muted-foreground">
              Enter the Definition.DefNum for each blockout type. Leave blank to use
              label only.
            </p>
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">
                      Block Type
                    </th>
                    <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground w-36">
                      DefNum
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {blockTypeMappings.map((m, i) => (
                    <tr key={m.blockTypeId}>
                      <td className="px-3 py-2 text-foreground">{m.blockTypeLabel}</td>
                      <td className="px-3 py-1.5">
                        <Input
                          value={m.defNum}
                          onChange={(e) => handleDefNumChange(i, e.target.value)}
                          placeholder="e.g. 12"
                          className="h-7 text-sm"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Note */}
          <p className="text-xs text-muted-foreground bg-muted/30 px-3 py-2 rounded">
            Mappings are saved per office. You only need to enter them once.
            Downloads: <strong>schedule JSON</strong> for API import and a{" "}
            <strong>CSV reference document</strong>.
          </p>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleExport} disabled={isExporting}>
              {isExporting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Exporting…
                </>
              ) : (
                <>
                  <Download className="w-4 h-4 mr-2" />
                  Download JSON + CSV
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  URL.revokeObjectURL(url);
  document.body.removeChild(a);
}
