if (!global.localCache) {
  global.localCache = new Map();
}
const localCache = global.localCache;

export const localCacheManager = {
  set(token: string, data: any, ttl: number) {
    if (ttl === -1) {
      localCache.set(token, { data, expires: -1 });
    } else {
      const expires = Date.now() + ttl;
      localCache.set(token, { data, expires });
    }
  },
  get(token: string) {
    const entry = localCache.get(token);
    if (!entry) return null;
    if (Date.now() > entry.expires) {
      localCache.delete(token);
      return null;
    }
    return entry.data;
  },
  delete(token: string) {
    localCache.delete(token);
  },

  getSize() {
    return localCache.size;
  },

  startCleanup() {
    const now = Date.now();
    localCache.forEach((value, key) => {
      if (value.expires !== -1 && now > value.expires) localCache.delete(key);
    });
  }
};
