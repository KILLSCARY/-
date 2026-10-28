// «Карта» — вторая, редкая валюта. Девушка с банковской картой стоит у края дороги (за крайней полосой, путь
// не перекрывает). Пробежал мимо по соседней полосе — карта летит к герою и засчитывается (+1, сразу в профиль).
// Частота — лимит на забег (CARDS.perRun), не таймер: первая гарантированно после CARDS.firstAt м, вторая позже;
// во время погони Мизулиной, сюжетной погони и боя с боссом — не появляется (ждёт, пока станет тихо).
// Девушки — пул (CARDS.perRun штук), модель — та же girl_npc.glb, что у прохожих, карта — одна общая геометрия.
import * as THREE from "./vendor/three.module.js";
import { CARDS, NPCS, CARDS_DURING_STORY_CHASE } from "./config.js";

const pick = (a) => a[Math.floor(Math.random() * a.length)];

// обычная банковская карта без банка: чип, магнитная полоса сверху, пустые строки вместо номера и имени (v5 команды)
function cardTexture() {
    const c = document.createElement("canvas");
    c.width = 256; c.height = 160;
    const x = c.getContext("2d");
    const rr = (X, Y, w, h, r) => { x.beginPath(); x.moveTo(X + r, Y); x.arcTo(X + w, Y, X + w, Y + h, r); x.arcTo(X + w, Y + h, X, Y + h, r); x.arcTo(X, Y + h, X, Y, r); x.arcTo(X, Y, X + w, Y, r); x.closePath(); }; // без roundRect — его нет на iOS 15
    const g = x.createLinearGradient(0, 0, 256, 160);
    g.addColorStop(0, "#ffe68a"); g.addColorStop(0.5, "#e0a93c"); g.addColorStop(1, "#9a5f1c");
    x.fillStyle = g; rr(0, 0, 256, 160, 18); x.fill();
    x.fillStyle = "#3a2410"; x.fillRect(0, 18, 256, 26);                       // магнитная полоса
    x.fillStyle = "#d9d9d9"; rr(26, 62, 42, 32, 5); x.fill();                  // чип
    x.strokeStyle = "#8a8a8a"; x.lineWidth = 2; x.strokeRect(34, 62, 0.1, 32); x.strokeRect(26, 78, 42, 0.1);
    x.fillStyle = "rgba(31,110,62,.85)";                                       // зелёные строки — без цифр
    rr(26, 110, 150, 10, 5); x.fill();
    rr(26, 130, 90, 8, 4); x.fill();
    x.strokeStyle = "rgba(255,255,255,.55)"; x.lineWidth = 4; rr(3, 3, 250, 154, 16); x.stroke(); // блик по кромке
    const t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding;
    return t;
}

// мягкое тёплое свечение (аддитивный спрайт) — без источника света: число ламп в сцене не меняем
function glowTexture() {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const x = c.getContext("2d"), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, "rgba(255,236,150,1)"); g.addColorStop(0.35, "rgba(255,200,70,.55)"); g.addColorStop(1, "rgba(255,170,40,0)");
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
}

