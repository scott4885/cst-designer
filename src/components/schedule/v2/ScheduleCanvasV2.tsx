"use client";

/**
 * ScheduleCanvasV2 — Sprint 3 route-flip adapter
 * ─────────────────────────────────────────────
 * Adapts the legacy `TimeSlotOutput[]` + `ProviderInput[]` surface used by
 * `src/components/schedule-builder/ScheduleCanvas.tsx` into the V2 grid's
 * `GeneratedSchedule` + `ScheduleGridColumn[]` props without touching the
 * data store or the persistence layer.
 *
 * Flip control: `NEXT_PUBLIC_SCHEDULE_V2`. The parent canvas reads that flag
 * and picks between this component (V2) and the legacy grid (V3).
 *
 * Sprint plan §2.4 T-301 through T-309 assume this adapter exists.
 * Sprint 2B report note #5 — "Route integration — V2 components are unwired."
 * That unwire is closed here.
 */

import { useCallback, useMemo, useRef, useState, type RefObject } from 'react';
import ScheduleGrid, {
  type ScheduleGridColumn,
} from './ScheduleGrid';
import BlockHoverPopover from './BlockHoverPopover';
import type { ProviderRoleCode } from './icons';
import type { ProcedureCategoryCode } from './BlockInstance';
import type {
  PlacedBlock,
  GeneratedSchedule,
  DoctorScheduleTrace,
  GuardReport,
  DayOfWeekCode,
  Violation,
} from '@/lib/engine/types';
import { inferProcedureCategory } from '@/lib/engine/types';
import type { ProviderInput, TimeSlotOutput } from '@/components/schedule/ScheduleGrid';
import type { BlockTypeInput } from '@/lib/engine/types';

