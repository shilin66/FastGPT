import { apiRequest, AdminApiError } from '@/web/api/client';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';

type SessionState = 'loading' | 'authenticated' | 'unauthenticated' | 'error';

export const useAdminSession = () => {
  const router = useRouter();
  const [state, setState] = useState<SessionState>('loading');

  useEffect(() => {
    apiRequest<{ userId: string }>('/api/admin/auth/session')
      .then(() => setState('authenticated'))
      .catch((error: unknown) => {
        if (error instanceof AdminApiError && error.status === 401) {
          setState('unauthenticated');
          void router.replace(`/login?redirect=${encodeURIComponent(router.asPath)}`);
          return;
        }
        setState('error');
      });
  }, [router.asPath, router.isReady]);

  return state;
};
