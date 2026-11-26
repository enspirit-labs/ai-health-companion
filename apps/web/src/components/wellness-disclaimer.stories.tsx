import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { InlineWellnessDisclaimer, WellnessDisclaimer } from './wellness-disclaimer';

const meta = {
  title: 'shared/WellnessDisclaimer',
  component: WellnessDisclaimer,
  tags: ['autodocs'],
} satisfies Meta<typeof WellnessDisclaimer>;

export default meta;
type Story = StoryObj<typeof meta>;

/** As rendered once in the root layout, on every page. */
export const Footer: Story = {};

export const Inline: Story = {
  render: () => (
    <div className="w-96">
      <InlineWellnessDisclaimer />
    </div>
  ),
};
