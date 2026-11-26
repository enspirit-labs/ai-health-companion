import { FACE_LM, type FaceLandmark } from './face-framing';
import { classifyFacePresence, eyeAspectRatio, LivenessTracker } from './face-liveness';

// MediaPipe's face mesh is 478 points; only the eye + nose anchors matter
// here, so the rest are filled with a placeholder.
const MESH_SIZE = 478;
const EYE_SPAN = 0.1;
const OPEN_EAR = 0.32;
const CLOSED_EAR = 0.1;

interface FaceOptions {
  ear?: number;
  earRight?: number;
  earLeft?: number;
  nose?: { x: number; y: number };
}

/** Builds a landmark set whose eyes have exactly the requested aspect
 * ratio(s): each eye's corners are `EYE_SPAN` apart horizontally and its
 * lids `ear * EYE_SPAN` apart vertically. */
function face(options: FaceOptions = {}): FaceLandmark[] {
  const earRight = options.earRight ?? options.ear ?? OPEN_EAR;
  const earLeft = options.earLeft ?? options.ear ?? OPEN_EAR;
  const nose = options.nose ?? { x: 0.5, y: 0.5 };

  const landmarks: FaceLandmark[] = Array.from({ length: MESH_SIZE }, () => ({ x: 0, y: 0 }));

  const buildEye = (indices: readonly number[], outerX: number, innerX: number, ear: number) => {
    const [outer, inner, top, bottom] = indices;
    const centerY = 0.4;
    const halfLid = (ear * EYE_SPAN) / 2;
    landmarks[outer] = { x: outerX, y: centerY };
    landmarks[inner] = { x: innerX, y: centerY };
    landmarks[top] = { x: (outerX + innerX) / 2, y: centerY - halfLid };
    landmarks[bottom] = { x: (outerX + innerX) / 2, y: centerY + halfLid };
  };

  buildEye(FACE_LM.rightEye, 0.4, 0.4 + EYE_SPAN, earRight);
  buildEye(FACE_LM.leftEye, 0.7, 0.7 - EYE_SPAN, earLeft);
  landmarks[FACE_LM.nose[0]] = nose;

  return landmarks;
}

function rotate(landmarks: FaceLandmark[], degrees: number): FaceLandmark[] {
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return landmarks.map(({ x, y }) => ({ x: x * cos - y * sin, y: x * sin + y * cos }));
}

describe('classifyFacePresence', () => {
  // "No person detected"
  it('reports none when the detector returned nothing', () => {
    expect(classifyFacePresence(undefined)).toBe('none');
    expect(classifyFacePresence([])).toBe('none');
  });

  // a present-but-empty landmark set is not a person
  it('reports none when the only landmark set is empty', () => {
    expect(classifyFacePresence([[]])).toBe('none');
  });

  // "Only one live human face is accepted"
  it('reports single for exactly one non-empty landmark set', () => {
    expect(classifyFacePresence([face()])).toBe('single');
  });

  // "Two or more people"
  it('reports multiple when a second face is detected', () => {
    expect(classifyFacePresence([face(), face()])).toBe('multiple');
  });

  // an empty trailing set must not read as a second person
  it('ignores empty sets when counting', () => {
    expect(classifyFacePresence([face(), []])).toBe('single');
  });
});

