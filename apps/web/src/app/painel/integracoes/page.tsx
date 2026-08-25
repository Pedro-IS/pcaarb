'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Copy, Key, PackageSearch, Plug, RefreshCw, ShoppingBag, Webhook } from 'lucide-react';
import { toast } from 'sonner';
import type {
  ApiKey,
  CreatedApiKey,
  CreateWebhookEndpointInput,
  MarketplaceChannel,
  MarketplaceListingWithProduct,
  MarketplaceOrder,
  Product,
  PullMarketplaceOrdersResult,
  Role,
  WebhookDelivery,
  WebhookEndpoint,
  WebhookEventType,
} from '@pcaarb/shared';
import { apiFetch, ApiError } from '@/lib/api-client';
import { formatCentsToBRL } from '@/lib/currency';
import { useAccessToken } from '@/lib/use-access-token';
import { useCurrentUser } from '@/lib/use-current-user';
import { ROLE_LABELS } from '@/lib/role-labels';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Card } from '@/components/ui/card';
import { Badge, type BadgeVariant } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { SkeletonRows } from '@/components/ui/skeleton';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';

const API_KEY_ROLES: Role[] = ['owner', 'admin', 'financeiro', 'operador_caixa'];

const LISTING_STATUS_BADGE: Record<'nao_sincronizado' | 'pending' | 'synced' | 'error', { label: string; variant: BadgeVariant }> = {
  nao_sincronizado: { label: 'Not synced', variant: 'neutral' },
  pending: { label: 'Pending', variant: 'neutral' },
  synced: { label: 'Synced', variant: 'success' },
  error: { label: 'Error', variant: 'danger' },
};

const ORDER_STATUS_BADGE: Record<MarketplaceOrder['status'], { label: string; variant: BadgeVariant }> = {
  imported: { label: 'Imported', variant: 'success' },
  needs_attention: { label: 'Needs attention', variant: 'warning' },
};

// 'webhook.test' is deliberately not a subscription option — it's the
// special-cased event the "Send test" action fires regardless of what an
// endpoint is subscribed to, not a real business event to opt into.
const SUBSCRIBABLE_EVENTS: { value: WebhookEventType; label: string }[] = [
  { value: 'sale.completed', label: 'Sale completed' },
  { value: 'sale.returned', label: 'Sale returned' },
];

const DELIVERY_STATUS_BADGE: Record<WebhookDelivery['status'], { label: string; variant: BadgeVariant }> = {
  pending: { label: 'Pending', variant: 'neutral' },
  success: { label: 'Delivered', variant: 'success' },
  failed: { label: 'Retrying', variant: 'warning' },
  exhausted: { label: 'Failed', variant: 'danger' },
};

