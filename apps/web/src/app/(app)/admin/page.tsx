'use client';

import Link from 'next/link';
import { ShieldAlert } from 'lucide-react';

import { AdminPilotMetrics } from '@/components/admin/admin-pilot-metrics';
import { AdminPromptTemplates } from '@/components/admin/admin-prompt-templates';
import { AdminStats } from '@/components/admin/admin-stats';
import { AdminUsersTable } from '@/components/admin/admin-users-table';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ErrorState } from '@/components/error-state';
import { LoadingState } from '@/components/loading-state';
import { PageHeader } from '@/components/page-header';
import { useCurrentUser } from '@/lib/auth/use-auth';
import { useAdminPilotMetrics, useAdminPromptTemplates, useAdminStats, useAdminUsers } from '@/lib/admin/use-admin';

export default function AdminPage() {
  const { data: currentUser, isLoading: isUserLoading } = useCurrentUser();
  const stats = useAdminStats();
  const pilotMetrics = useAdminPilotMetrics();
  const users = useAdminUsers();
  const promptTemplates = useAdminPromptTemplates();

  if (isUserLoading) {
    return (
      <main id="main-content" className="flex flex-1 items-center justify-center">
        <LoadingState label="Loading…" variant="page" />
      </main>
    );
  }

  if (!currentUser || currentUser.role !== 'ADMIN') {
    return (
      <main id="main-content" className="flex flex-1 flex-col items-center justify-center gap-4 px-4 text-center">
        <ShieldAlert className="size-10 text-muted-foreground" aria-hidden="true" />
        <p className="text-lg font-medium">Admins only</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          You don&apos;t have permission to view this page.
        </p>
        <Button asChild variant="outline">
          <Link href="/dashboard">Back to dashboard</Link>
        </Button>
      </main>
    );
  }

  return (
    <main id="main-content" className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8">
      <PageHeader title="Admin panel" />

      {stats.isLoading ? (
        <LoadingState label="Loading stats…" />
      ) : stats.isError ? (
        <ErrorState description="Could not load admin stats." onRetry={() => stats.refetch()} />
      ) : stats.data ? (
        <AdminStats stats={stats.data} />
      ) : null}

      {pilotMetrics.isLoading ? (
        <LoadingState label="Loading pilot metrics…" />
      ) : pilotMetrics.isError ? (
        <ErrorState description="Could not load pilot metrics." onRetry={() => pilotMetrics.refetch()} />
      ) : pilotMetrics.data ? (
        <AdminPilotMetrics metrics={pilotMetrics.data} />
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Users</CardTitle>
          <CardDescription>Manage roles and account access.</CardDescription>
        </CardHeader>
        <CardContent>
          {users.isLoading ? (
            <LoadingState label="Loading users…" />
          ) : users.isError ? (
            <ErrorState description="Could not load users." onRetry={() => users.refetch()} />
          ) : (
            <AdminUsersTable users={users.data ?? []} currentUserId={currentUser.id} />
          )}
        </CardContent>
      </Card>

      <div>
        <h2 className="mb-3 text-lg font-medium">AI prompt templates</h2>
        {promptTemplates.isLoading ? (
          <LoadingState label="Loading prompt templates…" />
        ) : promptTemplates.isError ? (
          <ErrorState description="Could not load prompt templates." onRetry={() => promptTemplates.refetch()} />
        ) : (
          <AdminPromptTemplates templates={promptTemplates.data ?? []} />
        )}
      </div>
    </main>
  );
}
