import { CaptureGateTracker } from './capture-gate';

describe('CaptureGateTracker', () => {
  it('does not confirm a region until the buffer has 8 samples, even at 100% pass rate', () => {
    const tracker = new CaptureGateTracker(['head']);
    let result;
    for (let i = 0; i < 7; i += 1) {
      result = tracker.update({ head: true }, i * 10);
    }
    expect(result!.confirmed.head).toBe(false);
    expect(result!.allRequiredConfirmed).toBe(false);
  });

  it('confirms a region once >=70% of the last 8 samples pass', () => {
    const tracker = new CaptureGateTracker(['head']);
    // 6 pass, 2 fail out of 8 => 75% >= 70%
    const raw = [true, true, false, true, true, false, true, true];
    let result;
    raw.forEach((value, i) => {
      result = tracker.update({ head: value }, i * 10);
    });
    expect(result!.confirmed.head).toBe(true);
  });

  it('does not confirm a region when fewer than 70% of the last 8 samples pass', () => {
    const tracker = new CaptureGateTracker(['head']);
    // 5 pass, 3 fail out of 8 => 62.5% < 70%
    const raw = [true, true, false, true, true, false, true, false];
    let result;
    raw.forEach((value, i) => {
      result = tracker.update({ head: value }, i * 10);
    });
    expect(result!.confirmed.head).toBe(false);
  });

  it('only reports isReadyToCapture after all required regions have held confirmed for holdMs', () => {
    const tracker = new CaptureGateTracker(['head', 'torso'], { holdMs: 500 });
    let now = 0;
    let result;
    // warm up both regions to confirmed (8 true samples each)
    for (let i = 0; i < 8; i += 1) {
      result = tracker.update({ head: true, torso: true }, now);
      now += 100;
    }
    expect(result!.allRequiredConfirmed).toBe(true);
    // not ready yet -- hold clock only just started
    expect(result!.isReadyToCapture).toBe(false);

    // advance past the hold window while staying confirmed
    for (let i = 0; i < 5; i += 1) {
      result = tracker.update({ head: true, torso: true }, now);
      now += 100;
    }
    expect(result!.isReadyToCapture).toBe(true);
  });

  it('resets the hold clock when a required region drops out of confirmation', () => {
    const tracker = new CaptureGateTracker(['head'], { holdMs: 200 });
    let now = 0;
    let result;
    for (let i = 0; i < 8; i += 1) {
      result = tracker.update({ head: true }, now);
      now += 50;
    }
    now += 300;
    result = tracker.update({ head: true }, now);
    expect(result!.isReadyToCapture).toBe(true);

    // a single bad frame starts dragging the rolling average down; feed enough
    // bad frames to actually flip confirmed to false, which must reset the hold clock
    for (let i = 0; i < 8; i += 1) {
      result = tracker.update({ head: false }, now);
      now += 50;
    }
    expect(result!.confirmed.head).toBe(false);
    expect(result!.isReadyToCapture).toBe(false);

    now += 50;
    result = tracker.update({ head: true }, now);
    expect(result!.isReadyToCapture).toBe(false);
  });

  it('does not gate on regions outside the required list', () => {
    const tracker = new CaptureGateTracker(['head']);
    let now = 0;
    let result;
    for (let i = 0; i < 8; i += 1) {
      result = tracker.update({ head: true, legs: false }, now);
      now += 100;
    }
    expect(result!.confirmed.legs).toBe(false);
    expect(result!.allRequiredConfirmed).toBe(true);
  });

  describe('getDebugSnapshot', () => {
    it('returns null for a region that has never been pushed to', () => {
      const tracker = new CaptureGateTracker(['head']);
      expect(tracker.getDebugSnapshot('head')).toBeNull();
    });

    it('returns the raw samples (oldest first) and the pass ratio they compute', () => {
      const tracker = new CaptureGateTracker(['head']);
      let now = 0;
      const raw = [true, true, false, true, true, false, true, true];
      raw.forEach((value) => {
        tracker.update({ head: value }, now);
        now += 100;
      });

      const snapshot = tracker.getDebugSnapshot('head');
      expect(snapshot?.samples).toEqual(raw);
      expect(snapshot?.passRatio).toBeCloseTo(6 / 8, 5);
    });
  });
});
