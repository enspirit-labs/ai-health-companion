import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { RiskLevelBadge } from './risk-level-badge';

const meta = {
  title: 'shared/RiskLevelBadge',
  component: RiskLevelBadge,
  tags: ['autodocs'],
  argTypes: {
    riskLevel: {
      control: 'select',
      options: ['LOW', 'MODERATE', 'ELEVATED', 'HIGH'],
    },
  },
  args: {
    riskLevel: 'LOW',
  },
} satisfies Meta<typeof RiskLevelBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

/** LOW and MODERATE both read "On track". */
export const Low: Story = {};
export const Moderate: Story = { args: { riskLevel: 'MODERATE' } };
/** "Worth a look". */
export const Elevated: Story = { args: { riskLevel: 'ELEVATED' } };
/** "Talk to someone" — the top band, deliberately not styled as critical. */
export const High: Story = { args: { riskLevel: 'HIGH' } };

export const AllLevels: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      <RiskLevelBadge riskLevel="LOW" />
      <RiskLevelBadge riskLevel="MODERATE" />
      <RiskLevelBadge riskLevel="ELEVATED" />
      <RiskLevelBadge riskLevel="HIGH" />
    </div>
  ),
};
