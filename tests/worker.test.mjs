// Cloudflare Worker: те же ответы /api/prize, статика и разделение cron
import test from "node:test";
import assert from "node:assert/strict";
import * as entry from "../worker/index.mjs";
import { memoryStore, setStore } from "../api/_lib/store.mjs";

const worker = entry.default;
const env = { ASSETS: { fetch: async () => new Response("static") } };
const call = (init) => worker.fetch(new Request("https://x.test/api/prize", init), env);

test("Worker экспортирует только обработчик: иначе Cloudflare его не запустит", () => {
    assert.deepEqual(Object.keys(entry), ["default"]);
});

test("GET /api/prize отдаёт счётчик без кэша", async () => {
    setStore(memoryStore());
    const r = await call();
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("Cache-Control"), "no-store");
    assert.equal(typeof (await r.json()).total, "number");
});

test("POST с плохим телом и неизвестным действием не роняет сервер", async () => {
    setStore(memoryStore());
    const r = await call({ method: "POST", body: "не json" });
    assert.notEqual(r.status, 500);
});

test("другой метод — 405", async () => {
    assert.equal((await call({ method: "PUT" })).status, 405);
});

test("остальные адреса отдаёт статика", async () => {
    assert.equal(await (await worker.fetch(new Request("https://x.test/index.html"), env)).text(), "static");
});

test("cron: итоги гонки и сообщения о копилке запускаются отдельно", async () => {
    const calls = [], store = memoryStore();
    store.once = async (k) => { calls.push(k); return false; };
    store.shiftDueList = async () => { calls.push("due"); return []; };
    setStore(store);
    const e = { BOT_TOKEN: "t", SHIFT_NOTIFY: "1" };
    await worker.scheduled({ cron: "0 9 * * *" }, e);
    assert.equal(calls.length, 1);
    assert.match(calls[0], /^race:/);
    await worker.scheduled({ cron: "30 9 * * *" }, e);
    assert.deepEqual(calls.slice(1), ["due"]);
});
