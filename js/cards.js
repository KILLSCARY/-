// «Карта» — вторая, редкая валюта. Девушка с банковской картой стоит у края дороги (за крайней полосой, путь
// не перекрывает). Пробежал мимо по соседней полосе — карта летит к герою и засчитывается (+1, сразу в профиль).
// Частота — лимит на забег (CARDS.perRun), не таймер: первая гарантированно после CARDS.firstAt м, вторая позже;
// во время погони Мизулиной, сюжетной погони и боя с боссом — не появляется (ждёт, пока станет тихо).
// Девушки — пул (CARDS.perRun штук), модель — та же girl_npc.glb, что у прохожих, карта — одна общая геометрия.
import * as THREE from "./vendor/three.module.js";
import { CARDS, NPCS } from "./config.js";

const pick = (a) => a[Math.floor(Math.random() * a.length)];

function cardTexture() {
    const c = document.createElement("canvas");
    c.width = 256; c.height = 160;
    const x = c.getContext("2d");
    const g = x.createLinearGradient(0, 0, 256, 160);
    g.addColorStop(0, "#f7d774"); g.addColorStop(0.55, "#d9a43a"); g.addColorStop(1, "#8a5a17");
    x.fillStyle = g; x.beginPath(); x.moveTo(18, 0); x.arcTo(256, 0, 256, 160, 18); x.arcTo(256, 160, 0, 160, 18); x.arcTo(0, 160, 0, 0, 18); x.arcTo(0, 0, 256, 0, 18); x.closePath(); x.fill(); // без roundRect — его нет на iOS 15
    x.fillStyle = "#c9c9c9"; x.fillRect(28, 52, 44, 34);                 // чип
    x.strokeStyle = "#7d7d7d"; x.lineWidth = 2; x.strokeRect(28, 52, 44, 34);
    x.fillStyle = "#1f6e3e"; x.font = "bold 22px sans-serif";
    x.fillText("•••• •••• •••• 2030", 28, 122);
    x.fillStyle = "#35e39b"; x.beginPath(); x.arc(212, 128, 16, 0, 7); x.fill();
    x.fillStyle = "#ffcf3a"; x.beginPath(); x.arc(232, 128, 16, 0, 7); x.fill();
    const t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding;
    return t;
}

export class CardGirls {
    constructor(game) {
        this.g = game;
        this.pool = [];
        this.cardGeo = new THREE.BoxGeometry(0.34, 0.215, 0.012);
        this.cardMat = new THREE.MeshStandardMaterial({ map: cardTexture(), metalness: 0.6, roughness: 0.25, emissive: 0x6a4a10, emissiveIntensity: 0.5 });
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
            card.scale.setScalar(1 / (s.x || 1));
            card.position.set(0, 12, 4); card.rotation.set(0.3, 0, 0.2);
            hand.add(card);
        } else { card.position.set(0.35, 1.05, 0.2); g.add(card); }
        g.userData.card = card;
        g.userData.cardHome = { p: card.position.clone(), r: card.rotation.clone(), s: card.scale.clone(), parent: card.parent };
        g.add(this.halo());
        w.scene.add(g);
        this.pool.push(g);
        return g;
    }

    // золотистое кольцо на асфальте — видно издалека, что у девушки карта
    halo() {
        const r = new THREE.Mesh(new THREE.RingGeometry(0.45, 0.6, 32), new THREE.MeshBasicMaterial({ color: 0xffcf3a, transparent: true, opacity: 0.55, depthWrite: false }));
        r.rotation.x = -Math.PI / 2; r.position.y = 0.03;
        return r;
    }

    blocked() {
        const g = this.g;
        return g.stumble > 0 || g.chaser?.visible || g.storyChasing?.() || g.bossCalm || g.bossFight || g.storyCatch;
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
