'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { Fragment, useMemo, useState } from 'react';
import { ChevronDown, Package, Plus, Printer, ShoppingBag, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { Product, PurchaseOrder, Supplier } from '@pcaarb/shared';
import { apiFetch, ApiError } from '@/lib/api-client';
import { formatCentsToBRL, parseBRLToCents } from '@/lib/currency';
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
import { PurchaseOrderPrint } from '@/components/compras/purchase-order-print';

interface OrderLine {
  productId: string;
  name: string;
  quantity: number;
  unitCostReais: string;
}

export default function ComprasPage() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  const meQuery = useCurrentUser();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const ordersQuery = useQuery({
    queryKey: ['purchase-orders'],
    queryFn: () => apiFetch<PurchaseOrder[]>('/purchase-orders', { accessToken: accessToken! }),
    enabled: !!accessToken,
  });

  const suppliersQuery = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => apiFetch<Supplier[]>('/suppliers', { accessToken: accessToken! }),
    enabled: !!accessToken,
  });

  const productsQuery = useQuery({
    queryKey: ['products'],
    queryFn: () => apiFetch<Product[]>('/products', { accessToken: accessToken! }),
    enabled: !!accessToken,
  });

  const supplierNameById = useMemo(
    () => new Map(suppliersQuery.data?.map((s) => [s.id, s.name]) ?? []),
    [suppliersQuery.data],
  );

  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<OrderLine[]>([]);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unitCostReais, setUnitCostReais] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const totalCents = useMemo(
    () =>
      lines.reduce(
        (sum, line) => sum + parseBRLToCents(line.unitCostReais || '0') * line.quantity,
        0,
      ),
    [lines],
  );

  function addLine() {
    const product = productsQuery.data?.find((p) => p.id === selectedProductId);
    const qty = Number.parseInt(quantity, 10);
    if (!product || !Number.isFinite(qty) || qty <= 0 || !unitCostReais) {
      return;
    }
    setLines((prev) => [
      ...prev,
      { productId: product.id, name: product.name, quantity: qty, unitCostReais },
    ]);
    setSelectedProductId('');
    setQuantity('1');
    setUnitCostReais('');
  }

  function removeLine(productId: string) {
    setLines((prev) => prev.filter((line) => line.productId !== productId));
  }

  function resetForm() {
    setSelectedSupplierId('');
    setNotes('');
    setLines([]);
    setFormError(null);
  }

  function invalidateOrders() {
    queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
  }

  const createMutation = useMutation({
    mutationFn: () =>
      apiFetch<PurchaseOrder>('/purchase-orders', {
        method: 'POST',
        accessToken: accessToken!,
        body: {
          supplierId: selectedSupplierId,
          notes: notes || undefined,
          items: lines.map((line) => ({
            productId: line.productId,
            quantity: line.quantity,
            unitCostCents: parseBRLToCents(line.unitCostReais),
          })),
        },
      }),
    onSuccess: () => {
      resetForm();
      invalidateOrders();
      toast.success('Purchase order created');
    },
    onError: (error) => {
      setFormError(error instanceof ApiError ? error.message : 'Unexpected error creating the order');
    },
  });

  const receiveMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/purchase-orders/${id}/receive`, { method: 'POST', accessToken: accessToken! }),
    onSuccess: () => {
      invalidateOrders();
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success('Order received — stock updated');
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Error receiving the order');
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/purchase-orders/${id}/cancel`, { method: 'POST', accessToken: accessToken! }),
    onSuccess: () => {
      invalidateOrders();
      toast.success('Order canceled');
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Error canceling the order');
    },
  });

  if (!accessToken) {
    return null;
  }

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Purchases</h1>

      <Card className="flex flex-col gap-4">
        <h2 className="text-sm font-medium">New order</h2>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm">Supplier</label>
            <Select value={selectedSupplierId} onChange={(e) => setSelectedSupplierId(e.target.value)}>
              <option value="">Select...</option>
              {suppliersQuery.data?.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm">Notes (optional)</label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>

        <div className="flex flex-col gap-2 border-t border-border pt-4">
          <h3 className="text-sm font-medium">Items</h3>
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex flex-1 flex-col gap-1.5">
              <label className="text-sm">Product</label>
              <Select
                value={selectedProductId}
                onChange={(e) => {
                  setSelectedProductId(e.target.value);
                  const product = productsQuery.data?.find((p) => p.id === e.target.value);
                  if (product?.costPriceCents) {
                    setUnitCostReais((product.costPriceCents / 100).toFixed(2).replace('.', ','));
                  }
                }}
              >
                <option value="">Select...</option>
                {productsQuery.data?.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex w-20 flex-col gap-1.5">
              <label className="text-sm">Qty.</label>
              <Input value={quantity} onChange={(e) => setQuantity(e.target.value)} />
            </div>
            <div className="flex w-28 flex-col gap-1.5">
              <label className="text-sm">Unit cost (R$)</label>
              <Input
                placeholder="0.00"
                value={unitCostReais}
                onChange={(e) => setUnitCostReais(e.target.value)}
              />
            </div>
            <Button
              type="button"
              variant="secondary"
              onClick={addLine}
              disabled={!selectedProductId || !unitCostReais}
            >
              <Plus className="h-4 w-4" />
              Add
            </Button>
          </div>

          <table className="w-full text-sm">
            <thead className="text-left text-muted">
              <tr>
                <th className="py-1">Product</th>
                <th className="py-1">Qty.</th>
                <th className="py-1">Unit cost</th>
                <th className="py-1">Total</th>
                <th className="py-1" />
              </tr>
            </thead>
            <tbody>
              <AnimatePresence initial={false}>
                {lines.map((line) => (
                  <motion.tr
                    key={line.productId}
                    layout
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="border-t border-border"
                  >
                    <td className="py-1.5">{line.name}</td>
                    <td className="py-1.5 tabular-nums">{line.quantity}</td>
                    <td className="py-1.5 font-mono tabular-nums">
                      {formatCentsToBRL(parseBRLToCents(line.unitCostReais))}
                    </td>
                    <td className="py-1.5 font-mono tabular-nums">
                      {formatCentsToBRL(parseBRLToCents(line.unitCostReais) * line.quantity)}
                    </td>
                    <td className="py-1.5">
                      <button
                        type="button"
                        className="text-danger transition-colors hover:opacity-75"
                        onClick={() => removeLine(line.productId)}
                        aria-label="Remove"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
          {lines.length === 0 && (
            <EmptyState icon={Package} message="No items added yet." />
          )}

          <p className="self-end text-sm font-semibold tabular-nums">Total: {formatCentsToBRL(totalCents)}</p>
        </div>

        {formError && <p className="text-sm text-danger">{formError}</p>}

        <Button
          className="self-start"
          disabled={!selectedSupplierId || lines.length === 0}
          loading={createMutation.isPending}
          onClick={() => createMutation.mutate()}
        >
          Create order
        </Button>
      </Card>

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-muted">
          {ordersQuery.data ? `${ordersQuery.data.length} order(s)` : ''}
        </h2>
        {!ordersQuery.data ? (
          <div className="rounded-lg border border-border">
            <SkeletonRows rows={4} cols={6} />
          </div>
        ) : ordersQuery.data.length === 0 ? (
          <div className="rounded-lg border border-border">
            <EmptyState icon={ShoppingBag} message="No purchase orders yet." />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <tr>
                <TableHead>Supplier</TableHead>
                <TableHead>Items</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created on</TableHead>
                <TableHead></TableHead>
              </tr>
            </TableHeader>
            <TableBody>
              {ordersQuery.data.map((order) => {
                const isExpanded = expandedId === order.id;
                const supplier = suppliersQuery.data?.find((s) => s.id === order.supplierId);
                return (
                  <Fragment key={order.id}>
                    <TableRow className="cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : order.id)}>
                      <TableCell>{supplierNameById.get(order.supplierId) ?? '—'}</TableCell>
                      <TableCell numeric>{order.items.length}</TableCell>
                      <TableCell numeric>{formatCentsToBRL(order.totalCents)}</TableCell>
                      <TableCell>
                        {order.status === 'received' ? (
                          <Badge variant="success">Received</Badge>
                        ) : order.status === 'canceled' ? (
                          <Badge variant="neutral">Canceled</Badge>
                        ) : (
                          <Badge variant="warning">Draft</Badge>
                        )}
                      </TableCell>
                      <TableCell>{new Date(order.createdAt).toLocaleDateString('pt-BR')}</TableCell>
                      <TableCell className="text-right">
                        <div
                          className="flex items-center justify-end gap-3"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {order.status === 'draft' && (
                            <>
                              <button
                                type="button"
                                className="text-xs text-success hover:underline"
                                disabled={receiveMutation.isPending}
                                onClick={() => receiveMutation.mutate(order.id)}
                              >
                                Receive
                              </button>
                              <button
                                type="button"
                                className="text-xs text-muted hover:underline"
                                disabled={cancelMutation.isPending}
                                onClick={() => cancelMutation.mutate(order.id)}
                              >
                                Cancel
                              </button>
                            </>
                          )}
                          <ChevronDown
                            className={`h-4 w-4 text-muted transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                            onClick={() => setExpandedId(isExpanded ? null : order.id)}
                          />
                        </div>
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
                              className="flex flex-col gap-3 border-t border-border bg-card-hover px-4 py-3"
                            >
                              <div className="flex items-center justify-between">
                                <span className="text-sm text-muted">
                                  Order {order.id.slice(0, 8)}
                                </span>
                                <Button variant="secondary" onClick={() => window.print()}>
                                  <Printer className="h-4 w-4" />
                                  Print order
                                </Button>
                              </div>
                              <PurchaseOrderPrint
                                order={order}
                                companyName={meQuery.data?.tenant.companyName ?? ''}
                                supplier={supplier}
                              />
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
      </div>
    </>
  );
}
