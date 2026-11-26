import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { Progress } from './progress';

const meta = {
  title: 'ui/Progress',
  component: Progress,
  tags: ['autodocs'],
  argTypes: {
    value: { control: { type: 'range', min: 0, max: 100, step: 5 } },
  },
  args: {
    value: 40,
  },
  render: (args) => (
    <div className="w-64">
      <Progress {...args} />
    </div>
  ),
} satisfies Meta<typeof Progress>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Empty: Story = { args: { value: 0 } };
export const HalfWay: Story = { args: { value: 50 } };
export const Complete: Story = { args: { value: 100 } };
