import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { Input } from './input';
import { Label } from './label';

const meta = {
  title: 'ui/Label',
  component: Label,
  tags: ['autodocs'],
  args: {
    children: 'Email address',
  },
} satisfies Meta<typeof Label>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithControl: Story = {
  render: () => (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="story-email">Email address</Label>
      <Input id="story-email" type="email" placeholder="you@example.com" />
    </div>
  ),
};
