import { render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './card';

describe('Card', () => {
  it('renders the composed header, content, and footer', () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>Squats assessment</CardTitle>
          <CardDescription>Last completed 2 days ago</CardDescription>
        </CardHeader>
        <CardContent>Tracks form and depth.</CardContent>
        <CardFooter>Footer content</CardFooter>
      </Card>,
    );
    expect(screen.getByText('Squats assessment')).toBeInTheDocument();
    expect(screen.getByText('Last completed 2 days ago')).toBeInTheDocument();
    expect(screen.getByText('Tracks form and depth.')).toBeInTheDocument();
    expect(screen.getByText('Footer content')).toBeInTheDocument();
  });

  it('has no axe violations', async () => {
    const { container } = render(
      <Card>
        <CardHeader>
          <CardTitle>Title</CardTitle>
        </CardHeader>
        <CardContent>Content</CardContent>
      </Card>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
