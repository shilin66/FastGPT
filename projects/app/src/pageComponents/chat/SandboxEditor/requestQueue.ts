const retryDelaysMs = [500, 1000, 2000];

export const isSandboxFileBusyError = (error: unknown): boolean =>
  error instanceof Error && error.message === 'chat:sandbox_busy';

const leaseBusyMessage = 'operation_conflict: Sandbox is busy before execution';

const isTransientLeaseConflict = (error: unknown): boolean => {
  if (typeof error === 'string') return error.includes(leaseBusyMessage);
  if (!error || typeof error !== 'object') return false;

  const value = error as { message?: unknown; response?: { data?: unknown } };
  const responseData = value.response?.data;
  const messages = [
    value.message,
    typeof responseData === 'string' ? responseData : undefined,
    responseData && typeof responseData === 'object' && 'message' in responseData
      ? responseData.message
      : undefined
  ];
  return messages.some(
    (message) => typeof message === 'string' && message.includes(leaseBusyMessage)
  );
};

type RequestOptions = {
  mode?: 'read' | 'exclusive';
  priority?: 'interactive' | 'background';
  signal?: AbortSignal;
};

export const createSandboxFileRequestQueue = (onWaitingChange?: (waiting: boolean) => void) => {
  const pending: (Required<Pick<RequestOptions, 'mode' | 'priority'>> & {
    execute: () => Promise<void>;
  })[] = [];
  let active = 0;
  let activeBackground = 0;
  let exclusive = false;
  let waiting = 0;

  const drain = () => {
    if (exclusive) return;
    while (active < 4 && pending.length > 0) {
      // Saves and workspace starts are barriers: later reads must not overtake them.
      const barrier = pending.findIndex((item) => item.mode === 'exclusive');
      if (barrier === 0 && active > 0) return;
      const candidates = barrier < 0 ? pending : pending.slice(0, barrier);
      let index = 0;
      if (barrier !== 0) {
        index = candidates.findIndex((item) => item.priority === 'interactive');
        if (index < 0) {
          // Leave capacity for clicks while the expanded directory tree refreshes.
          if (activeBackground >= 2) return;
          index = candidates.findIndex((item) => item.priority === 'background');
        }
        if (index < 0) return;
      }
      const [item] = pending.splice(index, 1);
      active++;
      if (item.priority === 'background') activeBackground++;
      exclusive = item.mode === 'exclusive';
      void item.execute().finally(() => {
        active--;
        if (item.priority === 'background') activeBackground--;
        if (item.mode === 'exclusive') exclusive = false;
        drain();
      });
      if (exclusive) return;
    }
  };

  return <T>(request: () => Promise<T>, options: RequestOptions = {}): Promise<T> => {
    const execute = async (): Promise<T> => {
      let isWaiting = false;
      try {
        for (let attempt = 0; ; attempt++) {
          if (options.signal?.aborted) throw new DOMException('Request cancelled', 'AbortError');
          try {
            return await request();
          } catch (error) {
            if (!isTransientLeaseConflict(error)) throw error;
            if (attempt === retryDelaysMs.length) throw new Error('chat:sandbox_busy');
            if (!isWaiting) {
              isWaiting = true;
              if (waiting++ === 0) onWaitingChange?.(true);
            }
            await new Promise<void>((resolve) => setTimeout(resolve, retryDelaysMs[attempt]));
          }
        }
      } finally {
        if (isWaiting && --waiting === 0) onWaitingChange?.(false);
      }
    };

    return new Promise<T>((resolve, reject) => {
      pending.push({
        mode: options.mode ?? 'exclusive',
        priority: options.priority ?? 'interactive',
        execute: async () => {
          try {
            resolve(await execute());
          } catch (error) {
            reject(error);
          }
        }
      });
      drain();
    });
  };
};
