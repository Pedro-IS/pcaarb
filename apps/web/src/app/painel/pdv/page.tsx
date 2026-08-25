'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CloudOff, Gift, Plus, Receipt, ShoppingCart, Trash2, WifiOff } from 'lucide-react';
import { toast } from 'sonner';
import type { CashSession, CreateSaleInput, Customer, CustomerLoyaltyBalance, LoyaltyProgram, PaymentMethod, Product, Sale, Store } from '@pcaarb/shared';
import { apiFetch, ApiError } from '@/lib/api-client';
import { formatCentsToBRL, parseBRLToCents } from '@/lib/currency';
import { useAccessToken } from '@/lib/use-access-token';
import { useCurrentUser } from '@/lib/use-current-user';
import { useTenantLogoUrl } from '@/lib/use-tenant-logo';
import { useOnlineStatus } from '@/lib/use-online-status';
import {
  enqueueOfflineSale,
  listOfflineSales,
  markOfflineSaleNeedsAttention,
  removeOfflineSale,
  type QueuedSale,
} from '@/lib/offline-sale-queue';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { HelpHint } from '@/components/ui/help-hint';
import { SaleReceipt } from '@/components/pdv/sale-receipt';

interface CartLine {
  productId: string;
  name: string;
  priceCents: number;
  quantity: number;
}

interface PaymentLine {
  method: PaymentMethod;
  amountReais: string;
}

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  dinheiro: 'Cash',
  cartao_credito: 'Credit card',
  cartao_debito: 'Debit card',
  pix: 'Pix',
};

function formatSaleQueueTotal(sale: QueuedSale): string {
  const totalCents = sale.payload.payments.reduce((sum, p) => sum + p.amountCents, 0);
  return formatCentsToBRL(totalCents);
}

interface CartDraft {
  cart: CartLine[];
  selectedCustomerId: string;
  discountReais: string;
  pointsToRedeemInput: string;
  payments: PaymentLine[];
}

function cartDraftKey(tenantId: string): string {
  return `pcaarb_pdv_draft_${tenantId}`;
}

// Just the cart draft (not confirmed yet): a hard reload without internet in
// the middle of a sale must not erase what the operator has already put
// together. Different from the offline sale queue (offline-sale-queue.ts) —
// here the sale hasn't even been "finalized" yet, it's just what's being assembled on screen.
function loadCartDraft(tenantId: string): CartDraft | null {
  try {
    const raw = localStorage.getItem(cartDraftKey(tenantId));
    return raw ? (JSON.parse(raw) as CartDraft) : null;
  } catch {
    return null;
  }
}

function saveCartDraft(tenantId: string, draft: CartDraft): void {
  try {
    localStorage.setItem(cartDraftKey(tenantId), JSON.stringify(draft));
  } catch {
    // localStorage unavailable/full: only the convenience of the draft
    // surviving a reload is lost, the sale itself doesn't depend on this.
  }
}

function clearCartDraft(tenantId: string): void {
  try {
    localStorage.removeItem(cartDraftKey(tenantId));
  } catch {
    // see comment in saveCartDraft
  }
}

async function fetchCurrentSession(accessToken: string): Promise<CashSession | null> {
  try {
    return await apiFetch<CashSession>('/cash-sessions/current', { accessToken });
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return null;
    }
    throw error;
  }
}

