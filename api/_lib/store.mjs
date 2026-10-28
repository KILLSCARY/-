// Хранилище: Upstash Redis / Vercel KV по REST (env KV_REST_API_URL+KV_REST_API_TOKEN или
// UPSTASH_REDIS_REST_URL+UPSTASH_REDIS_REST_TOKEN); без них — память процесса (только для локальной разработки).
// Ключи: p2p:ev:<tgId> — hash событие → первая метка времени (мс); p2p:claim — hash tgId → место; p2p:taken — счётчик;
// p2p:rw:<tgId> — hash награда (boss:1, sign:1.4…) → «сумма:метка»; HSETNX — второй раз не выдаётся.
const CLAIM_LUA = `local p = redis.call('HGET', KEYS[1], ARGV[1])
if p then return {tonumber(p), 0} end
local n = tonumber(redis.call('GET', KEYS[2]) or '0')
if n >= tonumber(ARGV[2]) then return {0, 0} end
n = redis.call('INCR', KEYS[2])
redis.call('HSET', KEYS[1], ARGV[1], n)
return {n, 1}`;

// p2p:cr:<tgId> — hash runId → «старт:сколько:последняя» (TTL), p2p:cards — hash tgId → баланс «Карт»
const CARD_GRANT_LUA = `local v = redis.call('HGET', KEYS[1], ARGV[1])
local bal = tonumber(redis.call('HGET', KEYS[2], ARGV[2]) or '0')
if not v then return {0, bal, 'no_run'} end
local s, c, l = string.match(v, '(%d+):(%d+):(%d+)')
s = tonumber(s); c = tonumber(c); l = tonumber(l)
local now = tonumber(ARGV[3])
if now - s > tonumber(ARGV[7]) * 1000 then return {0, bal, 'no_run'} end
if c >= tonumber(ARGV[4]) then return {0, bal, 'run_limit'} end
if now - s < tonumber(ARGV[5]) * 1000 or (l > 0 and now - l < tonumber(ARGV[6]) * 1000) then return {0, bal, 'too_fast'} end
redis.call('HSET', KEYS[1], ARGV[1], s .. ':' .. (c + 1) .. ':' .. now)
bal = redis.call('HINCRBY', KEYS[2], ARGV[2], 1)
return {1, bal, tostring(c + 1)}`;
// списать карты и положить перк — одним скриптом (KEYS[2] = p2p:pk:<id>)
const CARD_SPEND_LUA = `local b = tonumber(redis.call('HGET', KEYS[1], ARGV[1]) or '0')
local n = tonumber(ARGV[2])
if b < n then return {0, b} end
local nb = redis.call('HINCRBY', KEYS[1], ARGV[1], -n)
if ARGV[3] and ARGV[3] ~= '' then redis.call('HINCRBY', KEYS[2], ARGV[3], 1) end
return {1, nb}`;
// старт забега: взять по одному каждого перка > 0 атомарно
const PERK_TAKE_LUA = `local out = {}
for i, k in ipairs(ARGV) do
  local v = tonumber(redis.call('HGET', KEYS[1], k) or '0')
  if v > 0 then redis.call('HINCRBY', KEYS[1], k, -1); table.insert(out, k) end
end
return out`;

// Карты из кейса: openId — один раз (SADD), не больше cap раз за сутки, +n к балансу — одним скриптом
const CASE_CARD_LUA = `local bal = tonumber(redis.call('HGET', KEYS[3], ARGV[2]) or '0')
if redis.call('SISMEMBER', KEYS[1], ARGV[1]) == 1 then return {0, bal, 'dup'} end
local d = tonumber(redis.call('GET', KEYS[2]) or '0')
if d >= tonumber(ARGV[4]) then return {0, bal, 'day_limit'} end
redis.call('SADD', KEYS[1], ARGV[1])
redis.call('INCR', KEYS[2]); redis.call('EXPIRE', KEYS[2], 172800)
return {1, redis.call('HINCRBY', KEYS[3], ARGV[2], tonumber(ARGV[3])), 'ok'}`;

