"use client";

import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
} from "@tanstack/react-table";
import TimeSlotCell from "./TimeSlotCell";

export interface ProviderInput {
  id: string;
  name: string;
  role: string;
  color: string;
}

export interface TimeSlotOutput {
  time: string;
  slots: {
    providerId: string;
    staffingCode?: string;
    blockLabel?: string;
    isBreak?: boolean;
  }[];
}

interface ScheduleGridProps {
  slots: TimeSlotOutput[];
  providers: ProviderInput[];
}

export default function ScheduleGrid({ slots, providers }: ScheduleGridProps) {
  // Generate time slots from 7:00 AM to 6:00 PM in 10-minute increments
  const generateTimeSlots = (): string[] => {
    const times: string[] = [];
    let hour = 7;
    let minute = 0;

    while (hour < 18 || (hour === 18 && minute === 0)) {
      const formattedHour = hour > 12 ? hour - 12 : hour;
      const period = hour >= 12 ? "PM" : "AM";
      const formattedMinute = minute.toString().padStart(2, "0");
      times.push(`${formattedHour}:${formattedMinute} ${period}`);

      minute += 10;
      if (minute >= 60) {
        minute = 0;
        hour += 1;
      }
    }

    return times;
  };

  const timeSlots = slots.length > 0 ? slots : generateTimeSlots().map(time => ({
    time,
    slots: providers.map(p => ({ providerId: p.id })),
  }));

  // Build columns: Time + (Staffing | Block Type) for each provider
  const columnHelper = createColumnHelper<TimeSlotOutput>();
  
  const timeColumn = columnHelper.accessor("time", {
    header: "Time",
    cell: (info) => <TimeSlotCell time={info.getValue()} />,
    size: 80,
  });

  // Add columns for each provider (2 columns per provider: Staffing + Block Type)
  const providerColumns = providers.flatMap((provider) => [
    columnHelper.display({
        id: `${provider.id}-staffing`,
        header: () => (
          <div className="text-center">
            <div className="font-semibold">{provider.name}</div>
            <div className="text-xs text-muted-foreground mt-1">Staffing</div>
          </div>
        ),
        cell: (info) => {
          const slot = info.row.original.slots.find(s => s.providerId === provider.id);
          const isLunchTime = info.row.original.time.startsWith("1:") || info.row.original.time.startsWith("2:");
          
          return (
            <TimeSlotCell
              staffingCode={slot?.staffingCode}
              providerColor={slot?.staffingCode ? provider.color : undefined}
              isBreak={slot?.isBreak || (isLunchTime && !slot?.staffingCode)}
            />
          );
        },
        size: 100,
      }),
    columnHelper.display({
      id: `${provider.id}-block`,
      header: () => (
        <div className="text-center">
          <div className="text-xs text-muted-foreground">Block Type</div>
        </div>
      ),
      cell: (info) => {
        const slot = info.row.original.slots.find(s => s.providerId === provider.id);
        const isLunchTime = info.row.original.time.startsWith("1:") || info.row.original.time.startsWith("2:");
        
        return (
          <TimeSlotCell
            blockLabel={slot?.blockLabel}
            providerColor={slot?.blockLabel ? provider.color : undefined}
            isBreak={slot?.isBreak || (isLunchTime && !slot?.blockLabel)}
          />
        );
      },
      size: 150,
    }),
  ]);

  const columns = [timeColumn, ...providerColumns];

  const table = useReactTable({
    data: timeSlots,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  // Empty state
  if (providers.length === 0) {
    return (
      <div className="flex items-center justify-center h-96 border border-border rounded-lg bg-surface/30">
        <div className="text-center space-y-2">
          <p className="text-muted-foreground">No providers configured</p>
          <p className="text-sm text-muted-foreground">Add providers to see the schedule grid</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="schedule-grid max-h-[600px] overflow-auto">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 bg-surface z-20">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className="px-3 py-3 text-sm font-semibold text-foreground border-b-2 border-border bg-surface"
                    style={{ width: header.getSize() }}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className="hover:bg-surface/50 transition-colors">
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="p-0 border-b border-border">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Empty state message when no schedule generated */}
      {slots.length === 0 && providers.length > 0 && (
        <div className="text-center py-6 text-muted-foreground">
          <p>Click "Generate Schedule" to create optimized schedule blocks</p>
        </div>
      )}
    </div>
  );
}
