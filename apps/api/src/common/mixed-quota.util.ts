/**
 * Merges two mode-scoped pools (FULL and PULSE) into one list, taking up to
 * `fullQuota` from the first pool and `pulseQuota` from the second — and
 * backfilling from whichever pool has spare candidates when the other is
 * scarce, so the combined result stays at fullQuota+pulseQuota total
 * whenever enough items of either mode exist, rather than silently
 * shrinking. Without this, a steady stream of daily Pulse completions would
 * otherwise crowd out the richer FULL-assessment context/recommendations
 * over time.
 *
 * Each pool must already be sorted in the caller's preferred order (most
 * callers want recency, one wants priority-then-recency) — this function
 * only decides *how many* from each pool to take, not how to order within a
 * pool. `compare` re-sorts the final merged set (e.g. back into recency, or
 * priority-then-recency) since interleaving two pre-sorted pools doesn't
 * itself produce a globally sorted result.
 */
export function selectMixedQuota<T>(
  fullItems: T[],
  pulseItems: T[],
  fullQuota: number,
  pulseQuota: number,
  compare: (a: T, b: T) => number,
): T[] {
  const totalQuota = fullQuota + pulseQuota;
  let selectedFull = fullItems.slice(0, fullQuota);
  let selectedPulse = pulseItems.slice(0, pulseQuota);

  const fullShortfall = fullQuota - selectedFull.length;
  const pulseShortfall = pulseQuota - selectedPulse.length;

  if (fullShortfall > 0) {
    selectedPulse = [...selectedPulse, ...pulseItems.slice(selectedPulse.length, selectedPulse.length + fullShortfall)];
  }
  if (pulseShortfall > 0) {
    selectedFull = [...selectedFull, ...fullItems.slice(selectedFull.length, selectedFull.length + pulseShortfall)];
  }

  return [...selectedFull, ...selectedPulse].sort(compare).slice(0, totalQuota);
}
