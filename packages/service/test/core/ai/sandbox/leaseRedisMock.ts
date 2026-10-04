type HeldLease = { token: string; expiresAt: number };

/** Models the small Redis script contract used by sandbox leases in unit tests. */
export const createLeaseRedisEval = (storage: Map<string, HeldLease>) => {
  const readers = new Map<string, Map<string, number>>();
  const waiters = new Map<string, Map<string, number>>();
  const valid = (key: string) => {
    const held = storage.get(key);
    if (held && held.expiresAt <= Date.now()) storage.delete(key);
    return storage.get(key);
  };
  const zset = (key: string) => {
    const map = key.endsWith(':readers') ? readers : waiters;
    if (!map.has(key)) map.set(key, new Map());
    const entries = map.get(key)!;
    for (const [member, expiresAt] of entries) {
      if (expiresAt <= Date.now()) entries.delete(member);
    }
    return entries;
  };

  return async (script: string, keysCount: number, ...args: (string | number)[]) => {
    const keys = args.slice(0, keysCount).map(String);
    const values = args.slice(keysCount);
    const token = String(values[0]);
    const ttl = Number(values[1]);
    if (script.includes('local member = ARGV[3]')) {
      const [writerKey, readerKey, waiterKey] = keys;
      const rank = Number(values[2]);
      const member = `${rank}:${token}`;
      const waiting = zset(waiterKey);
      waiting.set(member, Date.now() + ttl);
      if (
        zset(readerKey).size ||
        valid(writerKey) ||
        [...waiting.keys()].some((item) => Number(item.split(':')[0]) < rank)
      )
        return 0;
      storage.set(writerKey, { token, expiresAt: Date.now() + ttl });
      waiting.delete(member);
      return 1;
    }
    if (script.includes("redis.call('ZADD', KEYS[2]")) {
      const [writerKey, readerKey, waiterKey] = keys;
      const rank = Number(values[2]);
      if (
        valid(writerKey) ||
        [...zset(waiterKey).keys()].some((item) => Number(item.split(':')[0]) <= rank)
      )
        return 0;
      zset(readerKey).set(token, Date.now() + ttl);
      return 1;
    }
    if (script.includes("redis.call('ZSCORE'")) {
      const entries = zset(keys[0]);
      if (!entries.has(token)) return 0;
      entries.set(token, Date.now() + ttl);
      return 1;
    }
    if (script.includes("redis.call('ZREM'")) {
      return Number(zset(keys[0]).delete(token));
    }
    const current = valid(keys[0]);
    if (!current || current.token !== token) return 0;
    if (script.includes('pexpire')) current.expiresAt = Date.now() + ttl;
    else storage.delete(keys[0]);
    return 1;
  };
};