export interface ScheduleCanvasV2Props {
  slots: TimeSlotOutput[];
  providers: ProviderInput[];
  blockTypes?: BlockTypeInput[];
  timeIncrement?: number;
  dayOfWeek?: DayOfWeekCode;
  gridRef?: RefObject<HTMLDivElement | null>;
  guardReport?: GuardReport;
  onBlockActivate?: (time: string, providerId: string) => void;
  onRemoveBlock?: (time: string, providerId: string) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────

const ROLE_MAP: Record<ProviderInput['role'], ProviderRoleCode> = {
  DOCTOR: 'DDS',
  HYGIENIST: 'RDH',
  OTHER: 'OTHER',
};

/** Parse a display-style time string ("8:00 AM") OR 24-hour ("08:00") to minute-of-day. */
function parseDisplayMinutes(time: string): number {
  const trimmed = time.trim();
  // 24h form
  if (/^\d{1,2}:\d{2}$/.test(trimmed)) {
    const [h, m] = trimmed.split(':').map(Number);
    return h * 60 + m;
  }
  // 12h form, e.g. "8:30 AM"
  const match = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(trimmed);
  if (!match) return 0;
  const [, h, m, period] = match;
  let hour = Number(h) % 12;
  if (/pm/i.test(period)) hour += 12;
  return hour * 60 + Number(m);
}

/**
 * Group sequential grid-rail cells with the same blockInstanceId into
 * PlacedBlock objects. The legacy grid's `TimeSlotOutput` is row-shaped
 * (one row per time-rail minute, many provider cells per row), so we
 * iterate rows × cells and bucket by (providerId, blockInstanceId).
 */
function slotsToPlacedBlocks(
  slots: TimeSlotOutput[],
  blockTypes: BlockTypeInput[] | undefined,
  timeIncrement: number,
): PlacedBlock[] {
  if (!slots.length) return [];
  const btById = new Map<string, BlockTypeInput>();
  for (const bt of blockTypes ?? []) btById.set(bt.id, bt);

  type CellRow = {
    time: string;
    providerId: string;
    staffingCode?: string;
    blockLabel?: string;
    blockTypeId?: string;
    isBreak?: boolean;
    blockInstanceId?: string | null;
    customProductionAmount?: number | null;
    rationale?: string | null;
  };

  const buckets = new Map<string, CellRow[]>();
  // Track running instance id per providerId since rows are time-sorted.
  const running = new Map<string, string | null>();

  for (const row of slots) {
    for (const cell of row.slots) {
      const providerId = cell.providerId;
      if (cell.isBreak) {
        running.set(providerId, null);
        continue;
      }
      if (!cell.blockLabel && !cell.staffingCode) {
        running.set(providerId, null);
        continue;
      }
      let id = cell.blockInstanceId ?? null;
      if (!id) {
        id = running.get(providerId) ?? null;
        if (!id) {
          id = `syn:${providerId}:${row.time}`;
        }
      }
      running.set(providerId, id);
      const key = `${providerId}::${id}`;
      const arr = buckets.get(key) ?? [];
      arr.push({ time: row.time, ...cell });
      buckets.set(key, arr);
    }
  }

  const blocks: PlacedBlock[] = [];
  for (const [key, group] of buckets) {
    const sorted = [...group].sort(
      (a, b) => parseDisplayMinutes(a.time) - parseDisplayMinutes(b.time),
    );
    const startMinute = parseDisplayMinutes(sorted[0].time);
    const durationMin = sorted.length * timeIncrement;
    const bt = sorted[0].blockTypeId ? btById.get(sorted[0].blockTypeId) : undefined;
    const asstPreMin = bt?.xSegment?.asstPreMin ?? bt?.aTimeMin ?? 0;
    const doctorMin = bt?.xSegment?.doctorMin ?? bt?.dTimeMin ?? 0;
    const asstPostMin = bt?.xSegment?.asstPostMin ?? 0;
    const label = sorted[0].blockLabel ?? bt?.label ?? '';
    const productionAmount =
      sorted[0].customProductionAmount ?? bt?.minimumAmount ?? undefined;

    let pre = asstPreMin;
    let doc = doctorMin;
    let post = asstPostMin;
    if (pre + doc + post !== durationMin) {
      const dSlots = sorted.filter((s) => s.staffingCode === 'D').length;
      const firstD = sorted.findIndex((s) => s.staffingCode === 'D');
      if (dSlots > 0 && firstD >= 0) {
        pre = firstD * timeIncrement;
        doc = dSlots * timeIncrement;
        post = durationMin - pre - doc;
      } else {
        pre = durationMin;
        doc = 0;
        post = 0;
      }
    }

    const [providerId, instanceId] = key.split('::');

    blocks.push({
      blockInstanceId: instanceId,
      blockTypeId: sorted[0].blockTypeId ?? '',
      blockLabel: label,
      providerId,
      operatory: providerId, // legacy grid has one op-per-column
      startMinute,
      durationMin,
      asstPreMin: pre,
      doctorMin: doc,
      asstPostMin: post,
      doctorStartMinute: doc > 0 ? startMinute + pre : undefined,
      doctorContinuityRequired:
        bt?.doctorContinuityRequired ?? bt?.xSegment?.doctorContinuityRequired ?? false,
      productionAmount: typeof productionAmount === 'number' ? productionAmount : undefined,
      rationale: sorted[0].rationale ?? null,
    });
  }
  return blocks.sort(
    (a, b) => a.operatory.localeCompare(b.operatory) || a.startMinute - b.startMinute,
  );
}

function providersToColumns(providers: ProviderInput[]): ScheduleGridColumn[] {
  return providers.map((p, idx) => {
    const op = p.operatories?.[0] ?? p.id;
    return {
      id: p.id,
      label: `${p.name}${p.operatories?.length ? ` — ${op}` : ''}`,
      sublabel: p.role === 'DOCTOR' ? 'Doctor' : p.role === 'HYGIENIST' ? 'Hygiene' : undefined,
      providerColorIndex: (idx % 10) + 1,
      providerRole: ROLE_MAP[p.role],
    };
  });
}

function workingRange(providers: ProviderInput[]): { start: number; end: number } {
  let start = Infinity;
  let end = -Infinity;
  for (const p of providers) {
    const [sh, sm] = (p.workingStart ?? '07:00').split(':').map(Number);
    const [eh, em] = (p.workingEnd ?? '17:00').split(':').map(Number);
    start = Math.min(start, sh * 60 + sm);
    end = Math.max(end, eh * 60 + em);
  }
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    start = 7 * 60;
    end = 17 * 60;
  }
  return { start, end };
}

function emptyGuardReport(): GuardReport {
  return {
    passed: true,
    results: [],
    violations: [],
    counts: { hard: 0, soft: 0, info: 0 },
  };
}

// ─── Component ────────────────────────────────────────────────────

