// «Карта» — вторая, редкая валюта. Девушка с банковской картой (Сбер, Альфа, Тинькофф, Озон — CARDS.banks) стоит
// у бордюра, путь не перекрывает, над ней облачко «Держи карту …!». Подбежал — кидает карту на свою крайнюю полосу;
// пробежал по ней — карта летит к герою и засчитывается (+1, сразу в профиль).
// Частота — лимит на забег (CARDS.perRun), не таймер: первая гарантированно после CARDS.firstAt м, вторая позже;
// во время погони Мизулиной, сюжетной погони и боя с боссом — не появляется (ждёт, пока станет тихо).
// Девушки — пул (CARDS.perRun штук), модель — та же girl_npc.glb, что у прохожих, карта — одна общая геометрия.
import * as THREE from "./vendor/three.module.js";
import { CARDS, NPCS, CARDS_DURING_STORY_CHASE } from "./config.js";

const pick = (a) => a[Math.floor(Math.random() * a.length)];

// без roundRect — его нет на iOS 15
const roundRect = (x, X, Y, w, h, r) => { x.beginPath(); x.moveTo(X + r, Y); x.arcTo(X + w, Y, X + w, Y + h, r); x.arcTo(X + w, Y + h, X, Y + h, r); x.arcTo(X, Y + h, X, Y, r); x.arcTo(X, Y, X + w, Y, r); x.closePath(); };

// Карта 512×320 (как настоящая, 1,6:1), углы скруглены прозрачностью (alphaTest в материале). Логотипов нет —
// только цвета и название банка; номер, имя и срок выдуманные, на обороте — «игровая, не платёжная».
const W = 512, H = 320, R = 34;
function canvas() {
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    return [c, c.getContext("2d")];
}
function toTexture(c, aniso) {
    const t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding;
    t.anisotropy = aniso;
    return t;
}
// четыре цифры номера — свои у банка, но не случайные (одинаковые у всех игроков)
const last4 = (id) => String([...id].reduce((s, ch) => (s * 31 + ch.charCodeAt(0)) % 9000, 7) + 1000);

// Лицо карты: глубокий цвет банка, широкая светлая диагональ и крупное название — с дороги читается бренд, а не мелкие детали
function cardFront(bank, aniso) {
    const [c, x] = canvas();
    const rr = (X, Y, w, h, r) => roundRect(x, X, Y, w, h, r);
    x.save(); rr(0, 0, W, H, R); x.clip();
    const g = x.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, bank.bg[0]); g.addColorStop(1, bank.bg[1]);
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    // диагональ цвета банка и блик на её кромке
    x.fillStyle = bank.wave; x.globalAlpha = 0.75;
    x.beginPath(); x.moveTo(W * 0.52, 0); x.lineTo(W, 0); x.lineTo(W, H * 0.72); x.lineTo(W * 0.3, H * 0.72 - 0.42 * W * 0.7 + 90); x.closePath(); x.fill();
    x.globalAlpha = 0.28; x.fillStyle = "#ffffff";
    x.beginPath(); x.moveTo(W * 0.52, 0); x.lineTo(W * 0.6, 0); x.lineTo(W * 0.38, H * 0.72 - 0.42 * W * 0.7 + 90); x.lineTo(W * 0.3, H * 0.72 - 0.42 * W * 0.7 + 90); x.closePath(); x.fill();
    x.globalAlpha = 1;
    // тёмная подложка снизу — на ней название
    const foot = x.createLinearGradient(0, H * 0.55, 0, H);
    foot.addColorStop(0, "rgba(0,0,0,0)"); foot.addColorStop(1, "rgba(0,0,0,.42)");
    x.fillStyle = foot; x.fillRect(0, H * 0.55, W, H * 0.45);
    // чип
    const cx = 36, cy = 40, cw = 72, chh = 54;
    const gold = x.createLinearGradient(cx, cy, cx + cw, cy + chh);
    gold.addColorStop(0, "#fff0b8"); gold.addColorStop(0.5, "#e2b65a"); gold.addColorStop(1, "#a87826");
    x.fillStyle = gold; rr(cx, cy, cw, chh, 11); x.fill();
    x.strokeStyle = "rgba(110,72,20,.8)"; x.lineWidth = 2;
    x.beginPath();
    x.moveTo(cx, cy + chh / 2); x.lineTo(cx + cw, cy + chh / 2);
    x.moveTo(cx + cw / 3, cy); x.lineTo(cx + cw / 3, cy + chh);
    x.moveTo(cx + cw * 2 / 3, cy); x.lineTo(cx + cw * 2 / 3, cy + chh);
    x.stroke();
    // бесконтакт
    x.strokeStyle = bank.ink; x.globalAlpha = 0.9; x.lineWidth = 5; x.lineCap = "round";
    for (const [rad, ang] of [[11, 0.7], [20, 0.66], [29, 0.62]]) { x.beginPath(); x.arc(cx + cw + 22, cy + chh / 2, rad, -ang, ang); x.stroke(); }
    x.globalAlpha = 1;
    // пометка «игровая» и последние цифры
    x.fillStyle = bank.ink; x.textBaseline = "alphabetic";
    x.globalAlpha = 0.8; x.font = "700 15px Arial, sans-serif"; x.textAlign = "right"; x.fillText("ИГРОВАЯ КАРТА", W - 32, 52);
    x.font = "700 22px 'Courier New', monospace"; x.fillText(`•• ${last4(bank.id)}`, W - 32, H - 34);
    x.globalAlpha = 1;
    // крупное название: чем длиннее, тем мельче, но всегда на всю доступную ширину
    x.textAlign = "left";
    let size = 76;
    do { x.font = `900 ${size}px "Arial Black", Arial, sans-serif`; size -= 2; } while (x.measureText(bank.name).width > W - 72 && size > 30);
    x.fillStyle = "rgba(0,0,0,.28)"; x.fillText(bank.name, 38, H - 72);
    x.fillStyle = bank.ink; x.fillText(bank.name, 36, H - 74);
    x.globalAlpha = 0.85; x.font = "700 15px Arial, sans-serif"; x.fillText("ПОКОРИТЕЛЬ P2P", 36, H - 34);
    x.globalAlpha = 1;
    x.restore();
    x.strokeStyle = "rgba(255,255,255,.35)"; x.lineWidth = 4; rr(2, 2, W - 4, H - 4, R - 2); x.stroke();
    return toTexture(c, aniso);
}

