import { render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';

import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from './table';

function ExampleTable() {
  return (
    <Table>
      <TableCaption>User management — role and account status.</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Role</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell>Ada Lovelace</TableCell>
          <TableCell>Admin</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  );
}

describe('Table', () => {
  it('exposes a table role with an accessible name from the caption', () => {
    render(<ExampleTable />);
    expect(screen.getByRole('table')).toHaveAccessibleName(/user management/i);
  });

  it('gives every column header scope="col"', () => {
    render(<ExampleTable />);
    for (const header of screen.getAllByRole('columnheader')) {
      expect(header).toHaveAttribute('scope', 'col');
    }
  });

  it('has no axe violations', async () => {
    const { container } = render(<ExampleTable />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