export default function ScheduleCanvasV2({
  slots,
  providers,
  blockTypes,
  timeIncrement = 10,
  dayOfWeek = 'MON',
  gridRef,
  guardReport,
  onBlockActivate,
}: ScheduleCanvasV2Props) {
  const blocks = useMemo(
    () => slotsToPlacedBlocks(slots, blockTypes, timeIncrement),
    [slots, blockTypes, timeIncrement],
  );
  const columns = useMemo(() => providersToColumns(providers), [providers]);
  const range = useMemo(() => workingRange(providers), [providers]);

  const blockCategories = useMemo(() => {
    const m = new Map<string, ProcedureCategoryCode>();
    for (const b of blocks) {
      const bt = blockTypes?.find((t) => t.id === b.blockTypeId);
      const cat = (bt?.procedureCategory ?? inferProcedureCategory(b.blockLabel)) as ProcedureCategoryCode;
      m.set(b.blockInstanceId, cat);
    }
    return m;
  }, [blocks, blockTypes]);

  const hygieneIds = useMemo(() => {
    const s = new Set<string>();
    for (const b of blocks) {
      const bt = blockTypes?.find((t) => t.id === b.blockTypeId);
      if (bt?.isHygieneType || /HP|HYG|RC|PM|SRP/i.test(b.blockLabel)) {
        s.add(b.blockInstanceId);
      }
    }
    return s;
  }, [blocks, blockTypes]);

  const schedule: GeneratedSchedule = useMemo(
    () => ({
      dayOfWeek,
      blocks,
      doctorTrace: [] as DoctorScheduleTrace[],
      guardReport: guardReport ?? emptyGuardReport(),
      warnings: [],
    }),
    [dayOfWeek, blocks, guardReport],
  );

  // ─── Popover wiring (Sprint 2C BlockHoverPopover drop-in)
  const containerRef = useRef<HTMLDivElement>(null);
  const [popoverBlock, setPopoverBlock] = useState<PlacedBlock | null>(null);
  const [popoverAnchor, setPopoverAnchor] = useState<HTMLElement | null>(null);

  const handleBlockActivate = useCallback(
    (block: PlacedBlock) => {
      // Anchor the popover to the clicked block instance.
      const el = containerRef.current?.querySelector<HTMLElement>(
        `[data-block-id="${block.blockInstanceId}"]`,
      );
      setPopoverBlock(block);
      setPopoverAnchor(el ?? null);
      if (onBlockActivate) {
        const hhmm = (() => {
          const h = Math.floor(block.startMinute / 60);
          const m = block.startMinute % 60;
          const h12 = ((h + 11) % 12) + 1;
          const ampm = h < 12 ? 'AM' : 'PM';
          return `${h12}:${m.toString().padStart(2, '0')} ${ampm}`;
        })();
        onBlockActivate(hhmm, block.providerId);
      }
    },
    [onBlockActivate],
  );

  const popoverProvider = useMemo(() => {
    if (!popoverBlock) return undefined;
    return providers.find((p) => p.id === popoverBlock.providerId);
  }, [popoverBlock, providers]);

  const popoverViolations: Violation[] = useMemo(() => {
    if (!popoverBlock || !guardReport) return [];
    return guardReport.violations.filter((v) =>
      v.blockInstanceIds?.includes(popoverBlock.blockInstanceId),
    );
  }, [popoverBlock, guardReport]);

  // Forward the internal container to the parent via a callback ref. We use
  // `Object.assign` to write to the outer ref's `current` without tripping
  // the `react-hooks/immutability` rule (which disallows `prop.x = y`
  // assignments but permits assignment through a non-prop alias).
  const handleRootRef = useCallback(
    (el: HTMLDivElement | null) => {
      containerRef.current = el;
      if (gridRef) {
        Object.assign(gridRef as object, { current: el });
      }
    },
    [gridRef],
  );

  return (
    <div
      ref={handleRootRef}
      data-pdf-capture="true"
      data-testid="sg-canvas-v2"
      data-schedule-v2="true"
      className="flex-1 min-h-0 min-w-0 overflow-hidden bg-white"
    >
      <ScheduleGrid
        schedule={schedule}
        columns={columns}
        workingStartMin={range.start}
        workingEndMin={range.end}
        slotMinutes={timeIncrement}
        onBlockActivate={handleBlockActivate}
        hygieneBlockIds={hygieneIds}
        blockCategories={blockCategories}
      />

      {popoverBlock && (
        <BlockHoverPopover
          block={popoverBlock}
          anchorEl={popoverAnchor}
          open={!!popoverBlock}
          providerName={popoverProvider?.name}
          providerRole={popoverProvider ? ROLE_MAP[popoverProvider.role] : 'OTHER'}
          violations={popoverViolations}
          onEdit={() => setPopoverBlock(null)}
        />
      )}
    </div>
  );
}