export function memoryStore() {
    const ev = new Map(), claims = new Map(), rw = new Map(), cr = new Map(), cards = new Map(), seenOpen = new Set(), caseDay = new Map(), pk = new Map();
    let taken = 0;
    return {
        kind: "memory",
        async addEvent(id, event, ts) { const m = ev.get(id) || new Map(); if (!m.has(event)) m.set(event, ts); ev.set(id, m); },
        async events(id) { return Object.fromEntries(ev.get(id) || []); },
        async claim(id, total) { // атомарно в пределах процесса (JS однопоточный)
            if (claims.has(id)) return { place: claims.get(id), fresh: false };
            if (taken >= total) return { place: 0, fresh: false };
            claims.set(id, ++taken);
            return { place: taken, fresh: true };
        },
        async place(id) { return claims.get(id) || 0; },
        async taken() { return taken; },
        async grant(id, key, amount, ts) { const m = rw.get(id) || new Map(); rw.set(id, m); if (m.has(key)) return false; m.set(key, `${amount}:${ts}`); return true; },
        // «Карта»: забеги (runId → {start, count, last}) и баланс; JS однопоточный — проверка и запись атомарны
        async cardRunStart(id, runId, ts) { const m = cr.get(id) || new Map(); cr.set(id, m); m.set(runId, { start: ts, count: 0, last: 0 }); },
        async cardGrant(id, runId, ts, cfg) {
            const r = cr.get(id)?.get(runId), bal = cards.get(id) || 0;
            if (!r || ts - r.start > cfg.runTtlSec * 1000) return { ok: false, reason: "no_run", cards: bal };
            if (r.count >= cfg.perRun) return { ok: false, reason: "run_limit", cards: bal };
            if (ts - r.start < cfg.firstSec * 1000 || (r.last && ts - r.last < cfg.gapSec * 1000)) return { ok: false, reason: "too_fast", cards: bal };
            r.count++; r.last = ts; cards.set(id, bal + 1);
            return { ok: true, cards: bal + 1, count: r.count };
        },
        async caseCardGrant(id, openId, n, day, cap) {
            const bal = cards.get(id) || 0, k = `${id}:${day}`;
            if (seenOpen.has(`${id}:${openId}`)) return { ok: false, reason: "dup", cards: bal };
            if ((caseDay.get(k) || 0) >= cap) return { ok: false, reason: "day_limit", cards: bal };
            seenOpen.add(`${id}:${openId}`); caseDay.set(k, (caseDay.get(k) || 0) + 1); cards.set(id, bal + n);
            return { ok: true, cards: bal + n };
        },
        async cardBalance(id) { return cards.get(id) || 0; },
        async cardSpend(id, n, item) { const b = cards.get(id) || 0; if (b < n) return { ok: false, cards: b }; cards.set(id, b - n); if (item) { const m = pk.get(id) || {}; m[item] = (m[item] || 0) + 1; pk.set(id, m); } return { ok: true, cards: b - n }; },
        async perkTake(id, keys) { const m = pk.get(id) || {}, out = []; for (const k of keys) if (m[k] > 0) { m[k]--; out.push(k); } return out; },
        async perks(id) { return { ...(pk.get(id) || {}) }; },
        async rewards(id) { return Object.fromEntries([...(rw.get(id) || [])].map(([k, v]) => [k, Number(v.split(":")[0])])); },
    };
}

export function redisStore(url, token, fetchImpl = fetch) {
    const cmd = async (...args) => {
        const r = await fetchImpl(url, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(args) });
        const j = await r.json();
        if (j.error) throw new Error(j.error);
        return j.result;
    };
    return {
        kind: "redis",
        async addEvent(id, event, ts) { await cmd("HSETNX", `p2p:ev:${id}`, event, String(ts)); },
        async events(id) {
            const a = (await cmd("HGETALL", `p2p:ev:${id}`)) || [];
            const o = {};
            for (let i = 0; i < a.length; i += 2) o[a[i]] = Number(a[i + 1]);
            return o;
        },
        async claim(id, total) {
            const [place, fresh] = await cmd("EVAL", CLAIM_LUA, "2", "p2p:claim", "p2p:taken", id, String(total));
            return { place: Number(place), fresh: Boolean(fresh) };
        },
        async place(id) { return Number((await cmd("HGET", "p2p:claim", id)) || 0); },
        async taken() { return Number((await cmd("GET", "p2p:taken")) || 0); },
        async cardRunStart(id, runId, ts, ttl) { await cmd("HSET", `p2p:cr:${id}`, runId, `${ts}:0:0`); await cmd("EXPIRE", `p2p:cr:${id}`, String(ttl)); },
        async cardGrant(id, runId, ts, cfg) {
            const [ok, bal, x] = await cmd("EVAL", CARD_GRANT_LUA, "2", `p2p:cr:${id}`, "p2p:cards", runId, String(id), String(ts), String(cfg.perRun), String(cfg.firstSec), String(cfg.gapSec), String(cfg.runTtlSec));
            return Number(ok) ? { ok: true, cards: Number(bal), count: Number(x) } : { ok: false, reason: x, cards: Number(bal) };
        },
        async caseCardGrant(id, openId, n, day, cap, ttl) {
            const [ok, b, why] = await cmd("EVAL", CASE_CARD_LUA, "3", `p2p:co:${id}`, `p2p:cd:${id}:${day}`, "p2p:cards", openId, String(id), String(n), String(cap), String(ttl));
            return Number(ok) ? { ok: true, cards: Number(b) } : { ok: false, reason: why, cards: Number(b) };
        },
        async cardBalance(id) { return Number((await cmd("HGET", "p2p:cards", String(id))) || 0); },
        async cardSpend(id, n, item = "") { const [ok, b] = await cmd("EVAL", CARD_SPEND_LUA, "2", "p2p:cards", `p2p:pk:${id}`, String(id), String(n), item); return { ok: Boolean(Number(ok)), cards: Number(b) }; },
        async perkTake(id, keys) { return (await cmd("EVAL", PERK_TAKE_LUA, "1", `p2p:pk:${id}`, ...keys)) || []; },
        async perks(id) { const a = (await cmd("HGETALL", `p2p:pk:${id}`)) || [], o = {}; for (let i = 0; i < a.length; i += 2) o[a[i]] = Number(a[i + 1]); return o; },
        async grant(id, key, amount, ts) { return Number(await cmd("HSETNX", `p2p:rw:${id}`, key, `${amount}:${ts}`)) === 1; },
        async rewards(id) {
            const a = (await cmd("HGETALL", `p2p:rw:${id}`)) || [];
            const o = {};
            for (let i = 0; i < a.length; i += 2) o[a[i]] = Number(String(a[i + 1]).split(":")[0]);
            return o;
        },
    };
}

let cached;
export function getStore(env = process.env) {
    if (cached) return cached;
    const url = env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL, token = env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN;
    cached = url && token ? redisStore(url, token) : memoryStore();
    return cached;
}
export function setStore(s) { cached = s; }
