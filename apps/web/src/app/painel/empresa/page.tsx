'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { Building2, Lock, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { TENANT_LOGO_ALLOWED_MIME_TYPES, TENANT_LOGO_MAX_BYTES, type Tenant } from '@pcaarb/shared';
import { apiFetch, apiUpload, ApiError } from '@/lib/api-client';
import { useAccessToken } from '@/lib/use-access-token';
import { useCurrentUser } from '@/lib/use-current-user';
import { useTenantLogoUrl } from '@/lib/use-tenant-logo';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/empty-state';

export default function EmpresaPage() {
  const accessToken = useAccessToken();
  const meQuery = useCurrentUser();
  const queryClient = useQueryClient();
  // Branding is a business-owner decision, same tier as billing (see
  // TenantsController) — admin/financeiro/operador_caixa can see the result
  // (topbar, PDV, receipts) but not edit it.
  const canManage = meQuery.data?.user.role === 'owner';
  const currentLogoUrl = useTenantLogoUrl(meQuery.data?.tenant.hasLogo);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [displayName, setDisplayName] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['users', 'me'] });
    queryClient.invalidateQueries({ queryKey: ['tenants', 'branding', 'logo'] });
  }

  function pickLogo(file: File | null) {
    if (!file) return;
    if (!(TENANT_LOGO_ALLOWED_MIME_TYPES as readonly string[]).includes(file.type)) {
      toast.error('Logo must be a PNG, JPEG, or WebP image');
      return;
    }
    if (file.size > TENANT_LOGO_MAX_BYTES) {
      toast.error('Logo must be 512KB or smaller');
      return;
    }
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  }

  const saveMutation = useMutation({
    mutationFn: (name: string) => {
      const formData = new FormData();
      formData.append('displayName', name);
      if (logoFile) {
        formData.append('logo', logoFile);
      }
      return apiUpload<Tenant>('/tenants/branding', formData, accessToken!);
    },
    onSuccess: () => {
      setLogoFile(null);
      setLogoPreview(null);
      invalidate();
      toast.success('Company profile updated');
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Error updating company profile');
    },
  });

  const removeLogoMutation = useMutation({
    mutationFn: () => apiFetch<Tenant>('/tenants/branding/logo', { method: 'DELETE', accessToken: accessToken! }),
    onSuccess: () => {
      invalidate();
      toast.success('Logo removed');
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Error removing logo');
    },
  });

  if (!accessToken || !meQuery.data) {
    return <h1 className="text-2xl font-semibold tracking-tight">Company</h1>;
  }

  if (!canManage) {
    return (
      <>
        <h1 className="text-2xl font-semibold tracking-tight">Company</h1>
        <Card>
          <EmptyState icon={Lock} message="Only the store owner can edit the company profile." />
        </Card>
      </>
    );
  }

  const effectiveDisplayName = displayName ?? meQuery.data.tenant.displayName ?? '';
  const previewUrl = logoPreview ?? currentLogoUrl;
  const hasPendingChanges = logoFile !== null || displayName !== null;

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Company</h1>
      <p className="max-w-2xl text-sm text-muted">
        The logo and trade name below appear on the topbar, the point-of-sale screen, and printed sale receipts and
        purchase orders. Official fiscal documents always use the legally registered company name instead.
      </p>

      <Card className="flex flex-col gap-5">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-card-hover">
            {previewUrl ? (
              // next/image can't optimize a blob: URL (local preview / authenticated fetch, not a fetchable network resource).
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewUrl} alt="" className="h-full w-full object-contain" />
            ) : (
              <Building2 className="h-6 w-6 text-muted" />
            )}
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <Button type="button" variant="secondary" onClick={() => fileInputRef.current?.click()}>
                <Upload className="h-4 w-4" />
                {previewUrl ? 'Replace logo' : 'Upload logo'}
              </Button>
              {(currentLogoUrl ?? logoFile) && (
                <Button
                  type="button"
                  variant="ghost"
                  loading={removeLogoMutation.isPending}
                  onClick={() => {
                    if (logoFile) {
                      setLogoFile(null);
                      setLogoPreview(null);
                    } else {
                      removeLogoMutation.mutate();
                    }
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                  Remove
                </Button>
              )}
            </div>
            <p className="text-xs text-muted">PNG, JPEG, or WebP, up to 512KB.</p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => pickLogo(e.target.files?.[0] ?? null)}
          />
        </div>

        <div className="flex flex-col gap-1.5 sm:w-96">
          <label className="text-sm">Trade name (nome fantasia)</label>
          <Input
            placeholder={meQuery.data.tenant.companyName}
            value={effectiveDisplayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
          <p className="text-xs text-muted">
            Shown everywhere instead of the registered company name. Leave blank to use the registered name, &ldquo;
            {meQuery.data.tenant.companyName}&rdquo;.
          </p>
        </div>

        <div>
          <Button
            loading={saveMutation.isPending}
            disabled={!hasPendingChanges}
            onClick={() => saveMutation.mutate(effectiveDisplayName.trim())}
          >
            Save changes
          </Button>
        </div>
      </Card>
    </>
  );
}
