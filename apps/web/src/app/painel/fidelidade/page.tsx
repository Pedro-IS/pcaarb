'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Gift, History } from 'lucide-react';
import { toast } from 'sonner';
import type { Customer, CustomerLoyaltyBalance, LoyaltyLedgerEntry, LoyaltyProgram } from '@pcaarb/shared';
import { apiFetch, ApiError } from '@/lib/api-client';
import { formatCentsToBRL } from '@/lib/currency';
import { useAccessToken } from '@/lib/use-access-token';
import { useCurrentUser } from '@/lib/use-current-user';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { SkeletonRows } from '@/components/ui/skeleton';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';

const LEDGER_LABELS: Record<LoyaltyLedgerEntry['type'], { label: string; variant: 'success' | 'warning' | 'neutral' }> = {
  earn: { label: 'Earned', variant: 'success' },
  redeem: { label: 'Redeemed', variant: 'warning' },
  adjustment: { label: 'Adjustment', variant: 'neutral' },
};

function ProgramSettings() {
  const accessToken = useAccessToken();
  const meQuery = useCurrentUser();
  const canEdit = meQuery.data?.user.role === 'owner' || meQuery.data?.user.role === 'admin';

  const programQuery = useQuery({
    queryKey: ['loyalty-program'],
    queryFn: () => apiFetch<LoyaltyProgram>('/loyalty/program', { accessToken: accessToken! }),
    enabled: !!accessToken,
  });

  if (!accessToken || !programQuery.data) {
    return (
      <Card className="flex flex-col gap-4">
        <SkeletonRows rows={2} cols={1} />
      </Card>
    );
  }

  return <ProgramSettingsForm program={programQuery.data} canEdit={canEdit} />;
}

// Separate component, mounted only once programQuery.data already exists: the
// useState calls below initialize directly with the loaded data, without
// needing a useEffect to sync (avoids the cascading render that causes).
function ProgramSettingsForm({ program, canEdit }: { program: LoyaltyProgram; canEdit: boolean }) {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  const [active, setActive] = useState(program.active);
  const [earnRate, setEarnRate] = useState(String(program.earnRatePoints));
  const [redeemValue, setRedeemValue] = useState(String(program.redeemValueCents));

  const updateMutation = useMutation({
    mutationFn: () =>
      apiFetch<LoyaltyProgram>('/loyalty/program', {
        method: 'PATCH',
        accessToken: accessToken!,
        body: {
          active,
          earnRatePoints: Number.parseInt(earnRate, 10) || 0,
          redeemValueCents: Number.parseInt(redeemValue, 10) || 1,
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['loyalty-program'] });
      toast.success('Loyalty settings updated');
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Error updating settings');
    },
  });

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">Points program</h2>
        <Badge variant={active ? 'success' : 'neutral'}>{active ? 'Active' : 'Inactive'}</Badge>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="h-4 w-4 accent-accent"
            checked={active}
            disabled={!canEdit}
            onChange={(e) => setActive(e.target.checked)}
          />
          Program active
        </label>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm">Points per R$1 spent</label>
          <Input
            type="number"
            min={0}
            value={earnRate}
            disabled={!canEdit}
            onChange={(e) => setEarnRate(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm">Value of 1 point when redeemed</label>
          <Input
            type="number"
            min={1}
            value={redeemValue}
            disabled={!canEdit}
            onChange={(e) => setRedeemValue(e.target.value)}
          />
          <p className="text-xs text-muted">
            {Number.parseInt(redeemValue, 10) || 0} cent(s) — 100 points are worth{' '}
            {formatCentsToBRL((Number.parseInt(redeemValue, 10) || 0) * 100)}
          </p>
        </div>
      </div>

      {canEdit && (
        <Button
          className="self-start"
          loading={updateMutation.isPending}
          onClick={() => updateMutation.mutate()}
        >
          Save
        </Button>
      )}
    </Card>
  );
}

function CustomerLookup() {
  const accessToken = useAccessToken();
  const [selectedCustomerId, setSelectedCustomerId] = useState('');

  const customersQuery = useQuery({
    queryKey: ['customers'],
    queryFn: () => apiFetch<Customer[]>('/customers', { accessToken: accessToken! }),
    enabled: !!accessToken,
  });

  const balanceQuery = useQuery({
    queryKey: ['loyalty-balance', selectedCustomerId],
    queryFn: () => apiFetch<CustomerLoyaltyBalance>(`/customers/${selectedCustomerId}/loyalty/balance`, { accessToken: accessToken! }),
    enabled: !!accessToken && !!selectedCustomerId,
  });

  const ledgerQuery = useQuery({
    queryKey: ['loyalty-ledger', selectedCustomerId],
    queryFn: () => apiFetch<LoyaltyLedgerEntry[]>(`/customers/${selectedCustomerId}/loyalty/ledger`, { accessToken: accessToken! }),
    enabled: !!accessToken && !!selectedCustomerId,
  });

  return (
    <Card className="flex flex-col gap-4">
      <h2 className="text-sm font-medium">Look up customer</h2>
      <div className="flex flex-col gap-1.5 sm:w-80">
        <label className="text-sm">Customer</label>
        <Select value={selectedCustomerId} onChange={(e) => setSelectedCustomerId(e.target.value)}>
          <option value="">Select...</option>
          {customersQuery.data?.map((customer) => (
            <option key={customer.id} value={customer.id}>
              {customer.name}
            </option>
          ))}
        </Select>
      </div>

      {selectedCustomerId && (
        <>
          {balanceQuery.data && (
            <div className="flex items-center gap-3 rounded-lg border border-border bg-accent-soft/40 px-4 py-3">
              <Gift className="h-5 w-5 text-accent" />
              <div>
                <p className="text-lg font-semibold tabular-nums">{balanceQuery.data.balancePoints} points</p>
                <p className="text-sm text-muted">
                  worth {formatCentsToBRL(balanceQuery.data.balanceValueCents)} when redeemed
                </p>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-medium text-muted">History</h3>
            {!ledgerQuery.data ? (
              <div className="rounded-lg border border-border">
                <SkeletonRows rows={3} cols={3} />
              </div>
            ) : ledgerQuery.data.length === 0 ? (
              <div className="rounded-lg border border-border">
                <EmptyState icon={History} message="No point activity yet." />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <tr>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Points</TableHead>
                  </tr>
                </TableHeader>
                <TableBody>
                  {ledgerQuery.data.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="text-muted">{new Date(entry.createdAt).toLocaleString('pt-BR')}</TableCell>
                      <TableCell>
                        <Badge variant={LEDGER_LABELS[entry.type].variant}>{LEDGER_LABELS[entry.type].label}</Badge>
                      </TableCell>
                      <TableCell numeric className={`font-medium ${entry.points >= 0 ? 'text-success' : 'text-danger'}`}>
                        {entry.points > 0 ? '+' : ''}
                        {entry.points}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </>
      )}
    </Card>
  );
}

export default function FidelidadePage() {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Loyalty</h1>
      <p className="text-sm text-muted">The points program — how customers earn and redeem loyalty points.</p>
      <ProgramSettings />
      <CustomerLookup />
    </>
  );
}
