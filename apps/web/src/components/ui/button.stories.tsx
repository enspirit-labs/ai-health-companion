import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Mail } from 'lucide-react';

import { Button } from './button';

const meta = {
  title: 'ui/Button',
  component: Button,
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'destructive', 'outline', 'secondary', 'ghost', 'link'],
    },
    size: {
      control: 'select',
      options: ['default', 'sm', 'lg', 'icon'],
    },
  },
  args: {
    children: 'Button',
    variant: 'default',
    size: 'default',
    disabled: false,
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Destructive: Story = { args: { variant: 'destructive' } };
export const Outline: Story = { args: { variant: 'outline' } };
export const Secondary: Story = { args: { variant: 'secondary' } };
export const Ghost: Story = { args: { variant: 'ghost' } };
export const Link: Story = { args: { variant: 'link' } };

export const Disabled: Story = { args: { disabled: true } };

export const WithIcon: Story = {
  args: {
    children: (
      <>
        <Mail /> Email
      </>
    ),
  },
};

export const IconOnly: Story = {
  args: {
    size: 'icon',
    'aria-label': 'Send email',
    children: <Mail />,
  },
};

export const AllVariants: Story = {
  render: (args) => (
    <div className="flex flex-wrap items-center gap-3">
      {(['default', 'destructive', 'outline', 'secondary', 'ghost', 'link'] as const).map((variant) => (
        <Button key={variant} {...args} variant={variant}>
          {variant}
        </Button>
      ))}
    </div>
  ),
};

export const AllSizes: Story = {
  render: (args) => (
    <div className="flex flex-wrap items-center gap-3">
      {(['sm', 'default', 'lg'] as const).map((size) => (
        <Button key={size} {...args} size={size}>
          {size}
        </Button>
      ))}
      <Button {...args} size="icon" aria-label="Icon button">
        <Mail />
      </Button>
    </div>
  ),
};
