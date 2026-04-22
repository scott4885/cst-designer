/**
 * BlockInstance — Sprint 2 Stream B unit + interaction tests.
 *
 * Contracts under test:
 *   • Renders 3 X-segment bands (A-pre / D / A-post) per Bible §2.1
 *   • Duration-slot math: durationSlots = durationMin / 10 (UX-L1)
 *   • Pre/Post bands omitted when slot count is 0
 *   • Violation badge surfaces highest severity
 *   • Enter / Space triggers onActivate
 *   • Hygiene block renders exam glyph on D-band (UX-L3)
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import BlockInstance from '../BlockInstance';
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

describe('BlockInstance — geometry', () => {
  it('renders exactly three X-segment bands when all three are present', () => {
    render(<BlockInstance block={baseBlock} slotHeightPx={32} />);
    expect(screen.getByTestId('sg-aband-pre')).toBeDefined();
    expect(screen.getByTestId('sg-dband')).toBeDefined();
    expect(screen.getByTestId('sg-aband-post')).toBeDefined();
  });

  it('omits A-pre band when asstPreMin === 0', () => {
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
  it('renders exam-glyph overlay only when isHygieneBlock is true', () => {
    const { rerender } = render(
      <BlockInstance block={baseBlock} slotHeightPx={32} />,
    );
    expect(screen.queryByTestId('sg-hygiene-exam-glyph')).toBeNull();
    rerender(
      <BlockInstance block={baseBlock} slotHeightPx={32} isHygieneBlock />,
    );
    expect(screen.getByTestId('sg-hygiene-exam-glyph')).toBeDefined();
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
