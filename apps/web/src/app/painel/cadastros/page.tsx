'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Contact, Truck } from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';
import type { Customer, Supplier } from '@pcaarb/shared';
import { apiDownload, apiFetch, ApiError } from '@/lib/api-client';
import { useAccessToken } from '@/lib/use-access-token';
import { useCurrentUser } from '@/lib/use-current-user';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { SkeletonRows } from '@/components/ui/skeleton';
import { Table, TableHeader, TableBody, TableHead, TableCell } from '@/components/ui/table';

type Resource = 'customers' | 'suppliers';

const RESOURCE_CONFIG = {
  customers: {
    label: 'Customers',
    singular: 'customer',
    endpoint: '/customers',
    icon: Contact,
    emptyMessage: 'No customers registered yet.',
  },
  suppliers: {
    label: 'Suppliers',
    singular: 'supplier',
    endpoint: '/suppliers',
    icon: Truck,
    emptyMessage: 'No suppliers registered yet.',
  },
} as const;

// CPF/CNPJ and e-mail are optional in the registration form, but a blank field
// arrives as "" (not undefined) via react-hook-form — we only validate the format when it's filled in.
const partyFormSchema = z.object({
  name: z.string().min(2, 'Name is too short').max(160),
  document: z
    .string()
    .optional()
    .refine((v) => !v || /^\d{11}$|^\d{14}$/.test(v), 'CPF (11 digits) or CNPJ (14 digits), numbers only'),
  email: z
    .string()
    .optional()
    .refine((v) => !v || z.string().email().safeParse(v).success, 'Invalid email'),
  phone: z.string().optional(),
});

type PartyFormValues = z.infer<typeof partyFormSchema>;
type Party = Customer | Supplier;

function PartySection({ resource }: { resource: Resource }) {
  const accessToken = useAccessToken();
  const meQuery = useCurrentUser();
  const queryClient = useQueryClient();
  const config = RESOURCE_CONFIG[resource];
  // Exporting/anonymizing personal data (LGPD) only exists for customers, and
  // only for the store owner — same gate as the backend (CASL subject
  // 'DataPrivacy', owner-only). Without this check here, other roles would
  // see the buttons and only find out they can't use them when they get a 403.
  const canManagePrivacy = resource === 'customers' && meQuery.data?.user.role === 'owner';

  const listQuery = useQuery({
    queryKey: [resource],
    queryFn: () => apiFetch<Party[]>(config.endpoint, { accessToken: accessToken! }),
    enabled: !!accessToken,
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
    setError,
  } = useForm<PartyFormValues>({ resolver: zodResolver(partyFormSchema) });

  const createMutation = useMutation({
    mutationFn: (values: PartyFormValues) =>
      apiFetch<Party>(config.endpoint, {
        method: 'POST',
        accessToken: accessToken!,
        body: {
          name: values.name,
          document: values.document || undefined,
          email: values.email || undefined,
          phone: values.phone || undefined,
        },
      }),
    onSuccess: () => {
      reset();
      queryClient.invalidateQueries({ queryKey: [resource] });
      toast.success(`${config.singular === 'customer' ? 'Customer' : 'Supplier'} added`);
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        setError('root', { message: error.message });
      }
    },
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`${config.endpoint}/${id}`, { method: 'DELETE', accessToken: accessToken! }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [resource] });
      toast.success(`${config.singular === 'customer' ? 'Customer' : 'Supplier'} removed`);
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : `Error removing ${config.singular}`);
    },
  });

  const exportDataMutation = useMutation({
    mutationFn: (id: string) => apiDownload(`/data-privacy/customers/${id}/export`, accessToken!),
    onSuccess: () => toast.success('Customer data exported'),
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Error exporting data'),
  });

  const anonymizeMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/data-privacy/customers/${id}/anonymize`, { method: 'POST', accessToken: accessToken! }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [resource] });
      toast.success('Customer personal data anonymized');
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Error anonymizing data'),
  });

  if (!accessToken) {
    return null;
  }

  return (
    <div className="flex flex-col gap-6">
      <Card as="form" className="flex flex-col gap-4" onSubmit={handleSubmit((values) => createMutation.mutate(values))}>
        <h2 className="text-sm font-medium">New {config.singular}</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <label className="text-sm">Name</label>
            <Input {...register('name')} />
            {errors.name && <p className="text-sm text-danger">{errors.name.message}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm">CPF/CNPJ</label>
            <Input placeholder="Numbers only" {...register('document')} />
            {errors.document && <p className="text-sm text-danger">{errors.document.message}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm">Phone</label>
            <Input {...register('phone')} />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <label className="text-sm">Email</label>
            <Input type="email" {...register('email')} />
            {errors.email && <p className="text-sm text-danger">{errors.email.message}</p>}
          </div>
        </div>
        {errors.root && <p className="text-sm text-danger">{errors.root.message}</p>}
        <Button type="submit" loading={createMutation.isPending} className="self-start">
          Add {config.singular}
        </Button>
      </Card>

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-muted">
          {listQuery.data ? `${listQuery.data.length} ${config.label.toLowerCase()}` : ''}
        </h2>
        {!listQuery.data ? (
          <div className="rounded-lg border border-border">
            <SkeletonRows rows={4} cols={4} />
          </div>
        ) : listQuery.data.length === 0 ? (
          <div className="rounded-lg border border-border">
            <EmptyState icon={config.icon} message={config.emptyMessage} />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <tr>
                <TableHead>Name</TableHead>
                <TableHead>CPF/CNPJ</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead></TableHead>
              </tr>
            </TableHeader>
            <TableBody>
              <AnimatePresence initial={false}>
                {listQuery.data.map((party) => (
                  <motion.tr
                    key={party.id}
                    layout
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="border-t border-border transition-colors hover:bg-card-hover/60"
                  >
                    <TableCell>{party.name}</TableCell>
                    <TableCell className="text-muted">{party.document ?? '—'}</TableCell>
                    <TableCell className="text-muted">{party.email ?? party.phone ?? '—'}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-3">
                        {canManagePrivacy && (
                          <>
                            <button
                              type="button"
                              className="text-xs text-accent hover:underline"
                              disabled={exportDataMutation.isPending}
                              onClick={() => exportDataMutation.mutate(party.id)}
                            >
                              Export data
                            </button>
                            <button
                              type="button"
                              className="text-xs text-warning hover:underline"
                              disabled={anonymizeMutation.isPending}
                              onClick={() => anonymizeMutation.mutate(party.id)}
                            >
                              Anonymize
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          className="text-xs text-danger hover:underline"
                          disabled={removeMutation.isPending}
                          onClick={() => removeMutation.mutate(party.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </TableCell>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}

export default function CadastrosPage() {
  const [tab, setTab] = useState<Resource>('customers');

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Customers & Suppliers</h1>
      <p className="text-sm text-muted">The people you sell to and the businesses you buy from.</p>

      <div className="flex gap-1 border-b border-border">
        {(Object.keys(RESOURCE_CONFIG) as Resource[]).map((key) => {
          const TabIcon = RESOURCE_CONFIG[key].icon;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={cn(
                'flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors',
                tab === key ? 'border-accent text-accent' : 'border-transparent text-muted hover:text-foreground',
              )}
            >
              <TabIcon className="h-4 w-4" />
              {RESOURCE_CONFIG[key].label}
            </button>
          );
        })}
      </div>

      <PartySection key={tab} resource={tab} />
    </>
  );
}