export default function IntegracoesPage() {
  const accessToken = useAccessToken();
  const meQuery = useCurrentUser();
  const canManage = meQuery.data?.user.role === 'owner' || meQuery.data?.user.role === 'admin';
  const queryClient = useQueryClient();

  const [newChannelName, setNewChannelName] = useState('');
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);

  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyRole, setNewKeyRole] = useState<Role>('admin');
  const [newKeyExpiresAt, setNewKeyExpiresAt] = useState('');
  const [justCreatedKey, setJustCreatedKey] = useState<CreatedApiKey | null>(null);

  const [newHookUrl, setNewHookUrl] = useState('');
  const [newHookDescription, setNewHookDescription] = useState('');
  const [newHookEvents, setNewHookEvents] = useState<WebhookEventType[]>([]);
  const [selectedWebhookId, setSelectedWebhookId] = useState<string | null>(null);

  const channelsQuery = useQuery({
    queryKey: ['marketplace', 'channels'],
    queryFn: () => apiFetch<MarketplaceChannel[]>('/marketplace/channels', { accessToken: accessToken! }),
    enabled: !!accessToken,
  });

  const productsQuery = useQuery({
    queryKey: ['products'],
    queryFn: () => apiFetch<Product[]>('/products', { accessToken: accessToken! }),
    enabled: !!accessToken && !!selectedChannelId,
  });

  const listingsQuery = useQuery({
    queryKey: ['marketplace', 'listings', selectedChannelId],
    queryFn: () => apiFetch<MarketplaceListingWithProduct[]>(`/marketplace/channels/${selectedChannelId}/listings`, { accessToken: accessToken! }),
    enabled: !!accessToken && !!selectedChannelId,
  });

  const ordersQuery = useQuery({
    queryKey: ['marketplace', 'orders', selectedChannelId],
    queryFn: () => apiFetch<MarketplaceOrder[]>(`/marketplace/channels/${selectedChannelId}/orders`, { accessToken: accessToken! }),
    enabled: !!accessToken && !!selectedChannelId,
  });

  const apiKeysQuery = useQuery({
    queryKey: ['api-keys'],
    queryFn: () => apiFetch<ApiKey[]>('/api-keys', { accessToken: accessToken! }),
    enabled: !!accessToken,
  });

  const webhooksQuery = useQuery({
    queryKey: ['webhooks'],
    queryFn: () => apiFetch<WebhookEndpoint[]>('/webhooks', { accessToken: accessToken! }),
    enabled: !!accessToken,
  });

  const webhookDeliveriesQuery = useQuery({
    queryKey: ['webhooks', selectedWebhookId, 'deliveries'],
    queryFn: () => apiFetch<WebhookDelivery[]>(`/webhooks/${selectedWebhookId}/deliveries`, { accessToken: accessToken! }),
    enabled: !!accessToken && !!selectedWebhookId,
  });

  function invalidateChannel() {
    queryClient.invalidateQueries({ queryKey: ['marketplace', 'listings', selectedChannelId] });
    queryClient.invalidateQueries({ queryKey: ['marketplace', 'orders', selectedChannelId] });
    queryClient.invalidateQueries({ queryKey: ['products'] });
  }

  const createChannelMutation = useMutation({
    mutationFn: () => apiFetch<MarketplaceChannel>('/marketplace/channels', { method: 'POST', accessToken: accessToken!, body: { name: newChannelName } }),
    onSuccess: (channel) => {
      setNewChannelName('');
      queryClient.invalidateQueries({ queryKey: ['marketplace', 'channels'] });
      setSelectedChannelId(channel.id);
      toast.success('Integration created (sandbox)');
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Error creating integration');
    },
  });

  const toggleChannelMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      apiFetch<MarketplaceChannel>(`/marketplace/channels/${id}`, { method: 'PATCH', accessToken: accessToken!, body: { active } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['marketplace', 'channels'] });
      toast.success('Integration updated');
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Error updating integration');
    },
  });

  const syncProductMutation = useMutation({
    mutationFn: (productId: string) =>
      apiFetch(`/marketplace/channels/${selectedChannelId}/listings/${productId}/sync`, { method: 'POST', accessToken: accessToken! }),
    onSuccess: () => {
      invalidateChannel();
      toast.success('Product synced');
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Error syncing product');
    },
  });

  const pullOrdersMutation = useMutation({
    mutationFn: () => apiFetch<PullMarketplaceOrdersResult>(`/marketplace/channels/${selectedChannelId}/orders/pull`, { method: 'POST', accessToken: accessToken! }),
    onSuccess: (result) => {
      invalidateChannel();
      if (result.fetched === 0) {
        toast.success('No new orders in this channel');
      } else if (result.needsAttention > 0) {
        toast.error(`${result.imported} order(s) imported, ${result.needsAttention} need attention`);
      } else {
        toast.success(`${result.imported} order(s) imported`);
      }
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Error fetching orders');
    },
  });

  const createApiKeyMutation = useMutation({
    mutationFn: () =>
      apiFetch<CreatedApiKey>('/api-keys', {
        method: 'POST',
        accessToken: accessToken!,
        body: {
          name: newKeyName,
          role: newKeyRole,
          // Input type="date" only gives the date — it expires at the end of the chosen day.
          expiresAt: newKeyExpiresAt ? new Date(`${newKeyExpiresAt}T23:59:59`).toISOString() : undefined,
        },
      }),
    onSuccess: (created) => {
      setJustCreatedKey(created);
      setNewKeyName('');
      setNewKeyRole('admin');
      setNewKeyExpiresAt('');
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Error creating API key');
    },
  });

  const revokeApiKeyMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/api-keys/${id}`, { method: 'DELETE', accessToken: accessToken! }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
      toast.success('API key revoked');
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Error revoking API key');
    },
  });

  const createWebhookMutation = useMutation({
    mutationFn: () =>
      apiFetch<WebhookEndpoint>('/webhooks', {
        method: 'POST',
        accessToken: accessToken!,
        body: {
          url: newHookUrl,
          description: newHookDescription || undefined,
          subscribedEvents: newHookEvents,
        } satisfies CreateWebhookEndpointInput,
      }),
    onSuccess: (endpoint) => {
      setNewHookUrl('');
      setNewHookDescription('');
      setNewHookEvents([]);
      setSelectedWebhookId(endpoint.id);
      queryClient.invalidateQueries({ queryKey: ['webhooks'] });
      toast.success('Webhook endpoint created');
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Error creating webhook endpoint');
    },
  });

  const toggleWebhookMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      apiFetch<WebhookEndpoint>(`/webhooks/${id}`, { method: 'PATCH', accessToken: accessToken!, body: { active } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhooks'] });
      toast.success('Webhook endpoint updated');
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Error updating webhook endpoint');
    },
  });

  const rotateWebhookSecretMutation = useMutation({
    mutationFn: (id: string) => apiFetch<WebhookEndpoint>(`/webhooks/${id}/rotate-secret`, { method: 'POST', accessToken: accessToken! }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhooks'] });
      toast.success('Signing secret rotated — update it wherever you verify deliveries');
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Error rotating secret');
    },
  });

  const deleteWebhookMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/webhooks/${id}`, { method: 'DELETE', accessToken: accessToken! }),
    onSuccess: (_data, id) => {
      if (selectedWebhookId === id) {
        setSelectedWebhookId(null);
      }
      queryClient.invalidateQueries({ queryKey: ['webhooks'] });
      toast.success('Webhook endpoint deleted');
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Error deleting webhook endpoint');
    },
  });

  const testWebhookMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/webhooks/${id}/test`, { method: 'POST', accessToken: accessToken! }),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ['webhooks', id, 'deliveries'] });
      toast.success('Test event sent — check the delivery log below');
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Error sending test event');
    },
  });

  const retryDeliveryMutation = useMutation({
    mutationFn: (deliveryId: string) => apiFetch(`/webhooks/deliveries/${deliveryId}/retry`, { method: 'POST', accessToken: accessToken! }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhooks', selectedWebhookId, 'deliveries'] });
      toast.success('Delivery retried');
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Error retrying delivery');
    },
  });

  function toggleHookEvent(event: WebhookEventType) {
    setNewHookEvents((current) => (current.includes(event) ? current.filter((e) => e !== event) : [...current, event]));
  }

  async function copySecret(secret: string) {
    try {
      await navigator.clipboard.writeText(secret);
      toast.success('Secret copied');
    } catch {
      toast.error('Could not copy automatically — select and copy manually');
    }
  }

  async function copyRawKey(rawKey: string) {
    try {
      await navigator.clipboard.writeText(rawKey);
      toast.success('Key copied');
    } catch {
      toast.error('Could not copy automatically — select and copy manually');
    }
  }

  if (!accessToken || meQuery.isLoading) {
    return null;
  }

  if (!canManage) {
    return (
      <>
        <h1 className="text-2xl font-semibold tracking-tight">Integrations</h1>
        <Card>
          <p className="text-sm text-muted">Configuring e-commerce/marketplace integrations is restricted to administrators.</p>
        </Card>
      </>
    );
  }

  const selectedChannel = channelsQuery.data?.find((c) => c.id === selectedChannelId) ?? null;
  const listingByProductId = new Map((listingsQuery.data ?? []).map((listing) => [listing.productId, listing]));

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Integrations</h1>
      <p className="text-sm text-muted">
        Connect e-commerce/marketplace channels (sandbox — no real credentials yet) to publish products and import
        orders, keeping stock consistent between the POS and online sales.
      </p>

      <Card className="flex items-end gap-2">
        <div className="flex flex-1 flex-col gap-1.5">
          <label className="text-sm">New integration (sandbox)</label>
          <Input placeholder="E.g.: Mercado Livre store" value={newChannelName} onChange={(e) => setNewChannelName(e.target.value)} />
        </div>
        <Button loading={createChannelMutation.isPending} disabled={!newChannelName} onClick={() => createChannelMutation.mutate()}>
          Connect
        </Button>
      </Card>

      {!channelsQuery.data ? (
        <div className="rounded-lg border border-border">
          <SkeletonRows rows={2} cols={2} />
        </div>
      ) : channelsQuery.data.length === 0 ? (
        <div className="rounded-lg border border-border">
          <EmptyState icon={Plug} message="No integrations connected yet." />
        </div>
      ) : (
        <Table>
          <TableHeader>
            <tr>
              <TableHead>Channel</TableHead>
              <TableHead>Status</TableHead>
              <TableHead></TableHead>
            </tr>
          </TableHeader>
          <TableBody>
            {channelsQuery.data.map((channel) => (
              <TableRow
                key={channel.id}
                className={`cursor-pointer ${selectedChannelId === channel.id ? 'bg-accent-soft/40' : ''}`}
                onClick={() => setSelectedChannelId(channel.id)}
              >
                <TableCell>
                  <span className="flex items-center gap-1.5">
                    <Plug className="h-3.5 w-3.5 text-muted" />
                    {channel.name}
                  </span>
                </TableCell>
                <TableCell>
                  <Badge variant={channel.active ? 'success' : 'neutral'}>{channel.active ? 'Active' : 'Inactive'}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  <button
                    type="button"
                    className="text-xs text-accent hover:underline"
                    disabled={toggleChannelMutation.isPending}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleChannelMutation.mutate({ id: channel.id, active: !channel.active });
                    }}
                  >
                    {channel.active ? 'Deactivate' : 'Reactivate'}
                  </button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {selectedChannel && (
        <>
          <Card className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-1.5 text-sm font-medium">
                <PackageSearch className="h-4 w-4" />
                Products — {selectedChannel.name}
              </h2>
            </div>
            {!productsQuery.data || !listingsQuery.data ? (
              <div className="rounded-lg border border-border">
                <SkeletonRows rows={3} cols={4} />
              </div>
            ) : productsQuery.data.filter((p) => p.active).length === 0 ? (
              <div className="rounded-lg border border-border">
                <EmptyState icon={PackageSearch} message="No active products registered yet." />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <tr>
                    <TableHead>Product</TableHead>
                    <TableHead>Price</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead></TableHead>
                  </tr>
                </TableHeader>
                <TableBody>
                  {productsQuery.data
                    .filter((p) => p.active)
                    .map((product) => {
                      const listing = listingByProductId.get(product.id);
                      const statusInfo = LISTING_STATUS_BADGE[listing?.status ?? 'nao_sincronizado'];
                      return (
                        <TableRow key={product.id}>
                          <TableCell>{product.name}</TableCell>
                          <TableCell numeric>{formatCentsToBRL(product.priceCents)}</TableCell>
                          <TableCell>
                            <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                            {listing?.status === 'error' && listing.lastSyncError && (
                              <p className="mt-1 text-xs text-danger">{listing.lastSyncError}</p>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="secondary"
                              loading={syncProductMutation.isPending && syncProductMutation.variables === product.id}
                              onClick={() => syncProductMutation.mutate(product.id)}
                            >
                              {listing ? 'Sync again' : 'Sync'}
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                </TableBody>
              </Table>
            )}
          </Card>

          <Card className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-1.5 text-sm font-medium">
                <ShoppingBag className="h-4 w-4" />
                Imported orders — {selectedChannel.name}
              </h2>
              <Button variant="secondary" loading={pullOrdersMutation.isPending} onClick={() => pullOrdersMutation.mutate()}>
                <RefreshCw className="h-4 w-4" />
                Fetch new orders
              </Button>
            </div>
            {!ordersQuery.data ? (
              <div className="rounded-lg border border-border">
                <SkeletonRows rows={2} cols={3} />
              </div>
            ) : ordersQuery.data.length === 0 ? (
              <div className="rounded-lg border border-border">
                <EmptyState icon={ShoppingBag} message="No orders imported yet." />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <tr>
                    <TableHead>Order</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                  </tr>
                </TableHeader>
                <TableBody>
                  {ordersQuery.data.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell>{order.externalOrderId}</TableCell>
                      <TableCell numeric>{formatCentsToBRL(order.totalCents)}</TableCell>
                      <TableCell>
                        <span className="flex items-center gap-1.5">
                          <Badge variant={ORDER_STATUS_BADGE[order.status].variant}>{ORDER_STATUS_BADGE[order.status].label}</Badge>
                          {order.status === 'needs_attention' && (
                            <span className="inline-flex" title={order.issue ?? undefined}>
                              <AlertTriangle className="h-3.5 w-3.5 text-warning" />
                            </span>
                          )}
                        </span>
                        {order.status === 'needs_attention' && order.issue && (
                          <p className="mt-1 text-xs text-warning">{order.issue}</p>
                        )}
                        {order.status === 'imported' && (
                          <span className="mt-1 flex items-center gap-1 text-xs text-muted">
                            <CheckCircle2 className="h-3 w-3" />
                            stock updated
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        </>
      )}

      <div className="flex flex-col gap-4">
        <div>
          <h2 className="flex items-center gap-1.5 text-lg font-semibold tracking-tight">
            <Key className="h-4 w-4" />
            API keys
          </h2>
          <p className="text-sm text-muted">
            Generate a key for an external system to consume the PCAARB API directly (interactive documentation at{' '}
            <code className="rounded bg-card-hover px-1 py-0.5 text-xs">/api/docs</code>). The key acts with
            the same permissions as the chosen role — the same rules that apply to a logged-in user. Use it server-side
            only — never in code that runs in the end customer&apos;s browser.
          </p>
        </div>

        {justCreatedKey && (
          <Card className="flex flex-col gap-2 border-warning/40 bg-warning-soft">
            <p className="flex items-center gap-1.5 text-sm font-medium text-warning">
              <AlertTriangle className="h-4 w-4" />
              Save this key now — it will not be shown again.
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 overflow-x-auto rounded-md border border-warning/40 bg-card px-3 py-2 text-xs">
                {justCreatedKey.rawKey}
              </code>
              <Button variant="secondary" onClick={() => copyRawKey(justCreatedKey.rawKey)}>
                <Copy className="h-4 w-4" />
                Copy
              </Button>
            </div>
            <button
              type="button"
              className="self-start text-xs text-muted hover:underline"
              onClick={() => setJustCreatedKey(null)}
            >
              I have saved it, close
            </button>
          </Card>
        )}

        <Card className="flex flex-wrap items-end gap-2">
          <div className="flex min-w-40 flex-1 flex-col gap-1.5">
            <label className="text-sm">Name</label>
            <Input placeholder="E.g.: Accounting integration" value={newKeyName} onChange={(e) => setNewKeyName(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm">Role</label>
            <Select value={newKeyRole} onChange={(e) => setNewKeyRole(e.target.value as Role)}>
              {API_KEY_ROLES.map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABELS[role]}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm">Expires on (optional)</label>
            <Input
              type="date"
              value={newKeyExpiresAt}
              onChange={(e) => setNewKeyExpiresAt(e.target.value)}
            />
          </div>
          <Button loading={createApiKeyMutation.isPending} disabled={!newKeyName} onClick={() => createApiKeyMutation.mutate()}>
            Generate key
          </Button>
        </Card>

        {!apiKeysQuery.data ? (
          <div className="rounded-lg border border-border">
            <SkeletonRows rows={2} cols={4} />
          </div>
        ) : apiKeysQuery.data.length === 0 ? (
          <div className="rounded-lg border border-border">
            <EmptyState icon={Key} message="No API keys created yet." />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <tr>
                <TableHead>Name</TableHead>
                <TableHead>Key</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Last used</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </tr>
            </TableHeader>
            <TableBody>
              {apiKeysQuery.data.map((key) => {
                const expired = key.expiresAt && new Date(key.expiresAt) < new Date();
                return (
                  <TableRow key={key.id}>
                    <TableCell>{key.name}</TableCell>
                    <TableCell>
                      <code className="text-xs text-muted">{key.keyPrefix}…</code>
                    </TableCell>
                    <TableCell>{ROLE_LABELS[key.role]}</TableCell>
                    <TableCell className="text-muted">
                      {key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleString('pt-BR') : 'Never used'}
                    </TableCell>
                    <TableCell>
                      {key.revokedAt ? (
                        <Badge variant="neutral">Revoked</Badge>
                      ) : expired ? (
                        <Badge variant="warning">Expired</Badge>
                      ) : (
                        <Badge variant="success">Active</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {!key.revokedAt && (
                        <button
                          type="button"
                          className="text-xs text-danger hover:underline"
                          disabled={revokeApiKeyMutation.isPending}
                          onClick={() => revokeApiKeyMutation.mutate(key.id)}
                        >
                          Revoke
                        </button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      <div className="flex flex-col gap-4">
        <div>
          <h2 className="flex items-center gap-1.5 text-lg font-semibold tracking-tight">
            <Webhook className="h-4 w-4" />
            Webhooks
          </h2>
          <p className="text-sm text-muted">
            Get a signed HTTP POST whenever an event happens (a sale completes, a return is processed) instead of
            polling the API. Each request carries an <code className="rounded bg-card-hover px-1 py-0.5 text-xs">X-PCAARB-Signature</code>{' '}
            header — verify it with the endpoint&apos;s signing secret before trusting the payload.
          </p>
        </div>

        <Card className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex min-w-56 flex-1 flex-col gap-1.5">
              <label className="text-sm">Endpoint URL</label>
              <Input placeholder="https://example.com/webhooks/pcaarb" value={newHookUrl} onChange={(e) => setNewHookUrl(e.target.value)} />
            </div>
            <div className="flex min-w-40 flex-1 flex-col gap-1.5">
              <label className="text-sm">Description (optional)</label>
              <Input placeholder="E.g.: Accounting sync" value={newHookDescription} onChange={(e) => setNewHookDescription(e.target.value)} />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm">Events</span>
            {SUBSCRIBABLE_EVENTS.map((event) => (
              <label key={event.value} className="flex items-center gap-1.5 text-sm">
                <input type="checkbox" checked={newHookEvents.includes(event.value)} onChange={() => toggleHookEvent(event.value)} />
                {event.label}
              </label>
            ))}
            <Button
              loading={createWebhookMutation.isPending}
              disabled={!newHookUrl || newHookEvents.length === 0}
              onClick={() => createWebhookMutation.mutate()}
            >
              Add endpoint
            </Button>
          </div>
        </Card>

        {!webhooksQuery.data ? (
          <div className="rounded-lg border border-border">
            <SkeletonRows rows={2} cols={4} />
          </div>
        ) : webhooksQuery.data.length === 0 ? (
          <div className="rounded-lg border border-border">
            <EmptyState icon={Webhook} message="No webhook endpoints configured yet." />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <tr>
                <TableHead>URL</TableHead>
                <TableHead>Events</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </tr>
            </TableHeader>
            <TableBody>
              {webhooksQuery.data.map((endpoint) => (
                <TableRow
                  key={endpoint.id}
                  className={`cursor-pointer ${selectedWebhookId === endpoint.id ? 'bg-accent-soft/40' : ''}`}
                  onClick={() => setSelectedWebhookId(endpoint.id)}
                >
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="break-all">{endpoint.url}</span>
                      {endpoint.description && <span className="text-xs text-muted">{endpoint.description}</span>}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {endpoint.subscribedEvents.map((event) => (
                        <Badge key={event} variant="neutral">
                          {event}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={endpoint.active ? 'success' : 'neutral'}>{endpoint.active ? 'Active' : 'Inactive'}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-3" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        className="text-xs text-accent hover:underline"
                        disabled={testWebhookMutation.isPending}
                        onClick={() => testWebhookMutation.mutate(endpoint.id)}
                      >
                        Send test
                      </button>
                      <button
                        type="button"
                        className="text-xs text-accent hover:underline"
                        disabled={toggleWebhookMutation.isPending}
                        onClick={() => toggleWebhookMutation.mutate({ id: endpoint.id, active: !endpoint.active })}
                      >
                        {endpoint.active ? 'Deactivate' : 'Reactivate'}
                      </button>
                      <button
                        type="button"
                        className="text-xs text-danger hover:underline"
                        disabled={deleteWebhookMutation.isPending}
                        onClick={() => deleteWebhookMutation.mutate(endpoint.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {selectedWebhookId && webhooksQuery.data && (
          <>
            {(() => {
              const endpoint = webhooksQuery.data!.find((e) => e.id === selectedWebhookId);
              if (!endpoint) return null;
              return (
                <Card className="flex flex-col gap-2">
                  <p className="flex items-center gap-1.5 text-sm font-medium">Signing secret</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 overflow-x-auto rounded-md border border-border bg-card-hover px-3 py-2 text-xs">
                      {endpoint.secret}
                    </code>
                    <Button variant="secondary" onClick={() => copySecret(endpoint.secret)}>
                      <Copy className="h-4 w-4" />
                      Copy
                    </Button>
                    <Button
                      variant="secondary"
                      loading={rotateWebhookSecretMutation.isPending}
                      onClick={() => rotateWebhookSecretMutation.mutate(endpoint.id)}
                    >
                      <RefreshCw className="h-4 w-4" />
                      Rotate
                    </Button>
                  </div>
                </Card>
              );
            })()}

            <Card className="flex flex-col gap-3">
              <h3 className="text-sm font-medium">Delivery log</h3>
              {!webhookDeliveriesQuery.data ? (
                <div className="rounded-lg border border-border">
                  <SkeletonRows rows={2} cols={4} />
                </div>
              ) : webhookDeliveriesQuery.data.length === 0 ? (
                <div className="rounded-lg border border-border">
                  <EmptyState icon={Webhook} message="No deliveries yet." />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <tr>
                      <TableHead>Event</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Attempt</TableHead>
                      <TableHead>Sent</TableHead>
                      <TableHead></TableHead>
                    </tr>
                  </TableHeader>
                  <TableBody>
                    {webhookDeliveriesQuery.data.map((delivery) => (
                      <TableRow key={delivery.id}>
                        <TableCell>{delivery.eventType}</TableCell>
                        <TableCell>
                          <Badge variant={DELIVERY_STATUS_BADGE[delivery.status].variant}>{DELIVERY_STATUS_BADGE[delivery.status].label}</Badge>
                          {delivery.errorMessage && <p className="mt-1 text-xs text-muted">{delivery.errorMessage}</p>}
                        </TableCell>
                        <TableCell numeric className="text-muted">{delivery.attempt}</TableCell>
                        <TableCell className="text-muted">{new Date(delivery.createdAt).toLocaleString('pt-BR')}</TableCell>
                        <TableCell className="text-right">
                          {(delivery.status === 'failed' || delivery.status === 'exhausted') && (
                            <button
                              type="button"
                              className="text-xs text-accent hover:underline"
                              disabled={retryDeliveryMutation.isPending}
                              onClick={() => retryDeliveryMutation.mutate(delivery.id)}
                            >
                              Retry now
                            </button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Card>
          </>
        )}
      </div>
    </>
  );
}
