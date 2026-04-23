/**
 * useScheduleView — Sprint 2 Stream B store unit tests.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useScheduleView, ZOOM_ROW_HEIGHT_PX } from '../use-schedule-view';

describe('useScheduleView', () => {
  beforeEach(() => {
    useScheduleView.setState({
      zoom: 'default',
      cursor: null,
      hoveredBlockId: null,
      selectedBlockId: null,
      showDoctorFlow: false,
    });
  });

  it('has sensible defaults', () => {
    const s = useScheduleView.getState();
    expect(s.zoom).toBe('default');
    expect(s.cursor).toBeNull();
    expect(s.hoveredBlockId).toBeNull();
    expect(s.selectedBlockId).toBeNull();
    expect(s.showDoctorFlow).toBe(false);
  });

  it('zoomIn / zoomOut cycles through fit → compact → default → expanded', () => {
    const s = useScheduleView.getState();
    s.zoomIn();
    expect(useScheduleView.getState().zoom).toBe('expanded');
    s.zoomOut();
    expect(useScheduleView.getState().zoom).toBe('default');
    s.zoomOut();
    expect(useScheduleView.getState().zoom).toBe('compact');
    s.zoomOut();
    expect(useScheduleView.getState().zoom).toBe('fit');
    // can't go further
    s.zoomOut();
    expect(useScheduleView.getState().zoom).toBe('fit');
  });

  it('moveCursor respects bounds', () => {
    const s = useScheduleView.getState();
    s.moveCursor(5, 5, 3, 3);
    expect(useScheduleView.getState().cursor).toEqual({
      rowIndex: 2,
      colIndex: 2,
    });
    s.moveCursor(-10, -10, 3, 3);
    expect(useScheduleView.getState().cursor).toEqual({
      rowIndex: 0,
      colIndex: 0,
    });
  });

  it('toggleDoctorFlow flips state', () => {
    const s = useScheduleView.getState();
    s.toggleDoctorFlow();
    expect(useScheduleView.getState().showDoctorFlow).toBe(true);
    s.toggleDoctorFlow();
    expect(useScheduleView.getState().showDoctorFlow).toBe(false);
  });

  it('ZOOM_ROW_HEIGHT_PX matches design-token stops', () => {
    expect(ZOOM_ROW_HEIGHT_PX.fit).toBe(14);
    expect(ZOOM_ROW_HEIGHT_PX.compact).toBe(24);
    expect(ZOOM_ROW_HEIGHT_PX.default).toBe(32);
    expect(ZOOM_ROW_HEIGHT_PX.expanded).toBe(48);
  });
});
