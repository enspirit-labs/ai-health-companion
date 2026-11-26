import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { RiskLevelBadge } from '@/components/risk-level-badge';

import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from './table';

const meta = {
  title: 'ui/Table',
  component: Table,
  tags: ['autodocs'],
} satisfies Meta<typeof Table>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Table>
      <TableCaption>Recent assessment results.</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>Assessment</TableHead>
          <TableHead>Date</TableHead>
          <TableHead>Wellness signal</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell>Squats</TableCell>
          <TableCell>2026-07-26</TableCell>
          <TableCell>
            <RiskLevelBadge riskLevel="LOW" />
          </TableCell>
        </TableRow>
        <TableRow>
          <TableCell>Posture</TableCell>
          <TableCell>2026-07-24</TableCell>
          <TableCell>
            <RiskLevelBadge riskLevel="MODERATE" />
          </TableCell>
        </TableRow>
        <TableRow>
          <TableCell>Eye</TableCell>
          <TableCell>2026-07-20</TableCell>
          <TableCell>
            <RiskLevelBadge riskLevel="ELEVATED" />
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>
  ),
};
