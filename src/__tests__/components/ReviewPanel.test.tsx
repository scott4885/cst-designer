/**
 * Loop 10 — ReviewPanel rendering tests.
 *
 * Verifies the unified review surface groups items correctly by severity,
 * renders the quality pill + tier label, and shows the "Couldn't clear floor"
 * banner when the retry envelope reports floorMet=false.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import ReviewPanel from "@/components/schedule/ReviewPanel";
import { useScheduleStore } from "@/store/schedule-store";
import type { QualityScore } from "@/lib/engine/quality-score";
import type { ClinicalWarning } from "@/lib/engine/clinical-rules";
import type { ConflictResult } from "@/lib/engine/stagger";
import type { DTimeConflict } from "@/lib/engine/da-time";

const mockQualityScore: QualityScore = {
  total: 82,
  tier: "good",
  emoji: "🟡",
  tierLabel: "Good",
  components: [],
};

beforeEach(() => {
  // Reset flashingCell each test so leak doesn't pollute the next one.
  useScheduleStore.setState({ flashingCell: null });
});

describe("ReviewPanel — rendering", () => {
  it("renders the quality pill with tier label and score", () => {
    render(
      <ReviewPanel
        qualityScore={mockQualityScore}
        clinicalWarnings={[]}
        conflicts={[]}
        dTimeConflicts={[]}
        scheduleWarnings={[]}
      />,
    );
    expect(screen.getByText(/82\/100/)).toBeInTheDocument();
    expect(screen.getByText(/Good/)).toBeInTheDocument();
  });

  it("renders 'All clear' when there are no items and floor was met", () => {
    render(
      <ReviewPanel
        qualityScore={mockQualityScore}
        clinicalWarnings={[]}
        conflicts={[]}
        dTimeConflicts={[]}
        scheduleWarnings={[]}
      />,
    );
    expect(screen.getByText(/All clear/i)).toBeInTheDocument();
  });

  it("groups items into Must Fix / Consider / Opportunity sections", () => {
    const conflicts: ConflictResult[] = [
      {
        time: "9:00 AM",
        providerId: "docA",
        operatories: ["OP1", "OP2"],
        blockLabels: ["Crown", "Filling"],
      },
    ];
    const clinical: ClinicalWarning[] = [
      {
        ruleId: "rule-1",
        severity: "warning",
        message: "Consider spreading exams out",
        affectedTime: "10:00",
      },
      {
        ruleId: "rule-2",
        severity: "info",
        message: "Opportunity: schedule a recall check",
        affectedTime: "11:00",
      },
    ];
    render(
      <ReviewPanel
        qualityScore={mockQualityScore}
        clinicalWarnings={clinical}
        conflicts={conflicts}
        dTimeConflicts={[]}
        scheduleWarnings={[]}
      />,
    );
    expect(screen.getByText(/Must Fix \(1\)/)).toBeInTheDocument();
    expect(screen.getByText(/Consider \(1\)/)).toBeInTheDocument();
    expect(screen.getByText(/Opportunity \(1\)/)).toBeInTheDocument();
    expect(screen.getByText(/Double-booking at 9:00 AM/)).toBeInTheDocument();
    expect(screen.getByText(/Consider spreading exams out/)).toBeInTheDocument();
    expect(screen.getByText(/schedule a recall check/)).toBeInTheDocument();
  });

  it("surfaces D-time conflicts in Must Fix", () => {
    const dTime: DTimeConflict[] = [
      {
        time: "8:30 AM",
        providerId: "doc-1",
        providerName: "Dr. Smith",
        operatories: ["OP1", "OP3"],
        blockLabels: ["Crown", "Composite"],
      },
    ];
    render(
      <ReviewPanel
        qualityScore={mockQualityScore}
        clinicalWarnings={[]}
        conflicts={[]}
        dTimeConflicts={dTime}
        scheduleWarnings={[]}
      />,
    );
    expect(screen.getByText(/D-time overlap at 8:30 AM/)).toBeInTheDocument();
    expect(screen.getByText(/Dr\. Smith/)).toBeInTheDocument();
  });

  it("shows the 'Couldn't clear floor' banner when retry envelope reports floorMet=false", () => {
    const warnings = ["QUALITY_RETRY: used 3/3 attempts, floorMet=false, scores=[62, 64, 71]"];
    render(
      <ReviewPanel
        qualityScore={mockQualityScore}
        clinicalWarnings={[]}
        conflicts={[]}
        dTimeConflicts={[]}
        scheduleWarnings={warnings}
      />,
    );
    expect(screen.getByText(/Couldn't clear quality floor/i)).toBeInTheDocument();
    expect(screen.getByText(/3\/3 attempts/)).toBeInTheDocument();
    expect(screen.getByText(/scores=\[62, 64, 71\]/)).toBeInTheDocument();
  });

  it("does NOT show the floor banner when floorMet=true", () => {
    const warnings = ["QUALITY_RETRY: used 2/3 attempts, floorMet=true, scores=[78, 82]"];
    render(
      <ReviewPanel
        qualityScore={mockQualityScore}
        clinicalWarnings={[]}
        conflicts={[]}
        dTimeConflicts={[]}
        scheduleWarnings={warnings}
      />,
    );
    expect(screen.queryByText(/Couldn't clear quality floor/i)).not.toBeInTheDocument();
  });

  it("fires flashSlot + onJumpToCell when 'Jump to cell' is clicked", () => {
    const onJumpToCell = vi.fn();
    const conflicts: ConflictResult[] = [
      {
        time: "9:00 AM",
        providerId: "docA",
        operatories: ["OP1", "OP2"],
        blockLabels: ["Crown", "Filling"],
      },
    ];
    render(
      <ReviewPanel
        qualityScore={mockQualityScore}
        clinicalWarnings={[]}
        conflicts={conflicts}
        dTimeConflicts={[]}
        scheduleWarnings={[]}
        onJumpToCell={onJumpToCell}
      />,
    );
    const jumpButton = screen.getByRole("button", { name: /Jump to cell at 9:00 AM/i });
    fireEvent.click(jumpButton);
    expect(onJumpToCell).toHaveBeenCalledWith("9:00 AM", "docA");
    // The store should also have flashingCell set (flashSlot was called).
    const st = useScheduleStore.getState();
    expect(st.flashingCell).toEqual({ time: "9:00 AM", providerId: "docA" });
  });
});
