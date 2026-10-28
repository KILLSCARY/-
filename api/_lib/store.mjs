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

export function memoryStore() {
    const ev = new Map(), claims = new Map(), rw = new Map();
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
