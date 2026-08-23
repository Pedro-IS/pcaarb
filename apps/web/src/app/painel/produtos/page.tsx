'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { Fragment, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Package, SlidersHorizontal } from 'lucide-react';
import { z } from 'zod';
import type { Category, Product } from '@pcaarb/shared';
import { apiFetch, ApiError } from '@/lib/api-client';
import { formatCentsToBRL, parseBRLToCents } from '@/lib/currency';
import { useAccessToken } from '@/lib/use-access-token';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { SkeletonRows } from '@/components/ui/skeleton';

const productFormSchema = z.object({
  name: z.string().min(2, 'Name too short'),
  sku: z.string().optional(),
  priceReais: z.string().min(1, 'Enter the price'),
  categoryId: z.string().optional(),
});

type ProductFormValues = z.infer<typeof productFormSchema>;

export default function ProdutosPage() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  const productsQuery = useQuery({
    queryKey: ['products'],
    queryFn: () => apiFetch<Product[]>('/products', { accessToken: accessToken! }),
    enabled: !!accessToken,
  });

  const categoriesQuery = useQuery({
    queryKey: ['categories'],
    queryFn: () => apiFetch<Category[]>('/categories', { accessToken: accessToken! }),
    enabled: !!accessToken,
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
    setError,
  } = useForm<ProductFormValues>({ resolver: zodResolver(productFormSchema) });

  const createMutation = useMutation({
    mutationFn: (values: ProductFormValues) =>
      apiFetch<Product>('/products', {
        method: 'POST',
        accessToken: accessToken!,
        body: {
          name: values.name,
          sku: values.sku || undefined,
          priceCents: parseBRLToCents(values.priceReais),
          categoryId: values.categoryId || undefined,
        },
      }),
    onSuccess: () => {
      reset();
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        setError('root', { message: error.message });
      }
    },
  });

  const [newCategoryName, setNewCategoryName] = useState('');
  const createCategoryMutation = useMutation({
    mutationFn: (name: string) =>
      apiFetch<Category>('/categories', { method: 'POST', accessToken: accessToken!, body: { name } }),
    onSuccess: () => {
      setNewCategoryName('');
      queryClient.invalidateQueries({ queryKey: ['categories'] });
    },
  });

  const [stockFormProductId, setStockFormProductId] = useState<string | null>(null);
  const [stockType, setStockType] = useState<'entrada' | 'saida' | 'ajuste'>('entrada');
  const [stockQuantity, setStockQuantity] = useState('');
  const [stockReason, setStockReason] = useState('');
  const [stockError, setStockError] = useState<string | null>(null);

  const stockMovementMutation = useMutation({
    mutationFn: (productId: string) =>
      apiFetch(`/products/${productId}/stock-movements`, {
        method: 'POST',
        accessToken: accessToken!,
        body: {
          type: stockType,
          quantity: Number(stockQuantity),
          reason: stockReason.trim() || undefined,
        },
      }),
    onSuccess: () => {
      setStockFormProductId(null);
      setStockQuantity('');
      setStockReason('');
      setStockError(null);
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
    onError: (error) => {
      setStockError(error instanceof ApiError ? error.message : 'Unexpected error');
    },
  });

  if (!accessToken) {
    return null;
  }

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Products</h1>

      <Card
        as="form"
        className="flex flex-col gap-4"
        onSubmit={handleSubmit((values) => createMutation.mutate(values))}
      >
        <h2 className="text-sm font-medium">New product</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <label className="text-sm">Name</label>
            <Input {...register('name')} />
            {errors.name && <p className="text-sm text-red-600">{errors.name.message}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm">SKU</label>
            <Input {...register('sku')} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm">Price (R$)</label>
            <Input placeholder="0.00" {...register('priceReais')} />
            {errors.priceReais && <p className="text-sm text-red-600">{errors.priceReais.message}</p>}
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <label className="text-sm">Category</label>
            <select className="h-10 rounded-md border border-border bg-card px-3 text-sm" {...register('categoryId')}>
              <option value="">No category</option>
              {categoriesQuery.data?.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        {errors.root && <p className="text-sm text-red-600">{errors.root.message}</p>}
        <Button type="submit" loading={createMutation.isPending} className="self-start">
          Add product
        </Button>
      </Card>

      <div className="flex items-end gap-2 rounded-lg border border-dashed border-border p-4">
        <div className="flex flex-1 flex-col gap-1.5">
          <label className="text-sm">New category</label>
          <Input value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} placeholder="E.g.: Beverages" />
        </div>
        <Button
          type="button"
          variant="secondary"
          disabled={newCategoryName.trim().length < 2}
          loading={createCategoryMutation.isPending}
          onClick={() => createCategoryMutation.mutate(newCategoryName.trim())}
        >
          Create category
        </Button>
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-muted">
          {productsQuery.data ? `${productsQuery.data.length} product(s)` : ''}
        </h2>
        <div className="overflow-x-auto rounded-lg border border-border">
          {!productsQuery.data ? (
            <SkeletonRows rows={4} cols={5} />
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-left dark:bg-zinc-900">
                <tr>
                  <th className="px-4 py-2 font-medium">Name</th>
                  <th className="px-4 py-2 font-medium">SKU</th>
                  <th className="px-4 py-2 font-medium">Price</th>
                  <th className="px-4 py-2 font-medium">Stock</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {productsQuery.data.map((product) => (
                  <Fragment key={product.id}>
                    <tr className="border-t border-border">
                      <td className="px-4 py-2">{product.name}</td>
                      <td className="px-4 py-2 text-muted">{product.sku ?? '—'}</td>
                      <td className="px-4 py-2">{formatCentsToBRL(product.priceCents)}</td>
                      <td className="px-4 py-2">
                        {product.trackStock ? product.stockQuantity : <span className="text-zinc-400">—</span>}
                      </td>
                      <td className="px-4 py-2">
                        <Badge variant={product.active ? 'success' : 'neutral'}>
                          {product.active ? 'Active' : 'Inactive'}
                        </Badge>
                      </td>
                      <td className="px-4 py-2 text-right">
                        {product.trackStock && (
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
                            onClick={() => {
                              setStockError(null);
                              setStockFormProductId(stockFormProductId === product.id ? null : product.id);
                            }}
                          >
                            <SlidersHorizontal className="h-3.5 w-3.5" />
                            Move stock
                          </button>
                        )}
                      </td>
                    </tr>
                    <AnimatePresence initial={false}>
                      {stockFormProductId === product.id && (
                        <motion.tr
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="border-t border-border bg-zinc-50 dark:bg-zinc-900"
                        >
                          <td className="px-4 py-3" colSpan={6}>
                            <div className="flex flex-wrap items-end gap-3">
                              <div className="flex flex-col gap-1.5">
                                <label className="text-xs">Type</label>
                                <select
                                  className="h-9 rounded-md border border-border bg-card px-2 text-sm"
                                  value={stockType}
                                  onChange={(e) => setStockType(e.target.value as typeof stockType)}
                                >
                                  <option value="entrada">Stock in</option>
                                  <option value="saida">Stock out</option>
                                  <option value="ajuste">Adjustment (count correction)</option>
                                </select>
                              </div>
                              <div className="flex flex-col gap-1.5">
                                <label className="text-xs">
                                  {stockType === 'ajuste' ? 'Delta (can be negative)' : 'Quantity'}
                                </label>
                                <Input
                                  className="w-28"
                                  value={stockQuantity}
                                  onChange={(e) => setStockQuantity(e.target.value)}
                                  placeholder={stockType === 'ajuste' ? '-5' : '0'}
                                />
                              </div>
                              <div className="flex flex-col gap-1.5">
                                <label className="text-xs">Reason (optional)</label>
                                <Input className="w-48" value={stockReason} onChange={(e) => setStockReason(e.target.value)} />
                              </div>
                              <Button
                                type="button"
                                variant="secondary"
                                disabled={!stockQuantity}
                                loading={stockMovementMutation.isPending}
                                onClick={() => stockMovementMutation.mutate(product.id)}
                              >
                                Confirm
                              </Button>
                              {stockError && <p className="text-sm text-red-600">{stockError}</p>}
                            </div>
                          </td>
                        </motion.tr>
                      )}
                    </AnimatePresence>
                  </Fragment>
                ))}
              </tbody>
            </table>
          )}
          {productsQuery.data?.length === 0 && <EmptyState icon={Package} message="No products registered yet." />}
        </div>
      </div>
    </>
  );
}