export class CardGirls {
    constructor(game) {
        this.g = game;
        this.pool = [];
        const k = CARDS.cardSize;
        this.cardGeo = new THREE.BoxGeometry(0.34 * k, 0.215 * k, 0.014);
        const tex = cardTexture();
        // светится сама (emissiveMap) — читается и под красными и синими мигалками улицы
        this.cardMat = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.9, metalness: 0.4, roughness: 0.3 });
        this.glowMat = new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffd36a, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
        this.beamMat = new THREE.MeshBasicMaterial({ color: 0xffc94a, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
        this.beamGeo = new THREE.CylinderGeometry(0.16, 0.24, 3.2, 16, 1, true); // тонкий луч
        this.girlMats = new Map(); // свои материалы девушки с картой: тёплая подсветка (у прохожих — без)
        this._q = new THREE.Quaternion();
        this.flying = [];
        this.reset();
    }

    reset() {
        this.spawned = 0;
        this.got = 0;
        this.nextAt = CARDS.firstAt;
        for (const p of this.pool) { p.visible = false; p.userData.active = false; }
        for (const f of this.flying) f.visible = false;
        this.flying.length = 0;
    }

    makeGirl() {
        const w = this.g.world, m = w.npcModels.girl;
        if (!m) return null; // модель ещё грузится — попробуем на следующем кадре
        const g = w.rig(m, NPCS.girl.idle);
        const act = g.userData.mixer?._actions[0];
        if (act) act.timeScale = CARDS.idleSpeed; // медленный танец — покачивание на месте
        const card = new THREE.Mesh(this.cardGeo, this.cardMat);
        let hand = null;
        g.traverse((o) => { if (!hand && /RightHand$/.test(o.name)) hand = o; });
        if (hand) { // карта в правой руке: масштаб кости компенсируем (модель уменьшена через scale)
            const s = new THREE.Vector3(); hand.getWorldScale(s);
            card.scale.setScalar(1.6 / (s.x || 1)); // ×1.6 — читается издалека
            card.position.set(0, 14, 6);
            hand.add(card);
            g.userData.cardFace = true;
        } else { card.position.set(0.35, 1.05, 0.2); g.add(card); }
        g.userData.card = card;
        g.userData.cardHome = { p: card.position.clone(), r: card.rotation.clone(), s: card.scale.clone(), parent: card.parent };
        // тёплая подсветка девушки: свой клон материала с золотым emissive
        g.traverse((o) => {
            if (!o.isMesh || o === card) return;
            const mats = Array.isArray(o.material) ? o.material : [o.material];
            const warm = mats.map((m) => {
                if (!this.girlMats.has(m)) { const c = m.clone(); c.emissive = new THREE.Color(CARDS.girlGlow); c.emissiveIntensity = 0.55; this.girlMats.set(m, c); }
                return this.girlMats.get(m);
            });
            o.material = Array.isArray(o.material) ? warm : warm[0];
        });
        const glow = new THREE.Sprite(this.glowMat);
        glow.scale.setScalar(0.9);
        card.add(glow);
        g.userData.cardGlow = glow;
        const beam = new THREE.Mesh(this.beamGeo, this.beamMat);
        beam.position.y = 1.6;
        g.add(beam);
        g.add(this.halo());
        w.scene.add(g);
        this.pool.push(g);
        return g;
    }

    // золотистое кольцо на асфальте — видно издалека, что у девушки карта
    halo() {
        const r = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.8, 32), new THREE.MeshBasicMaterial({ color: 0xffcf3a, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
        r.rotation.x = -Math.PI / 2; r.position.y = 0.03;
        return r;
    }

    blocked() {
        const g = this.g;
        return g.stumble > 0 || g.chaser?.visible || (!CARDS_DURING_STORY_CHASE && g.storyChasing?.()) || g.bossCalm || g.bossFight || g.storyCatch;
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
        Object.assign(girl.userData, { active: true, lane: side, taken: false, missed: false });
        girl.visible = true;
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
            p.position.z += move;
            p.userData.mixer?.update(dt);
            if (p.userData.cardFace && !p.userData.taken) { // карта лицом к камере, как бы ни крутилась рука
                const c = p.userData.card, cam = g.camera;
                if (cam) { c.parent.getWorldQuaternion(this._q); c.quaternion.copy(this._q.invert().multiply(cam.quaternion)); }
            }
            if (p.userData.cardGlow) p.userData.cardGlow.material.opacity = 0.75 + Math.sin(performance.now() / 180) * 0.25;
            const u = p.userData;
            // пробегает мимо по соседней (крайней) полосе — карта его
            if (!u.taken && p.position.z > -0.8 && p.position.z < 1.2 && g.lane === u.lane && g.state === "playing") {
                u.taken = true;
                this.collect(p);
            }
            if (!u.taken && !u.missed && p.position.z > 1.4) { u.missed = true; g.cardMissed?.(); } // пробежал не по той полосе — карта сгорела
            if (p.position.z > 12) { u.active = false; p.visible = false; }
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

    collect(p) {
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
        g.cardFx?.(pick(CARDS.lines));
    }
}
