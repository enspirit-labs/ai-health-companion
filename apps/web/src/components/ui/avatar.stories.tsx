import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { Avatar, AvatarFallback, AvatarImage } from './avatar';

const meta = {
  title: 'ui/Avatar',
  component: Avatar,
  tags: ['autodocs'],
} satisfies Meta<typeof Avatar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Initials: Story = {
  render: () => (
    <Avatar>
      <AvatarFallback className="bg-primary text-primary-foreground">AL</AvatarFallback>
    </Avatar>
  ),
};

export const WithImage: Story = {
  render: () => (
    <Avatar className="size-10">
      <AvatarImage src="https://i.pravatar.cc/80" alt="" />
      <AvatarFallback>AL</AvatarFallback>
    </Avatar>
  ),
};

export const Sizes: Story = {
  render: () => (
    <div className="flex items-center gap-3">
      {['size-6', 'size-8', 'size-10', 'size-14'].map((size) => (
        <Avatar key={size} className={size}>
          <AvatarFallback className="bg-accent text-accent-foreground">AL</AvatarFallback>
        </Avatar>
      ))}
    </div>
  ),
};
