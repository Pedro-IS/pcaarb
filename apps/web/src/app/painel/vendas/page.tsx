'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { Fragment, useState } from 'react';
import { ChevronDown, Printer, Receipt, RefreshCw, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import type {
  Customer,
  CreateSaleReturnInput,
  PaymentMethod,
  Sale,
  SaleListItem,
  SaleReturn,
  SaleReturnRefundMethod,
  Store,
} from '@pcaarb/shared';
import { apiFetch, ApiError } from '@/lib/api-client';
import { formatCentsToBRL } from '@/lib/currency';
import { useAccessToken } from '@/lib/use-access-token';
import { useCurrentUser } from '@/lib/use-current-user';
import { useTenantLogoUrl } from '@/lib/use-tenant-logo';
import { Button } from '@/components/ui/button';
import { Badge, type BadgeVariant } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { SkeletonRows } from '@/components/ui/skeleton';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { SaleReceipt } from '@/components/pdv/sale-receipt';

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  dinheiro: 'Cash',
  cartao_credito: 'Credit card',
  cartao_debito: 'Debit card',
  pix: 'Pix',
};

const REFUND_METHOD_LABELS: Record<SaleReturnRefundMethod, string> = {
  dinheiro: 'Cash (from the open register)',
  estorno_pagamento: 'Card/Pix refund',
  outro: 'Other (exchange, credit arranged separately...)',
};

