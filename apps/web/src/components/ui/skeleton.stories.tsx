import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { Skeleton } from './skeleton';

const meta = {
  title: 'ui/Skeleton',
  component: Skeleton,
  tags: ['autodocs'],
} satisfies Meta<typeof Skeleton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { className: 'h-4 w-48' },
};

export const CardPlaceholder: Story = {
  render: () => (
    <div className="flex w-80 flex-col gap-3 rounded-xl border p-4">
      <Skeleton className="h-5 w-32" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-5/6" />
      <Skeleton className="h-9 w-24" />
    </div>
  ),
};

export const Avatar: Story = {
  args: { className: 'size-10 rounded-full' },
};
