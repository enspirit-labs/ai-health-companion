import type { AdminStatsDto } from '@aidoctor/shared';
import { ASSESSMENT_LABELS } from '@aidoctor/shared';

import { Card, CardContent } from '@/components/ui/card';
import { ASSESSMENT_ICONS } from '@/lib/assessments/assessment-icons';

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <Card className="gap-2">
      <CardContent className="px-5 py-4">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums">{value.toLocaleString()}</p>
      </CardContent>
    </Card>
  );
}

export function AdminStats({ stats }: { stats: AdminStatsDto }) {
  const nonZeroByType = stats.assessmentsByType.filter((a) => a.count > 0).sort((a, b) => b.count - a.count);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        <StatTile label="Total users" value={stats.totalUsers} />
        <StatTile label="Active users" value={stats.activeUsers} />
        <StatTile label="Signups (30d)" value={stats.signupsLast30Days} />
        <StatTile label="Completed assessments" value={stats.totalCompletedAssessments} />
        <StatTile label="Reports generated" value={stats.totalReports} />
      </div>

      {nonZeroByType.length > 0 ? (
        <Card>
          <CardContent className="px-5 py-4">
            <p className="mb-3 text-sm font-medium">Completed assessments by type</p>
            <ul className="space-y-1.5">
              {nonZeroByType.map((a) => {
                const Icon = ASSESSMENT_ICONS[a.type];
                return (
                  <li key={a.type} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 text-muted-foreground">
                      <Icon className="size-3.5 shrink-0" aria-hidden="true" />
                      {ASSESSMENT_LABELS[a.type]}
                    </span>
                    <span className="font-medium tabular-nums">{a.count}</span>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
