import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Inbox } from 'lucide-react';

import { Button } from '@/components/ui/button';

import { EmptyState } from './empty-state';

const meta = {
  title: 'shared/EmptyState',
  component: EmptyState,
  tags: ['autodocs'],
} satisfies Meta<typeof EmptyState>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    message: 'No assessments completed yet.',
  },
};

export const WithIcon: Story = {
  args: {
    icon: Inbox,
    message: 'No assessments completed yet.',
  },
};

export const WithAction: Story = {
  args: {
    icon: Inbox,
    message: 'No assessments completed yet.',
    action: <Button size="sm">Start an assessment</Button>,
  },
};
