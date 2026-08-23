'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, BarChart3, Download, Landmark, PackageSearch, Receipt, Store, Tag, Trophy, Wallet } from 'lucide-react';
import type {
  AbcCurveItem,
  DreSummary,
  PricingSuggestionItem,
  ReorderSuggestionItem,
  SalesSummary,
  SellerRankingItem,
  StoreRankingItem,
} from '@pcaarb/shared';
import { apiFetch, apiDownload, ApiError } from '@/lib/api-client';
import { formatCentsToBRL } from '@/lib/currency';
import { useAccessToken } from '@/lib/use-access-token';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge, type BadgeVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { SkeletonRows } from '@/components/ui/skeleton';

const ABC_BADGE_VARIANT: Record<AbcCurveItem['class'], BadgeVariant> = {
  A: 'success',
  B: 'warning',
  C: 'neutral',
};

function buildPeriodQuery(from: string, to: string): string {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export default function RelatoriosPage() {
  const accessToken = useAccessToken();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [exporting, setExporting] = useState<'vendas' | 'financeiro' | null>(null);
  const [targetMarginPercent, setTargetMarginPercent] = useState('30');
  const period = buildPeriodQuery(from, to);

  async function handleExport(kind: 'vendas' | 'financeiro') {
    if (!accessToken) return;
    setExporting(kind);
    try {
      await apiDownload(`/reports/exportar/${kind}.csv${period}`, accessToken);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Error generating the file');
    } finally {
      setExporting(null);
    }
  }

  const summaryQuery = useQuery({
    queryKey: ['reports', 'summary', from, to],
    queryFn: () => apiFetch<SalesSummary>(`/reports/vendas-resumo${period}`, { accessToken: accessToken! }),
    enabled: !!accessToken,
  });

  const abcQuery = useQuery({
    queryKey: ['reports', 'abc', from, to],
    queryFn: () => apiFetch<AbcCurveItem[]>(`/reports/curva-abc${period}`, { accessToken: accessToken! }),
    enabled: !!accessToken,
  });

  const sellersQuery = useQuery({
    queryKey: ['reports', 'sellers', from, to],
    queryFn: () => apiFetch<SellerRankingItem[]>(`/reports/vendedores-ranking${period}`, { accessToken: accessToken! }),
    enabled: !!accessToken,
  });

  const storesQuery = useQuery({
    queryKey: ['reports', 'stores', from, to],
    queryFn: () => apiFetch<StoreRankingItem[]>(`/reports/lojas-ranking${period}`, { accessToken: accessToken! }),
    enabled: !!accessToken,
  });

  const dreQuery = useQuery({
    queryKey: ['reports', 'dre', from, to],
    queryFn: () => apiFetch<DreSummary>(`/reports/dre${period}`, { accessToken: accessToken! }),
    enabled: !!accessToken,
  });

  const reorderQuery = useQuery({
    queryKey: ['reports', 'reposicao', from, to],
    queryFn: () => apiFetch<ReorderSuggestionItem[]>(`/reports/reposicao${period}`, { accessToken: accessToken! }),
    enabled: !!accessToken,
  });

  const marginNumber = Number(targetMarginPercent);
  const pricingQuery = useQuery({
    queryKey: ['reports', 'precificacao', marginNumber],
    queryFn: () =>
      apiFetch<PricingSuggestionItem[]>(`/reports/precificacao?targetMarginPercent=${marginNumber}`, {
        accessToken: accessToken!,
      }),
    enabled: !!accessToken && Number.isFinite(marginNumber) && marginNumber >= 0 && marginNumber <= 95,
  });

  const summary = summaryQuery.data;
  const dre = dreQuery.data;

  if (!accessToken) {
    return null;
  }

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>

      <Card className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm">From</label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm">To</label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
        </div>
        <p className="text-sm text-muted">
          {summary ? `Period shown: ${summary.from} to ${summary.to}` : 'No filter, showing the last 30 days.'}
        </p>
        <div className="ml-auto flex gap-2">
          <Button
            variant="secondary"
            loading={exporting === 'vendas'}
            onClick={() => handleExport('vendas')}
          >
            <Download className="h-4 w-4" />
            Export sales
          </Button>
          <Button
            variant="secondary"
            loading={exporting === 'financeiro'}
            onClick={() => handleExport('financeiro')}
          >
            <Download className="h-4 w-4" />
            Export finance
          </Button>
        </div>
      </Card>
      <p className="-mt-2 text-xs text-muted">
        Exports as CSV (compatible with Excel/Google Sheets) to send to an accountant or open in any spreadsheet.
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="flex flex-col gap-1">
          <div className="flex items-center gap-1.5 text-xs text-muted">
            <Receipt className="h-3.5 w-3.5" />
            Sales in period
          </div>
          <p className="text-lg font-semibold">{summary ? summary.totalSales : '—'}</p>
        </Card>
        <Card className="flex flex-col gap-1">
          <div className="flex items-center gap-1.5 text-xs text-muted">
            <Wallet className="h-3.5 w-3.5" />
            Revenue
          </div>
          <p className="text-lg font-semibold">{summary ? formatCentsToBRL(summary.totalRevenueCents) : '—'}</p>
        </Card>
        <Card className="flex flex-col gap-1">
          <div className="flex items-center gap-1.5 text-xs text-muted">
            <BarChart3 className="h-3.5 w-3.5" />
            Average ticket
          </div>
          <p className="text-lg font-semibold">{summary ? formatCentsToBRL(summary.averageTicketCents) : '—'}</p>
        </Card>
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-medium text-muted">
          <Trophy className="h-3.5 w-3.5" />
          Seller ranking
        </h2>
        <div className="overflow-x-auto rounded-lg border border-border">
          {!sellersQuery.data ? (
            <SkeletonRows rows={2} cols={3} />
          ) : sellersQuery.data.length === 0 ? (
            <EmptyState icon={Trophy} message="No sales in this period." />
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-left dark:bg-zinc-900">
                <tr>
                  <th className="px-4 py-2 font-medium">Seller</th>
                  <th className="px-4 py-2 font-medium">Sales</th>
                  <th className="px-4 py-2 font-medium">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {sellersQuery.data.map((seller) => (
                  <tr key={seller.sellerId} className="border-t border-border">
                    <td className="px-4 py-2">{seller.sellerName}</td>
                    <td className="px-4 py-2">{seller.totalSales}</td>
                    <td className="px-4 py-2">{formatCentsToBRL(seller.revenueCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-medium text-muted">
          <Store className="h-3.5 w-3.5" />
          Consolidated view by store
        </h2>
        <div className="overflow-x-auto rounded-lg border border-border">
          {!storesQuery.data ? (
            <SkeletonRows rows={2} cols={3} />
          ) : storesQuery.data.length === 0 ? (
            <EmptyState icon={Store} message="No sales in this period." />
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-left dark:bg-zinc-900">
                <tr>
                  <th className="px-4 py-2 font-medium">Store</th>
                  <th className="px-4 py-2 font-medium">Sales</th>
                  <th className="px-4 py-2 font-medium">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {storesQuery.data.map((store) => (
                  <tr key={store.storeId} className="border-t border-border">
                    <td className="px-4 py-2">{store.storeName}</td>
                    <td className="px-4 py-2">{store.totalSales}</td>
                    <td className="px-4 py-2">{formatCentsToBRL(store.revenueCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-muted">Product ABC curve</h2>
        <p className="text-xs text-muted">
          Class A covers up to 80% of cumulative revenue, B up to 95%, C the rest — helps identify the products that
          drive most of the revenue.
        </p>
        <div className="overflow-x-auto rounded-lg border border-border">
          {!abcQuery.data ? (
            <SkeletonRows rows={4} cols={5} />
          ) : abcQuery.data.length === 0 ? (
            <EmptyState icon={BarChart3} message="No sales in this period." />
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-left dark:bg-zinc-900">
                <tr>
                  <th className="px-4 py-2 font-medium">Product</th>
                  <th className="px-4 py-2 font-medium">Qty. sold</th>
                  <th className="px-4 py-2 font-medium">Revenue</th>
                  <th className="px-4 py-2 font-medium">% of revenue</th>
                  <th className="px-4 py-2 font-medium">Class</th>
                </tr>
              </thead>
              <tbody>
                {abcQuery.data.map((item) => (
                  <tr key={item.productId} className="border-t border-border">
                    <td className="px-4 py-2">{item.productName}</td>
                    <td className="px-4 py-2">{item.quantitySold}</td>
                    <td className="px-4 py-2">{formatCentsToBRL(item.revenueCents)}</td>
                    <td className="px-4 py-2 text-muted">{item.revenueSharePercent.toFixed(1)}%</td>
                    <td className="px-4 py-2">
                      <Badge variant={ABC_BADGE_VARIANT[item.class]}>{item.class}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-medium text-muted">
          <PackageSearch className="h-3.5 w-3.5" />
          Restocking suggestions
        </h2>
        <p className="text-xs text-muted">
          Estimated with a simple moving average (sales in period ÷ days in period) — not a forecasting model with
          seasonality, it is a linear projection over what has already been sold. Products with no sales history and
          healthy stock do not show up here.
        </p>
        <div className="overflow-x-auto rounded-lg border border-border">
          {!reorderQuery.data ? (
            <SkeletonRows rows={3} cols={5} />
          ) : reorderQuery.data.length === 0 ? (
            <EmptyState icon={PackageSearch} message="No product needs attention right now." />
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-left dark:bg-zinc-900">
                <tr>
                  <th className="px-4 py-2 font-medium">Product</th>
                  <th className="px-4 py-2 font-medium">Stock</th>
                  <th className="px-4 py-2 font-medium">Sales/day (avg.)</th>
                  <th className="px-4 py-2 font-medium">Stockout forecast</th>
                  <th className="px-4 py-2 font-medium">Suggested order</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {reorderQuery.data.map((item) => (
                  <tr key={item.productId} className="border-t border-border">
                    <td className="px-4 py-2">{item.productName}</td>
                    <td className="px-4 py-2">{item.stockQuantity}</td>
                    <td className="px-4 py-2 text-muted">{item.avgDailySales.toFixed(2)}</td>
                    <td className="px-4 py-2 text-muted">
                      {item.daysUntilStockout === null ? '—' : `${item.daysUntilStockout} day(s)`}
                    </td>
                    <td className="px-4 py-2">{item.suggestedReorderQty > 0 ? item.suggestedReorderQty : '—'}</td>
                    <td className="px-4 py-2">
                      {item.needsAttention ? (
                        <Badge variant="danger">
                          <AlertTriangle className="mr-1 inline h-3 w-3" />
                          Attention
                        </Badge>
                      ) : (
                        <Badge variant="success">OK</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-medium text-muted">
          <Tag className="h-3.5 w-3.5" />
          Pricing suggestions
        </h2>
        <p className="text-xs text-muted">
          Price suggested from the target margin entered (cost ÷ (1 − margin)) — a margin heuristic, does not account
          for competition or price elasticity. Only products with a registered cost are included.
        </p>
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted">Target margin</label>
          <Input
            type="number"
            min={0}
            max={95}
            value={targetMarginPercent}
            onChange={(e) => setTargetMarginPercent(e.target.value)}
            className="w-24"
          />
          <span className="text-sm text-muted">%</span>
        </div>
        <div className="overflow-x-auto rounded-lg border border-border">
          {!pricingQuery.data ? (
            <SkeletonRows rows={3} cols={5} />
          ) : pricingQuery.data.length === 0 ? (
            <EmptyState icon={Tag} message="No active product with a registered cost." />
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-left dark:bg-zinc-900">
                <tr>
                  <th className="px-4 py-2 font-medium">Product</th>
                  <th className="px-4 py-2 font-medium">Current price</th>
                  <th className="px-4 py-2 font-medium">Cost</th>
                  <th className="px-4 py-2 font-medium">Current margin</th>
                  <th className="px-4 py-2 font-medium">Suggested price</th>
                </tr>
              </thead>
              <tbody>
                {pricingQuery.data.map((item) => (
                  <tr key={item.productId} className="border-t border-border">
                    <td className="px-4 py-2">{item.productName}</td>
                    <td className="px-4 py-2">{formatCentsToBRL(item.priceCents)}</td>
                    <td className="px-4 py-2 text-muted">{formatCentsToBRL(item.costPriceCents)}</td>
                    <td className="px-4 py-2">
                      {item.belowCost ? (
                        <Badge variant="danger">{item.currentMarginPercent.toFixed(1)}% (below cost)</Badge>
                      ) : (
                        <span className={item.currentMarginPercent < 15 ? 'text-amber-600' : ''}>
                          {item.currentMarginPercent.toFixed(1)}%
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2">{formatCentsToBRL(item.suggestedPriceCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-medium text-muted">
          <Landmark className="h-3.5 w-3.5" />
          Simplified P&amp;L
        </h2>
        <p className="text-xs text-muted">
          Cash basis: only counts entries already paid in the period, not what is merely posted.
        </p>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Card className="flex flex-col gap-1">
            <p className="text-xs text-muted">Revenue realized</p>
            <p className="text-lg font-semibold text-green-600">{dre ? formatCentsToBRL(dre.receitasCents) : '—'}</p>
          </Card>
          <Card className="flex flex-col gap-1">
            <p className="text-xs text-muted">Expenses realized</p>
            <p className="text-lg font-semibold text-red-600">{dre ? formatCentsToBRL(dre.despesasCents) : '—'}</p>
          </Card>
          <Card className="flex flex-col gap-1">
            <p className="text-xs text-muted">Result</p>
            <p className={`text-lg font-semibold ${dre && dre.resultadoCents < 0 ? 'text-red-600' : 'text-green-600'}`}>
              {dre ? formatCentsToBRL(dre.resultadoCents) : '—'}
            </p>
          </Card>
        </div>

        <div className="overflow-x-auto rounded-lg border border-border">
          {!dre ? (
            <SkeletonRows rows={3} cols={4} />
          ) : dre.porCentroDeCusto.length === 0 ? (
            <EmptyState icon={Landmark} message="No entries paid in this period." />
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-left dark:bg-zinc-900">
                <tr>
                  <th className="px-4 py-2 font-medium">Cost center</th>
                  <th className="px-4 py-2 font-medium">Revenue</th>
                  <th className="px-4 py-2 font-medium">Expenses</th>
                  <th className="px-4 py-2 font-medium">Result</th>
                </tr>
              </thead>
              <tbody>
                {dre.porCentroDeCusto.map((bucket) => (
                  <tr key={bucket.costCenterId ?? 'sem-centro-de-custo'} className="border-t border-border">
                    <td className="px-4 py-2">{bucket.costCenterName}</td>
                    <td className="px-4 py-2">{formatCentsToBRL(bucket.receitasCents)}</td>
                    <td className="px-4 py-2">{formatCentsToBRL(bucket.despesasCents)}</td>
                    <td className={`px-4 py-2 ${bucket.resultadoCents < 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {formatCentsToBRL(bucket.resultadoCents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
