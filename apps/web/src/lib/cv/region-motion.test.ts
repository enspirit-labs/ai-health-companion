import { RegionMotionTracker } from './region-motion';

const WINDOW = 4;

function feed(tracker: RegionMotionTracker, regionPoints: Array<{ x: number; y: number } | null>, referencePoints: Array<{ x: number; y: number } | null>) {
  regionPoints.forEach((point, i) => tracker.update(point, referencePoints[i]));
}

describe('RegionMotionTracker', () => {
  it('is not suspicious before the window fills up', () => {
    const tracker = new RegionMotionTracker(WINDOW);
    tracker.update({ x: 0.5, y: 0.5 }, { x: 0.5, y: 0.5 });
    expect(tracker.isSuspiciouslyFrozen(0.01, 0.2)).toBe(false);
  });

  it('is not suspicious when the reference itself barely moved (user holding still)', () => {
    const tracker = new RegionMotionTracker(WINDOW);
    const still = Array.from({ length: WINDOW }, () => ({ x: 0.5, y: 0.5 }));
    feed(tracker, still, still);
    expect(tracker.isSuspiciouslyFrozen(0.01, 0.2)).toBe(false);
  });

  it('is suspicious when the region stays still while the reference moves a lot', () => {
    const tracker = new RegionMotionTracker(WINDOW);
    const frozenRegion = Array.from({ length: WINDOW }, () => ({ x: 0.5, y: 0.5 }));
    const movingReference = [
      { x: 0.3, y: 0.5 },
      { x: 0.35, y: 0.5 },
      { x: 0.4, y: 0.5 },
      { x: 0.45, y: 0.5 },
    ];
    feed(tracker, frozenRegion, movingReference);
    expect(tracker.isSuspiciouslyFrozen(0.01, 0.2)).toBe(true);
  });

  it('is not suspicious when the region moves proportionally with the reference', () => {
    const tracker = new RegionMotionTracker(WINDOW);
    const movingRegion = [
      { x: 0.3, y: 0.5 },
      { x: 0.35, y: 0.5 },
      { x: 0.4, y: 0.5 },
      { x: 0.45, y: 0.5 },
    ];
    const movingReference = [
      { x: 0.3, y: 0.5 },
      { x: 0.35, y: 0.5 },
      { x: 0.4, y: 0.5 },
      { x: 0.45, y: 0.5 },
    ];
    feed(tracker, movingRegion, movingReference);
    expect(tracker.isSuspiciouslyFrozen(0.01, 0.2)).toBe(false);
  });

  it('resets its history when a point goes missing, requiring the window to refill', () => {
    const tracker = new RegionMotionTracker(WINDOW);
    const frozenRegion = Array.from({ length: WINDOW }, () => ({ x: 0.5, y: 0.5 }));
    const movingReference = [
      { x: 0.3, y: 0.5 },
      { x: 0.35, y: 0.5 },
      { x: 0.4, y: 0.5 },
      { x: 0.45, y: 0.5 },
    ];
    feed(tracker, frozenRegion, movingReference);
    expect(tracker.isSuspiciouslyFrozen(0.01, 0.2)).toBe(true);

    tracker.update(null, { x: 0.5, y: 0.5 });
    expect(tracker.isSuspiciouslyFrozen(0.01, 0.2)).toBe(false);
  });
});
