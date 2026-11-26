import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from './alert-dialog';

function ExampleDialog({ defaultOpen = false }: { defaultOpen?: boolean }) {
  return (
    <AlertDialog defaultOpen={defaultOpen}>
      <AlertDialogTrigger>Delete</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this assessment?</AlertDialogTitle>
          <AlertDialogDescription>This can&apos;t be undone.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction>Delete</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

describe('AlertDialog', () => {
  it('does not render its content until opened', () => {
    render(<ExampleDialog />);
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('renders title and description when open', () => {
    render(<ExampleDialog defaultOpen />);
    expect(screen.getByRole('alertdialog')).toHaveAccessibleName('Delete this assessment?');
    expect(screen.getByText("This can't be undone.")).toBeInTheDocument();
  });

  it('closes on cancel', async () => {
    const user = userEvent.setup();
    render(<ExampleDialog defaultOpen />);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('has no axe violations when open', async () => {
    const { container } = render(<ExampleDialog defaultOpen />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
