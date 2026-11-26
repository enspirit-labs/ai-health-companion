import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { Input } from './input';

const meta = {
  title: 'ui/Input',
  component: Input,
  tags: ['autodocs'],
  args: {
    placeholder: 'you@example.com',
    type: 'text',
    disabled: false,
  },
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Email: Story = { args: { type: 'email', placeholder: 'you@example.com' } };
export const Password: Story = { args: { type: 'password', placeholder: '••••••••' } };
export const Disabled: Story = { args: { disabled: true, value: 'Cannot edit this', placeholder: '' } };

export const Invalid: Story = {
  args: { 'aria-invalid': true, defaultValue: 'not-an-email' },
};