export default function PdvPage() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  const meQuery = useCurrentUser();
  const tenantId = meQuery.data?.tenant.id;
  const logoUrl = useTenantLogoUrl(meQuery.data?.tenant.hasLogo);
  const isOnline = useOnlineStatus();

  const offlineQueueQuery = useQuery({
    queryKey: ['offline-sale-queue', tenantId],
    queryFn: () => listOfflineSales(tenantId!),
    enabled: !!tenantId,
    // The queue only changes through local action (sale queued, sync
    // attempted) — never by anything that happens on the server, so it
    // doesn't make sense for it to revalidate on its own; invalidateQueries
    // triggers the re-read at the right moments.
    staleTime: Infinity,
    // 'always': react-query's default ('online') pauses the whole query
    // while the browser is offline — wrong here, since this reads from the
    // local IndexedDB, not the network, and is exactly what needs to keep working offline.
    networkMode: 'always',
  });
  const pendingSales = offlineQueueQuery.data?.filter((s) => s.status === 'pending') ?? [];
  const attentionSales = offlineQueueQuery.data?.filter((s) => s.status === 'needs_attention') ?? [];

  // Syncs the local queue: resends each pending sale with the same
  // clientSaleId (idempotent — see SalesService.create). A real refusal from
  // the server (insufficient stock, deactivated product, the cash session
  // the sale originated from no longer exists) becomes 'needs_attention' and
  // stops retrying on its own; a network failure (still offline) leaves it
  // as is to retry on the next reconnection — it never discards or fakes success.
  const flushOfflineQueue = useCallback(async () => {
    if (!accessToken || !tenantId) return;
    const queued = await listOfflineSales(tenantId);
    const toSync = queued.filter((item) => item.status === 'pending');
    if (toSync.length === 0) return;

    let syncedCount = 0;
    let attentionCount = 0;
    for (const item of toSync) {
      try {
        await apiFetch<Sale>('/sales', { method: 'POST', accessToken, body: item.payload });
        await removeOfflineSale(item.clientSaleId);
        syncedCount += 1;
      } catch (error) {
        if (error instanceof ApiError) {
          await markOfflineSaleNeedsAttention(item.clientSaleId, error.message);
          attentionCount += 1;
        }
        // network error (still no real connection): leaves it as 'pending', retries later
      }
    }

    if (syncedCount > 0) {
      toast.success(`${syncedCount} offline sale(s) synced`);
    }
    if (attentionCount > 0) {
      toast.error(`${attentionCount} offline sale(s) could not be synced — see details on screen`);
    }
    if (syncedCount > 0 || attentionCount > 0) {
      queryClient.invalidateQueries({ queryKey: ['offline-sale-queue'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['current-cash-session'] });
    }
  }, [accessToken, tenantId, queryClient]);

  // Tries to sync on reconnection, and once on page load (covers the case of
  // sales queued in a previous tab/session while the device is already back online).
  useEffect(() => {
    if (isOnline) {
      flushOfflineQueue();
    }
  }, [isOnline, flushOfflineQueue]);

  async function discardAttentionSale(clientSaleId: string) {
    await removeOfflineSale(clientSaleId);
    queryClient.invalidateQueries({ queryKey: ['offline-sale-queue'] });
    toast.success('Pending sale discarded');
  }

  const sessionQuery = useQuery({
    queryKey: ['current-cash-session'],
    queryFn: () => fetchCurrentSession(accessToken!),
    enabled: !!accessToken,
  });

  const productsQuery = useQuery({
    queryKey: ['products'],
    queryFn: () => apiFetch<Product[]>('/products', { accessToken: accessToken! }),
    enabled: !!accessToken && !!sessionQuery.data,
  });

  const customersQuery = useQuery({
    queryKey: ['customers'],
    queryFn: () => apiFetch<Customer[]>('/customers', { accessToken: accessToken! }),
    enabled: !!accessToken && !!sessionQuery.data,
  });

  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [pointsToRedeemInput, setPointsToRedeemInput] = useState('');

  const loyaltyProgramQuery = useQuery({
    queryKey: ['loyalty-program'],
    queryFn: () => apiFetch<LoyaltyProgram>('/loyalty/program', { accessToken: accessToken! }),
    enabled: !!accessToken && !!sessionQuery.data,
  });

  const customerBalanceQuery = useQuery({
    queryKey: ['loyalty-balance', selectedCustomerId],
    queryFn: () =>
      apiFetch<CustomerLoyaltyBalance>(`/customers/${selectedCustomerId}/loyalty/balance`, { accessToken: accessToken! }),
    enabled: !!accessToken && !!selectedCustomerId,
  });

  const storesQuery = useQuery({
    queryKey: ['stores'],
    queryFn: () => apiFetch<Store[]>('/stores', { accessToken: accessToken! }),
    enabled: !!accessToken && !sessionQuery.data,
  });
  const activeStores = storesQuery.data?.filter((store) => store.active) ?? [];

  const [openingAmount, setOpeningAmount] = useState('');
  // Most tenants have just 1 store (Starter/Profissional plan) — in that
  // case it doesn't even show a selector, it uses the single store directly.
  const [selectedStoreId, setSelectedStoreId] = useState('');
  const effectiveStoreId = selectedStoreId || (activeStores.length === 1 ? activeStores[0]!.id : '');

  const openSessionMutation = useMutation({
    mutationFn: () =>
      apiFetch<CashSession>('/cash-sessions', {
        method: 'POST',
        accessToken: accessToken!,
        body: { storeId: effectiveStoreId, openingAmountCents: parseBRLToCents(openingAmount || '0') },
      }),
    onSuccess: () => {
      setOpeningAmount('');
      queryClient.invalidateQueries({ queryKey: ['current-cash-session'] });
      toast.success('Register opened');
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Error opening the register');
    },
  });

  const [cart, setCart] = useState<CartLine[]>([]);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [discountReais, setDiscountReais] = useState('');
  const [payments, setPayments] = useState<PaymentLine[]>([]);
  const [saleError, setSaleError] = useState<string | null>(null);
  const [lastSale, setLastSale] = useState<Sale | null>(null);
  const lastSaleStore = lastSale ? storesQuery.data?.find((store) => store.id === lastSale.storeId) : undefined;

  // Only lastSale?.id triggers this — not receiptAutoPrint — so toggling the
  // printer setting elsewhere never re-fires a print for a sale already on
  // screen, only a genuinely new one.
  useEffect(() => {
    if (lastSale && lastSaleStore?.receiptAutoPrint) {
      window.print();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastSale?.id]);

  // Restores the in-progress cart (if the reload happened in the middle of a
  // sale) exactly once, as soon as the tenant is known — only feeds in data
  // if nothing already exists on screen, so it doesn't overwrite what the
  // operator is already assembling if the effect runs again for some reason.
  // Can't use lazy useState() here because tenantId only exists once
  // useCurrentUser() resolves (even coming from the persisted cache, it
  // still takes one render cycle) — it isn't available on the first render
  // to seed the state directly. The ref guard ensures this runs at most once
  // per mount, so there's no risk of a cascading render loop.
  const draftHydrated = useRef(false);
  useEffect(() => {
    if (!tenantId || draftHydrated.current) return;
    draftHydrated.current = true;
    const draft = loadCartDraft(tenantId);
    if (draft && draft.cart.length > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time hydration of an external value (localStorage) that's only available after the first render, guarded by the ref above
      setCart(draft.cart);
      setSelectedCustomerId(draft.selectedCustomerId);
      setDiscountReais(draft.discountReais);
      setPointsToRedeemInput(draft.pointsToRedeemInput);
      setPayments(draft.payments);
    }
  }, [tenantId]);

  useEffect(() => {
    if (!tenantId) return;
    if (cart.length === 0) {
      clearCartDraft(tenantId);
      return;
    }
    saveCartDraft(tenantId, { cart, selectedCustomerId, discountReais, pointsToRedeemInput, payments });
  }, [tenantId, cart, selectedCustomerId, discountReais, pointsToRedeemInput, payments]);

  const subtotalCents = useMemo(
    () => cart.reduce((sum, line) => sum + line.priceCents * line.quantity, 0),
    [cart],
  );
  const discountCents = parseBRLToCents(discountReais || '0');
  const pointsToRedeem = Math.max(Number.parseInt(pointsToRedeemInput, 10) || 0, 0);
  const redemptionValueCents = pointsToRedeem * (loyaltyProgramQuery.data?.redeemValueCents ?? 0);
  const totalCents = Math.max(subtotalCents - discountCents - redemptionValueCents, 0);
  const paidCents = useMemo(
    () => payments.reduce((sum, p) => sum + parseBRLToCents(p.amountReais || '0'), 0),
    [payments],
  );
  const remainingCents = totalCents - paidCents;

  function addToCart() {
    const product = productsQuery.data?.find((p) => p.id === selectedProductId);
    if (!product) return;
    setCart((prev) => {
      const existing = prev.find((line) => line.productId === product.id);
      if (existing) {
        return prev.map((line) =>
          line.productId === product.id ? { ...line, quantity: line.quantity + 1 } : line,
        );
      }
      return [...prev, { productId: product.id, name: product.name, priceCents: product.priceCents, quantity: 1 }];
    });
  }

  function removeFromCart(productId: string) {
    setCart((prev) => prev.filter((line) => line.productId !== productId));
  }

  function addPaymentLine() {
    setPayments((prev) => [...prev, { method: 'dinheiro', amountReais: '' }]);
  }

  function updatePayment(index: number, patch: Partial<PaymentLine>) {
    setPayments((prev) => prev.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  }

  function removePayment(index: number) {
    setPayments((prev) => prev.filter((_, i) => i !== index));
  }

  type CreateSaleOutcome = { kind: 'synced'; sale: Sale } | { kind: 'queued' };

  const createSaleMutation = useMutation<CreateSaleOutcome, Error, void>({
    // 'always': react-query's default ('online') PAUSES the whole mutation
    // while the browser is offline — it never even calls mutationFn, only
    // resuming once the connection comes back. That would completely defeat
    // local queueing (the entire point of this mutation): the button would
    // just spin forever until reconnection, instead of saving the sale on
    // the device right away. mutationFn already handles connectivity on its
    // own (isOnline check + network failure catch), so it doesn't need —
    // and can't — depend on react-query's network control here.
    networkMode: 'always',
    mutationFn: async (): Promise<CreateSaleOutcome> => {
      // clientSaleId is born HERE, already inside the body that goes to the
      // server — it's the same key used as the id of the local queue
      // (offline-sale-queue) and the one sent on any eventual sync retry,
      // guaranteeing the server always sees the same clientSaleId for this
      // sale on every attempt (see SalesService.create — real idempotency
      // depends on the key being identical on every attempt, not just existing).
      const clientSaleId = crypto.randomUUID();
      const body: CreateSaleInput = {
        customerId: selectedCustomerId || undefined,
        items: cart.map((line) => ({ productId: line.productId, quantity: line.quantity })),
        discountCents,
        pointsToRedeem,
        payments: payments.map((p) => ({ method: p.method, amountCents: parseBRLToCents(p.amountReais || '0') })),
        clientSaleId,
      };

      // No real connection: doesn't even attempt the request, queues it
      // directly — avoids waiting for the fetch timeout just to find out the obvious.
      if (!isOnline) {
        await enqueueOfflineSale({
          clientSaleId,
          tenantId: tenantId!,
          payload: body,
          queuedAt: new Date().toISOString(),
          status: 'pending',
          lastError: null,
        });
        return { kind: 'queued' };
      }

      try {
        const sale = await apiFetch<Sale>('/sales', { method: 'POST', accessToken: accessToken!, body });
        return { kind: 'synced', sale };
      } catch (error) {
        // ApiError = the server responded and actually refused the sale
        // (insufficient stock, payment doesn't add up, etc.) — this isn't a
        // connectivity problem, it has to surface to the operator now, not
        // stay hidden in a queue.
        if (error instanceof ApiError) {
          throw error;
        }
        // Any other error here is the fetch failing due to network (the
        // connection dropped right when finalizing) — the sale has already
        // been validated on the client (cart, payment matches), so it
        // becomes a queued sale with the SAME clientSaleId that would be
        // used on a manual retry, instead of the operator simply losing the sale.
        await enqueueOfflineSale({
          clientSaleId,
          tenantId: tenantId!,
          payload: body,
          queuedAt: new Date().toISOString(),
          status: 'pending',
          lastError: null,
        });
        return { kind: 'queued' };
      }
    },
    onSuccess: (outcome) => {
      if (outcome.kind === 'synced') {
        setLastSale(outcome.sale);
        queryClient.invalidateQueries({ queryKey: ['loyalty-balance', selectedCustomerId] });
      } else {
        toast.success('No connection — sale saved on this device. It will be sent automatically once the internet is back.');
        queryClient.invalidateQueries({ queryKey: ['offline-sale-queue'] });
      }
      setCart([]);
      setPayments([]);
      setDiscountReais('');
      setPointsToRedeemInput('');
      setSaleError(null);
    },
    onError: (error) => {
      setSaleError(error instanceof ApiError ? error.message : 'Unexpected error recording the sale');
    },
  });

  const [closingAmount, setClosingAmount] = useState('');
  const closeSessionMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/cash-sessions/${sessionQuery.data!.id}/close`, {
        method: 'POST',
        accessToken: accessToken!,
        body: { closingAmountCents: parseBRLToCents(closingAmount || '0') },
      }),
    onSuccess: () => {
      setClosingAmount('');
      queryClient.invalidateQueries({ queryKey: ['current-cash-session'] });
      toast.success('Register closed');
    },
  });

  const [movementType, setMovementType] = useState<'sangria' | 'suprimento'>('sangria');
  const [movementAmount, setMovementAmount] = useState('');
  const [movementReason, setMovementReason] = useState('');
  const addMovementMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/cash-sessions/${sessionQuery.data!.id}/movements`, {
        method: 'POST',
        accessToken: accessToken!,
        body: {
          type: movementType,
          amountCents: parseBRLToCents(movementAmount || '0'),
          reason: movementReason || undefined,
        },
      }),
    onSuccess: () => {
      setMovementAmount('');
      setMovementReason('');
      toast.success(movementType === 'sangria' ? 'Cash withdrawal recorded' : 'Cash deposit recorded');
    },
  });

  if (!accessToken || sessionQuery.isLoading) {
    return null;
  }

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">POS</h1>
      <p className="text-sm text-muted">Ring up sales for the currently open cash register.</p>

      {!sessionQuery.data ? (
        <Card className="flex flex-col gap-4">
          <h2 className="font-medium">Open register</h2>
          <p className="text-sm text-muted">Enter the cash amount you are starting the register with.</p>
          <div className="flex items-end gap-2">
            {activeStores.length > 1 && (
              <div className="flex flex-col gap-1.5">
                <label className="text-sm">Store</label>
                <Select value={selectedStoreId} onChange={(e) => setSelectedStoreId(e.target.value)}>
                  <option value="">Select...</option>
                  {activeStores.map((store) => (
                    <option key={store.id} value={store.id}>
                      {store.name}
                    </option>
                  ))}
                </Select>
              </div>
            )}
            <div className="flex flex-1 flex-col gap-1.5">
              <label className="text-sm">Opening amount (R$)</label>
              <Input
                placeholder="0.00"
                value={openingAmount}
                onChange={(e) => setOpeningAmount(e.target.value)}
              />
            </div>
            <Button
              loading={openSessionMutation.isPending}
              disabled={!effectiveStoreId}
              onClick={() => openSessionMutation.mutate()}
            >
              Open register
            </Button>
          </div>
        </Card>
      ) : (
        <>
          <div className="flex items-center justify-between rounded-lg border border-success/40 bg-success-soft px-4 py-2 text-sm">
            <span>Register open — opened with {formatCentsToBRL(sessionQuery.data.openingAmountCents)}</span>
            <div className="flex items-center gap-2">
              {!isOnline && (
                <Badge variant="warning" className="flex items-center gap-1">
                  <WifiOff className="h-3 w-3" />
                  No connection
                </Badge>
              )}
              <Badge variant="success">Open</Badge>
            </div>
          </div>

          {!isOnline && (
            <p className="flex items-center gap-1.5 text-xs text-muted">
              <CloudOff className="h-3.5 w-3.5" />
              Sales keep working offline — they are saved on this device and sent automatically once the internet is
              back. Prices and stock shown are the last known values
              {productsQuery.dataUpdatedAt ? ` (${new Date(productsQuery.dataUpdatedAt).toLocaleTimeString('pt-BR')})` : ''}.
            </p>
          )}

          {(pendingSales.length > 0 || attentionSales.length > 0) && (
            <Card className="flex flex-col gap-3">
              <h2 className="flex items-center gap-1.5 text-sm font-medium">
                <CloudOff className="h-4 w-4" />
                Offline sales
              </h2>
              {pendingSales.length > 0 && (
                <p className="text-sm text-muted">
                  {pendingSales.length} sale(s) waiting for a connection to sync
                  {isOnline ? ' (retrying now)...' : '.'}
                </p>
              )}
              {attentionSales.length > 0 && (
                <div className="flex flex-col gap-2">
                  <p className="flex items-center gap-1.5 text-sm text-warning">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    {attentionSales.length} offline sale(s) could not be synced — they need attention:
                  </p>
                  {attentionSales.map((sale) => (
                    <div
                      key={sale.clientSaleId}
                      className="flex items-center justify-between rounded-md border border-warning/40 bg-warning-soft px-3 py-2 text-xs"
                    >
                      <div className="flex flex-col gap-0.5">
                        <span>
                          Sale from {new Date(sale.queuedAt).toLocaleString('pt-BR')} —{' '}
                          {formatSaleQueueTotal(sale)}
                        </span>
                        <span className="text-warning">{sale.lastError}</span>
                      </div>
                      <button
                        type="button"
                        className="shrink-0 text-danger hover:underline"
                        onClick={() => discardAttentionSale(sale.clientSaleId)}
                      >
                        Discard
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}

          <AnimatePresence>
            {lastSale && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
              >
                <div className="flex items-start gap-3 rounded-lg border border-info/40 bg-info-soft px-4 py-3 text-sm">
                  <Receipt className="mt-0.5 h-4 w-4 shrink-0 text-info" />
                  <div className="flex flex-col gap-1">
                    <span>
                      Sale recorded: {formatCentsToBRL(lastSale.totalCents)} ({lastSale.items.length} item
                      {lastSale.items.length === 1 ? '' : 's'})
                    </span>
                    {lastSale.fiscalDocument?.status === 'authorized' && (
                      <span className="text-xs text-muted">
                        NFC-e authorized (sandbox) — key {lastSale.fiscalDocument.accessKey}
                      </span>
                    )}
                    {lastSale.fiscalDocument?.status === 'rejected' && (
                      <span className="text-xs text-warning">
                        NFC-e not issued: {lastSale.fiscalDocument.rejectionReason}. Reissue it later from Sales.
                      </span>
                    )}
                    {lastSale.pointsEarned > 0 && (
                      <span className="flex items-center gap-1 text-xs text-muted">
                        <Gift className="h-3.5 w-3.5" />
                        Customer earned {lastSale.pointsEarned} loyalty point(s)
                      </span>
                    )}
                  </div>
                  <Button variant="secondary" className="ml-auto shrink-0" onClick={() => window.print()}>
                    Print receipt
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {lastSale && (
            <SaleReceipt
              sale={lastSale}
              companyName={meQuery.data?.tenant.companyName ?? ''}
              displayName={meQuery.data?.tenant.displayName}
              logoUrl={logoUrl}
              storeName={lastSaleStore?.name}
              paperWidthMm={lastSaleStore?.receiptPaperWidthMm}
            />
          )}

          <Card className="flex flex-col gap-4">
            <h2 className="text-sm font-medium">New sale</h2>

            <div className="flex flex-col gap-1.5 sm:w-80">
              <label className="text-sm">Customer (optional)</label>
              <Select
                value={selectedCustomerId}
                onChange={(e) => {
                  setSelectedCustomerId(e.target.value);
                  setPointsToRedeemInput('');
                }}
              >
                <option value="">No customer identified</option>
                {customersQuery.data?.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name}
                  </option>
                ))}
              </Select>
              {selectedCustomerId && customerBalanceQuery.data && (
                <p className="flex items-center gap-1 text-xs text-muted">
                  <Gift className="h-3.5 w-3.5" />
                  {customerBalanceQuery.data.balancePoints} point(s) available — worth{' '}
                  {formatCentsToBRL(customerBalanceQuery.data.balanceValueCents)}
                </p>
              )}
            </div>

            <div className="flex items-end gap-2">
              <div className="flex flex-1 flex-col gap-1.5">
                <label className="text-sm">Product</label>
                <Select value={selectedProductId} onChange={(e) => setSelectedProductId(e.target.value)}>
                  <option value="">Select...</option>
                  {productsQuery.data
                    ?.filter((p) => p.active)
                    .map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.name} — {formatCentsToBRL(product.priceCents)}
                      </option>
                    ))}
                </Select>
              </div>
              <Button type="button" variant="secondary" onClick={addToCart} disabled={!selectedProductId}>
                <Plus className="h-4 w-4" />
                Add
              </Button>
            </div>

            <table className="w-full text-sm">
              <thead className="text-left text-muted">
                <tr>
                  <th className="py-1">Product</th>
                  <th className="py-1">Qty.</th>
                  <th className="py-1">Price</th>
                  <th className="py-1">Total</th>
                  <th className="py-1" />
                </tr>
              </thead>
              <tbody>
                <AnimatePresence initial={false}>
                  {cart.map((line) => (
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
                      <td className="py-1.5 font-mono tabular-nums">{formatCentsToBRL(line.priceCents)}</td>
                      <td className="py-1.5 font-mono tabular-nums">{formatCentsToBRL(line.priceCents * line.quantity)}</td>
                      <td className="py-1.5">
                        <button
                          type="button"
                          className="text-danger transition-colors hover:opacity-75"
                          onClick={() => removeFromCart(line.productId)}
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
            {cart.length === 0 && <EmptyState icon={ShoppingCart} message="Empty cart" />}

            <div className="flex flex-col gap-1.5 self-end sm:w-64">
              <label className="text-sm">Discount (R$)</label>
              <Input placeholder="0.00" value={discountReais} onChange={(e) => setDiscountReais(e.target.value)} />
            </div>

            {selectedCustomerId && !!customerBalanceQuery.data?.balancePoints && (
              <div className="flex flex-col gap-1.5 self-end sm:w-64">
                <label className="text-sm">Redeem points (max. {customerBalanceQuery.data.balancePoints})</label>
                <Input
                  type="number"
                  min={0}
                  max={customerBalanceQuery.data.balancePoints}
                  placeholder="0"
                  value={pointsToRedeemInput}
                  onChange={(e) => setPointsToRedeemInput(e.target.value)}
                />
                {pointsToRedeem > 0 && (
                  <p className="text-xs text-muted">discount of {formatCentsToBRL(redemptionValueCents)}</p>
                )}
              </div>
            )}

            <div className="flex flex-col gap-1 self-end text-right text-sm sm:w-64">
              <div className="flex justify-between">
                <span className="text-muted">Subtotal</span>
                <span className="tabular-nums">{formatCentsToBRL(subtotalCents)}</span>
              </div>
              {redemptionValueCents > 0 && (
                <div className="flex justify-between text-muted">
                  <span>Points redeemed</span>
                  <span className="tabular-nums">-{formatCentsToBRL(redemptionValueCents)}</span>
                </div>
              )}
              <div className="flex justify-between text-lg font-semibold">
                <span>Total</span>
                <span className="tabular-nums">{formatCentsToBRL(totalCents)}</span>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium">Payment</h3>
                <Button type="button" variant="secondary" onClick={addPaymentLine}>
                  <Plus className="h-4 w-4" />
                  Payment method
                </Button>
              </div>
              <AnimatePresence initial={false}>
                {payments.map((payment, index) => (
                  <motion.div
                    key={index}
                    layout
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    className="flex items-end gap-2"
                  >
                    <div className="flex flex-1 flex-col gap-1.5">
                      <label className="text-sm">Method</label>
                      <Select
                        value={payment.method}
                        onChange={(e) => updatePayment(index, { method: e.target.value as PaymentMethod })}
                      >
                        {Object.entries(PAYMENT_LABELS).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <div className="flex flex-1 flex-col gap-1.5">
                      <label className="text-sm">Amount (R$)</label>
                      <Input
                        placeholder="0.00"
                        value={payment.amountReais}
                        onChange={(e) => updatePayment(index, { amountReais: e.target.value })}
                      />
                    </div>
                    <button
                      type="button"
                      className="flex h-10 w-10 items-center justify-center text-danger transition-colors hover:opacity-75"
                      onClick={() => removePayment(index)}
                      aria-label="Remove payment method"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </motion.div>
                ))}
              </AnimatePresence>
              <p className={`text-right text-sm tabular-nums ${remainingCents === 0 ? 'text-success' : 'text-muted'}`}>
                {remainingCents > 0
                  ? `${formatCentsToBRL(remainingCents)} remaining`
                  : remainingCents < 0
                    ? `${formatCentsToBRL(-remainingCents)} over`
                    : 'Payment complete'}
              </p>
            </div>

            {saleError && <p className="text-sm text-danger">{saleError}</p>}

            <Button
              className="self-start"
              disabled={cart.length === 0 || remainingCents !== 0}
              loading={createSaleMutation.isPending}
              onClick={() => createSaleMutation.mutate()}
            >
              Finalize sale
            </Button>
          </Card>

          <Card className="flex flex-col gap-4">
            <h2 className="flex items-center gap-1.5 text-sm font-medium">
              Cash withdrawal / deposit
              <HelpHint>
                Withdrawal removes cash from the drawer without a sale (e.g. paying a supplier in cash). Deposit adds
                cash beyond the opening amount (e.g. topping up change). Both are recorded and counted when closing
                the register.
              </HelpHint>
            </h2>
            <div className="flex flex-wrap items-end gap-2">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm">Type</label>
                <Select value={movementType} onChange={(e) => setMovementType(e.target.value as 'sangria' | 'suprimento')}>
                  <option value="sangria">Withdrawal</option>
                  <option value="suprimento">Deposit</option>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm">Amount (R$)</label>
                <Input placeholder="0.00" value={movementAmount} onChange={(e) => setMovementAmount(e.target.value)} />
              </div>
              <div className="flex flex-1 flex-col gap-1.5">
                <label className="text-sm">Reason (optional)</label>
                <Input value={movementReason} onChange={(e) => setMovementReason(e.target.value)} />
              </div>
              <Button
                type="button"
                variant="secondary"
                loading={addMovementMutation.isPending}
                onClick={() => addMovementMutation.mutate()}
              >
                Record
              </Button>
            </div>
          </Card>

          <Card className="flex flex-col gap-4">
            <h2 className="flex items-center gap-1.5 text-sm font-medium">
              Close register
              <HelpHint>
                Count the cash physically in the drawer and enter it here. The system compares it against the
                expected balance (opening amount + cash sales + deposits − withdrawals) and records any difference.
              </HelpHint>
            </h2>
            <div className="flex items-end gap-2">
              <div className="flex flex-1 flex-col gap-1.5">
                <label className="text-sm">Counted amount (R$)</label>
                <Input placeholder="0.00" value={closingAmount} onChange={(e) => setClosingAmount(e.target.value)} />
              </div>
              <Button
                type="button"
                variant="secondary"
                loading={closeSessionMutation.isPending}
                onClick={() => closeSessionMutation.mutate()}
              >
                Close register
              </Button>
            </div>
          </Card>
        </>
      )}
    </>
  );
}
