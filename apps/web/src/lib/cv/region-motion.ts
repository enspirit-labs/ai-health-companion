export interface Point2D {
  x: number;
  y: number;
}

function totalMovement(history: Point2D[]): number {
  let total = 0;
  for (let i = 1; i < history.length; i += 1) {
    total += Math.hypot(history[i].x - history[i - 1].x, history[i].y - history[i - 1].y);
  }
  return total;
}

/**
 * Tracks a short rolling history of a region's centroid (e.g. the average
 * position of a set of landmarks) alongside a stable reference centroid
 * from elsewhere on the same face (e.g. the nose tip), and reports whether
 * the region has moved suspiciously little RELATIVE to how much the
 * reference moved over the same window.
 *
 * This is a proxy for "this region looks frozen/extrapolated while the rest
 * of the face is genuinely being tracked" — the pattern a face-mesh model
 * interpolating a hidden region tends to produce, since it has no real
 * visual signal to move against. Comparing relative movement (not an
 * absolute stillness threshold) is deliberate: a user genuinely holding
 * still moves every region by about the same (small) amount, so the ratio
 * stays high; a region a hand is covering moves far less than the rest of
 * the face does whenever the face actually moves.
 */
export class RegionMotionTracker {
  private regionHistory: Point2D[] = [];
  private referenceHistory: Point2D[] = [];

  constructor(private readonly windowSize = 8) {}

  /** Call once per inference tick. Passing null for either point (e.g. the
   * region/reference landmark wasn't detected this tick) resets that
   * history, since a gap makes the window's movement total meaningless. */
  update(regionCentroid: Point2D | null, referenceCentroid: Point2D | null): void {
    if (regionCentroid) {
      this.regionHistory.push(regionCentroid);
      if (this.regionHistory.length > this.windowSize) this.regionHistory.shift();
    } else {
      this.regionHistory = [];
    }
    if (referenceCentroid) {
      this.referenceHistory.push(referenceCentroid);
      if (this.referenceHistory.length > this.windowSize) this.referenceHistory.shift();
    } else {
      this.referenceHistory = [];
    }
  }

  /** True when the region moved suspiciously little relative to the
   * reference. False whenever there isn't enough history yet, or the
   * reference itself barely moved — holding still isn't suspicious on its
   * own; only a region lagging behind genuine head motion is. */
  isSuspiciouslyFrozen(minReferenceMovement: number, maxRegionToReferenceRatio: number): boolean {
    if (this.regionHistory.length < this.windowSize || this.referenceHistory.length < this.windowSize) return false;
    const referenceMovement = totalMovement(this.referenceHistory);
    if (referenceMovement < minReferenceMovement) return false;
    const regionMovement = totalMovement(this.regionHistory);
    return regionMovement / referenceMovement < maxRegionToReferenceRatio;
  }

  /** Read-only introspection for debug logging — not used by
   * isSuspiciouslyFrozen() itself. */
  getDebugSnapshot(): { regionMovement: number; referenceMovement: number; ratio: number | null } {
    const regionMovement = totalMovement(this.regionHistory);
    const referenceMovement = totalMovement(this.referenceHistory);
    return {
      regionMovement,
      referenceMovement,
      ratio: referenceMovement === 0 ? null : regionMovement / referenceMovement,
    };
  }
}
