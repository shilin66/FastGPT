import { useEffect, useRef, useState } from 'react';

type Phase = 'loading' | 'starting' | 'slow' | 'ready' | 'error';

export const useWorkbenchLoading = (entryUrl: string) => {
  const editorRef = useRef<HTMLIFrameElement>(null);
  const [phase, setPhase] = useState<Phase>('loading');

  useEffect(() => {
    setPhase('loading');
    const timer = setTimeout(
      () => setPhase((current) => (current === 'ready' || current === 'error' ? current : 'slow')),
      30_000
    );
    const receive = (event: MessageEvent<unknown>) => {
      if (
        event.source !== editorRef.current?.contentWindow ||
        !event.data ||
        typeof event.data !== 'object' ||
        !('event' in event.data) ||
        event.data.event !== 'loaded'
      )
        return;
      try {
        const entry = new URL(entryUrl, window.location.origin);
        const next = entry.searchParams.get('next');
        const origin = new URL(event.origin);
        const label = `${entry.searchParams.get('port')}--${entry.searchParams.get('sandboxId')}.`;
        if (next && event.origin !== new URL(next, window.location.origin).origin) return;
        if (
          event.origin !== window.location.origin &&
          (!origin.hostname.startsWith(label) ||
            (origin.protocol !== 'https:' &&
              !(origin.protocol === 'http:' && origin.hostname.endsWith('.localhost'))))
        )
          return;
      } catch {
        return;
      }
      clearTimeout(timer);
      setPhase('ready');
    };
    window.addEventListener('message', receive);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('message', receive);
    };
  }, [entryUrl]);

  return {
    editorRef,
    phase,
    onDocumentLoad: () => setPhase((current) => (current === 'loading' ? 'starting' : current)),
    onError: () => setPhase('error')
  };
};
