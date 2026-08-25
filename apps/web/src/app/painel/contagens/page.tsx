'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Check, ClipboardList, PackageSearch } from 'lucide-react';
import { toast } from 'sonner';
import type { StockCount } from '@pcaarb/shared';
import { apiFetch, ApiError } from '@/lib/api-client';
import { useAccessToken } from '@/lib/use-access-token';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { SkeletonRows } from '@/components/ui/skeleton';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';

function diffLabel(expected: number, counted: number | null): string {
  if (counted === null) return '—';
  const delta = counted - expected;
  if (delta === 0) return '0';
  return delta > 0 ? `+${delta}` : String(delta);
}

function diffClassName(expected: number, counted: number | null): string {
  if (counted === null || counted === expected) return 'text-muted';
  return counted > expected ? 'text-success' : 'text-danger';
}

export default function ContagensPage() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState('');
  const [draftValues, setDraftValues] = useState<Record<string, string>>({});

  const countsQuery = useQuery({
    queryKey: ['stock-counts'],
    queryFn: () => apiFetch<StockCount[]>('/stock-counts', { accessToken: accessToken! }),
    enabled: !!accessToken,
  });

  const activeCount = useMemo(() => countsQuery.data?.find((count) => count.status === 'open'), [countsQuery.data]);

  function invalidateCounts() {
    queryClient.invalidateQueries({ queryKey: ['stock-counts'] });
    queryClient.invalidateQueries({ queryKey: ['products'] });
  }

  const openMutation = useMutation({
    mutationFn: () =>
      apiFetch<StockCount>('/stock-counts', { method: 'POST', accessToken: accessToken!, body: { notes: notes || undefined } }),
    onSuccess: (count) => {
      setNotes('');
      invalidateCounts();
      if (count.items.length === 0) {
        toast.error('No products with stock tracking to count');
      } else {
        toast.success('Count opened');
      }
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Error opening count');
    },
  });

  const setItemMutation = useMutation({
    mutationFn: ({ countId, itemId, countedQuantity }: { countId: string; itemId: string; countedQuantity: number }) =>
      apiFetch(`/stock-counts/${countId}/items/${itemId}`, {
        method: 'PATCH',
        accessToken: accessToken!,
        body: { countedQuantity },
      }),
    onSuccess: () => invalidateCounts(),
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Error recording item count');
    },
  });

  const finalizeMutation = useMutation({
    mutationFn: (countId: string) => apiFetch(`/stock-counts/${countId}/finalize`, { method: 'POST', accessToken: accessToken! }),
    onSuccess: () => {
      invalidateCounts();
      toast.success('Count finalized — stock adjusted');
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Error finalizing count');
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (countId: string) => apiFetch(`/stock-counts/${countId}/cancel`, { method: 'POST', accessToken: accessToken! }),
    onSuccess: () => {
      invalidateCounts();
      toast.success('Count canceled');
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Error canceling count');
    },
  });

  if (!accessToken) {
    return null;
  }

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Inventory</h1>
      <p className="text-sm text-muted">Physical stock counts — enter what&rsquo;s actually on the shelf and reconcile it against the system balance.</p>

      {!countsQuery.data ? (
        <Card>
          <SkeletonRows rows={3} cols={4} />
        </Card>
      ) : activeCount ? (
        <Card className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-medium">
              <ClipboardList className="h-4 w-4" />
              Count in progress — {new Date(activeCount.createdAt).toLocaleDateString('pt-BR')}
            </h2>
            <div className="flex gap-2">
              <Button variant="secondary" loading={cancelMutation.isPending} onClick={() => cancelMutation.mutate(activeCount.id)}>
                Cancel
              </Button>
              <Button loading={finalizeMutation.isPending} onClick={() => finalizeMutation.mutate(activeCount.id)}>
                Finalize count
              </Button>
            </div>
          </div>

          {activeCount.items.length === 0 ? (
            <EmptyState icon={PackageSearch} message="No products with stock tracking to count." />
          ) : (
            <Table>
              <TableHeader>
                <tr>
                  <TableHead>Product</TableHead>
                  <TableHead>System</TableHead>
                  <TableHead>Counted</TableHead>
                  <TableHead>Difference</TableHead>
                  <TableHead></TableHead>
                </tr>
              </TableHeader>
              <TableBody>
                {activeCount.items.map((item) => {
                  const draft = draftValues[item.id] ?? (item.countedQuantity !== null ? String(item.countedQuantity) : '');
                  const parsed = draft === '' ? null : Number.parseInt(draft, 10);
                  return (
                    <TableRow key={item.id}>
                      <TableCell>{item.productName}</TableCell>
                      <TableCell numeric className="text-muted">{item.expectedQuantity}</TableCell>
                      <TableCell>
                        <Input
                          className="w-24"
                          value={draft}
                          onChange={(e) => setDraftValues((prev) => ({ ...prev, [item.id]: e.target.value }))}
                        />
                      </TableCell>
                      <TableCell numeric className={diffClassName(item.expectedQuantity, item.countedQuantity)}>
                        {diffLabel(item.expectedQuantity, item.countedQuantity)}
                      </TableCell>
                      <TableCell className="text-right">
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 text-xs text-accent hover:underline disabled:opacity-50"
                          disabled={parsed === null || Number.isNaN(parsed) || parsed < 0 || setItemMutation.isPending}
                          onClick={() =>
                            parsed !== null &&
                            setItemMutation.mutate({ countId: activeCount.id, itemId: item.id, countedQuantity: parsed })
                          }
                        >
                          <Check className="h-3.5 w-3.5" />
                          Save
                        </button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </Card>
      ) : (
        <Card className="flex flex-wrap items-end gap-3">
          <div className="flex flex-1 flex-col gap-1.5">
            <label className="text-sm">Notes (optional)</label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="E.g.: monthly count" />
          </div>
          <Button loading={openMutation.isPending} onClick={() => openMutation.mutate()}>
            Open new count
          </Button>
        </Card>
      )}

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-muted">
          {countsQuery.data ? `${countsQuery.data.length} count(s)` : ''}
        </h2>
        {!countsQuery.data ? (
          <div className="rounded-lg border border-border">
            <SkeletonRows rows={3} cols={4} />
          </div>
        ) : countsQuery.data.length === 0 ? (
          <div className="rounded-lg border border-border">
            <EmptyState icon={ClipboardList} message="No stock counts yet." />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <tr>
                <TableHead>Opened on</TableHead>
                <TableHead>Items</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead>Status</TableHead>
              </tr>
            </TableHeader>
            <TableBody>
              {countsQuery.data.map((count) => (
                <TableRow key={count.id}>
                  <TableCell>{new Date(count.createdAt).toLocaleDateString('pt-BR')}</TableCell>
                  <TableCell numeric>{count.items.length}</TableCell>
                  <TableCell className="text-muted">{count.notes ?? '—'}</TableCell>
                  <TableCell>
                    {count.status === 'completed' ? (
                      <Badge variant="success">Finalized</Badge>
                    ) : count.status === 'canceled' ? (
                      <Badge variant="neutral">Canceled</Badge>
                    ) : (
                      <Badge variant="warning">In progress</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </>
  );
}
