'use client';

import { useQuery } from '@tanstack/react-query';
import { Lock, ScrollText } from 'lucide-react';
import type { AuditLog, User } from '@pcaarb/shared';
import { apiFetch } from '@/lib/api-client';
import { useAccessToken } from '@/lib/use-access-token';
import { useCurrentUser } from '@/lib/use-current-user';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { SkeletonRows } from '@/components/ui/skeleton';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';

const ACTION_LABELS: Record<string, string> = {
  'user.role_updated': 'User role changed',
  'permission_override.granted': 'Permission exception granted',
  'permission_override.revoked': 'Permission exception revoked',
  'billing.subscribed': 'Subscription started',
  'billing.canceled': 'Subscription canceled',
  'sale_return.created': 'Sale return recorded',
  'auth.password_reset': 'Password reset',
  'auth.account_locked': 'Account locked after login attempts',
};

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  return `${date.toLocaleDateString('pt-BR')} ${date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

export default function AuditoriaPage() {
  const accessToken = useAccessToken();
  const meQuery = useCurrentUser();
  // GET /audit-logs is owner-only on the backend (CASL subject 'AuditLog',
  // deliberately kept outside permissionSubjectSchema — see ability.factory.ts)
  // — without this gate here, any other role navigating to this page
  // would just see the query fail with 403 with no explanation.
  const canView = meQuery.data?.user.role === 'owner';

  const logsQuery = useQuery({
    queryKey: ['audit-logs'],
    queryFn: () => apiFetch<AuditLog[]>('/audit-logs', { accessToken: accessToken! }),
    enabled: !!accessToken && canView,
  });

  const usersQuery = useQuery({
    queryKey: ['users'],
    queryFn: () => apiFetch<User[]>('/users', { accessToken: accessToken! }),
    enabled: !!accessToken && canView,
  });

  if (!accessToken || !meQuery.data) {
    return (
      <>
        <h1 className="text-2xl font-semibold tracking-tight">Audit Log</h1>
        <Card>
          <SkeletonRows rows={5} cols={4} />
        </Card>
      </>
    );
  }

  if (!canView) {
    return (
      <>
        <h1 className="text-2xl font-semibold tracking-tight">Audit Log</h1>
        <Card>
          <EmptyState icon={Lock} message="Only the store owner can see the audit log." />
        </Card>
      </>
    );
  }

  const actorName = (actorUserId: string | null) => {
    if (!actorUserId) return 'System';
    return usersQuery.data?.find((u) => u.id === actorUserId)?.name ?? '—';
  };

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Audit Log</h1>
      <p className="text-sm text-muted">Sensitive tenant actions — role changes, permissions, subscription, returns, password, and account lockout.</p>

      {!logsQuery.data ? (
        <div className="rounded-lg border border-border">
          <SkeletonRows rows={8} cols={4} />
        </div>
      ) : logsQuery.data.length === 0 ? (
        <div className="rounded-lg border border-border">
          <EmptyState icon={ScrollText} message="No actions recorded yet." />
        </div>
      ) : (
        <Table>
          <TableHeader>
            <tr>
              <TableHead>Date</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Actor</TableHead>
              <TableHead>Details</TableHead>
            </tr>
          </TableHeader>
          <TableBody>
            {logsQuery.data.map((log) => (
              <TableRow key={log.id}>
                <TableCell className="whitespace-nowrap">{formatDateTime(log.createdAt)}</TableCell>
                <TableCell>{ACTION_LABELS[log.action] ?? log.action}</TableCell>
                <TableCell>{actorName(log.actorUserId)}</TableCell>
                <TableCell className="font-mono text-xs text-muted">
                  {log.metadata ? JSON.stringify(log.metadata) : '—'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </>
  );
}
