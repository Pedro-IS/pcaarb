'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { ArrowDownCircle, ArrowUpCircle, Receipt, Wallet } from 'lucide-react';
import { z } from 'zod';
import type { CostCenter, Customer, FinanceCashflowSummary, FinanceEntry, Supplier } from '@pcaarb/shared';
import { apiFetch, ApiError } from '@/lib/api-client';
import { formatCentsToBRL, parseBRLToCents } from '@/lib/currency';
import { useAccessToken } from '@/lib/use-access-token';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { SkeletonRows } from '@/components/ui/skeleton';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';

const entryFormSchema = z.object({
  type: z.enum(['payable', 'receivable']),
  description: z.string().min(2, 'Description too short'),
  amountReais: z.string().min(1, 'Enter an amount'),
  dueDate: z.string().min(1, 'Enter a due date'),
  customerId: z.string().optional(),
  supplierId: z.string().optional(),
  costCenterId: z.string().optional(),
});

type EntryFormValues = z.infer<typeof entryFormSchema>;

function isOverdue(entry: FinanceEntry): boolean {
  return entry.status === 'pending' && entry.dueDate < new Date().toISOString().slice(0, 10);
}

export default function FinanceiroPage() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  const entriesQuery = useQuery({
    queryKey: ['finance-entries'],
    queryFn: () => apiFetch<FinanceEntry[]>('/finance-entries', { accessToken: accessToken! }),
    enabled: !!accessToken,
  });

  const summaryQuery = useQuery({
    queryKey: ['finance-entries', 'summary'],
    queryFn: () => apiFetch<FinanceCashflowSummary>('/finance-entries/summary', { accessToken: accessToken! }),
    enabled: !!accessToken,
  });

  const customersQuery = useQuery({
    queryKey: ['customers'],
    queryFn: () => apiFetch<Customer[]>('/customers', { accessToken: accessToken! }),
    enabled: !!accessToken,
  });

  const suppliersQuery = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => apiFetch<Supplier[]>('/suppliers', { accessToken: accessToken! }),
    enabled: !!accessToken,
  });

  const costCentersQuery = useQuery({
    queryKey: ['cost-centers'],
    queryFn: () => apiFetch<CostCenter[]>('/cost-centers', { accessToken: accessToken! }),
    enabled: !!accessToken,
  });
  const costCenterNameById = new Map(costCentersQuery.data?.map((cc) => [cc.id, cc.name]) ?? []);

  const [newCostCenterName, setNewCostCenterName] = useState('');
  const createCostCenterMutation = useMutation({
    mutationFn: (name: string) =>
      apiFetch<CostCenter>('/cost-centers', { method: 'POST', accessToken: accessToken!, body: { name } }),
    onSuccess: () => {
      setNewCostCenterName('');
      queryClient.invalidateQueries({ queryKey: ['cost-centers'] });
    },
  });

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors },
    setError,
  } = useForm<EntryFormValues>({
    resolver: zodResolver(entryFormSchema),
    defaultValues: { type: 'payable' },
  });
  const selectedType = useWatch({ control, name: 'type' });

  function invalidateFinance() {
    queryClient.invalidateQueries({ queryKey: ['finance-entries'] });
  }

  const createMutation = useMutation({
    mutationFn: (values: EntryFormValues) =>
      apiFetch<FinanceEntry>('/finance-entries', {
        method: 'POST',
        accessToken: accessToken!,
        body: {
          type: values.type,
          description: values.description,
          amountCents: parseBRLToCents(values.amountReais),
          dueDate: values.dueDate,
          customerId: values.type === 'receivable' && values.customerId ? values.customerId : undefined,
          supplierId: values.type === 'payable' && values.supplierId ? values.supplierId : undefined,
          costCenterId: values.costCenterId || undefined,
        },
      }),
    onSuccess: () => {
      reset({ type: 'payable' });
      invalidateFinance();
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        setError('root', { message: error.message });
      }
    },
  });

  const payMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/finance-entries/${id}/pay`, { method: 'POST', accessToken: accessToken! }),
    onSuccess: invalidateFinance,
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/finance-entries/${id}/cancel`, { method: 'POST', accessToken: accessToken! }),
    onSuccess: invalidateFinance,
  });

  if (!accessToken) {
    return null;
  }

  const summary = summaryQuery.data;

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Finance</h1>
      <p className="text-sm text-muted">Accounts payable and receivable, and a simplified profit &amp; loss.</p>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card className="flex flex-col gap-1">
          <div className="flex items-center gap-1.5 text-xs text-muted">
            <ArrowUpCircle className="h-3.5 w-3.5" />Receivable (pending)
          </div>
          <p className="text-lg font-semibold tabular-nums">{summary ? formatCentsToBRL(summary.pendingReceivableCents) : '—'}</p>
        </Card>
        <Card className="flex flex-col gap-1">
          <div className="flex items-center gap-1.5 text-xs text-muted">
            <ArrowDownCircle className="h-3.5 w-3.5" />Payable (pending)
          </div>
          <p className="text-lg font-semibold tabular-nums">{summary ? formatCentsToBRL(summary.pendingPayableCents) : '—'}</p>
          {summary && summary.overduePayableCents > 0 && (
            <p className="text-xs text-danger tabular-nums">{formatCentsToBRL(summary.overduePayableCents)} overdue</p>
          )}
        </Card>
        <Card className="flex flex-col gap-1">
          <div className="flex items-center gap-1.5 text-xs text-muted">
            <Receipt className="h-3.5 w-3.5" />
            Received
          </div>
          <p className="text-lg font-semibold tabular-nums">{summary ? formatCentsToBRL(summary.paidReceivableCents) : '—'}</p>
        </Card>
        <Card className="flex flex-col gap-1">
          <div className="flex items-center gap-1.5 text-xs text-muted">
            <Wallet className="h-3.5 w-3.5" />
            Balance
          </div>
          <p className={`text-lg font-semibold tabular-nums ${summary && summary.netCents < 0 ? 'text-danger' : 'text-success'}`}>
            {summary ? formatCentsToBRL(summary.netCents) : '—'}
          </p>
        </Card>
      </div>

      <Card as="form" className="flex flex-col gap-4" onSubmit={handleSubmit((values) => createMutation.mutate(values))}>
        <h2 className="text-sm font-medium">New entry</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm">Type</label>
            <Select {...register('type')}>
              <option value="payable">Payable</option>
              <option value="receivable">Receivable</option>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <label className="text-sm">Description</label>
            <Input {...register('description')} />
            {errors.description && <p className="text-sm text-danger">{errors.description.message}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm">Amount (R$)</label>
            <Input placeholder="0.00" {...register('amountReais')} />
            {errors.amountReais && <p className="text-sm text-danger">{errors.amountReais.message}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm">Due date</label>
            <Input type="date" {...register('dueDate')} />
            {errors.dueDate && <p className="text-sm text-danger">{errors.dueDate.message}</p>}
          </div>
          {selectedType === 'receivable' && (
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <label className="text-sm">Customer (optional)</label>
              <Select {...register('customerId')}>
                <option value="">No customer</option>
                {customersQuery.data?.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name}
                  </option>
                ))}
              </Select>
            </div>
          )}
          {selectedType === 'payable' && (
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <label className="text-sm">Supplier (optional)</label>
              <Select {...register('supplierId')}>
                <option value="">No supplier</option>
                {suppliersQuery.data?.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </Select>
            </div>
          )}
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <label className="text-sm">Cost center (optional)</label>
            <Select {...register('costCenterId')}>
              <option value="">No cost center</option>
              {costCentersQuery.data
                ?.filter((cc) => cc.active)
                .map((costCenter) => (
                  <option key={costCenter.id} value={costCenter.id}>
                    {costCenter.name}
                  </option>
                ))}
            </Select>
          </div>
        </div>
        {errors.root && <p className="text-sm text-danger">{errors.root.message}</p>}
        <Button type="submit" loading={createMutation.isPending} className="self-start">
          Add entry
        </Button>
      </Card>

      <div className="flex items-end gap-2 rounded-lg border border-dashed border-border p-4">
        <div className="flex flex-1 flex-col gap-1.5">
          <label className="text-sm">New cost center</label>
          <Input value={newCostCenterName} onChange={(e) => setNewCostCenterName(e.target.value)} placeholder="E.g.: Store, Marketing" />
        </div>
        <Button
          type="button"
          variant="secondary"
          disabled={newCostCenterName.trim().length < 2}
          loading={createCostCenterMutation.isPending}
          onClick={() => createCostCenterMutation.mutate(newCostCenterName.trim())}
        >
          Create cost center
        </Button>
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-muted">{entriesQuery.data ? `${entriesQuery.data.length} entrie(s)` : ''}</h2>
        {!entriesQuery.data ? (
          <div className="rounded-lg border border-border">
            <SkeletonRows rows={4} cols={5} />
          </div>
        ) : entriesQuery.data.length === 0 ? (
          <div className="rounded-lg border border-border">
            <EmptyState icon={Wallet} message="No entries registered yet." />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <tr>
                <TableHead>Type</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Due date</TableHead>
                <TableHead>Cost center</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </tr>
            </TableHeader>
            <TableBody>
              {entriesQuery.data.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell>{entry.type === 'payable' ? 'Payable' : 'Receivable'}</TableCell>
                  <TableCell>{entry.description}</TableCell>
                  <TableCell numeric>{formatCentsToBRL(entry.amountCents)}</TableCell>
                  <TableCell>{entry.dueDate}</TableCell>
                  <TableCell className="text-muted">
                    {entry.costCenterId ? (costCenterNameById.get(entry.costCenterId) ?? '—') : '—'}
                  </TableCell>
                  <TableCell>
                    {isOverdue(entry) ? (
                      <Badge variant="danger">Overdue</Badge>
                    ) : entry.status === 'paid' ? (
                      <Badge variant="success">Paid</Badge>
                    ) : entry.status === 'canceled' ? (
                      <Badge variant="neutral">Canceled</Badge>
                    ) : (
                      <Badge variant="warning">Pending</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {entry.status === 'pending' && (
                      <div className="flex justify-end gap-3">
                        <button
                          type="button"
                          className="text-xs text-success hover:underline"
                          disabled={payMutation.isPending}
                          onClick={() => payMutation.mutate(entry.id)}
                        >
                          Pay
                        </button>
                        <button
                          type="button"
                          className="text-xs text-muted hover:underline"
                          disabled={cancelMutation.isPending}
                          onClick={() => cancelMutation.mutate(entry.id)}
                        >
                          Cancel
                        </button>
                      </div>
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