// оборот: магнитная полоса и пометка «игровая, не платёжная»
function cardBack(bank, aniso) {
    const [c, x] = canvas();
    const rr = (X, Y, w, h, r) => roundRect(x, X, Y, w, h, r);
    x.save(); rr(0, 0, W, H, R); x.clip();
    const g = x.createLinearGradient(W, 0, 0, H);
    g.addColorStop(0, bank.bg[0]); g.addColorStop(1, bank.bg[1]);
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    x.fillStyle = "#121212"; x.fillRect(0, 38, W, 62);
    x.fillStyle = bank.ink; x.textAlign = "left"; x.textBaseline = "alphabetic"; x.globalAlpha = 0.9;
    x.font = "600 17px Arial, sans-serif";
    x.fillText("Игровая карта «Покоритель P2P 3.0».", 36, 160);
    x.fillText("Не платёжная: денег на ней нет.", 36, 186);
    x.globalAlpha = 1;
    x.font = "900 34px \"Arial Black\", Arial, sans-serif"; x.textAlign = "right"; x.fillText(bank.name, W - 34, H - 36);
    x.restore();
    x.strokeStyle = "rgba(255,255,255,.3)"; x.lineWidth = 4; rr(2, 2, W - 4, H - 4, R - 2); x.stroke();
    return toTexture(c, aniso);
}

// мягкое свечение карты (аддитивный спрайт, белое — красится в цвет банка) — без источника света
function glowTexture() {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const x = c.getContext("2d"), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(0.35, "rgba(255,255,255,.45)"); g.addColorStop(1, "rgba(255,255,255,0)");
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
}

export class CardGirls {
    constructor(game) {
        this.g = game;
        this.pool = [];
        const k = CARDS.cardSize;
        this.cardGeo = new THREE.BoxGeometry(0.34 * k, 0.215 * k, 0.014);
        const glow = glowTexture();
        // у каждого банка своя карта, своё свечение и своя реплика; текстуры рисуются при первой девушке этого банка
        this.banks = CARDS.banks.map((b) => ({ ...b, card: null,
            glow: new THREE.SpriteMaterial({ map: glow, color: b.glow, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.6 }) }));
        this.bankI = Math.floor(Math.random() * this.banks.length);
        this._q = new THREE.Quaternion();
        this._v = new THREE.Vector3();
        this.flying = [];
        this.reset();
    }

