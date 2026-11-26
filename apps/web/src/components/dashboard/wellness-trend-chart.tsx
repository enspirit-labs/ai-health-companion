'use client';

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { WellnessTrendPoint } from '@aidoctor/shared';

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function ChartTooltip({ active, payload }: { active?: boolean; payload?: Array<{ value: number; payload: WellnessTrendPoint }> }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-md">
      <p className="text-xs text-muted-foreground">{formatDate(point.capturedAt)}</p>
      <p className="font-semibold tabular-nums">{Math.round(point.overallScore)}/100</p>
    </div>
  );
}

export function WellnessTrendChart({ data }: { data: WellnessTrendPoint[] }) {
  if (data.length < 2) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        Complete a few assessments to see your wellness trend over time.
      </div>
    );
  }

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="capturedAt"
            tickFormatter={formatDate}
            tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
            axisLine={{ stroke: 'var(--border)' }}
            tickLine={false}
            minTickGap={24}
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            width={32}
          />
          <Tooltip content={<ChartTooltip />} cursor={{ stroke: 'var(--border)' }} />
          <Line
            type="monotone"
            dataKey="overallScore"
            stroke="var(--chart-1)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
