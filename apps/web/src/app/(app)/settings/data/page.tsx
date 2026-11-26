'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Database, Download, Trash2 } from 'lucide-react';
import { DELETE_ACCOUNT_CONFIRMATION } from '@aidoctor/shared';

import { Alert } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LoadingState } from '@/components/loading-state';
import { PageHeader } from '@/components/page-header';
import { useCurrentUser } from '@/lib/auth/use-auth';
import { useDeleteAccount, useExportData } from '@/lib/data-rights/use-data-rights';

export default function YourDataPage() {
  const { data: user, isLoading } = useCurrentUser();

  return (
    <main id="main-content" className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 py-6">
      <PageHeader
        title="Your data"
        icon={Database}
        backHref="/dashboard"
        description="Control the information this app keeps about you."
      />

      {isLoading ? (
        <LoadingState label="Loading…" />
      ) : !user ? (
        <p className="text-sm text-muted-foreground">
          <Link href="/login" className="text-primary underline underline-offset-4">
            Sign in
          </Link>{' '}
          to manage your data.
        </p>
      ) : (
        <>
          <ExportDataSection />
          <DeleteDataSection />
        </>
      )}

      <p className="text-xs text-muted-foreground">
        Read our{' '}
        <Link href="/privacy" target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-4">
          privacy policy
        </Link>
        .
      </p>
    </main>
  );
}

// Wording: needs review by the privacy owner.
function ExportDataSection() {
  const exportData = useExportData();

  return (
    <section aria-labelledby="export-data-heading" className="flex flex-col gap-3 rounded-xl border bg-card p-4">
      <h2 id="export-data-heading" className="text-base font-semibold">
        Download my data
      </h2>
      <p className="text-sm text-muted-foreground">
        Get a copy of your profile, consents, assessments and scores, reports and chat history as a JSON file. Photos
        and recordings are not included in the file.
      </p>
      <Button
        type="button"
        variant="outline"
        className="self-start"
        disabled={exportData.isPending}
        onClick={() => exportData.mutate()}
      >
        <Download aria-hidden="true" />
        {exportData.isPending ? 'Preparing…' : 'Download my data'}
      </Button>
      {exportData.isError ? (
        <Alert variant="error">We couldn&apos;t prepare your download. Please try again.</Alert>
      ) : null}
    </section>
  );
}

// Wording: needs review by the privacy owner.
function DeleteDataSection() {
  const deleteAccount = useDeleteAccount();
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [password, setPassword] = useState('');

  const confirmed = confirmation === DELETE_ACCOUNT_CONFIRMATION;

  function handleOpenChange(next: boolean) {
    // Don't let the dialog be dismissed mid-request.
    if (deleteAccount.isPending) return;
    setOpen(next);
    if (!next) {
      setConfirmation('');
      setPassword('');
      deleteAccount.reset();
    }
  }

  return (
    <section aria-labelledby="delete-data-heading" className="flex flex-col gap-3 rounded-xl border bg-card p-4">
      <h2 id="delete-data-heading" className="text-base font-semibold">
        Delete my data
      </h2>
      <p className="text-sm text-muted-foreground">
        This permanently deletes your account and everything linked to it: your profile, answers, scores, reports, chat
        history, goals, and any photos or recordings we stored. It cannot be undone.
      </p>

      <AlertDialog open={open} onOpenChange={handleOpenChange}>
        <AlertDialogTrigger asChild>
          <Button type="button" variant="destructive" className="self-start">
            <Trash2 aria-hidden="true" />
            Delete my data
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete your account and all your data?</AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone. Type {DELETE_ACCOUNT_CONFIRMATION} and enter your password to confirm.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="delete-confirmation">Type {DELETE_ACCOUNT_CONFIRMATION} to confirm</Label>
              <Input
                id="delete-confirmation"
                autoComplete="off"
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="delete-password">Your password</Label>
              <Input
                id="delete-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {deleteAccount.isError ? <Alert variant="error">{deleteAccount.error.message}</Alert> : null}
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteAccount.isPending}>Cancel</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={!confirmed || deleteAccount.isPending}
              onClick={() =>
                deleteAccount.mutate({
                  confirmation: DELETE_ACCOUNT_CONFIRMATION,
                  ...(password ? { password } : {}),
                })
              }
            >
              {deleteAccount.isPending ? 'Deleting…' : 'Permanently delete'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