describe('eyeAspectRatio', () => {
  // no usable blink signal is distinct from "eyes closed"
  it('returns null when landmarks are missing or unusable', () => {
    expect(eyeAspectRatio(undefined)).toBeNull();
    expect(eyeAspectRatio([])).toBeNull();
  });

  // degenerate geometry must not divide by zero
  it('returns null when an eye has no horizontal span', () => {
    const landmarks = face();
    landmarks[FACE_LM.rightEye[1]] = { ...landmarks[FACE_LM.rightEye[0]] };
    expect(eyeAspectRatio(landmarks)).toBeNull();
  });

  // "Natural blinking"
  it('is markedly higher for open eyes than for closed eyes', () => {
    const open = eyeAspectRatio(face({ ear: OPEN_EAR }));
    const closed = eyeAspectRatio(face({ ear: CLOSED_EAR }));
    expect(open).toBeCloseTo(OPEN_EAR, 5);
    expect(closed).toBeCloseTo(CLOSED_EAR, 5);
    expect(open as number).toBeGreaterThan(closed as number);
  });

  // averaging both eyes, so a wink is not a full blink
  it('averages both eyes', () => {
    const ratio = eyeAspectRatio(face({ earRight: OPEN_EAR, earLeft: CLOSED_EAR }));
    expect(ratio).toBeCloseTo((OPEN_EAR + CLOSED_EAR) / 2, 5);
  });

  // head roll must not be read as a blink
  it('is unchanged by head roll', () => {
    const upright = eyeAspectRatio(face({ ear: OPEN_EAR })) as number;
    const rolled = eyeAspectRatio(rotate(face({ ear: OPEN_EAR }), 25)) as number;
    expect(rolled).toBeCloseTo(upright, 6);
  });
});

