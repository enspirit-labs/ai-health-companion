import { dashboardDimensionHref, isDimensionTileVisible } from './dimension-links';

const FLAGS_OFF = { dailyPulse: true, slackReminders: false, assessmentVoice: false, assessmentTongue: false };

describe('dashboardDimensionHref', () => {
  it('sends a scored tile to history', () => {
    expect(dashboardDimensionHref('tongue', 70, FLAGS_OFF)).toBe('/assessments/history');
  });

  it('deep-links an unscored tile to its single source assessment', () => {
    expect(dashboardDimensionHref('skin', null, FLAGS_OFF)).toBe('/assessments/skin');
  });

  it('deep-links the new Face, Eye and Memory tiles to their own assessments', () => {
    expect(dashboardDimensionHref('face', null, FLAGS_OFF)).toBe('/assessments/face');
    expect(dashboardDimensionHref('eye', null, FLAGS_OFF)).toBe('/assessments/eye');
    expect(dashboardDimensionHref('memory', null, FLAGS_OFF)).toBe('/assessments/memory');
  });

  it('falls back to the hub when the source assessment is switched off', () => {
    expect(dashboardDimensionHref('tongue', null, FLAGS_OFF)).toBe('/assessments');
  });

  it('fails closed to the hub when no flags are passed', () => {
    expect(dashboardDimensionHref('tongue', null)).toBe('/assessments');
  });

  it('deep-links to a gated source assessment once its flag is on', () => {
    expect(dashboardDimensionHref('tongue', null, { ...FLAGS_OFF, assessmentTongue: true })).toBe(
      '/assessments/tongue',
    );
  });

  it('deep-links an unscored Stress & Mental Wellness tile to its only source, the questionnaire', () => {
    expect(dashboardDimensionHref('mentalWellness', null, FLAGS_OFF)).toBe('/assessments/mental-wellness');
  });

  it('deep-links each empty physical-test tile to its own test', () => {
    expect(dashboardDimensionHref('squats', null, FLAGS_OFF)).toBe('/assessments/squats');
    expect(dashboardDimensionHref('handCoordination', null, FLAGS_OFF)).toBe('/assessments/hand-coordination');
    expect(dashboardDimensionHref('posture', null, FLAGS_OFF)).toBe('/assessments/posture');
  });
});

describe('isDimensionTileVisible', () => {
  it('always shows a tile that has a score, even if its source is hidden', () => {
    expect(isDimensionTileVisible('hair', 70, FLAGS_OFF)).toBe(true);
  });

  it('hides an empty tile whose only source is hidden from the picker', () => {
    expect(isDimensionTileVisible('hair', null, FLAGS_OFF)).toBe(false);
  });

  it('hides an empty Tongue tile while its assessment is switched off, and fails closed while flags load', () => {
    expect(isDimensionTileVisible('tongue', null, FLAGS_OFF)).toBe(false);
    expect(isDimensionTileVisible('tongue', null)).toBe(false);
    expect(isDimensionTileVisible('tongue', null, { ...FLAGS_OFF, assessmentTongue: true })).toBe(true);
  });

  it('hides an empty tile whose only source is switched off by its flag', () => {
    expect(isDimensionTileVisible('voice', null, FLAGS_OFF)).toBe(false);
    expect(isDimensionTileVisible('voice', null, { ...FLAGS_OFF, assessmentVoice: true })).toBe(true);
  });

  it('shows an empty tile whose source can be started', () => {
    expect(isDimensionTileVisible('face', null, FLAGS_OFF)).toBe(true);
    expect(isDimensionTileVisible('memory', null, FLAGS_OFF)).toBe(true);
  });

  it('shows empty Squats and Hand Coordination tiles, which can be started', () => {
    expect(isDimensionTileVisible('squats', null, FLAGS_OFF)).toBe(true);
    expect(isDimensionTileVisible('handCoordination', null, FLAGS_OFF)).toBe(true);
  });

  it('hides an empty Walking tile, since Walking is not on the Assessments page, but shows a scored one', () => {
    expect(isDimensionTileVisible('walking', null, FLAGS_OFF)).toBe(false);
    expect(isDimensionTileVisible('walking', 74, FLAGS_OFF)).toBe(true);
  });
});
