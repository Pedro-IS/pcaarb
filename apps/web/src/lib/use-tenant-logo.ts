import { useQuery } from '@tanstack/react-query';
import { apiFetchBlob } from './api-client';
import { useAccessToken } from './use-access-token';

// Object URL for the tenant's logo, or null if none is set. The endpoint is
// authenticated (Bearer token), so it can't be used directly as an <img
// src> — fetched as a blob instead, same reasoning as apiDownload.
export function useTenantLogoUrl(hasLogo: boolean | undefined) {
  const accessToken = useAccessToken();
  const query = useQuery({
    queryKey: ['tenants', 'branding', 'logo'],
    queryFn: async () => {
      const blob = await apiFetchBlob('/tenants/branding/logo', accessToken!);
      return blob ? URL.createObjectURL(blob) : null;
    },
    enabled: !!accessToken && !!hasLogo,
    staleTime: 5 * 60_000,
  });
  return query.data ?? null;
}
