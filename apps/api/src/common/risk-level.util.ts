import type { RiskLevel } from '@aidoctor/shared';

export function riskLevelForScore(score: number): RiskLevel {
  if (score >= 80) return 'LOW';
  if (score >= 60) return 'MODERATE';
  if (score >= 40) return 'ELEVATED';
  return 'HIGH';
}
