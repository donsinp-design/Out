// ICE MAN score service — a Cloudflare Worker over one KV namespace.
//
// It exists for two things the game itself cannot do: keep the boards somewhere that is not one browser, and let
// a winner leave an email address without that address being readable by everyone else.
//
//   POST /score          one finished run. Optional email, kept but never served publicly.
//   GET  /board?p=day    today's top, names and scores only
//   GET  /board?p=week   this week's, the same
//   GET  /admin/board    the same rows WITH the emails. Needs the admin token.
//   GET  /admin/export   those rows as CSV, for a mail merge. Needs the admin token.
//
// Two rules the code holds to, because getting either wrong publishes somebody's email address:
//   1. Only paths under /admin ever include an email, and only after the token has matched.
//   2. The public shape is built by copying the three fields it is allowed to have, never by deleting fields off
//      the stored row - a field added to storage later cannot leak by being forgotten here.
//
// What this is NOT: tamper proof. Scores arrive from a browser, so a determined player can post whatever number
// they like, and no amount of client-side signing fixes that (the key would be sitting in the page). The checks
// below stop accidents and casual curl, nothing more. Treat the board as a friendly competition, not an audit.

const DAY_MS = 86400000;
const MAX_ROWS = 200;          // per board; plenty for a daily competition and far inside a KV value
const MAX_SCORE = 50000000;    // a sanity ceiling, not an anti-cheat measure
const RATE_PER_MIN = 20;       // posts per IP per minute

const json = (body, status, extra) => new Response(JSON.stringify(body), {
  status: status || 200,
  headers: Object.assign({ 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }, cors(), extra || {}),
});
const cors = () => ({
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
  'access-control-allow-headers': 'content-type,authorization',
  'access-control-max-age': '86400',
});

// ---------- the keys a day and a week are filed under ----------
// UTC, to match the game: the road changes at the same instant everywhere rather than giving whoever lives
// furthest east a private head start.
function dayKey(d) { return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate(); }
function weekKey(d) {
  const t = new Date(d.getTime());
  t.setUTCHours(0, 0, 0, 0);
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));      // ISO: the Thursday decides the year
  const jan1 = Date.UTC(t.getUTCFullYear(), 0, 1);
  return t.getUTCFullYear() * 100 + Math.ceil(((t.getTime() - jan1) / DAY_MS + 1) / 7);
}
const boardKey = (period, key) => 'board:' + period + ':' + key;

// ---------- what a caller is allowed to send ----------
const str = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '');
const name3 = v => str(v, 3).toUpperCase().replace(/[^A-Z0-9]/g, '') || 'ICE';
// Deliberately loose: the point is to be able to write to somebody, not to police their address. Anything without
// one @ and a dot after it is dropped rather than stored wrong.
const email = v => { const e = str(v, 190).trim(); return /^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(e) ? e : ''; };

// One row per player per board, holding their best. Filing every run separately would let one afternoon fill the
// whole list, which is a log rather than a leaderboard.
function merge(rows, row) {
  const out = rows.slice();
  const i = out.findIndex(r => r && r.u === row.u);
  if (i < 0) out.push(row);
  // A better run replaces the old one, but an address is only ever added, never cleared: most runs are posted
  // without one, and taking the lead is exactly when losing somebody's email would matter most.
  else if (row.s > out[i].s) out[i] = Object.assign({}, out[i], row, { e: row.e || out[i].e || '' });
  else if (row.e && !out[i].e) out[i] = Object.assign({}, out[i], { e: row.e });
  out.sort((a, b) => b.s - a.s);
  return out.slice(0, MAX_ROWS);
}

// The only place a stored row becomes a public one. Built by naming what may go out.
const publicRow = r => ({ name: r.n, score: r.s, bags: r.b || 0 });
const adminRow = r => ({ name: r.n, score: r.s, bags: r.b || 0, chain: r.c || 0, stage: r.st || 0, email: r.e || '', id: r.u, at: r.t || 0, route: r.r || '' });

async function readBoard(env, period, key) {
  const raw = await env.SCORES.get(boardKey(period, key));
  if (!raw) return [];
  try { const v = JSON.parse(raw); return Array.isArray(v) ? v : []; } catch (e) { return []; }
}

async function rateOk(env, ip) {
  if (!ip) return true;
  const k = 'rate:' + ip + ':' + Math.floor(Date.now() / 60000);
  const n = parseInt(await env.SCORES.get(k) || '0', 10) + 1;
  await env.SCORES.put(k, String(n), { expirationTtl: 120 });
  return n <= RATE_PER_MIN;
}

