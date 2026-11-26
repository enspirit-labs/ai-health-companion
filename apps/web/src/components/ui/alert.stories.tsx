import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { Alert } from './alert';

const meta = {
  title: 'ui/Alert',
  component: Alert,
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['info', 'success', 'warning', 'error'],
    },
  },
  args: {
    variant: 'info',
    title: 'Heads up',
    children: 'This is some supporting context for the alert.',
  },
} satisfies Meta<typeof Alert>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Info: Story = {};
export const Success: Story = { args: { variant: 'success', title: 'Saved', children: 'Your changes were saved.' } };
export const Warning: Story = {
  args: { variant: 'warning', title: 'Review before continuing', children: 'Some fields look unusual.' },
};
export const Error: Story = {
  args: { variant: 'error', title: 'Something went wrong', children: 'Please try again in a moment.' },
};

export const WithoutTitle: Story = { args: { title: undefined, children: 'Just a message, no title.' } };
