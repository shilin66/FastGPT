import { useCallback, useEffect, useRef, useState } from 'react';
import {
  SANDBOX_PROXY_SESSION_SECONDS,
  SANDBOX_PROXY_RENEW_MESSAGE
} from '@fastgpt/global/core/ai/sandbox/proxy';

const renewalMarginMs = 120_000;
const requestTimeoutMs = 20_000;

export const useSandboxProxySession = (entryUrl: string | null) => {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const pendingRef = useRef<string>();
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const renewalRef = useRef<ReturnType<typeof setTimeout>>();
  const expiresAtRef = useRef(0);
  const [requestUrl, setRequestUrl] = useState<string>();
  const [state, setState] = useState<'idle' | 'renewing' | 'active' | 'failed'>('idle');

  const renew = useCallback(() => {
    if (!entryUrl || pendingRef.current) return;
    const url = new URL(entryUrl, window.location.origin);
    if (url.origin !== window.location.origin || url.pathname !== '/api/core/sandbox/proxyAuth')
      return;
    clearTimeout(renewalRef.current);
    const requestId = crypto.randomUUID();
    pendingRef.current = requestId;
    url.searchParams.delete('next');
    url.searchParams.set('mode', 'renew');
    url.searchParams.set('requestId', requestId);
    setState('renewing');
    setRequestUrl(url.toString());
    timeoutRef.current = setTimeout(() => {
      pendingRef.current = undefined;
      expiresAtRef.current = 0;
      setRequestUrl(undefined);
      setState('failed');
    }, requestTimeoutMs);
  }, [entryUrl]);

  useEffect(() => {
    expiresAtRef.current = 0;
    setState('idle');
    setRequestUrl(undefined);
    const receive = (event: MessageEvent<unknown>) => {
      if (!pendingRef.current || event.source !== frameRef.current?.contentWindow) return;
      const data = event.data;
      if (
        !data ||
        typeof data !== 'object' ||
        !('type' in data) ||
        data.type !== SANDBOX_PROXY_RENEW_MESSAGE ||
        !('requestId' in data) ||
        data.requestId !== pendingRef.current ||
        !('expiresAt' in data) ||
        typeof data.expiresAt !== 'number' ||
        !Number.isFinite(data.expiresAt) ||
        data.expiresAt <= Date.now() ||
        data.expiresAt > Date.now() + SANDBOX_PROXY_SESSION_SECONDS * 1000 + 5_000
      )
        return;
      try {
        const entry = new URL(entryUrl ?? '', window.location.origin);
        const origin = new URL(event.origin);
        const label = `${entry.searchParams.get('port')}--${entry.searchParams.get('sandboxId')}.`;
        if (
          event.origin === window.location.origin ||
          !origin.hostname.startsWith(label) ||
          (origin.protocol !== 'https:' &&
            !(origin.protocol === 'http:' && origin.hostname.endsWith('.localhost')))
        )
          return;
      } catch {
        return;
      }
      clearTimeout(timeoutRef.current);
      pendingRef.current = undefined;
      expiresAtRef.current = data.expiresAt;
      setRequestUrl(undefined);
      setState('active');
      renewalRef.current = setTimeout(
        renew,
        Math.max(1_000, data.expiresAt - Date.now() - renewalMarginMs)
      );
    };
    const checkOnFocus = () => {
      if (
        document.visibilityState === 'visible' &&
        expiresAtRef.current <= Date.now() + renewalMarginMs
      )
        renew();
    };
    window.addEventListener('message', receive);
    window.addEventListener('focus', checkOnFocus);
    document.addEventListener('visibilitychange', checkOnFocus);
    return () => {
      pendingRef.current = undefined;
      clearTimeout(timeoutRef.current);
      clearTimeout(renewalRef.current);
      window.removeEventListener('message', receive);
      window.removeEventListener('focus', checkOnFocus);
      document.removeEventListener('visibilitychange', checkOnFocus);
    };
  }, [entryUrl, renew]);

  return { frameRef, requestUrl, state, renew };
};