// Constant-time-ish compare, so a wrong token cannot be found a character at a time by timing the reply.
function tokenOk(env, req) {
  const want = env.ADMIN_TOKEN || '';
  if (!want) return false;                                       // unset means closed, never open
  const got = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (got.length !== want.length) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= got.charCodeAt(i) ^ want.charCodeAt(i);
  return diff === 0;
}

async function postScore(req, env) {
  const ip = req.headers.get('cf-connecting-ip') || '';
  if (!await rateOk(env, ip)) return json({ error: 'slow_down' }, 429);
  let body;
  try { body = await req.json(); } catch (e) { return json({ error: 'bad_json' }, 400); }
  const s = Math.floor(Number(body.score));
  if (!isFinite(s) || s <= 0 || s > MAX_SCORE) return json({ error: 'bad_score' }, 400);
  const now = new Date();
  const row = {
    u: str(body.id, 40) || ('anon-' + Math.random().toString(36).slice(2, 10)),
    n: name3(body.name),
    s: s,
    b: Math.max(0, Math.min(999, Math.floor(Number(body.bags) || 0))),
    c: Math.max(0, Math.min(9999, Math.floor(Number(body.chain) || 0))),
    st: Math.max(0, Math.min(99, Math.floor(Number(body.stage) || 0))),
    r: str(body.route, 60),
    e: email(body.email),
    t: now.getTime(),
  };
  const dk = dayKey(now), wk = weekKey(now);
  for (const [p, k] of [['d', dk], ['w', wk]]) {
    const rows = merge(await readBoard(env, p, k), row);
    // 90 days for a day board, a year for a week board: the boards are the record, the raw runs are not kept
    await env.SCORES.put(boardKey(p, k), JSON.stringify(rows), { expirationTtl: p === 'd' ? 90 * 86400 : 400 * 86400 });
  }
  const day = await readBoard(env, 'd', dk);
  const place = day.findIndex(r => r.u === row.u);
  return json({ ok: true, day: dk, week: wk, place: place < 0 ? null : place + 1 });
}

async function getBoard(req, env, url) {
  const p = url.searchParams.get('p') === 'week' ? 'w' : 'd';
  const now = new Date();
  const rows = await readBoard(env, p, p === 'd' ? dayKey(now) : weekKey(now));
  const n = Math.max(1, Math.min(100, parseInt(url.searchParams.get('n') || '20', 10)));
  return json({ period: p === 'd' ? 'day' : 'week', top: rows.slice(0, n).map(publicRow) });
}

async function adminBoard(req, env, url) {
  if (!tokenOk(env, req)) return json({ error: 'unauthorized' }, 401);
  const p = url.searchParams.get('p') === 'week' ? 'w' : 'd';
  const now = new Date();
  // an explicit key lets you look back at a past day or week, not only the current one
  const key = parseInt(url.searchParams.get('key') || '', 10) || (p === 'd' ? dayKey(now) : weekKey(now));
  const rows = await readBoard(env, p, key);
  return json({ period: p === 'd' ? 'day' : 'week', key, count: rows.length, rows: rows.map(adminRow) });
}

async function adminExport(req, env, url) {
  if (!tokenOk(env, req)) return json({ error: 'unauthorized' }, 401);
  const p = url.searchParams.get('p') === 'week' ? 'w' : 'd';
  const now = new Date();
  const key = parseInt(url.searchParams.get('key') || '', 10) || (p === 'd' ? dayKey(now) : weekKey(now));
  const rows = await readBoard(env, p, key);
  const q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const head = 'place,name,score,bags,chain,stage,route,email,id,at\n';
  const body = rows.map((r, i) => [i + 1, r.n, r.s, r.b || 0, r.c || 0, r.st || 0, r.r || '', r.e || '', r.u, new Date(r.t || 0).toISOString()].map(q).join(',')).join('\n');
  return new Response(head + body + '\n', {
    headers: Object.assign({
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="iceman-' + (p === 'd' ? 'day' : 'week') + '-' + key + '.csv"',
      'cache-control': 'no-store',
    }, cors()),
  });
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors() });
    if (!env || !env.SCORES) return json({ error: 'kv_not_bound' }, 500);
    try {
      if (req.method === 'POST' && url.pathname === '/score') return await postScore(req, env);
      if (req.method === 'GET' && url.pathname === '/board') return await getBoard(req, env, url);
      if (req.method === 'GET' && url.pathname === '/admin/board') return await adminBoard(req, env, url);
      if (req.method === 'GET' && url.pathname === '/admin/export') return await adminExport(req, env, url);
      return json({ error: 'not_found' }, 404);
    } catch (e) {
      return json({ error: 'server_error' }, 500);
    }
  },
};

// exported for the test harness; the Worker runtime only uses the default export
export const _internals = { dayKey, weekKey, merge, email, name3, publicRow, adminRow };
