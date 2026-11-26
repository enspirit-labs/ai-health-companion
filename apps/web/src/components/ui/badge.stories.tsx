import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { Badge } from './badge';

const meta = {
  title: 'ui/Badge',
  component: Badge,
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'secondary', 'destructive', 'outline', 'good', 'warning', 'serious', 'critical'],
    },
  },
  args: {
    children: 'Badge',
    variant: 'default',
  },
} satisfies Meta<typeof Badge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      {(['default', 'secondary', 'destructive', 'outline'] as const).map((variant) => (
        <Badge key={variant} variant={variant}>
          {variant}
        </Badge>
      ))}
    </div>
  ),
};

/**
 * The status palette — used exclusively via RiskLevelBadge (see
 * src/components/risk-level-badge.stories.tsx) to render RiskLevel. Shown
 * here as raw Badge variants for reference; don't reach for these variants
 * directly outside that mapping.
 */
export const StatusVariants: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      {(['good', 'warning', 'serious', 'critical'] as const).map((variant) => (
        <Badge key={variant} variant={variant}>
          {variant}
        </Badge>
      ))}
    </div>
  ),
};
