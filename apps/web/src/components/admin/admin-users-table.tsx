'use client';

import type { AdminUserDto, UserRoleValue } from '@aidoctor/shared';

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
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState } from '@/components/empty-state';
import { useUpdateAdminUser } from '@/lib/admin/use-admin';

const ROLE_OPTIONS: UserRoleValue[] = ['USER', 'SUPPORT', 'ADMIN'];

export function AdminUsersTable({ users, currentUserId }: { users: AdminUserDto[]; currentUserId: string }) {
  const updateUser = useUpdateAdminUser();

  if (users.length === 0) {
    return <EmptyState message="No users yet." />;
  }

  return (
    <Table>
      <TableCaption className="sr-only">User management — role and account status.</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Email</TableHead>
          <TableHead>Role</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Completed</TableHead>
          <TableHead>Joined</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {users.map((user) => {
          const isSelf = user.id === currentUserId;
          const isPending = updateUser.isPending && updateUser.variables?.userId === user.id;

          return (
            <TableRow key={user.id} aria-busy={isPending}>
              <TableHead scope="row" className="h-auto font-normal text-foreground">
                {user.fullName}
              </TableHead>
              <TableCell className="text-muted-foreground">{user.email}</TableCell>
              <TableCell>
                <Select
                  value={user.role}
                  disabled={isSelf || isPending}
                  onValueChange={(role) => updateUser.mutate({ userId: user.id, input: { role: role as UserRoleValue } })}
                >
                  <SelectTrigger className="h-8 w-28" aria-label={`Role for ${user.fullName}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLE_OPTIONS.map((role) => (
                      <SelectItem key={role} value={role}>
                        {role}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Badge variant={user.isActive ? 'good' : 'critical'}>
                    {user.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                  {!isSelf ? (
                    user.isActive ? (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="outline" size="sm" disabled={isPending} aria-label={`Deactivate ${user.fullName}`}>
                            Deactivate
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Deactivate {user.fullName}?</AlertDialogTitle>
                            <AlertDialogDescription>
                              They&apos;ll lose access to their account until reactivated. This can be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => updateUser.mutate({ userId: user.id, input: { isActive: false } })}
                            >
                              Deactivate
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={isPending}
                        aria-label={`Reactivate ${user.fullName}`}
                        onClick={() => updateUser.mutate({ userId: user.id, input: { isActive: true } })}
                      >
                        Reactivate
                      </Button>
                    )
                  ) : null}
                </div>
              </TableCell>
              <TableCell className="tabular-nums">{user.completedAssessmentCount}</TableCell>
              <TableCell className="text-muted-foreground">{new Date(user.createdAt).toLocaleDateString()}</TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
