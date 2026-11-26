import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select';

const meta = {
  title: 'ui/Select',
  component: Select,
  tags: ['autodocs'],
} satisfies Meta<typeof Select>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Select>
      <SelectTrigger className="w-56">
        <SelectValue placeholder="Select an assessment" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="squats">Squats</SelectItem>
        <SelectItem value="walking">Walking</SelectItem>
        <SelectItem value="posture">Posture</SelectItem>
        <SelectItem value="eye">Eye</SelectItem>
      </SelectContent>
    </Select>
  ),
};

export const WithDefaultValue: Story = {
  render: () => (
    <Select defaultValue="walking">
      <SelectTrigger className="w-56">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="squats">Squats</SelectItem>
        <SelectItem value="walking">Walking</SelectItem>
        <SelectItem value="posture">Posture</SelectItem>
      </SelectContent>
    </Select>
  ),
};

export const Disabled: Story = {
  render: () => (
    <Select disabled>
      <SelectTrigger className="w-56">
        <SelectValue placeholder="Unavailable" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="squats">Squats</SelectItem>
      </SelectContent>
    </Select>
  ),
};
