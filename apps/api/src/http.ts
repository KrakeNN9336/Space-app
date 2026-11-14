export async function fetchJson<T>(url: string, timeoutMs = 8000, init: RequestInit = {}): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (!response.ok) throw new Error("UPSTREAM_HTTP_" + response.status);
    return await response.json() as T;
  } finally {
    clearTimeout(timer);
  }
}

export type CachedResult<T> = { value: T; source: "live" | "cache" | "stale" };
export type CacheKV = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
};

export async function cached<T>(
  kv: CacheKV | undefined, key: string, seconds: number, load: () => Promise<T>,
): Promise<CachedResult<T>> {
  let hit: { value: T; timestamp: number } | null = null;
  try {
    const saved = await kv?.get(key);
    if (saved) hit = JSON.parse(saved) as { value: T; timestamp: number };
  } catch { /* Cache cannot block live data. */ }
  if (hit && Date.now() - hit.timestamp < seconds * 1000) return { value: hit.value, source: "cache" };
  try {
    const value = await load();
    try {
      await kv?.put(key, JSON.stringify({ value, timestamp: Date.now() }), { expirationTtl: seconds });
    } catch { /* Cache cannot block live data. */ }
    return { value, source: "live" };
  } catch (error) {
    if (hit) return { value: hit.value, source: "stale" };
    throw error;
  }
}
