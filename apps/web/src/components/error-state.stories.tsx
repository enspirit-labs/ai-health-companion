import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { ErrorState } from './error-state';

const meta = {
  title: 'shared/ErrorState',
  component: ErrorState,
  tags: ['autodocs'],
} satisfies Meta<typeof ErrorState>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const CustomCopy: Story = {
  args: {
    title: "Couldn't load your dashboard",
    description: 'Check your connection and try again.',
  },
};

export const WithRetry: Story = {
  args: {
    onRetry: () => {},
  },
};
