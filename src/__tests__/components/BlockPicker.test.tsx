import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import BlockPicker from '@/components/schedule/BlockPicker';
import { useBlockTypeStore, BLOCK_TYPE_STORAGE_KEY, type LibraryBlockType } from '@/store/block-type-store';
import { defaultBlockTypes } from '@/lib/mock-data';

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function resetStore() {
  localStorage.removeItem(BLOCK_TYPE_STORAGE_KEY);
  useBlockTypeStore.setState({
    blockTypes: defaultBlockTypes.map((bt) => ({ ...bt, isCustom: false })),
  });
}

const noop = () => {};

// ────────────────────────────────────────────────────────────────────────────
// Tests: BlockPicker with explicit prop blockTypes
// ────────────────────────────────────────────────────────────────────────────

describe('BlockPicker - explicit blockTypes prop', () => {
  const doctorTypes = defaultBlockTypes.filter((bt) => bt.appliesToRole === 'DOCTOR');
  const hygienistTypes = defaultBlockTypes.filter((bt) => bt.appliesToRole === 'HYGIENIST');

  it('renders doctor block types for DOCTOR provider', () => {
    render(
      <BlockPicker
        blockTypes={[...doctorTypes, ...hygienistTypes]}
        providerRole="DOCTOR"
        onSelect={noop}
        onClose={noop}
        timeLabel="08:00"
      />
    );

    // Should show doctor types
    doctorTypes.forEach((bt) => {
      expect(screen.getByText(bt.label)).toBeInTheDocument();
    });

    // Should NOT show hygienist-only types
    hygienistTypes.forEach((bt) => {
      expect(screen.queryByText(bt.label)).not.toBeInTheDocument();
    });
  });

  it('renders hygienist block types for HYGIENIST provider', () => {
    render(
      <BlockPicker
        blockTypes={[...doctorTypes, ...hygienistTypes]}
        providerRole="HYGIENIST"
        onSelect={noop}
        onClose={noop}
        timeLabel="09:00"
      />
    );

    hygienistTypes.forEach((bt) => {
      expect(screen.getByText(bt.label)).toBeInTheDocument();
    });

    doctorTypes.forEach((bt) => {
      expect(screen.queryByText(bt.label)).not.toBeInTheDocument();
    });
  });

  it('shows BOTH types for both provider roles', () => {
    const bothType: LibraryBlockType = {
      id: 'both-1',
      label: 'CONSULT',
      appliesToRole: 'BOTH',
      durationMin: 30,
    };

    const { rerender } = render(
      <BlockPicker
        blockTypes={[bothType]}
        providerRole="DOCTOR"
        onSelect={noop}
        onClose={noop}
        timeLabel="10:00"
      />
    );
    expect(screen.getByText('CONSULT')).toBeInTheDocument();

    rerender(
      <BlockPicker
        blockTypes={[bothType]}
        providerRole="HYGIENIST"
        onSelect={noop}
        onClose={noop}
        timeLabel="10:00"
      />
    );
    expect(screen.getByText('CONSULT')).toBeInTheDocument();
  });

  it('returns null when no applicable blocks', () => {
    const { container } = render(
      <BlockPicker
        blockTypes={[]}
        providerRole="DOCTOR"
        onSelect={noop}
        onClose={noop}
        timeLabel="08:00"
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('calls onSelect with the block type when clicked', () => {
    const onSelect = vi.fn();
    const type = doctorTypes[0];

    render(
      <BlockPicker
        blockTypes={doctorTypes}
        providerRole="DOCTOR"
        onSelect={onSelect}
        onClose={noop}
        timeLabel="08:00"
      />
    );

    fireEvent.click(screen.getByText(type.label));
    expect(onSelect).toHaveBeenCalledWith(type);
  });

  it('calls onClose when the X button is clicked', () => {
    const onClose = vi.fn();

    render(
      <BlockPicker
        blockTypes={doctorTypes}
        providerRole="DOCTOR"
        onSelect={noop}
        onClose={onClose}
        timeLabel="08:00"
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('displays the time label in the header', () => {
    render(
      <BlockPicker
        blockTypes={doctorTypes}
        providerRole="DOCTOR"
        onSelect={noop}
        onClose={noop}
        timeLabel="14:30"
      />
    );
    expect(screen.getByText(/14:30/)).toBeInTheDocument();
  });

  it('shows production amount when minimumAmount is set', () => {
    const type: LibraryBlockType = {
      id: 'hp-test',
      label: 'HP',
      appliesToRole: 'DOCTOR',
      durationMin: 60,
      minimumAmount: 1200,
    };

    render(
      <BlockPicker
        blockTypes={[type]}
        providerRole="DOCTOR"
        onSelect={noop}
        onClose={noop}
        timeLabel="08:00"
      />
    );

    expect(screen.getByText('$1200')).toBeInTheDocument();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Tests: BlockPicker falling back to global store
// ────────────────────────────────────────────────────────────────────────────

describe('BlockPicker - global store fallback (no blockTypes prop)', () => {
  beforeEach(() => {
    resetStore();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('renders block types from the global store when no prop is provided', () => {
    const { blockTypes } = useBlockTypeStore.getState();
    const doctorTypes = blockTypes.filter((bt) => bt.appliesToRole === 'DOCTOR');

    render(
      <BlockPicker
        providerRole="DOCTOR"
        onSelect={noop}
        onClose={noop}
        timeLabel="08:00"
      />
    );

    // Should render at least one doctor type from the store
    expect(doctorTypes.length).toBeGreaterThan(0);
    expect(screen.getByText(doctorTypes[0].label)).toBeInTheDocument();
  });

  // ── KEY INTEGRATION TEST ───────────────────────────────────────────────────
  it('newly added custom type appears in BlockPicker automatically', () => {
    // Add a custom type via the store
    const result = useBlockTypeStore.getState().addBlockType({
      label: 'Invisalign Consult',
      description: 'Consultation for Invisalign treatment',
      appliesToRole: 'DOCTOR',
      durationMin: 45,
      minimumAmount: 500,
      color: '#6366f1',
    });

    expect(result.success).toBe(true);

    // Render BlockPicker without explicit blockTypes — it should pull from the store
    render(
      <BlockPicker
        providerRole="DOCTOR"
        onSelect={noop}
        onClose={noop}
        timeLabel="10:00"
      />
    );

    // The custom type should now be visible in the picker
    expect(screen.getByText('Invisalign Consult')).toBeInTheDocument();
  });

  it('custom hygienist type appears for HYGIENIST provider only', () => {
    useBlockTypeStore.getState().addBlockType({
      label: 'Wisdom Extraction Prep',
      appliesToRole: 'HYGIENIST',
      durationMin: 60,
    });

    // Should appear for HYGIENIST
    const { unmount } = render(
      <BlockPicker
        providerRole="HYGIENIST"
        onSelect={noop}
        onClose={noop}
        timeLabel="08:00"
      />
    );
    expect(screen.getByText('Wisdom Extraction Prep')).toBeInTheDocument();
    unmount();

    // Should NOT appear for DOCTOR
    render(
      <BlockPicker
        providerRole="DOCTOR"
        onSelect={noop}
        onClose={noop}
        timeLabel="08:00"
      />
    );
    expect(screen.queryByText('Wisdom Extraction Prep')).not.toBeInTheDocument();
  });

  it('deleted custom type no longer appears in BlockPicker', () => {
    const result = useBlockTypeStore.getState().addBlockType({
      label: 'Veneer Prep',
      appliesToRole: 'DOCTOR',
      durationMin: 90,
    });
    if (!result.success) throw new Error('setup failed');

    useBlockTypeStore.getState().deleteBlockType(result.blockType.id);

    render(
      <BlockPicker
        providerRole="DOCTOR"
        onSelect={noop}
        onClose={noop}
        timeLabel="08:00"
      />
    );

    expect(screen.queryByText('Veneer Prep')).not.toBeInTheDocument();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Edge cases
// ────────────────────────────────────────────────────────────────────────────

describe('BlockPicker - edge cases', () => {
  beforeEach(resetStore);
  afterEach(() => localStorage.clear());

  it('explicit blockTypes prop takes precedence over store', () => {
    // Add something to store
    useBlockTypeStore.getState().addBlockType({
      label: 'Store Only Type',
      appliesToRole: 'DOCTOR',
      durationMin: 30,
    });

    const explicitTypes: LibraryBlockType[] = [
      { id: 'explicit-1', label: 'Explicit Type', appliesToRole: 'DOCTOR', durationMin: 30 },
    ];

    render(
      <BlockPicker
        blockTypes={explicitTypes}
        providerRole="DOCTOR"
        onSelect={noop}
        onClose={noop}
        timeLabel="08:00"
      />
    );

    // Only the explicit type should be shown, not the store type
    expect(screen.getByText('Explicit Type')).toBeInTheDocument();
    expect(screen.queryByText('Store Only Type')).not.toBeInTheDocument();
  });

  it('renders color dot when color is set on a block type', () => {
    const typeWithColor: LibraryBlockType = {
      id: 'color-test',
      label: 'Colorful Block',
      appliesToRole: 'DOCTOR',
      durationMin: 30,
      color: '#ff0000',
    };

    render(
      <BlockPicker
        blockTypes={[typeWithColor]}
        providerRole="DOCTOR"
        onSelect={noop}
        onClose={noop}
        timeLabel="08:00"
      />
    );

    // Label should be visible
    expect(screen.getByText('Colorful Block')).toBeInTheDocument();
    // Color dot should be rendered with the correct background color
    const colorDot = document.querySelector('[style*="background-color: rgb(255, 0, 0)"]');
    expect(colorDot).toBeTruthy();
  });
});
