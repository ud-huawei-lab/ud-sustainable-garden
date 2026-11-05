// Bounded, expiring local caches and per-instance login limits.
export function memoryStore({ now = Date.now } = {}) {
  const values = new Map();
  const get = async (key) => {
    const entry = values.get(key);
    if (!entry) return null;
    if (entry.until <= now()) {
      values.delete(key);
      return null;
    }
    return structuredClone(entry.value);
  };
  return {
    get,
    async set(key, value, ttlMs) {
      for (const [name, entry] of values)
        if (entry.until <= now()) values.delete(name);
      if (values.size >= 10000 && !values.has(key))
        throw new Error("Local session storage is full.");
      values.set(key, { value: structuredClone(value), until: now() + ttlMs });
    },
    async delete(key) {
      values.delete(key);
    },
    async attempt(key, windowMs) {
      // No await between reading and incrementing, so this is atomic in one process.
      let entry = values.get(key);
      if (!entry || entry.until <= now()) {
        if (values.size >= 10000)
          throw new Error("Local session storage is full.");
        entry = { value: 0, until: now() + windowMs };
        values.set(key, entry);
      }
      entry.value++;
      return { count: entry.value, ttl: entry.until - now() };
    },
  };
}
