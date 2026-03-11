"use client";

/**
 * Block Type Audit Report Page — Sprint 16
 *
 * Analyzes which block types are used vs. unused across all saved schedules.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { Download, Trash2, ArrowLeft, AlertCircle, CheckCircle2, BarChart2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useOfficeStore } from "@/store/office-store";
import { useScheduleStore } from "@/store/schedule-store";
import { auditBlockTypes, exportAuditToCSV } from "@/lib/audit";
import type { OfficeWithSchedules } from "@/lib/audit";
import type { BlockTypeInput } from "@/lib/engine/types";
import { toast } from "sonner";

export default function AuditPage() {
  const { offices, fetchOffices } = useOfficeStore();
  const { generatedSchedules } = useScheduleStore();

  // Fetch offices on mount
  useMemo(() => {
    if (offices.length === 0) fetchOffices();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Build OfficeWithSchedules from store data
  const officeWithSchedulesList = useMemo((): OfficeWithSchedules[] => {
    return offices.map((office) => {
      const blockTypes: BlockTypeInput[] = office.blockTypes ?? [];
      // Build schedules from generatedSchedules store (keyed by officeId-day)
      const schedules: OfficeWithSchedules["schedules"] = {};
      for (const day of ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"]) {
        const key = `${office.id}-${day}`;
        const daySchedule = generatedSchedules[key];
        if (daySchedule?.slots) {
          schedules[day] = daySchedule.slots.map((s) => ({
            blockTypeId: s.blockTypeId,
            isBreak: s.isBreak,
            blockInstanceId: s.blockInstanceId,
            customProductionAmount: s.customProductionAmount,
          }));
        }
      }
      return {
        id: office.id,
        name: office.name,
        blockTypes,
        schedules,
      };
    });
  }, [offices, generatedSchedules]);

  // Collect all global block types
  const globalBlockTypes = useMemo((): BlockTypeInput[] => {
    const map = new Map<string, BlockTypeInput>();
    for (const office of offices) {
      for (const bt of (office.blockTypes ?? [])) {
        map.set(bt.id, bt);
      }
    }
    return Array.from(map.values());
  }, [offices]);

  const auditResult = useMemo(
    () => auditBlockTypes(officeWithSchedulesList, globalBlockTypes),
    [officeWithSchedulesList, globalBlockTypes]
  );

  function handleExportCSV() {
    const csv = exportAuditToCSV(auditResult);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `block-type-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Audit CSV exported");
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <BarChart2 className="h-6 w-6 text-blue-500" />
              Block Type Audit
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Analyze block type usage across all scheduled offices
            </p>
          </div>
        </div>
        <Button onClick={handleExportCSV} variant="outline" size="sm">
          <Download className="h-4 w-4 mr-2" />
          Export Audit CSV
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Block Types</p>
            <p className="text-3xl font-bold mt-1">{auditResult.totalBlockTypes}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Used</p>
            <p className="text-3xl font-bold mt-1 text-green-600">
              {auditResult.usedBlockTypes.length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Unused</p>
            <p className="text-3xl font-bold mt-1 text-amber-600">
              {auditResult.unusedBlockTypes.length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Offices Analyzed</p>
            <p className="text-3xl font-bold mt-1">{officeWithSchedulesList.length}</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="top" className="space-y-4">
        <TabsList>
          <TabsTrigger value="top">Top Performers</TabsTrigger>
          <TabsTrigger value="unused">
            Unused
            {auditResult.unusedBlockTypes.length > 0 && (
              <Badge variant="destructive" className="ml-1.5 text-xs px-1.5 py-0">
                {auditResult.unusedBlockTypes.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="offices">Per-Office Breakdown</TabsTrigger>
          <TabsTrigger value="all">All Block Types</TabsTrigger>
        </TabsList>

        {/* Top performers */}
        <TabsContent value="top" className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Top 5 by Total Production</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Block Type</TableHead>
                      <TableHead className="text-xs text-right">Production</TableHead>
                      <TableHead className="text-xs text-right">Uses</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {auditResult.topBlocksByProduction.map((u) => (
                      <TableRow key={u.blockTypeId}>
                        <TableCell className="text-sm font-medium">{u.name}</TableCell>
                        <TableCell className="text-sm text-right text-green-600">
                          ${u.totalProduction.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-sm text-right text-muted-foreground">
                          {u.useCount}
                        </TableCell>
                      </TableRow>
                    ))}
                    {auditResult.topBlocksByProduction.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center text-sm text-muted-foreground py-4">
                          No usage data yet
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Top 5 by Frequency</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Block Type</TableHead>
                      <TableHead className="text-xs text-right">Uses</TableHead>
                      <TableHead className="text-xs text-right">Offices</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {auditResult.topBlocksByFrequency.map((u) => (
                      <TableRow key={u.blockTypeId}>
                        <TableCell className="text-sm font-medium">{u.name}</TableCell>
                        <TableCell className="text-sm text-right text-blue-600 font-medium">
                          {u.useCount}
                        </TableCell>
                        <TableCell className="text-sm text-right text-muted-foreground">
                          {u.officeCount}
                        </TableCell>
                      </TableRow>
                    ))}
                    {auditResult.topBlocksByFrequency.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center text-sm text-muted-foreground py-4">
                          No usage data yet
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Unused block types */}
        <TabsContent value="unused">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-amber-500" />
                <CardTitle className="text-sm">
                  Unused Block Types ({auditResult.unusedBlockTypes.length})
                </CardTitle>
              </div>
              <p className="text-xs text-muted-foreground">
                These block types exist in the library but are never scheduled. Consider removing dead config.
              </p>
            </CardHeader>
            <CardContent>
              {auditResult.unusedBlockTypes.length === 0 ? (
                <div className="flex items-center gap-2 text-green-600 py-4">
                  <CheckCircle2 className="h-4 w-4" />
                  <span className="text-sm">All block types are being used!</span>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Block Type</TableHead>
                      <TableHead className="text-xs">Applies To</TableHead>
                      <TableHead className="text-xs text-right">Duration</TableHead>
                      <TableHead className="text-xs text-right">Min Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {auditResult.unusedBlockTypes.map((bt) => (
                      <TableRow key={bt.id}>
                        <TableCell className="text-sm font-medium">{bt.label}</TableCell>
                        <TableCell className="text-sm">
                          <Badge variant="secondary" className="text-xs">
                            {bt.appliesToRole}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-right text-muted-foreground">
                          {bt.durationMin} min
                        </TableCell>
                        <TableCell className="text-sm text-right text-muted-foreground">
                          {bt.minimumAmount ? `$${bt.minimumAmount.toLocaleString()}` : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Per-office breakdown */}
        <TabsContent value="offices">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Per-Office Block Type Usage</CardTitle>
            </CardHeader>
            <CardContent>
              {auditResult.offices.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No office data available
                </p>
              ) : (
                <div className="space-y-4">
                  {auditResult.offices.map((office) => (
                    <div key={office.officeId} className="border rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-sm font-semibold">{office.officeName}</h3>
                        <div className="flex gap-3 text-xs text-muted-foreground">
                          <span>{office.blockTypeCount} block types</span>
                          <span>${office.totalProduction.toLocaleString()} production</span>
                        </div>
                      </div>
                      {office.topBlocks.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {office.topBlocks.map((b) => (
                            <div
                              key={b.blockTypeId}
                              className="text-xs bg-muted rounded-md px-2 py-1"
                            >
                              <span className="font-medium">{b.name}</span>
                              <span className="text-muted-foreground ml-1">×{b.useCount}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">No schedules built yet</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* All block types */}
        <TabsContent value="all">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">All Block Types</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Block Type</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-xs text-right">Uses</TableHead>
                    <TableHead className="text-xs text-right">Total Min</TableHead>
                    <TableHead className="text-xs text-right">Total Production</TableHead>
                    <TableHead className="text-xs text-right">Offices</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {auditResult.usedBlockTypes.map((u) => (
                    <TableRow key={u.blockTypeId}>
                      <TableCell className="text-sm font-medium">{u.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs text-green-600 border-green-200">
                          Used
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-right">{u.useCount}</TableCell>
                      <TableCell className="text-sm text-right text-muted-foreground">
                        {u.totalMinutes}
                      </TableCell>
                      <TableCell className="text-sm text-right text-green-600">
                        ${u.totalProduction.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-sm text-right text-muted-foreground">
                        {u.officeCount}
                      </TableCell>
                    </TableRow>
                  ))}
                  {auditResult.unusedBlockTypes.map((bt) => (
                    <TableRow key={bt.id} className="opacity-50">
                      <TableCell className="text-sm">{bt.label}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-xs">
                          Unused
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-right">0</TableCell>
                      <TableCell className="text-sm text-right text-muted-foreground">0</TableCell>
                      <TableCell className="text-sm text-right text-muted-foreground">$0</TableCell>
                      <TableCell className="text-sm text-right text-muted-foreground">0</TableCell>
                    </TableRow>
                  ))}
                  {auditResult.totalBlockTypes === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-4">
                        No block types found. Add block types in your office configuration.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
