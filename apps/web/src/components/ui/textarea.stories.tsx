import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { Textarea } from './textarea';

const meta = {
  title: 'ui/Textarea',
  component: Textarea,
  tags: ['autodocs'],
  args: {
    placeholder: 'Anything else you want to share about how you felt today?',
    disabled: false,
  },
} satisfies Meta<typeof Textarea>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const WithValue: Story = { args: { defaultValue: 'Felt a bit more tired than usual after the walk.' } };
export const Disabled: Story = { args: { disabled: true, defaultValue: 'Cannot edit this' } };
export const Invalid: Story = { args: { 'aria-invalid': true } };
