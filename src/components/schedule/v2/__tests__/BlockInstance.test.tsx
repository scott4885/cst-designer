/**
 * BlockInstance — Sprint 2 Stream B unit + interaction tests.
 *
 * Contracts under test (post-redesign):
 *   • COMPACT view (default): solid body + 4px top accent strip with
 *     three proportional spans (pre / doc / post). Segments collapse
 *     when the corresponding minute count is 0.
 *   • X-SEGMENTS view (showXSegments=true): legacy 3-band full-bleed
 *     treatment — A-pre / D / A-post bands; pre/post omitted when
 *     their slot count is 0.
 *   • Duration-slot math: durationSlots = durationMin / 10 (UX-L1)
 *   • Hygiene exam glyph renders on D-band in X-SEGMENTS view only
 *     (the overlay doesn't make sense without the full D-band)
 *   • Violation badge surfaces highest severity (both views)
 *   • Enter / Space triggers onActivate (both views)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import BlockInstance from '../BlockInstance';
import { useScheduleView } from '@/store/use-schedule-view';
import type { PlacedBlock, Violation } from '@/lib/engine/types';

const baseBlock: PlacedBlock = {
  blockInstanceId: 'blk-1',
  blockTypeId: 'bt-hp',
  blockLabel: 'High Production',
  providerId: 'dr-kim',
  operatory: 'op-1',
  startMinute: 480,
  durationMin: 60,
  asstPreMin: 10,
  doctorMin: 40,
  asstPostMin: 10,
};

// Helper to flip the x-segments toggle for tests that exercise the
// legacy diagnostic mode. Defaults are reset in beforeEach.
function enableXSegments() {
  act(() => {
    useScheduleView.setState({ showXSegments: true });
  });
}

beforeEach(() => {
  useScheduleView.setState({
    zoom: 'fit',
    cursor: null,
    hoveredBlockId: null,
    selectedBlockId: null,
    showDoctorFlow: false,
    showXSegments: false,
  });
});

describe('BlockInstance — compact view (default)', () => {
  it('renders a 4px accent strip with three proportional segments', () => {
    render(<BlockInstance block={baseBlock} slotHeightPx={32} />);
    const strip = screen.getByTestId('sg-accent-strip');
    expect(strip).toBeDefined();
    // 60-min block with 10/40/10 split → pre 16.67%, doc 66.67%, post 16.67%
    const pre = screen.getByTestId('sg-accent-pre');
    const doc = screen.getByTestId('sg-accent-doc');
    const post = screen.getByTestId('sg-accent-post');
    expect(pre.getAttribute('style')).toMatch(/flex-basis:\s*16\.66/);
    expect(doc.getAttribute('style')).toMatch(/flex-basis:\s*66\.66/);
    expect(post.getAttribute('style')).toMatch(/flex-basis:\s*16\.66/);
  });

  it('collapses the A-pre accent segment when asstPreMin === 0', () => {
    render(
      <BlockInstance
        block={{ ...baseBlock, asstPreMin: 0, doctorMin: 50, asstPostMin: 10 }}
        slotHeightPx={32}
      />,
    );
    expect(screen.queryByTestId('sg-accent-pre')).toBeNull();
    expect(screen.getByTestId('sg-accent-doc')).toBeDefined();
    expect(screen.getByTestId('sg-accent-post')).toBeDefined();
  });

  it('does NOT render the full-bleed 3 bands by default', () => {
    render(<BlockInstance block={baseBlock} slotHeightPx={32} />);
    expect(screen.queryByTestId('sg-aband-pre')).toBeNull();
    expect(screen.queryByTestId('sg-dband')).toBeNull();
    expect(screen.queryByTestId('sg-aband-post')).toBeNull();
  });

  it('sets data-view="compact" on the root', () => {
    render(<BlockInstance block={baseBlock} slotHeightPx={32} />);
    const root = screen.getByTestId('sg-block-instance');
    expect(root.getAttribute('data-view')).toBe('compact');
  });
});

describe('BlockInstance — x-segments view (toggle on)', () => {
  it('renders exactly three X-segment bands when all three are present', () => {
    enableXSegments();
    render(<BlockInstance block={baseBlock} slotHeightPx={32} />);
    expect(screen.getByTestId('sg-aband-pre')).toBeDefined();
    expect(screen.getByTestId('sg-dband')).toBeDefined();
    expect(screen.getByTestId('sg-aband-post')).toBeDefined();
  });

  it('omits A-pre band when asstPreMin === 0', () => {
    enableXSegments();
    render(
      <BlockInstance
        block={{ ...baseBlock, asstPreMin: 0, doctorMin: 50, asstPostMin: 10 }}
        slotHeightPx={32}
      />,
    );
    expect(screen.queryByTestId('sg-aband-pre')).toBeNull();
    expect(screen.getByTestId('sg-dband')).toBeDefined();
    expect(screen.getByTestId('sg-aband-post')).toBeDefined();
  });

  it('does NOT render the accent strip in x-segments mode', () => {
    enableXSegments();
    render(<BlockInstance block={baseBlock} slotHeightPx={32} />);
    expect(screen.queryByTestId('sg-accent-strip')).toBeNull();
  });

  it('sets data-view="xsegments" on the root', () => {
    enableXSegments();
    render(<BlockInstance block={baseBlock} slotHeightPx={32} />);
    const root = screen.getByTestId('sg-block-instance');
    expect(root.getAttribute('data-view')).toBe('xsegments');
  });
});

describe('BlockInstance — geometry (view-agnostic)', () => {
  it('encodes slot counts in data attributes for downstream tests', () => {
    render(<BlockInstance block={baseBlock} slotHeightPx={32} />);
    const root = screen.getByTestId('sg-block-instance');
    expect(root.getAttribute('data-duration-slots')).toBe('6');
    expect(root.getAttribute('data-pre-slots')).toBe('1');
    expect(root.getAttribute('data-doctor-slots')).toBe('4');
    expect(root.getAttribute('data-post-slots')).toBe('1');
  });

  it('applies slotHeightPx to overall height (durationSlots × slotHeightPx)', () => {
    const { rerender } = render(
      <BlockInstance block={baseBlock} slotHeightPx={32} />,
    );
    let root = screen.getByTestId('sg-block-instance') as HTMLElement;
    expect(root.style.height).toBe('192px'); // 6 × 32

    rerender(<BlockInstance block={baseBlock} slotHeightPx={48} />);
    root = screen.getByTestId('sg-block-instance') as HTMLElement;
    expect(root.style.height).toBe('288px'); // 6 × 48
  });
});

describe('BlockInstance — hygiene glyph', () => {
  it('renders exam-glyph overlay only in x-segments mode when isHygieneBlock is true', () => {
    enableXSegments();
    const { rerender } = render(
      <BlockInstance block={baseBlock} slotHeightPx={32} />,
    );
    expect(screen.queryByTestId('sg-hygiene-exam-glyph')).toBeNull();
    rerender(
      <BlockInstance block={baseBlock} slotHeightPx={32} isHygieneBlock />,
    );
    expect(screen.getByTestId('sg-hygiene-exam-glyph')).toBeDefined();
  });

  it('does NOT render the hygiene glyph in compact view (the overlay depends on the full D-band)', () => {
    render(<BlockInstance block={baseBlock} slotHeightPx={32} isHygieneBlock />);
    expect(screen.queryByTestId('sg-hygiene-exam-glyph')).toBeNull();
  });
});

describe('BlockInstance — violations', () => {
  it('shows a HARD-severity badge when any violation is HARD', () => {
    const violations: Violation[] = [
      { ap: 'AP-1', code: 'D_COLLISION', message: 'collision', severity: 'HARD' },
      { ap: 'AP-3', code: 'SOFT_WIN', message: 'soft', severity: 'SOFT' },
    ];
    render(
      <BlockInstance block={baseBlock} slotHeightPx={32} violations={violations} />,
    );
    const badge = screen.getByTestId('sg-violation-badge');
    expect(badge.getAttribute('data-severity')).toBe('HARD');
    // Count 2 surfaced
    expect(badge.textContent).toContain('2');
  });

  it('omits the badge entirely when no violations', () => {
    render(
      <BlockInstance block={baseBlock} slotHeightPx={32} violations={[]} />,
    );
    expect(screen.queryByTestId('sg-violation-badge')).toBeNull();
  });
});

describe('BlockInstance — interaction', () => {
  it('calls onActivate on click', () => {
    const onActivate = vi.fn();
    render(
      <BlockInstance
        block={baseBlock}
        slotHeightPx={32}
        onActivate={onActivate}
      />,
    );
    fireEvent.click(screen.getByTestId('sg-block-instance'));
    expect(onActivate).toHaveBeenCalledWith('blk-1');
  });

  it('calls onActivate on Enter key', () => {
    const onActivate = vi.fn();
    render(
      <BlockInstance
        block={baseBlock}
        slotHeightPx={32}
        onActivate={onActivate}
      />,
    );
    fireEvent.keyDown(screen.getByTestId('sg-block-instance'), { key: 'Enter' });
    expect(onActivate).toHaveBeenCalledWith('blk-1');
  });

  it('fires onHoverChange on mouseenter/leave', () => {
    const onHoverChange = vi.fn();
    render(
      <BlockInstance
        block={baseBlock}
        slotHeightPx={32}
        onHoverChange={onHoverChange}
      />,
    );
    const el = screen.getByTestId('sg-block-instance');
    fireEvent.mouseEnter(el);
    expect(onHoverChange).toHaveBeenLastCalledWith('blk-1');
    fireEvent.mouseLeave(el);
    expect(onHoverChange).toHaveBeenLastCalledWith(null);
  });
});

describe('BlockInstance — a11y', () => {
  it('exposes role="button" + tabIndex=0 + descriptive aria-label', () => {
    render(<BlockInstance block={baseBlock} slotHeightPx={32} />);
    const root = screen.getByTestId('sg-block-instance');
    expect(root.getAttribute('role')).toBe('button');
    expect(root.getAttribute('tabindex')).toBe('0');
    expect(root.getAttribute('aria-label')).toMatch(/60 minutes/);
    expect(root.getAttribute('aria-label')).toMatch(/High Production/);
  });
});
