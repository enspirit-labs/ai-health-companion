import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { Button } from './button';
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './card';

const meta = {
  title: 'ui/Card',
  component: Card,
  tags: ['autodocs'],
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Card className="w-80">
      <CardHeader>
        <CardTitle>Squats assessment</CardTitle>
        <CardDescription>Last completed 2 days ago</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Tracks form, depth, and repetition count using pose estimation.
        </p>
      </CardContent>
      <CardFooter>
        <Button size="sm">View report</Button>
      </CardFooter>
    </Card>
  ),
};

export const WithAction: Story = {
  render: () => (
    <Card className="w-80">
      <CardHeader>
        <CardTitle>Eye assessment</CardTitle>
        <CardDescription>Contrast check + screen-comfort habits</CardDescription>
        <CardAction>
          <Button variant="ghost" size="sm">
            Retake
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">Nothing new since your last check-in.</p>
      </CardContent>
    </Card>
  ),
};

export const MinimalContentOnly: Story = {
  render: () => (
    <Card className="w-80">
      <CardContent>
        <p className="text-sm">A card with just content, no header or footer.</p>
      </CardContent>
    </Card>
  ),
};
