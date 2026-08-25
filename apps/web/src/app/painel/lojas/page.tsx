'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Store as StoreIcon } from 'lucide-react';
import { toast } from 'sonner';
import type { Store } from '@pcaarb/shared';
import { apiFetch, ApiError } from '@/lib/api-client';
import { useAccessToken } from '@/lib/use-access-token';
import { useCurrentUser } from '@/lib/use-current-user';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SkeletonRows } from '@/components/ui/skeleton';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';

export default function LojasPage() {
  const accessToken = useAccessToken();
  const meQuery = useCurrentUser();
  const canManage = meQuery.data?.user.role === 'owner' || meQuery.data?.user.role === 'admin';
  const queryClient = useQueryClient();
  const [newStoreName, setNewStoreName] = useState('');

  const storesQuery = useQuery({
    queryKey: ['stores'],
    queryFn: () => apiFetch<Store[]>('/stores', { accessToken: accessToken! }),
    enabled: !!accessToken,
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['stores'] });
  }

  const createMutation = useMutation({
    mutationFn: () => apiFetch<Store>('/stores', { method: 'POST', accessToken: accessToken!, body: { name: newStoreName } }),
    onSuccess: () => {
      setNewStoreName('');
      invalidate();
      toast.success('Store created');
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Error creating store');
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      apiFetch<Store>(`/stores/${id}`, { method: 'PATCH', accessToken: accessToken!, body: { active } }),
    onSuccess: () => {
      invalidate();
      toast.success('Store updated');
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Error updating store');
    },
  });

  if (!accessToken) {
    return null;
  }

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Stores</h1>
      <p className="text-sm text-muted">The physical stores under this account.</p>

      {canManage && (
        <Card className="flex items-end gap-2">
          <div className="flex flex-1 flex-col gap-1.5">
            <label className="text-sm">New store</label>
            <Input placeholder="Store name" value={newStoreName} onChange={(e) => setNewStoreName(e.target.value)} />
          </div>
          <Button loading={createMutation.isPending} disabled={!newStoreName} onClick={() => createMutation.mutate()}>
            Add
          </Button>
        </Card>
      )}
      <p className="text-xs text-muted">Operating more than one store requires the Multi-store plan — see /painel/assinatura.</p>

      {!storesQuery.data ? (
        <div className="rounded-lg border border-border">
          <SkeletonRows rows={2} cols={2} />
        </div>
      ) : (
        <Table>
          <TableHeader>
            <tr>
              <TableHead>Store</TableHead>
              <TableHead>Status</TableHead>
              {canManage && <TableHead></TableHead>}
            </tr>
          </TableHeader>
          <TableBody>
            {storesQuery.data.map((store) => (
              <TableRow key={store.id}>
                <TableCell>
                  <span className="flex items-center gap-1.5">
                    <StoreIcon className="h-3.5 w-3.5 text-muted" />
                    {store.name}
                  </span>
                </TableCell>
                <TableCell>
                  <Badge variant={store.active ? 'success' : 'neutral'}>{store.active ? 'Active' : 'Inactive'}</Badge>
                </TableCell>
                {canManage && (
                  <TableCell className="text-right">
                    <button
                      type="button"
                      className="text-xs text-accent hover:underline"
                      disabled={toggleActiveMutation.isPending}
                      onClick={() => toggleActiveMutation.mutate({ id: store.id, active: !store.active })}
                    >
                      {store.active ? 'Deactivate' : 'Reactivate'}
                    </button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </>
  );
}
