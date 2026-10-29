// node --test tests/ — рейтинг забегов через redisStore (как на проде, Upstash REST), на маленькой имитации Redis.
// Тесты api.test.mjs идут на хранилище в памяти и не ловят ошибки, которые бывают только с командами Redis.
import test from "node:test";
import assert from "node:assert/strict";
import { handle } from "../api/_lib/prize.mjs";
import { redisStore } from "../api/_lib/store.mjs";
import { signInitData } from "../api/_lib/telegram.mjs";

const BOT = "123456:TEST-token";
const env = { BOT_TOKEN: BOT };
const T0 = 1_800_000_000_000;
const init = (id, t = T0) => signInitData({ auth_date: String(Math.floor(t / 1000)), query_id: "q", user: JSON.stringify({ id, first_name: "Игрок" }) }, BOT);

// имитация Redis: только команды, которые использует store.mjs; неизвестная команда — ошибка (как пустой HMGET у Upstash)
function fakeRedis() {
    const h = new Map(), z = new Map(), s = new Map(), log = [];
    const H = (k) => (h.has(k) || h.set(k, new Map()), h.get(k)), Z = (k) => (z.has(k) || z.set(k, new Map()), z.get(k));
    const sorted = (k) => [...Z(k)].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? 1 : -1));
    const run = ([c, ...a]) => {
        log.push(c);
        switch (c) {
            case "HSET": { const m = H(a[0]); for (let i = 1; i < a.length; i += 2) m.set(a[i], String(a[i + 1])); return 1; }
            case "HSETNX": { const m = H(a[0]); if (m.has(a[1])) return 0; m.set(a[1], String(a[2])); return 1; }
            case "HGET": return H(a[0]).get(a[1]) ?? null;
            case "HDEL": return H(a[0]).delete(a[1]) ? 1 : 0;
            case "HKEYS": return [...H(a[0]).keys()];
            case "HGETALL": return [...H(a[0])].flat();
            case "HMGET": if (a.length < 2) throw new Error("ERR wrong number of arguments for 'hmget' command"); return a.slice(1).map((f) => H(a[0]).get(f) ?? null);
            case "HINCRBY": { const m = H(a[0]), v = Number(m.get(a[1]) || 0) + Number(a[2]); m.set(a[1], String(v)); return v; }
            case "EXPIRE": return 1;
            case "GET": return s.get(a[0]) ?? null;
            case "ZADD": { const gt = a[1] === "GT", sc = Number(a[gt ? 2 : 1]), id = a[gt ? 3 : 2], m = Z(a[0]); if (!gt || !(m.get(id) >= sc)) m.set(id, sc); return 1; }
            case "ZINCRBY": { const m = Z(a[0]); m.set(a[2], (m.get(a[2]) || 0) + Number(a[1])); return String(m.get(a[2])); }
            case "ZSCORE": return Z(a[0]).has(a[1]) ? String(Z(a[0]).get(a[1])) : null;
            case "ZREVRANK": { const i = sorted(a[0]).findIndex(([id]) => id === a[1]); return i < 0 ? null : i; }
            case "ZREVRANGE": return sorted(a[0]).slice(Number(a[1]), Number(a[2]) + 1).flatMap(([id, sc]) => [id, String(sc)]);
            case "EVAL": return []; // перки за карты: в этих тестах купленных нет
            default: throw new Error(`ERR unknown command '${c}'`);
        }
    };
    const fetchImpl = async (url, o) => { try { return { json: async () => ({ result: run(JSON.parse(o.body)) }) }; } catch (e) { return { json: async () => ({ error: e.message }) }; } };
    return { fetchImpl, log };
}

test("рейтинг забегов на Redis: старт → результат → таблица и место", async () => {
    const r = fakeRedis(), store = redisStore("https://redis.test", "t", r.fetchImpl);
    const call = (action, body, now) => handle(action, body, { store, env, now });
    const a = init(501), b = init(502);
    const ra = (await call("cardrun", { initData: a }, T0)).json.runId, rb = (await call("cardrun", { initData: b }, T0)).json.runId;
    assert.ok(ra && rb);
    assert.equal((await call("runscore", { initData: a, runId: ra, distance: 1500, usdt: 120 }, T0 + 90_000)).status, 200);
    assert.equal((await call("runscore", { initData: b, runId: rb, distance: 900, usdt: 40 }, T0 + 60_000)).status, 200);
    // худший результат того же игрока таблицу не меняет
    const rb2 = (await call("cardrun", { initData: b }, T0 + 100_000)).json.runId;
    await call("runscore", { initData: b, runId: rb2, distance: 300, usdt: 5 }, T0 + 160_000);
    const t = (await call("top", { initData: b }, T0 + 200_000));
    assert.equal(t.status, 200, JSON.stringify(t.json));
    assert.deepEqual(t.json.top.map((x) => [x.id, x.score]), [["501", 2700], ["502", 1300]]);
    assert.equal(t.json.me.rank, 2); assert.equal(t.json.me.score, 1300);
});

// каждое действие, которое понимает handle(), должно проходить через /api/prize (список ACTIONS)
test("/api/prize пропускает все действия, в том числе runscore", async () => {
    const { default: handler, ACTIONS } = await import("../api/prize.mjs");
    for (const action of ["runscore", "top", "task", "cardrun", "reward", "event", "claim", "apply", "subcheck", "refs"]) {
        assert.ok(ACTIONS.includes(action), action);
        const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(b) { this.body = b; } };
        await handler({ method: "POST", body: { action } }, res);
        assert.equal(res.statusCode, 401, `${action}: ${res.body}`); // без initData — 401, а не 404 «unknown»
    }
});
