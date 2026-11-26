'use client';

import { Download } from 'lucide-react';
import { PERSONAL_GOAL_LABELS, pilotMetricsToCsv, type PilotMetricsDto } from '@aidoctor/shared';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

function formatRate(rate: number | null): string {
  return rate === null ? 'No data yet' : `${(rate * 100).toFixed(0)}%`;
}

function Row({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <tr className="border-b last:border-0">
      <th scope="row" className="py-2 pr-4 text-left text-sm font-normal text-muted-foreground">
        {label}
      </th>
      <td className="py-2 text-right text-sm font-medium tabular-nums">{value}</td>
      <td className="py-2 pl-4 text-right text-xs text-muted-foreground tabular-nums">{detail ?? ''}</td>
    </tr>
  );
}

function MetricTable({ caption, children }: { caption: string; children: React.ReactNode }) {
  return (
    <Card className="gap-2">
      <CardContent className="px-5 py-4">
        <table className="w-full">
          <caption className="mb-2 text-left text-sm font-medium">{caption}</caption>
          <tbody>{children}</tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function downloadCsv(metrics: PilotMetricsDto) {
  const blob = new Blob([pilotMetricsToCsv(metrics)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `pilot-metrics-${metrics.generatedAt.slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

/** E6 pilot habit-loop metrics. Aggregates only; the CSV is the same anonymised numbers. */
export function AdminPilotMetrics({ metrics }: { metrics: PilotMetricsDto }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>Pilot metrics</CardTitle>
          <CardDescription>
            Aggregate habit-loop numbers for {metrics.cohortSize.toLocaleString()} pilot users
            {metrics.cohortStart ? ` who joined on or after ${metrics.cohortStart}` : ''}. No individual data.
          </CardDescription>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => downloadCsv(metrics)}>
          <Download aria-hidden="true" />
          Export CSV
        </Button>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2">
        <MetricTable caption="Retention">
          {metrics.retention.map((r) => (
            <Row
              key={r.day}
              label={`Day ${r.day}`}
              value={formatRate(r.rate)}
              detail={`${r.retainedUsers} of ${r.eligibleUsers}`}
            />
          ))}
        </MetricTable>

        <MetricTable caption="Check-ins and recovery">
          <Row label="Active users (last 7 days)" value={String(metrics.activeUsersLast7Days)} />
          <Row
            label="Check-ins per active day"
            value={metrics.checkIns.perActiveDay === null ? 'No data yet' : metrics.checkIns.perActiveDay.toFixed(2)}
            detail={`${metrics.checkIns.total} over ${metrics.checkIns.activeDays} days`}
          />
          <Row
            label="Lapse recovery"
            value={formatRate(metrics.lapseRecovery.rate)}
            detail={`${metrics.lapseRecovery.recoveredUsers} of ${metrics.lapseRecovery.lapsedUsers}`}
          />
          <Row label="Safety events" value={String(metrics.safetyEvents.total)} />
        </MetricTable>

        <MetricTable caption="Weekly actions">
          <Row label="Completions, all time" value={String(metrics.weeklyActions.totalCompletions)} />
          <Row
            label={`Users completing, week of ${metrics.weeklyActions.lastWeek.weekStart}`}
            value={formatRate(metrics.weeklyActions.lastWeek.completionRate)}
            detail={`${metrics.weeklyActions.lastWeek.usersCompleting} of ${metrics.weeklyActions.usersWithActiveGoals}`}
          />
          <Row label="Completions that week" value={String(metrics.weeklyActions.lastWeek.completions)} />
        </MetricTable>

        <MetricTable caption="Streaks and goals">
          {metrics.streakDistribution.map((s) => (
            <Row
              key={s.bucket}
              label={s.bucket === 'LAPSED' ? 'Streak: lapsed' : s.bucket === 'NONE' ? 'Streak: none yet' : `Streak: ${s.bucket} days`}
              value={String(s.users)}
            />
          ))}
          {metrics.goalChoices.map((g) => (
            <Row key={g.goal} label={`Goal: ${PERSONAL_GOAL_LABELS[g.goal]}`} value={String(g.users)} />
          ))}
        </MetricTable>
      </CardContent>
    </Card>
  );
}
