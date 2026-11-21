const DEFAULT_TTL_MS = Number(process.env.DB_CACHE_TTL_MS || 15000);
const MAX_ENTRIES = Number(process.env.DB_CACHE_MAX_ENTRIES || 250);

const cache = new Map();

const getActorKey = (req) => {
  if (!req.user) return 'public';
  return [req.user.role, req.user._id?.toString()].filter(Boolean).join(':');
};

const normalizeHeader = (value) => Array.isArray(value) ? value.join(',') : (value || '');

const getCacheKey = (req, namespace) => JSON.stringify({
  namespace,
  method: req.method,
  url: req.originalUrl,
  actor: getActorKey(req),
  subject: normalizeHeader(req.headers['x-subject-id']),
  instructor: normalizeHeader(req.headers['x-instructor-id']),
  sharedPanelsEnabled: Boolean(req.sharedPanelsEnabled),
});

const pruneCache = () => {
  if (cache.size <= MAX_ENTRIES) return;
  const overflow = cache.size - MAX_ENTRIES;
  const keys = cache.keys();
  for (let i = 0; i < overflow; i += 1) {
    const key = keys.next().value;
    if (!key) break;
    cache.delete(key);
  }
};

const clearResponseCache = () => {
  cache.clear();
};

const cacheResponse = (namespace, ttlMs = DEFAULT_TTL_MS) => (req, res, next) => {
  if (req.method !== 'GET' || ttlMs <= 0) return next();
  if (req.headers['cache-control']?.includes('no-cache')) return next();

  const key = getCacheKey(req, namespace);
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    res.set('X-Cache', 'HIT');
    return res.status(cached.status).json(cached.body);
  }
  if (cached) cache.delete(key);

  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      cache.set(key, {
        status: res.statusCode,
        body,
        expiresAt: Date.now() + ttlMs,
      });
      pruneCache();
      res.set('X-Cache', 'MISS');
    }
    return originalJson(body);
  };

  return next();
};

const invalidateCacheOnMutation = (req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();

  res.on('finish', () => {
    if (res.statusCode >= 200 && res.statusCode < 400) clearResponseCache();
  });

  return next();
};

module.exports = {
  cacheResponse,
  clearResponseCache,
  invalidateCacheOnMutation,
};