    // материалы карты банка: лицо и оборот светятся сами (читаются и под мигалками), углы срезаны прозрачностью,
    // торцы — цветом банка. Порядок граней BoxGeometry: +x, −x, +y, −y, лицо (+z), оборот (−z)
    cardMats(b) {
        if (b.card) return b.card;
        const aniso = Math.min(8, this.g.renderer?.capabilities?.getMaxAnisotropy?.() || 1);
        const face = (tex) => new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.55, metalness: 0.35, roughness: 0.32, alphaTest: 0.5 }); // ярче — выгорает под свечением (bloom)
        const edge = new THREE.MeshStandardMaterial({ color: new THREE.Color(b.bg[1]), metalness: 0.5, roughness: 0.4 });
        b.card = [edge, edge, edge, edge, face(cardFront(b, aniso)), face(cardBack(b, aniso))];
        return b.card;
    }

    reset() {
        this.spawned = 0;
        this.got = 0;
        this.nextAt = CARDS.firstAt;
        for (const p of this.pool) { p.visible = false; p.userData.active = false; if (p.userData.bubble) p.userData.bubble.hidden = true; }
        for (const f of this.flying) f.visible = false;
        this.flying.length = 0;
    }

    makeGirl() {
        const w = this.g.world, m = w.npcModels.girl;
        if (!m) return null; // модель ещё грузится — попробуем на следующем кадре
        const g = w.rig(m, NPCS.girl.idle);
        const act = g.userData.mixer?._actions[0];
        if (act) act.timeScale = CARDS.idleSpeed; // медленный танец — покачивание на месте
        const card = new THREE.Mesh(this.cardGeo, this.cardMats(this.banks[0]));
        let hand = null;
        g.traverse((o) => { if (!hand && /RightHand$/.test(o.name)) hand = o; });
        if (hand) { // карта в правой руке: смещение и размер — в метрах мира, пересчитанные в единицы кости.
            // Было смещение (0, 14, 6) «в сантиметрах кости»: у облегчённой модели (телефоны) кость в метрах,
            // и карта висела в 10–15 м от девушки — в воздухе или под асфальтом
            g.updateMatrixWorld(true);
            const s = new THREE.Vector3(); hand.getWorldScale(s);
            const k = s.x || 1;
            card.scale.setScalar(1.6 / k); // ×1.6 — читается издалека
            card.position.set(0, 0.14 / k, 0.06 / k); // у ладони
            hand.add(card);
            g.userData.cardFace = true;
        } else { card.position.set(0.35, 1.05, 0.2); g.add(card); }
        g.userData.card = card;
        g.userData.cardHome = { p: card.position.clone(), r: card.rotation.clone(), s: card.scale.clone(), parent: card.parent };
        // сама девушка не светится (как прохожие); светится только карта — мягко, в цвет банка
        const glow = new THREE.Sprite(this.banks[0].glow);
        glow.scale.setScalar(0.7);
        card.add(glow);
        g.userData.cardGlow = glow;
        // реплика над головой — какую карту она даёт: подпись в HUD над её головой (в 3D-спрайте текст издалека не прочитать)
        const bubble = document.createElement("div");
        bubble.className = "card-bubble";
        bubble.hidden = true;
        document.getElementById("hud")?.appendChild(bubble);
        g.userData.bubble = bubble;
        w.scene.add(g);
        this.pool.push(g);
        return g;
    }

    blocked() {
        const g = this.g;
        const story = g.storyChasing?.(); // сюжетная погоня Мизулиной идёт почти весь забег главы 1 — девушки появляются и в ней
        return g.stumble > 0 || (g.chaser?.visible && !(CARDS_DURING_STORY_CHASE && story)) || (!CARDS_DURING_STORY_CHASE && story) || g.bossCalm || g.bossFight || g.storyCatch;
    }

    spawn(z) {
        const w = this.g.world;
        let girl = this.pool.find((p) => !p.userData.active) || this.makeGirl();
        if (!girl) return false;
        const side = Math.random() < 0.5 ? 0 : 2;          // у левой или правой крайней полосы
        const x = w.lanes[side] + Math.sign(w.lanes[side]) * CARDS.edge;
        girl.position.set(x, 0, z);
        girl.rotation.y = -Math.sign(x) * 0.6; // к бегущему, вполоборота к дороге
        const card = girl.userData.card, h = girl.userData.cardHome;
        if (card.parent !== h.parent) { h.parent.add(card); }
        card.position.copy(h.p); card.rotation.copy(h.r); card.scale.copy(h.s); card.visible = true;
        // банки по кругу — две девушки подряд не дают одинаковую карту
        this.bankI = (this.bankI + 1) % this.banks.length;
        const bank = this.banks[this.bankI];
        card.material = this.cardMats(bank);
        girl.userData.cardGlow.material = bank.glow;
        girl.userData.bubble.textContent = bank.line;
        girl.userData.bubble.style.setProperty("--bc", `#${bank.glow.toString(16).padStart(6, "0")}`);
        Object.assign(girl.userData, { active: true, lane: side, taken: false, missed: false, toss: null, onRoad: false, bank });
        girl.visible = true;
        this.g.hub?.toast(`Карта ${bank.of} ${side ? "справа →" : "← слева"} — беги к краю!`); // подсказка: где она и что делать
        return true;
    }

    update(dt, move) {
        const g = this.g, w = g.world;
        if (this.spawned < CARDS.perRun && g.distance >= this.nextAt && !this.blocked()) {
            if (this.spawn(CARDS.spawnZ)) {
                this.spawned++;
                this.nextAt = g.distance + CARDS.nextGap[0] + Math.random() * (CARDS.nextGap[1] - CARDS.nextGap[0]);
            }
        }
        for (const p of this.pool) {
            if (!p.userData.active) continue;
            const u = p.userData, c = u.card;
            p.position.z += move;
            u.mixer?.update(dt);
            if (u.cardFace && !u.taken && !u.toss) { // в руке карта лицом к камере, как бы ни крутилась рука
                const cam = g.camera;
                if (cam) { c.parent.getWorldQuaternion(this._q); c.quaternion.copy(this._q.invert().multiply(cam.quaternion)); }
            }
            if (u.cardGlow) u.cardGlow.material.opacity = 0.75 + Math.sin(performance.now() / 180) * 0.25;
            // подбежал — девушка кидает карту на дорогу: дугой из руки на её (крайнюю) полосу, чуть ближе к герою
            if (!u.taken && !u.toss && p.position.z > CARDS.tossAt) {
                const from = new THREE.Vector3(); c.getWorldPosition(from);
                w.scene.attach(c);
                c.scale.setScalar(CARDS.roadScale);
                u.toss = { t: 0, from, to: new THREE.Vector3(w.lanes[u.lane], CARDS.roadY, p.position.z + CARDS.tossAhead) };
            }
            if (u.toss && !u.taken) {
                const q = u.toss;
                q.from.z += move; q.to.z += move;
                q.t = Math.min(1, q.t + dt / CARDS.tossTime);
                const k = q.t, bob = u.onRoad ? Math.sin(performance.now() / 260) * 0.08 : 0;
                c.position.lerpVectors(q.from, q.to, k);
                c.position.y += Math.sin(k * Math.PI) * 1.1 + bob; // дуга броска, на дороге — покачивается
                c.rotation.set(0, c.rotation.y + dt * (u.onRoad ? 2.6 : 12), 0); // крутится, как монета
                if (k >= 1) u.onRoad = true;
            }
            // карта на дороге (или ещё в руке, если не успела кинуть) — забирает тот, кто пробежал по её полосе
            const cz = u.toss ? c.position.z : p.position.z;
            if (!u.taken && cz > -0.8 && cz < 1.2 && g.lane === u.lane && g.state === "playing") {
                u.taken = true;
                this.collect(p);
            }
            if (!u.taken && !u.missed && cz > 1.4) { u.missed = true; c.visible = false; g.cardMissed?.(); } // пробежал не по той полосе — карта сгорела
            if (p.position.z > 12) { u.active = false; p.visible = false; c.visible = false; }
            this.placeBubble(p);
        }
        for (let i = this.flying.length - 1; i >= 0; i--) {
            const c = this.flying[i], d = c.userData;
            d.t += dt / 0.45;
            const k = Math.min(1, d.t);
            const tx = g.x, ty = g.y + 1.0, tz = 0;
            c.position.set(d.x0 + (tx - d.x0) * k, d.y0 + (ty - d.y0) * k + Math.sin(k * Math.PI) * 0.8, d.z0 + (tz - d.z0) * k);
            c.rotation.y += dt * 14;
            c.scale.setScalar(1 - k * 0.5);
            if (k >= 1) { c.visible = false; this.flying.splice(i, 1); }
        }
    }

    // подпись «Держи карту …!» над головой девушки: точка над ней — в экран; ближе — крупнее, за спиной и в тумане — нет
    placeBubble(p) {
        const el = p.userData.bubble, cam = this.g.camera;
        if (!el) return;
        const z = p.position.z;
        const show = p.userData.active && this.g.state === "playing" && z > -62 && z < -1.5 && cam;
        if (!show) { if (!el.hidden) el.hidden = true; return; }
        const v = this._v.set(p.position.x, 2.2, z).project(cam);
        if (v.z > 1 || Math.abs(v.x) > 1.1) { el.hidden = true; return; }
        const k = Math.min(1.1, Math.max(0.72, 1.2 + z / 70));
        el.style.transform = `translate(${((v.x + 1) / 2) * innerWidth}px, ${((1 - v.y) / 2) * innerHeight}px) translate(-50%, -100%) scale(${k.toFixed(2)})`;
        el.hidden = false;
    }

    collect(p) {
        if (this.got >= CARDS.perRun) return; // не больше CARDS.perRun карт за забег, что бы ни случилось
        const g = this.g, card = p.userData.card, w = g.world;
        const pos = new THREE.Vector3(); card.getWorldPosition(pos);
        w.scene.attach(card); // открепляем от руки, летит к герою
        card.scale.setScalar(1.6);
        card.userData = { t: 0, x0: pos.x, y0: pos.y, z0: pos.z };
        this.flying.push(card);
        this.got++;
        g.profile.addCards(1);
        g.audio.play("boost");
        g.world.flash(pos, true);
        g.cardFx?.(pick(CARDS.lines), this.got);
    }
}