const RETURN_STATUS_BADGE: Record<SaleReturn['status'], { label: string; variant: BadgeVariant }> = {
  completed: { label: 'Completed', variant: 'success' },
  needs_attention: { label: 'Needs attention', variant: 'warning' },
};

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  return `${date.toLocaleDateString('pt-BR')} ${date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

function SaleDetail({
  sale,
  storeName,
  companyName,
  displayName,
  logoUrl,
  paperWidthMm,
}: {
  sale: Sale;
  storeName: string | undefined;
  companyName: string;
  displayName?: string | null;
  logoUrl?: string | null;
  paperWidthMm?: 58 | 80;
}) {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  const [returnFormOpen, setReturnFormOpen] = useState(false);
  const [returnQuantities, setReturnQuantities] = useState<Record<string, string>>({});
  const [returnReason, setReturnReason] = useState('');
  const [returnMethod, setReturnMethod] = useState<SaleReturnRefundMethod>('dinheiro');

  const retryMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/sales/${sale.id}/fiscal-document/retry`, {
        method: 'POST',
        accessToken: accessToken!,
      }),
    onSuccess: () => {
      toast.success('NFC-e reissued');
      queryClient.invalidateQueries({ queryKey: ['sales', sale.id] });
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Error reissuing NFC-e');
    },
  });

  const returnsQuery = useQuery({
    queryKey: ['sales', sale.id, 'returns'],
    queryFn: () => apiFetch<SaleReturn[]>(`/sales/${sale.id}/returns`, { accessToken: accessToken! }),
    enabled: !!accessToken,
  });

  const alreadyReturnedByItem = new Map<string, number>();
  for (const ret of returnsQuery.data ?? []) {
    for (const item of ret.items) {
      alreadyReturnedByItem.set(item.saleItemId, (alreadyReturnedByItem.get(item.saleItemId) ?? 0) + item.quantity);
    }
  }
  const remaining = (saleItemId: string, originalQuantity: number) =>
    originalQuantity - (alreadyReturnedByItem.get(saleItemId) ?? 0);

  const returnMutation = useMutation({
    mutationFn: () => {
      const items = Object.entries(returnQuantities)
        .map(([saleItemId, quantity]) => ({ saleItemId, quantity: Number(quantity) }))
        .filter((item) => item.quantity > 0);
      const body: CreateSaleReturnInput = { refundMethod: returnMethod, reason: returnReason, items };
      return apiFetch<SaleReturn>(`/sales/${sale.id}/returns`, { method: 'POST', accessToken: accessToken!, body });
    },
    onSuccess: (created) => {
      if (created.status === 'needs_attention') {
        toast.warning(created.issue ?? 'Return registered, but needs attention');
      } else {
        toast.success('Return registered');
      }
      setReturnFormOpen(false);
      setReturnQuantities({});
      setReturnReason('');
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Error registering return');
    },
  });

  const hasQuantityToReturn = Object.values(returnQuantities).some((q) => Number(q) > 0);

  return (
    <div className="flex flex-col gap-3 border-t border-border bg-card-hover px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-col gap-1 text-sm">
          <span className="text-muted">
            {sale.items.length} ite{sale.items.length === 1 ? 'm' : 'ns'} · Sale{' '}
            {sale.id.slice(0, 8)}
          </span>
          {sale.fiscalDocument?.status === 'authorized' && (
            <span className="text-xs text-muted">
              NFC-e authorized — key {sale.fiscalDocument.accessKey}
            </span>
          )}
          {sale.fiscalDocument?.status === 'rejected' && (
            <span className="text-xs text-warning">
              NFC-e not issued: {sale.fiscalDocument.rejectionReason}
            </span>
          )}
        </div>
        <div className="flex gap-2">
          {sale.fiscalDocument?.status === 'rejected' && (
            <Button
              variant="secondary"
              loading={retryMutation.isPending}
              onClick={() => retryMutation.mutate()}
            >
              <RefreshCw className="h-4 w-4" />
              Reissue NFC-e
            </Button>
          )}
          {sale.status === 'completed' && (
            <Button variant="secondary" onClick={() => setReturnFormOpen((open) => !open)}>
              <Undo2 className="h-4 w-4" />
              Return
            </Button>
          )}
          <Button variant="secondary" onClick={() => window.print()}>
            <Printer className="h-4 w-4" />
            Print receipt
          </Button>
        </div>
      </div>

      <Table>
        <TableHeader>
          <tr>
            <TableHead className="px-3 py-1.5">Product</TableHead>
            <TableHead className="px-3 py-1.5">Qty</TableHead>
            <TableHead className="px-3 py-1.5">Unit price</TableHead>
            <TableHead className="px-3 py-1.5">Total</TableHead>
            {returnFormOpen && <TableHead className="px-3 py-1.5">Return</TableHead>}
          </tr>
        </TableHeader>
        <TableBody>
          {sale.items.map((item) => {
            const returnable = remaining(item.id, item.quantity);
            return (
              <TableRow key={item.id}>
                <TableCell className="px-3 py-1.5">{item.productName}</TableCell>
                <TableCell className="px-3 py-1.5" numeric>{item.quantity}</TableCell>
                <TableCell className="px-3 py-1.5" numeric>{formatCentsToBRL(item.unitPriceCents)}</TableCell>
                <TableCell className="px-3 py-1.5" numeric>{formatCentsToBRL(item.totalCents)}</TableCell>
                {returnFormOpen && (
                  <TableCell className="px-3 py-1.5">
                    {returnable > 0 ? (
                      <Input
                        type="number"
                        min={0}
                        max={returnable}
                        placeholder="0"
                        className="h-8 w-20"
                        value={returnQuantities[item.id] ?? ''}
                        onChange={(e) => setReturnQuantities((prev) => ({ ...prev, [item.id]: e.target.value }))}
                      />
                    ) : (
                      <span className="text-xs text-muted">already returned</span>
                    )}
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {returnFormOpen && (
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-1 flex-col gap-1.5">
              <label className="text-sm">Reason</label>
              <Input
                placeholder="E.g.: defective product, customer changed their mind..."
                value={returnReason}
                onChange={(e) => setReturnReason(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5 sm:w-64">
              <label className="text-sm">Refund</label>
              <Select
                value={returnMethod}
                onChange={(e) => setReturnMethod(e.target.value as SaleReturnRefundMethod)}
              >
                {(Object.entries(REFUND_METHOD_LABELS) as [SaleReturnRefundMethod, string][]).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </div>
            <Button
              loading={returnMutation.isPending}
              disabled={!hasQuantityToReturn || returnReason.trim().length < 3}
              onClick={() => returnMutation.mutate()}
            >
              Confirm return
            </Button>
          </div>
        </div>
      )}

      {(returnsQuery.data?.length ?? 0) > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted">Returns for this sale</span>
          <div className="flex flex-col gap-1.5">
            {returnsQuery.data!.map((ret) => (
              <div
                key={ret.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-xs"
              >
                <span className="text-muted">
                  {formatDateTime(ret.createdAt)} · {ret.reason}
                </span>
                <div className="flex items-center gap-2">
                  <span className="font-medium tabular-nums">{formatCentsToBRL(ret.totalRefundedCents)}</span>
                  <Badge variant={RETURN_STATUS_BADGE[ret.status].variant}>{RETURN_STATUS_BADGE[ret.status].label}</Badge>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-4 text-sm text-muted">
        {sale.payments.map((payment) => (
          <span key={payment.id}>
            {PAYMENT_LABELS[payment.method]}: {formatCentsToBRL(payment.amountCents)}
          </span>
        ))}
      </div>

      <SaleReceipt
        sale={sale}
        companyName={companyName}
        displayName={displayName}
        logoUrl={logoUrl}
        storeName={storeName}
        paperWidthMm={paperWidthMm}
      />
    </div>
  );
}

export default function VendasPage() {
  const accessToken = useAccessToken();
  const meQuery = useCurrentUser();
  const logoUrl = useTenantLogoUrl(meQuery.data?.tenant.hasLogo);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const salesQuery = useQuery({
    queryKey: ['sales'],
    queryFn: () => apiFetch<SaleListItem[]>('/sales', { accessToken: accessToken! }),
    enabled: !!accessToken,
  });

  const storesQuery = useQuery({
    queryKey: ['stores'],
    queryFn: () => apiFetch<Store[]>('/stores', { accessToken: accessToken! }),
    enabled: !!accessToken,
  });

  const customersQuery = useQuery({
    queryKey: ['customers'],
    queryFn: () => apiFetch<Customer[]>('/customers', { accessToken: accessToken! }),
    enabled: !!accessToken,
  });

  const detailQuery = useQuery({
    queryKey: ['sales', expandedId],
    queryFn: () => apiFetch<Sale>(`/sales/${expandedId}`, { accessToken: accessToken! }),
    enabled: !!accessToken && !!expandedId,
  });

  if (!accessToken) {
    return null;
  }

  const storeName = (id: string) => storesQuery.data?.find((store) => store.id === id)?.name ?? '—';
  const customerName = (id: string | null) =>
    id ? (customersQuery.data?.find((customer) => customer.id === id)?.name ?? '—') : '—';

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Sales</h1>
      <p className="text-sm text-muted">Completed sales, with receipt reprint and returns/refunds.</p>

      {!salesQuery.data ? (
        <div className="rounded-lg border border-border">
          <SkeletonRows rows={5} cols={5} />
        </div>
      ) : salesQuery.data.length === 0 ? (
        <div className="rounded-lg border border-border">
          <EmptyState icon={Receipt} message="No sales recorded yet." />
        </div>
      ) : (
        <Table>
          <TableHeader>
            <tr>
              <TableHead>Date</TableHead>
              <TableHead>Store</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Status</TableHead>
              <TableHead></TableHead>
            </tr>
          </TableHeader>
          <TableBody>
            {salesQuery.data.map((sale) => {
              const isExpanded = expandedId === sale.id;
              return (
                <Fragment key={sale.id}>
                  <TableRow className="cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : sale.id)}>
                    <TableCell>{formatDateTime(sale.createdAt)}</TableCell>
                    <TableCell>{storeName(sale.storeId)}</TableCell>
                    <TableCell>{customerName(sale.customerId)}</TableCell>
                    <TableCell numeric className="font-medium">{formatCentsToBRL(sale.totalCents)}</TableCell>
                    <TableCell>
                      {sale.status === 'completed' ? (
                        <Badge variant="success">Completed</Badge>
                      ) : (
                        <Badge variant="danger">Canceled</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <ChevronDown
                        className={`ml-auto h-4 w-4 text-muted transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                      />
                    </TableCell>
                  </TableRow>
                  {isExpanded && (
                    <tr>
                      <td colSpan={6} className="p-0">
                        <AnimatePresence>
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                          >
                            {!detailQuery.data ? (
                              <SkeletonRows rows={2} cols={4} />
                            ) : (
                              <SaleDetail
                                sale={detailQuery.data}
                                storeName={
                                  storesQuery.data?.find((store) => store.id === sale.storeId)
                                    ?.name
                                }
                                companyName={meQuery.data?.tenant.companyName ?? ''}
                                displayName={meQuery.data?.tenant.displayName}
                                logoUrl={logoUrl}
                                paperWidthMm={
                                  storesQuery.data?.find((store) => store.id === sale.storeId)
                                    ?.receiptPaperWidthMm
                                }
                              />
                            )}
                          </motion.div>
                        </AnimatePresence>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      )}
    </>
  );
}
