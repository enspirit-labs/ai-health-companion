import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { LoadingState } from './loading-state';

const meta = {
  title: 'shared/LoadingState',
  component: LoadingState,
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['inline', 'block'],
    },
  },
} satisfies Meta<typeof LoadingState>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Block: Story = { args: { variant: 'block' } };
export const Inline: Story = { args: { variant: 'inline' } };
export const CustomLabel: Story = { args: { variant: 'block', label: 'Generating your report…' } };
