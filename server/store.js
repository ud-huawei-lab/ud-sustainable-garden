// Shared storage is required for Vercel instances; local development uses memory.
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

export function redisStore(env, { fetchImpl = fetch } = {}) {
  const url = env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL;
  const token = env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token)
    throw new Error("Connect a Redis store in the Vercel project Storage tab.");
  const origin = new URL(url);
  if (
    origin.protocol !== "https:" ||
    origin.username ||
    origin.password ||
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash
  )
    throw new Error("Redis must use an HTTPS REST origin.");
  const prefix = "udgarden:v1:";
  const command = async (args) => {
    const response = await fetchImpl(origin.origin, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(args),
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error("Shared session storage is unavailable.");
    const data = await response.json();
    if (data.error)
      throw new Error("Shared session storage rejected the request.");
    return data.result;
  };
  return {
    async get(key) {
      const result = await command(["GET", prefix + key]);
      return result == null ? null : JSON.parse(result);
    },
    async set(key, value, ttlMs) {
      await command(["SET", prefix + key, JSON.stringify(value), "PX", ttlMs]);
    },
    async delete(key) {
      await command(["DEL", prefix + key]);
    },
    async attempt(key, windowMs) {
      const result = await command([
        "EVAL",
        "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('PEXPIRE',KEYS[1],ARGV[1]) end; return {n,redis.call('PTTL',KEYS[1])}",
        1,
        prefix + key,
        windowMs,
      ]);
      if (
        !Array.isArray(result) ||
        result.length !== 2 ||
        !result.every(Number.isFinite)
      )
        throw new Error("Shared login limits are unavailable.");
      return { count: result[0], ttl: result[1] };
    },
  };
}
