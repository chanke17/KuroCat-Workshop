// KuroCat Workshop Download Stats Worker (Cloudflare Worker + D1)
// Binding required: D1 database named "DB"

const ALLOWED_TYPES = new Set(['skin', 'accessory', 'keyboard']);
const SLUG_RE = /^[a-z0-9][a-z0-9_-]{0,99}$/i;

// Lightweight per-isolate rate limit (IP + item_key -> last hit timestamp)
const recentHits = new Map();
const HIT_COOLDOWN_MS = 10_000;

let schemaReady = false;

function corsHeaders(request) {
  const origin = request.headers.get('Origin') || '*';
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}

function jsonResponse(data, request, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...corsHeaders(request)
    }
  });
}

async function ensureSchema(db) {
  if (schemaReady) return;
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS download_counts (
        item_key TEXT PRIMARY KEY,
        count INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL DEFAULT 0
      )`
    )
    .run();
  schemaReady = true;
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    if (!env.DB) {
      return jsonResponse({ error: 'D1 binding DB is not configured' }, request, 500);
    }

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    try {
      await ensureSchema(env.DB);

      if (request.method === 'GET' && (path === '/' || path === '/counts' || path === '/api/counts')) {
        const { results } = await env.DB.prepare('SELECT item_key, count FROM download_counts').all();
        const counts = {};
        for (const row of results || []) {
          counts[row.item_key] = Number(row.count) || 0;
        }
        return jsonResponse({ ok: true, counts }, request);
      }

      if (request.method === 'POST' && (path === '/hit' || path === '/api/hit')) {
        let body = {};
        try {
          body = await request.json();
        } catch (_) {
          return jsonResponse({ error: 'Invalid JSON body' }, request, 400);
        }

        const type = String(body.type || '').trim();
        const slug = String(body.slug || '').trim();
        if (!ALLOWED_TYPES.has(type) || !SLUG_RE.test(slug)) {
          return jsonResponse({ error: 'Invalid type or slug' }, request, 400);
        }

        const key = `${type}:${slug}`;
        const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
        const rlKey = `${ip}|${key}`;
        const now = Date.now();
        const last = recentHits.get(rlKey) || 0;

        if (now - last < HIT_COOLDOWN_MS) {
          const row = await env.DB.prepare('SELECT count FROM download_counts WHERE item_key = ?1')
            .bind(key)
            .first();
          return jsonResponse({ ok: true, key, count: Number(row?.count || 0), throttled: true }, request);
        }

        recentHits.set(rlKey, now);
        if (recentHits.size > 5000) {
          for (const [k, ts] of recentHits) {
            if (now - ts > HIT_COOLDOWN_MS) recentHits.delete(k);
          }
        }

        const row = await env.DB.prepare(
          `INSERT INTO download_counts (item_key, count, updated_at)
           VALUES (?1, 1, ?2)
           ON CONFLICT(item_key) DO UPDATE SET count = count + 1, updated_at = excluded.updated_at
           RETURNING count`
        )
          .bind(key, now)
          .first();

        return jsonResponse({ ok: true, key, count: Number(row?.count || 1) }, request);
      }

      return jsonResponse({ error: 'Not found' }, request, 404);
    } catch (err) {
      return jsonResponse({ error: String(err?.message || err) }, request, 500);
    }
  }
};