describe('LivenessTracker', () => {
  /** Nose position that drifts enough per tick to clear the static-frame
   * check, so blink-focused tests aren't accidentally testing motion. */
  function movingNose(tick: number) {
    return { x: 0.5 + tick * 0.002, y: 0.5 };
  }

  describe('update', () => {
    // "No person detected"
    it('reports no_face when there are no landmarks', () => {
      const tracker = new LivenessTracker();
      expect(tracker.update(undefined, 0)).toEqual({
        isLive: false,
        reason: 'no_face',
        eyesOpen: false,
        blinkCount: 0,
        motion: 0,
      });
    });

    // "Natural blinking" — nothing is live until it blinks
    it('reports awaiting_blink before any blink has been seen', () => {
      const tracker = new LivenessTracker();
      const result = tracker.update(face({ ear: OPEN_EAR, nose: movingNose(0) }), 0);
      expect(result.isLive).toBe(false);
      expect(result.reason).toBe('awaiting_blink');
    });

    // "Only one live human face is accepted" / §2
    it('becomes live after a full close-then-open blink cycle', () => {
      const tracker = new LivenessTracker();
      tracker.update(face({ ear: OPEN_EAR, nose: movingNose(0) }), 0);
      tracker.update(face({ ear: CLOSED_EAR, nose: movingNose(1) }), 130);
      const result = tracker.update(face({ ear: OPEN_EAR, nose: movingNose(2) }), 260);
      expect(result.isLive).toBe(true);
      expect(result.reason).toBeNull();
      expect(result.blinkCount).toBe(1);
    });

    // "Fake blinking" — a photo of shut eyes never reopens
    it('does not count eyes that close and stay closed', () => {
      const tracker = new LivenessTracker();
      tracker.update(face({ ear: OPEN_EAR, nose: movingNose(0) }), 0);
      let result = tracker.update(face({ ear: CLOSED_EAR, nose: movingNose(1) }), 130);
      result = tracker.update(face({ ear: CLOSED_EAR, nose: movingNose(2) }), 260);
      result = tracker.update(face({ ear: CLOSED_EAR, nose: movingNose(3) }), 390);
      expect(result.blinkCount).toBe(0);
      expect(result.reason).toBe('awaiting_blink');
    });

    // "Synthetic movement" — EAR noise must not fake blinks
    it('ignores EAR noise that never crosses the closed threshold', () => {
      const tracker = new LivenessTracker();
      // 0.21 sits between the 0.18 closed and 0.24 open defaults.
      const noisy = [OPEN_EAR, 0.21, OPEN_EAR, 0.21, OPEN_EAR, 0.21];
      let result = tracker.update(face({ ear: OPEN_EAR, nose: movingNose(0) }), 0);
      noisy.forEach((ear, i) => {
        result = tracker.update(face({ ear, nose: movingNose(i + 1) }), (i + 1) * 130);
      });
      expect(result.blinkCount).toBe(0);
      expect(result.isLive).toBe(false);
    });

    // "Synthetic movement" — once armed (eyes read closed),
    // hovering in the mid-zone between the two thresholds must not complete
    // the blink; only actually reaching earOpenThreshold should. The prior
    // "ignores EAR noise" test above never drives the tracker into the
    // eyesClosed=true state at all, so it can't tell a real two-threshold
    // hysteresis apart from a single-cutpoint implementation that happens to
    // never cross that cutpoint. This drives it into the armed state first.
    it('does not complete a blink from mid-zone noise while armed, only from crossing the open threshold', () => {
      const tracker = new LivenessTracker();
      tracker.update(face({ ear: OPEN_EAR, nose: movingNose(0) }), 0);
      // Arm the blink: drop to/below the closed threshold (0.18).
      tracker.update(face({ ear: CLOSED_EAR, nose: movingNose(1) }), 130);
      // Hover in the mid-zone (above 0.18, below the 0.24 open threshold)
      // several times — none of this should complete the blink.
      let result = tracker.update(face({ ear: 0.2, nose: movingNose(2) }), 260);
      expect(result.blinkCount).toBe(0);
      result = tracker.update(face({ ear: 0.21, nose: movingNose(3) }), 390);
      expect(result.blinkCount).toBe(0);
      result = tracker.update(face({ ear: 0.19, nose: movingNose(4) }), 520);
      expect(result.blinkCount).toBe(0);
      expect(result.reason).toBe('awaiting_blink');
      // Only now cross the actual open threshold — exactly one blink, not
      // one per mid-zone tick that a single-cutpoint bug would have counted.
      result = tracker.update(face({ ear: OPEN_EAR, nose: movingNose(5) }), 650);
      expect(result.blinkCount).toBe(1);
      expect(result.isLive).toBe(true);
    });

    // bounded recency, so one blink can't vouch indefinitely
    it('stops reading live once the last blink falls outside the recency window', () => {
      const tracker = new LivenessTracker({ blinkWindowMs: 1_000 });
      tracker.update(face({ ear: OPEN_EAR, nose: movingNose(0) }), 0);
      tracker.update(face({ ear: CLOSED_EAR, nose: movingNose(1) }), 100);
      expect(tracker.update(face({ ear: OPEN_EAR, nose: movingNose(2) }), 200).isLive).toBe(true);

      const later = tracker.update(face({ ear: OPEN_EAR, nose: movingNose(3) }), 5_000);
      expect(later.isLive).toBe(false);
      expect(later.reason).toBe('awaiting_blink');
      expect(later.blinkCount).toBe(0);
    });

    // ISS-4 / §2 — expiry must be per-timestamp, not "clear them
    // all". The test above records exactly one blink and lets it expire, so a
    // pruneBlinks() that just empties the array whenever anything is stale
    // would pass it identically. Two blinks, only the older one outside the
    // window, is the case that tells those apart.
    it('prunes only the blinks outside the recency window, keeping the recent one', () => {
      const tracker = new LivenessTracker({ blinkWindowMs: 1_000 });
      tracker.update(face({ ear: OPEN_EAR, nose: movingNose(0) }), 0);
      tracker.update(face({ ear: CLOSED_EAR, nose: movingNose(1) }), 100);
      // Blink #1 completes at t=200 — 1_300 ms before the final tick, stale.
      tracker.update(face({ ear: OPEN_EAR, nose: movingNose(2) }), 200);
      tracker.update(face({ ear: CLOSED_EAR, nose: movingNose(3) }), 700);
      // Blink #2 completes at t=800 — 700 ms before the final tick, still fresh.
      expect(tracker.update(face({ ear: OPEN_EAR, nose: movingNose(4) }), 800).blinkCount).toBe(2);

      const later = tracker.update(face({ ear: OPEN_EAR, nose: movingNose(5) }), 1_500);
      expect(later.blinkCount).toBe(1);
      expect(later.isLive).toBe(true);
      expect(later.reason).toBeNull();
    });

    // "Static image"/"Paused video", §2 "Frozen frames"
    it('reports static_frame once a perfectly still feed fills the motion window', () => {
      const tracker = new LivenessTracker({ motionWindowSize: 4 });
      const still = face({ ear: OPEN_EAR, nose: { x: 0.5, y: 0.5 } });
      let result = tracker.update(still, 0);
      for (let i = 1; i < 4; i += 1) result = tracker.update(still, i * 130);
      expect(result.reason).toBe('static_frame');
      expect(result.isLive).toBe(false);
      expect(result.motion).toBe(0);
    });

    // must not false-reject before there's enough history
    it('does not report static_frame before the motion window fills', () => {
      const tracker = new LivenessTracker({ motionWindowSize: 4 });
      const still = face({ ear: OPEN_EAR, nose: { x: 0.5, y: 0.5 } });
      const result = tracker.update(still, 0);
      expect(result.reason).toBe('awaiting_blink');
    });

    // "Natural facial movement" — a live face always drifts
    it('does not flag natural micro-motion as a static frame', () => {
      const tracker = new LivenessTracker({ motionWindowSize: 4 });
      let result = tracker.update(face({ ear: OPEN_EAR, nose: movingNose(0) }), 0);
      for (let i = 1; i < 6; i += 1) {
        result = tracker.update(face({ ear: OPEN_EAR, nose: movingNose(i) }), i * 130);
      }
      expect(result.reason).toBe('awaiting_blink');
      expect(result.motion).toBeGreaterThan(0);
    });

    // ISS-3 / §2 — the two tests below straddle the 0.004
    // minNaturalMotion default from either side, ~15% out, so the threshold
    // itself is pinned. Every other static_frame test feeds exactly zero
    // motion and the passing-motion test drifts well clear of the floor, which
    // together would leave `motion < minNaturalMotion` and `motion === 0`
    // indistinguishable. motionWindowSize 4 = 3 gaps between samples.
    it('reports static_frame for drift just below the natural-motion floor', () => {
      const tracker = new LivenessTracker({ motionWindowSize: 4 });
      // 3 × 0.0011 = 0.0033 of total travel, under the 0.004 floor.
      let result = tracker.update(face({ ear: OPEN_EAR, nose: { x: 0.5, y: 0.5 } }), 0);
      for (let i = 1; i < 4; i += 1) {
        result = tracker.update(face({ ear: OPEN_EAR, nose: { x: 0.5 + i * 0.0011, y: 0.5 } }), i * 130);
      }
      expect(result.motion).toBeCloseTo(0.0033, 6);
      // Guards against a `motion === 0` reading of "static": this feed moves.
      expect(result.motion).toBeGreaterThan(0);
      expect(result.reason).toBe('static_frame');
      expect(result.isLive).toBe(false);
    });

    it('does not report static_frame for drift just above the natural-motion floor', () => {
      const tracker = new LivenessTracker({ motionWindowSize: 4 });
      // 3 × 0.0015 = 0.0045 of total travel, over the 0.004 floor — only
      // ~36% more movement than the rejected case above.
      let result = tracker.update(face({ ear: OPEN_EAR, nose: { x: 0.5, y: 0.5 } }), 0);
      for (let i = 1; i < 4; i += 1) {
        result = tracker.update(face({ ear: OPEN_EAR, nose: { x: 0.5 + i * 0.0015, y: 0.5 } }), i * 130);
      }
      expect(result.motion).toBeCloseTo(0.0045, 6);
      expect(result.reason).not.toBe('static_frame');
      expect(result.reason).toBe('awaiting_blink');
    });

    // guidance must name the real problem, not ask a photo to blink
    it('reports static_frame in preference to awaiting_blink', () => {
      const tracker = new LivenessTracker({ motionWindowSize: 4 });
      const still = face({ ear: OPEN_EAR, nose: { x: 0.5, y: 0.5 } });
      let result = tracker.update(still, 0);
      for (let i = 1; i < 4; i += 1) result = tracker.update(still, i * 130);
      expect(result.blinkCount).toBe(0);
      expect(result.reason).toBe('static_frame');
    });

    // a gap makes the window total meaningless (matches
    // RegionMotionTracker.update(null) semantics)
    it('restarts the motion window when the face is lost', () => {
      const tracker = new LivenessTracker({ motionWindowSize: 4 });
      const still = face({ ear: OPEN_EAR, nose: { x: 0.5, y: 0.5 } });
      for (let i = 0; i < 4; i += 1) tracker.update(still, i * 130);
      expect(tracker.update(still, 520).reason).toBe('static_frame');

      expect(tracker.update(undefined, 650).reason).toBe('no_face');
      expect(tracker.update(still, 780).reason).toBe('awaiting_blink');
    });

    // losing the face briefly must not erase a genuine blink
    it('keeps blink history across a momentary loss of the face', () => {
      const tracker = new LivenessTracker();
      tracker.update(face({ ear: OPEN_EAR, nose: movingNose(0) }), 0);
      tracker.update(face({ ear: CLOSED_EAR, nose: movingNose(1) }), 130);
      tracker.update(face({ ear: OPEN_EAR, nose: movingNose(2) }), 260);
      expect(tracker.update(undefined, 390).blinkCount).toBe(1);
      expect(tracker.update(face({ ear: OPEN_EAR, nose: movingNose(4) }), 520).isLive).toBe(true);
    });

    // ISS-6 / §5 — isLive stays true for the whole blink-recency
    // window, so it can't be what keeps a capture off a mid-blink frame.
    // eyesOpen is the per-tick signal that can.
    it('reports eyesOpen false on a shut-eye tick even while the feed still reads live', () => {
      const tracker = new LivenessTracker();
      tracker.update(face({ ear: OPEN_EAR, nose: movingNose(0) }), 0);
      tracker.update(face({ ear: CLOSED_EAR, nose: movingNose(1) }), 130);
      const afterBlink = tracker.update(face({ ear: OPEN_EAR, nose: movingNose(2) }), 260);
      expect(afterBlink.isLive).toBe(true);
      expect(afterBlink.eyesOpen).toBe(true);

      const midBlink = tracker.update(face({ ear: CLOSED_EAR, nose: movingNose(3) }), 390);
      expect(midBlink.isLive).toBe(true);
      expect(midBlink.eyesOpen).toBe(false);
    });

    // ISS-6 — a half-shut eye in the hysteresis mid-zone is not a frame worth
    // capturing either, so eyesOpen keys off earOpenThreshold rather than the
    // (looser) earClosedThreshold.
    it('reports eyesOpen false for a half-shut eye between the two thresholds', () => {
      const tracker = new LivenessTracker();
      // 0.21 sits between the 0.18 closed and 0.24 open defaults.
      const result = tracker.update(face({ ear: 0.21, nose: movingNose(0) }), 0);
      expect(result.eyesOpen).toBe(false);
    });
  });

  describe('reset', () => {
    // a previous attempt's blink can't vouch for a retake
    it('clears blink and motion history', () => {
      const tracker = new LivenessTracker();
      tracker.update(face({ ear: OPEN_EAR, nose: movingNose(0) }), 0);
      tracker.update(face({ ear: CLOSED_EAR, nose: movingNose(1) }), 130);
      expect(tracker.update(face({ ear: OPEN_EAR, nose: movingNose(2) }), 260).isLive).toBe(true);

      tracker.reset();
      const afterReset = tracker.update(face({ ear: OPEN_EAR, nose: movingNose(3) }), 390);
      expect(afterReset.isLive).toBe(false);
      expect(afterReset.reason).toBe('awaiting_blink');
      expect(tracker.getDebugSnapshot()).toEqual({ eyesClosed: false, blinkCount: 0, motion: 0, samples: 1 });
    });
  });
});
