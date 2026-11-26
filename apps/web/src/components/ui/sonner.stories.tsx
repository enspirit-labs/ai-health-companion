import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { toast } from 'sonner';

import { Button } from './button';
import { Toaster } from './sonner';

const meta = {
  title: 'ui/Toaster',
  component: Toaster,
  tags: ['autodocs'],
} satisfies Meta<typeof Toaster>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Toaster renders nothing itself until a toast is fired — click the button
 * to trigger one. In the real app, Toaster is mounted once in the root
 * layout and every page fires toasts via the `sonner` `toast()` API.
 */
export const Default: Story = {
  render: () => (
    <>
      <Toaster />
      <div className="flex gap-2">
        <Button onClick={() => toast('Your changes were saved.')}>Show toast</Button>
        <Button variant="destructive" onClick={() => toast.error('Your session has expired.')}>
          Show error toast
        </Button>
      </div>
    </>
  ),
};
