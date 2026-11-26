import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { Checkbox } from './checkbox';
import { Label } from './label';

const meta = {
  title: 'ui/Checkbox',
  component: Checkbox,
  tags: ['autodocs'],
  args: {
    disabled: false,
  },
} satisfies Meta<typeof Checkbox>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Checked: Story = { args: { defaultChecked: true } };
export const Disabled: Story = { args: { disabled: true } };
export const DisabledChecked: Story = { args: { disabled: true, defaultChecked: true } };

export const WithLabel: Story = {
  render: (args) => (
    <div className="flex items-center gap-2">
      <Checkbox id="story-consent" {...args} />
      <Label htmlFor="story-consent">I agree to the wellness disclaimer</Label>
    </div>
  ),
};
