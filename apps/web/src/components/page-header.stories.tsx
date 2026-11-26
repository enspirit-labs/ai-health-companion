import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Activity } from 'lucide-react';

import { Button } from '@/components/ui/button';

import { PageHeader } from './page-header';

const meta = {
  title: 'shared/PageHeader',
  component: PageHeader,
  tags: ['autodocs'],
} satisfies Meta<typeof PageHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    title: 'Squats assessment',
  },
};

export const WithIconAndDescription: Story = {
  args: {
    title: 'Squats assessment',
    icon: Activity,
    description: 'Tracks form, depth, and repetition count.',
  },
};

export const WithBackLink: Story = {
  args: {
    title: 'Squats assessment',
    icon: Activity,
    backHref: '/dashboard',
  },
};

export const WithActions: Story = {
  args: {
    title: 'Squats assessment',
    icon: Activity,
    backHref: '/dashboard',
    actions: <Button size="sm">Retake</Button>,
  },
};
