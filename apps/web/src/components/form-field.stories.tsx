import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

import { FormField } from './form-field';

const meta = {
  title: 'shared/FormField',
  component: FormField,
  tags: ['autodocs'],
  // Every story below overrides via `render` rather than `args`, but CSF3's
  // types still require `args` to satisfy FormField's required props.
  args: {
    label: 'Label',
    htmlFor: 'story-form-field',
    children: null,
  },
} satisfies Meta<typeof FormField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <div className="w-72">
      <FormField label="Email address" htmlFor="story-form-field-email">
        <Input id="story-form-field-email" type="email" placeholder="you@example.com" />
      </FormField>
    </div>
  ),
};

export const WithError: Story = {
  render: () => (
    <div className="w-72">
      <FormField label="Email address" htmlFor="story-form-field-email-error" error="Enter a valid email address.">
        <Input id="story-form-field-email-error" type="email" defaultValue="not-an-email" />
      </FormField>
    </div>
  ),
};

export const WithTextarea: Story = {
  render: () => (
    <div className="w-72">
      <FormField label="Notes" htmlFor="story-form-field-notes">
        <Textarea id="story-form-field-notes" placeholder="Anything else to share?" />
      </FormField>
    </div>
  ),
};
