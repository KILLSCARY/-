// Ночной район: мокрый асфальт, хрущёвки с окнами, рольставни, красные лампы у подъездов,
// оранжевые фонари, дождь. Плюс препятствия и монеты, которые едут навстречу крысу.
// Фасады и асфальт — текстуры из папки textures/ (см. TEXTURES в config.js),
// гофрометалл и бетон цоколя — Poly Haven (CC0).

import * as THREE from "./vendor/three.module.js";
import { Reflector } from "./vendor/jsm/Reflector.js";
import { TEXTURES, BANKS, ATMS, MODELS, SPRITES, OBSTACLE_MIX, POWERUPS, POWERUP_SPAWN, POLICE_OFFICER, CLIENT_TYPES, CHARACTERS, CHASER, NPCS, SKY, WIND } from "./config.js";
import { clone as cloneSkinned } from "./vendor/jsm/SkeletonUtils.js";
import { mergeBufferGeometries } from "./vendor/jsm/BufferGeometryUtils.js";
import { loadModel, later } from "./models.js";

const SPAWN_Z = -95;   // где появляются предметы
const DESPAWN_Z = 12;  // где исчезают (уже за камерой)
const STREET_LEN = 160;
const BEHIND_Z = 45;   // улица тянется и за спину крыса — её видно с камеры меню
const FLOOR_H = 2.9;
const CAR_FRONT = { x: 0.5, y: 0.58, z: 2.12 }; // фары машины, собранной в коде (makeCar)
// размеры для столкновений процедурных препятствий: halfZ — полудлина, top — что перепрыгнуть, oncoming — едет навстречу (м/с)
const OBSTACLE_STATS = {
    dumpster: { halfZ: 0.55, top: 1.15 },
    barrier: { halfZ: 0.3 },
    atm: { halfZ: 0.55 },
    car: { halfZ: 2.2, oncoming: 6 },
};

const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

const loader = new THREE.TextureLoader();

// одна загрузка на файл; копии (свой repeat у каждой) обновляются, когда картинка пришла —
// раньше needsUpdate без картинки заставлял three.js ругаться в консоль каждый кадр
const texCache = {};
function loadTex(file, repeat, srgb) {
    let entry = texCache[file];
    if (!entry) {
        entry = texCache[file] = { copies: [], ready: false };
        entry.tex = new THREE.Texture();
        const load = () => loader.load(`textures/${file}`, (img) => {
            entry.tex.image = img.image; // источник общий у всех копий
            entry.ready = true;
            for (const c of entry.copies) c.needsUpdate = true;
        });
        // улица и дома видны в меню сразу; витрины банков и банкоматы подождут героя
        if (/^(bank_|atm)/.test(file)) later(load); else load();
    }
    const t = new THREE.Texture(); // не clone(): он ставит needsUpdate ещё до загрузки картинки
    t.source = entry.tex.source;
    if (entry.ready) t.needsUpdate = true;
    else entry.copies.push(t);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(...repeat);
    t.anisotropy = 8;
    if (srgb) t.encoding = THREE.sRGBEncoding;
    return t;
}

// Склеить неподвижные детали группы с одинаковым материалом в одну сетку: дом из 10–15 коробок
// рисуется за 3–5 вызовов вместо 10–15. Детали с userData, дочерними объектами или массивом материалов не трогаем.
function mergeStatic(g) {
    const byMat = new Map();
    for (const m of [...g.children]) {
        if (!m.isMesh || m.children.length || Array.isArray(m.material) || Object.keys(m.userData).length) continue;
        m.updateMatrix();
        const geo = m.geometry.clone();
        geo.applyMatrix4(m.matrix);
        for (const name of Object.keys(geo.attributes)) if (!["position", "normal", "uv"].includes(name)) geo.deleteAttribute(name);
        const list = byMat.get(m.material) || [];
        list.push({ m, geo });
        byMat.set(m.material, list);
    }
    for (const [mat, list] of byMat) {
        if (list.length < 2) continue;
        const merged = mergeBufferGeometries(list.map((x) => x.geo));
        if (!merged) continue;
        for (const { m } of list) g.remove(m);
        const mesh = new THREE.Mesh(merged, mat);
        mesh.receiveShadow = true;
        mesh.castShadow = list.some((x) => x.m.castShadow);
        g.add(mesh);
    }
}

// Случайный фасад с учётом weight
function pickFacade() {
    const list = TEXTURES.facades;
    let r = Math.random() * list.reduce((s, f) => s + (f.weight ?? 1), 0);
    for (let i = 0; i < list.length; i++) if ((r -= list[i].weight ?? 1) < 0) return i;
    return 0;
}

// maps: какие карты есть у текстуры, кроме diff: "nor", "rough", "glow"
function pbr(name, repeat, maps = ["nor", "rough"]) {
    const out = { map: loadTex(`${name}_diff.jpg`, repeat, true) };
    if (maps.includes("nor")) out.normalMap = loadTex(`${name}_nor.jpg`, repeat);
    if (maps.includes("rough")) out.roughnessMap = loadTex(`${name}_rough.jpg`, repeat);
    if (maps.includes("glow")) out.emissiveMap = loadTex(`${name}_glow.jpg`, repeat, true);
    return out;
}

function roundRect(g, x, y, w, h, r) {
    const R = typeof r === "number" ? { tl: r, tr: r, br: r, bl: r } : r;
    g.beginPath();
    g.moveTo(x + R.tl, y);
    g.lineTo(x + w - R.tr, y); g.quadraticCurveTo(x + w, y, x + w, y + R.tr);
    g.lineTo(x + w, y + h - R.br); g.quadraticCurveTo(x + w, y + h, x + w - R.br, y + h);
    g.lineTo(x + R.bl, y + h); g.quadraticCurveTo(x, y + h, x, y + h - R.bl);
    g.lineTo(x, y + R.tl); g.quadraticCurveTo(x, y, x + R.tl, y);
    g.closePath();
}

// одна строка: уменьшаем шрифт, пока не влезет в maxW (результат — в g.__line, шрифт уже выставлен)
function fitText(g, text, maxW, size, font) {
    for (let s = size; s >= 24; s -= 2) {
        g.font = font.replace("{s}", s);
        if (g.measureText(text).width <= maxW) break;
    }
    g.__line = text;
}

// несколько строк по центру блока: подбираем размер, чтобы влезло по ширине и высоте
function wrapText(g, text, cx, top, maxW, maxH, font) {
    for (let s = 64; s >= 26; s -= 2) {
        g.font = font.replace("{s}", s);
        const words = text.split(" "), lines = [];
        let line = "";
        for (const w of words) {
            const t = line ? `${line} ${w}` : w;
            if (g.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t;
        }
        lines.push(line);
        const lh = s * 1.15;
        if (lines.length * lh <= maxH && lines.every((l) => g.measureText(l).width <= maxW)) {
            const y0 = top + (maxH - lines.length * lh) / 2 + s * 0.9;
            g.textAlign = "center";
            lines.forEach((l, i) => g.fillText(l, cx, y0 + i * lh));
            return;
        }
    }
}

function canvasTex(w, h, draw) {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    draw(c.getContext("2d"), w, h);
    const tex = new THREE.CanvasTexture(c);
    tex.encoding = THREE.sRGBEncoding;
    tex.anisotropy = 4;
    return tex;
}

function dashTexture() {
    return canvasTex(16, 256, (g, w, h) => {
        g.clearRect(0, 0, w, h);
        g.fillStyle = "rgba(235,228,215,0.75)";
        g.fillRect(2, 0, w - 4, h * 0.5);
        for (let i = 0; i < 60; i++) g.clearRect(rnd(0, w), rnd(0, h * 0.5), 2, 3); // стёртая краска
    });
}

function usdtTexture(label, bg, fg) {
    return canvasTex(128, 128, (g) => {
        g.fillStyle = bg;
        g.beginPath(); g.arc(64, 64, 62, 0, Math.PI * 2); g.fill();
        g.strokeStyle = "rgba(255,255,255,0.6)";
        g.lineWidth = 6;
        g.beginPath(); g.arc(64, 64, 52, 0, Math.PI * 2); g.stroke();
        g.fillStyle = fg;
        g.font = `bold ${label.length > 1 ? 54 : 78}px Arial Black, Arial, sans-serif`;
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText(label, 64, 70);
    });
}

function signTexture(text) {
    return canvasTex(256, 64, (g, w, h) => {
        for (let i = 0; i < 8; i++) {
            g.fillStyle = i % 2 ? "#f2f2f2" : "#d0121b";
            g.beginPath();
            g.moveTo(i * 36 - 20, h); g.lineTo(i * 36 + 12, 0); g.lineTo(i * 36 + 48, 0); g.lineTo(i * 36 + 16, h);
            g.fill();
        }
        g.fillStyle = "rgba(0,0,0,0.8)";
        g.fillRect(w * 0.18, 8, w * 0.64, h - 16);
        g.fillStyle = "#ff3b3b";
        g.font = "bold 34px Arial Black, Arial, sans-serif";
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText(text, w / 2, h / 2 + 2);
    });
}

function neonTexture(text) {
    return canvasTex(256, 64, (g, w, h) => {
        g.font = "bold 40px Arial Black, Arial, sans-serif";
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.shadowColor = "#ff2040";
        g.shadowBlur = 14;
        g.fillStyle = "#ffd0d6";
        g.fillText(text, w / 2, h / 2);
    });
}

// Окружение для отражений: тёмное небо, красное зарево у горизонта, россыпь окон.
// Мокрый асфальт, лужи, машины и металл отражают именно его.
export function buildEnvironment(renderer) {
    const env = new THREE.Scene();
    const sky = new THREE.Mesh(
        new THREE.SphereGeometry(50, 32, 16),
        new THREE.MeshBasicMaterial({
            side: THREE.BackSide,
            map: canvasTex(16, 256, (g, w, h) => {
                const grad = g.createLinearGradient(0, 0, 0, h);
                grad.addColorStop(0, SKY.zenith);
                grad.addColorStop(0.42, "#5a1424");
                grad.addColorStop(0.5, "#b0182a");
                grad.addColorStop(0.56, "#2a0509");
                grad.addColorStop(1, "#050102");
                g.fillStyle = grad;
                g.fillRect(0, 0, w, h);
            }),
        })
    );
    env.add(sky);
    const warm = new THREE.MeshBasicMaterial({ color: 0xffb060 });
    const red = new THREE.MeshBasicMaterial({ color: 0xff2030 });
    for (let i = 0; i < 120; i++) {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.6), Math.random() < 0.15 ? red : warm);
        const a = rnd(0, Math.PI * 2), y = rnd(2, 18);
        m.position.set(Math.cos(a) * 30, y, Math.sin(a) * 30);
        m.lookAt(0, y, 0);
        env.add(m);
    }
    const pmrem = new THREE.PMREMGenerator(renderer);
    const tex = pmrem.fromScene(env, 0.02).texture;
    pmrem.dispose();
    return tex;
}

export class World {
    constructor(scene, laneWidth, tier) {
        this.scene = scene;
        this.tier = tier;
        this.lanes = [-laneWidth, 0, laneWidth];
        this.obstacles = [];
        this.coins = [];        // и монеты, и баночки (userData.pickup)
        this.noPickups = false; // во время полёта новых баночек не нужно
        this.sincePickup = 0;
        this.playerX = 0;       // где герой по X (ставит игра) — для блика фар
        this.scenery = [];   // всё, что едет и переставляется в конец улицы

        this.swaps = {};
        this.warmQueue = []; // свежезагруженные модели: игра заранее соберёт их шейдеры и зальёт текстуры (Game.warmUp)
        this.officers = [];    // живые инспекторы у патрульных машин на обочине
        this.officerPosts = []; // машины, к которым поставить инспектора, когда загрузится модель
        this.critters = [];     // живые NPC со скелетом: девушки, кошки (анимация — только рядом)
        this.flocks = [];       // стайки голубей у бордюра
        this.npcModels = {};
        this.buildMaterials();
        this.buildStreet();
        this.buildRain();
        this.buildSplash();
        this.buildStreetLife();
        this.unclutter();
        this.loadObstacleModels();
        this.loadOfficer();
        this.loadIslam();
        this.buildWind();
        this.loadChaser();
        this.loadNpcs();
    }

    // Тротуар без наложений: у кого есть userData.foot (полуразмеры hx/hz), те не стоят друг в друге —
    // ни инспектор в машине, ни прохожая в банкомате. Ставим по очереди (prio: 0 — не двигать, дальше — по порядку),
    // мешает — сдвигаем вдоль тротуара. Всё на тротуаре едет вместе, так что расставить достаточно один раз.
    unclutter() {
        const items = this.scenery.filter((o) => o.userData.foot).sort((a, b) => (a.userData.foot.prio ?? 9) - (b.userData.foot.prio ?? 9));
        const placed = [];
        for (const o of items) {
            if (o.userData.foot.prio !== 0) this.placeFree(o, placed);
            placed.push(o);
        }
    }

    placeFree(o, others = this.scenery.filter((p) => p !== o && p.userData.foot)) {
        for (let i = 0; i < 80 && others.some((p) => this.footHit(o, p)); i++) {
            o.position.z -= 0.8;
            if (o.position.z < BEHIND_Z - STREET_LEN) o.position.z += STREET_LEN;
        }
    }

    footHit(a, b) {
        if (a === b || Math.sign(a.position.x) !== Math.sign(b.position.x)) return false;
        const fa = a.userData.foot, fb = b.userData.foot;
        let dz = Math.abs(a.position.z - b.position.z) % STREET_LEN;
        dz = Math.min(dz, STREET_LEN - dz); // улица закольцована
        return Math.abs(a.position.x - b.position.x) < fa.hx + fb.hx && dz < fa.hz + fb.hz;
    }

    // свободно ли место на обочине (для патрульной машины у поста на полосе)
    sidewalkFree(x, z, hx, hz) {
        const probe = { position: { x, z }, userData: { foot: { hx, hz } } };
        return !this.scenery.some((p) => p.userData.foot && this.footHit(probe, p));
    }

    lite(url) {
        return this.tier.lite ? url.replace("models/obj/", "models/obj/lite/") : url;
    }

    buildMaterials() {
        const wall = pbr("wall", [2, 2]);
        const iron = pbr("iron", [2, 1]);
        const std = (o) => new THREE.MeshStandardMaterial(o);
        this.mat = {
            facades: {}, // кэш материалов фасадов по (текстура, этажность) — см. facadeMaterial()
            trim: std({ ...wall, color: 0x4a403d }),
            plinth: std({ ...wall, color: 0x3a302d }),
            shutter: std({ ...iron, color: 0x8a8580, metalness: 0.6, roughness: 1 }),
            door: std({ color: 0x3b2a22, roughness: 0.7 }),
            ac: std({ color: 0x6a6660, roughness: 0.5, metalness: 0.3 }),
            pipe: std({ color: 0x4b4340, roughness: 0.5, metalness: 0.6 }),
            redLamp: new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 0.5, 0.4) }),
            sodium: new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 2.2, 0.7) }),
            pole: std({ color: 0x2b2624, roughness: 0.6, metalness: 0.7 }),
            neon: ["ОБМЕН 24/7", "P2P", "USDT", "КРИПТА", "КУРС ₮"].map((t) => new THREE.MeshBasicMaterial({
                map: neonTexture(t), transparent: true, color: new THREE.Color(2.5, 1.2, 1.3), depthWrite: false,
            })),
            dumpster: std({ ...iron, color: 0x3c5244, metalness: 0.7, roughness: 1 }),
            dumpsterLid: std({ color: 0x1d2620, roughness: 0.45, metalness: 0.7 }),
            post: std({ color: 0x9a9ea4, roughness: 0.35, metalness: 0.9 }),
            sign: std({ map: signTexture("БЛОК"), roughness: 0.5, emissive: 0x220000 }),
            rail: std({ ...iron, color: 0xb5b9be, metalness: 0.9, roughness: 0.7 }),
            car: [0x7a1f22, 0x252a36, 0x9c9a92, 0x1f3a2a, 0xd8d4c8].map((c) => std({ color: c, roughness: 0.18, metalness: 0.6, envMapIntensity: 1.5 })),
            glass: std({ color: 0x050608, roughness: 0.02, metalness: 1, envMapIntensity: 2 }),
            tire: std({ color: 0x0b0b0b, roughness: 0.9 }),
            chrome: std({ color: 0xdddddd, roughness: 0.15, metalness: 1 }),
            headlight: new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 5.5, 4) }),
            taillight: new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 0.2, 0.2) }),
            coin: std({ map: usdtTexture("₮", "#26a17b", "#fff"), metalness: 0.5, roughness: 0.3, emissive: 0x1a6a4a, emissiveIntensity: 0.6 }),
            coinEdge: std({ color: 0x1d7a5d, metalness: 0.9, roughness: 0.25 }),
            boost: std({ map: usdtTexture("×2", "#e9b730", "#3a2500"), metalness: 0.6, roughness: 0.3, emissive: 0x8a6000, emissiveIntensity: 0.8 }),
            boostEdge: std({ color: 0xb8860b, metalness: 1, roughness: 0.2 }),
            trash: std({ color: 0x0c0c0e, roughness: 0.25, metalness: 0.1 }),
        };
        const glowSpill = (color) => new THREE.MeshBasicMaterial({
            map: canvasTex(64, 64, (g2, w, h) => {
                const gr = g2.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2);
                gr.addColorStop(0, "rgba(255,255,255,0.55)");
                gr.addColorStop(1, "rgba(255,255,255,0)");
                g2.fillStyle = gr;
                g2.fillRect(0, 0, w, h);
            }),
            color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        });
        this.mat.banks = BANKS.list.map((b) => {
            const maps = pbr(b.name, [1, 1], ["glow"]);
            for (const t of [maps.map, maps.emissiveMap]) t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
            return {
                aspect: b.aspect,
                mat: new THREE.MeshStandardMaterial({ ...maps, emissive: 0xffffff, emissiveIntensity: 2.4, roughness: 0.6 }),
                spill: glowSpill(new THREE.Color(b.light)),
            };
        });
        this.mat.atms = ATMS.map((a) => {
            const maps = pbr(a.name, [1, 1], ["glow"]);
            for (const t of [maps.map, maps.emissiveMap]) t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
            return { aspect: a.aspect, light: a.light, front: new THREE.MeshStandardMaterial({ ...maps, emissive: 0xffffff, emissiveIntensity: 2.2, roughness: 0.4, metalness: 0.3 }) };
        });
        this.mat.atmBody = std({ ...iron, color: 0x3a3a3c, metalness: 0.8, roughness: 0.8 });
        this.mat.paint = new THREE.MeshPhysicalMaterial({ color: 0x9e0a12, metalness: 0.5, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 1.6 });

        this.glowTex = canvasTex(64, 64, (g2, w, h) => {
            const gr = g2.createRadialGradient(w / 2, h / 2, 1, w / 2, h / 2, w / 2);
            gr.addColorStop(0, "rgba(255,255,255,1)");
            gr.addColorStop(0.25, "rgba(255,255,255,0.5)");
            gr.addColorStop(1, "rgba(255,255,255,0)");
            g2.fillStyle = gr;
            g2.fillRect(0, 0, w, h);
        });
        this.geo = {
            glow: new THREE.PlaneGeometry(1, 1),
            coin: new THREE.CylinderGeometry(0.32, 0.32, 0.07, 24),
            box: new THREE.BoxGeometry(1, 1, 1),
            // бак и отбойник собираются на каждое появление — геометрии общие, иначе они копятся в памяти видеокарты
            dumpster: new THREE.BoxGeometry(1.3, 1.0, 1.0),
            dumpsterLid: new THREE.BoxGeometry(1.36, 0.07, 1.06),
            dumpsterRim: new THREE.BoxGeometry(1.38, 0.1, 0.08),
            wheel: new THREE.CylinderGeometry(0.08, 0.08, 0.06, 10),
            post: new THREE.BoxGeometry(0.1, 1.3, 0.1),
            rail: new THREE.BoxGeometry(1.75, 0.34, 0.12),
            lip: new THREE.BoxGeometry(1.75, 0.05, 0.2),
            sign: new THREE.BoxGeometry(0.9, 0.22, 0.03),
            beam: new THREE.PlaneGeometry(2.4, 7),
        };

        // Фары встречных машин — без настоящих источников света: светящиеся точки, пятно на асфальте
        // и блик в камеру (растёт, когда машина близко и в твоей полосе — см. updateSprites)
        const additive = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending };
        this.mat.headlamp = new THREE.SpriteMaterial({ map: this.glowTex, color: new THREE.Color(4, 3.6, 2.8), ...additive });
        this.mat.glare = new THREE.SpriteMaterial({ map: this.glowTex, color: new THREE.Color(1.5, 1.4, 1.15), opacity: 0.55, ...additive });
        this.mat.beam = new THREE.MeshBasicMaterial({
            // верх картинки — у машины (дальний край пятна): мягко разгорается у бампера и гаснет к игроку; края по ширине мягкие
            map: canvasTex(64, 256, (g2, w, h) => {
                const v = g2.createLinearGradient(0, 0, 0, h);
                v.addColorStop(0, "rgba(255,255,255,0)");
                v.addColorStop(0.12, "rgba(255,255,255,0.45)");
                v.addColorStop(1, "rgba(255,255,255,0)");
                g2.fillStyle = v;
                g2.fillRect(0, 0, w, h);
                g2.globalCompositeOperation = "destination-in";
                const s = g2.createLinearGradient(0, 0, w, 0);
                s.addColorStop(0, "rgba(0,0,0,0)");
                s.addColorStop(0.5, "rgba(0,0,0,1)");
                s.addColorStop(1, "rgba(0,0,0,0)");
                g2.fillStyle = s;
                g2.fillRect(0, 0, w, h);
            }),
            color: new THREE.Color(1.3, 1.15, 0.9), ...additive,
        });
    }

    // ---- окружение -------------------------------------------------------------------------

    buildStreet() {
        const s = this.scene;
        const centerZ = BEHIND_Z - STREET_LEN / 2;

        // мокрый асфальт. Под ним зеркало (Reflector), сам асфальт полупрозрачен там,
        // где текстура «мокрая» (низкая шероховатость) — через эти места видно отражения.
        const roadTex = pbr(TEXTURES.road, [1, STREET_LEN / 6]);
        this.roadMap = roadTex.map;
        this.roadRepeat = STREET_LEN / 6;
        this.roadMat = new THREE.MeshStandardMaterial({
            ...roadTex, alphaMap: roadTex.roughnessMap, transparent: true, opacity: 0.92,
            color: 0xb0a4a4, roughness: 0.75, metalness: 0.2, normalScale: new THREE.Vector2(1, 1), envMapIntensity: 0.8,
        });
        const roadMesh = new THREE.Mesh(new THREE.PlaneGeometry(6, STREET_LEN), this.roadMat);
        roadMesh.rotation.x = -Math.PI / 2;
        roadMesh.position.set(0, 0.002, centerZ);
        roadMesh.receiveShadow = true;
        roadMesh.renderOrder = 1;
        s.add(roadMesh);
        this.roadCenterZ = centerZ;

        // разметка между полосами
        this.dashMap = dashTexture();
        this.dashMap.wrapT = THREE.RepeatWrapping;
        this.dashMap.repeat.set(1, STREET_LEN / 8);
        const dashMat = new THREE.MeshStandardMaterial({ map: this.dashMap, transparent: true, roughness: 0.4, depthWrite: false });
        for (const x of [-0.85, 0.85]) {
            const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.12, STREET_LEN), dashMat);
            dash.rotation.x = -Math.PI / 2;
            dash.position.set(x, 0.006, centerZ);
            dash.renderOrder = 2;
            s.add(dash);
        }

        // тротуары и бордюр
        const walkTex = pbr(TEXTURES.sidewalk, [1.5, STREET_LEN / 3]);
        this.walkMap = walkTex.map;
        this.walkRepeat = STREET_LEN / 3;
        const walkMat = new THREE.MeshStandardMaterial({ ...walkTex, color: 0xc8bcb8, roughness: 0.9, envMapIntensity: 0.6 });
        for (const side of [-1, 1]) {
            const w = new THREE.Mesh(new THREE.BoxGeometry(4, 0.18, STREET_LEN), walkMat);
            w.position.set(side * 5, 0.09, centerZ);
            w.receiveShadow = true;
            const curb = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.24, STREET_LEN), this.mat.trim);
            curb.position.set(side * 3.05, 0.12, centerZ);
            curb.receiveShadow = true;
            s.add(w, curb);
        }

        // зарево в конце улицы
        const glow = new THREE.Mesh(
            new THREE.PlaneGeometry(90, 50),
            new THREE.MeshBasicMaterial({
                map: canvasTex(256, 128, (g, w, h) => {
                    const grad = g.createRadialGradient(w / 2, h * 0.75, 2, w / 2, h * 0.75, w * 0.45);
                    grad.addColorStop(0, "rgba(255,90,70,1)");
                    grad.addColorStop(0.3, "rgba(170,20,35,0.7)");
                    grad.addColorStop(1, "rgba(40,4,8,0)");
                    g.fillStyle = grad;
                    g.fillRect(0, 0, w, h);
                }),
                transparent: true, fog: false, depthWrite: false,
            })
        );
        glow.position.set(0, 8, -150);
        s.add(glow);

        // хрущёвки по обе стороны, переставляются по кругу
        const slot = 16;
        for (const side of [-1, 1]) {
            for (let i = 0; i < STREET_LEN / slot; i++) {
                this.scenery.push(this.makeBuilding(side, BEHIND_Z - 5 - i * slot, slot));
            }
        }

        // банкоматы на тротуарах
        for (let i = 0; i < 5; i++) {
            const atm = this.makeAtm();
            const side = i % 2 ? 1 : -1;
            atm.position.set(side * rnd(4.0, 4.6), 0.18, BEHIND_Z - 15 - i * 32);
            atm.rotation.y = atm.userData.faceY = -side * 0.6; // лицом к дороге
            atm.userData.foot = { hx: 0.8, hz: 0.75, prio: 2 };
            this.registerSwap("atm", atm);
            atm.userData.loop = STREET_LEN;
            atm.traverse((m) => { if (m.isMesh) m.castShadow = true; });
            s.add(atm);
            this.scenery.push(atm);
        }

        // фонарные столбы с оранжевыми лампами
        for (let i = 0; i < 8; i++) {
            const side = i % 2 ? 1 : -1;
            const pole = this.makeStreetLamp(side);
            pole.position.set(side * 3.5, 0, BEHIND_Z - 10 - i * 20);
            pole.userData.loop = STREET_LEN;
            pole.userData.foot = { hx: 0.25, hz: 0.25, prio: 0 }; // столбы не двигаются
            s.add(pole);
            this.scenery.push(pole);
        }

        // настоящих источников света немного (дорого): красные у подъездов + оранжевые фонари
        this.lights = [];
        // каждый источник считается в каждом пикселе каждого материала — на телефоне их меньше
        for (let i = 0; i < this.tier.lights; i++) {
            const red = i % 2 === 0;
            const light = new THREE.PointLight(red ? 0xff2a1a : 0xff8a3a, red ? 3.5 : 3, 14, 1.6);
            const side = i % 2 ? 1 : -1;
            light.position.set(side * (red ? 6 : 3.3), red ? 2.6 : 5, -i * 22);
            light.userData = { loop: Math.max(44, this.tier.lights * 22) };
            s.add(light);
            this.lights.push(light);
        }

        // мусорные пакеты на тротуарах
        for (let i = 0; i < (this.tier.lite ? 12 : 26); i++) {
            const bag = new THREE.Mesh(new THREE.SphereGeometry(rnd(0.22, 0.42), 10, 8), this.mat.trash);
            bag.scale.set(1, rnd(0.6, 0.8), 1.1);
            bag.position.set(pick([-1, 1]) * rnd(6.3, 6.8), 0.3, BEHIND_Z - rnd(0, STREET_LEN)); // у стены, за дорожкой гуляющих
            bag.userData.loop = STREET_LEN;
            s.add(bag);
            this.scenery.push(bag);
        }
    }

    // зеркало под дорогой: в нём дома, окна, фонари и фары — эффект мокрого асфальта
    enableReflections(width, height) {
        if (this.reflector) return;
        this.reflector = new Reflector(new THREE.PlaneGeometry(6, STREET_LEN), {
            textureWidth: width, textureHeight: height, color: new THREE.Color(0.42, 0.4, 0.4),
        });
        this.reflector.rotation.x = -Math.PI / 2;
        this.reflector.position.set(0, 0, this.roadCenterZ);
        this.reflector.renderOrder = 0;
        this.scene.add(this.reflector);
        this.roadMat.transparent = true; // сквозь «мокрые» места асфальта видно зеркало
        this.roadMat.alphaMap = this.roadMat.roughnessMap;
        this.roadMat.needsUpdate = true;
    }

    disableReflections() {
        // асфальт делаем непрозрачным всегда: на телефоне зеркала не было с самого начала, но прозрачность стояла
        if (this.reflector) {
            this.scene.remove(this.reflector);
            this.reflector.dispose();
            this.reflector = null;
        }
        if (!this.roadMat.transparent) return;
        this.roadMat.transparent = false;
        this.roadMat.alphaMap = null;
        this.roadMat.needsUpdate = true;
    }

    makeStreetLamp(side) {
        const g = new THREE.Group();
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 5.4, 8), this.mat.pole);
        pole.position.y = 2.7;
        const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.2, 6), this.mat.pole);
        arm.rotation.z = Math.PI / 2;
        arm.position.set(-side * 0.55, 5.3, 0);
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.25), this.mat.pole);
        head.position.set(-side * 1.1, 5.25, 0);
        const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.05, 0.18), this.mat.sodium);
        bulb.position.set(-side * 1.1, 5.18, 0);
        g.add(pole, arm, head, bulb);
        mergeStatic(g);
        return g;
    }

    // Материал фасада: картинка дома натянута на всю высоту, по ширине виден кусок len метров
    // (variant сдвигает его, чтобы соседние дома не были одинаковыми); окна горят (bloom)
    facadeMaterial(index, len, variant) {
        const key = `${index}_${variant}`;
        if (this.mat.facades[key]) return this.mat.facades[key];
        const f = TEXTURES.facades[index];
        const h = f.floors * FLOOR_H + 0.8;
        const share = Math.min(1, len / (h * f.aspect)); // какая доля ширины картинки помещается на дом
        const maps = pbr(f.name, [share, 1], ["nor", "glow"]);
        maps.map.offset.x = maps.normalMap.offset.x = maps.emissiveMap.offset.x = (1 - share) * variant / 2;
        const m = new THREE.MeshStandardMaterial({
            ...maps, color: 0xffffff, roughness: 0.92, emissive: 0xffffff, emissiveIntensity: 2.2,
            normalScale: new THREE.Vector2(1.4, 1.4), envMapIntensity: 0.5,
        });
        this.mat.facades[key] = m;
        return m;
    }

    // Панелька: фасад-текстура с окнами, карниз, водосток, кондиционеры;
    // первый этаж — магазины: подъезд с красной лампой, рольставни, иногда неон.
    makeBuilding(side, z, slot) {
        const g = new THREE.Group();
        const fi = pickFacade();
        const f = TEXTURES.facades[fi];
        const floors = f.floors;
        const h = floors * FLOOR_H + 0.8;
        const len = slot - 1.2;
        const depth = 8;
        const face = -side * depth / 2; // x фасада, смотрящего на дорогу (в координатах группы)
        const out = -side;              // направление «наружу», к дороге

        const wall = new THREE.Mesh(this.geo.box, this.facadeMaterial(fi, len, Math.floor(Math.random() * 3)));
        wall.scale.set(depth, h, len);
        wall.position.y = h / 2;
        wall.receiveShadow = true;
        g.add(wall);

        const roof = new THREE.Mesh(this.geo.box, this.mat.trim);
        roof.scale.set(depth + 0.4, 0.35, len + 0.4);
        roof.position.y = h + 0.17;
        g.add(roof);
        if (!f.ground) { // первый этаж: бетонный пояс магазинов поверх окон (у домов со своими подъездами — не нужен)
            const band = new THREE.Mesh(this.geo.box, this.mat.plinth);
            band.scale.set(0.3, 3.2, len + 0.02);
            band.position.set(face + out * 0.15, 1.6, 0);
            g.add(band);
        }

        for (let i = 0; i < 3; i++) { // кондиционеры (у фасадов с подъездами они уже нарисованы)
            if (f.ground || Math.random() < 0.4) continue;
            const ac = new THREE.Mesh(this.geo.box, this.mat.ac);
            ac.scale.set(0.35, 0.5, 0.75);
            ac.position.set(face + out * 0.2, FLOOR_H * (1 + Math.floor(Math.random() * (floors - 1))) + 0.6, rnd(-len / 2 + 1, len / 2 - 1));
            g.add(ac);
        }

        // водосточная труба
        const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, h, 6), this.mat.pipe);
        pipe.position.set(face + out * 0.12, h / 2, len / 2 - 0.4);
        g.add(pipe);

        const front = face + out * 0.3; // лицевая плоскость пояса первого этажа
        if (!f.ground) this.addEntrance(g, front, out, len);
        mergeStatic(g);

        g.position.set(side * 11, 0, z);
        g.userData.loop = STREET_LEN;
        this.scene.add(g);
        // отделение банка: павильон Сбера/Альфы перед домом (дом отодвигается назад)
        if (Math.random() < BANKS.chance) {
            const bank = new THREE.Group();
            bank.userData = { side, house: g, front, out };
            this.registerSwap("bank", bank);
            g.add(bank);
        }
        // неоновая вывеска «ОБМЕН 24/7» над подъездом — лицом к дороге
        if (Math.random() < 0.3) {
            const sign = new THREE.Group();
            sign.position.set(front + out * 0.12, f.ground ? 3.4 : 3.15, 0);
            sign.userData.faceY = out * Math.PI / 2;
            this.registerSwap("sign", sign);
            g.add(sign);
        }
        return g;
    }

    // Обычный первый этаж: подъезд с красной лампой, рольставни, иногда неон
    addEntrance(g, front, out, len) {
        const door = new THREE.Mesh(this.geo.box, this.mat.door);
        door.scale.set(0.12, 2.1, 1.2);
        door.position.set(front + out * 0.05, 1.05 + 0.3, 0);
        const canopy = new THREE.Mesh(this.geo.box, this.mat.trim);
        canopy.scale.set(1.0, 0.1, 2.0);
        canopy.position.set(front + out * 0.5, 2.75, 0);
        const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), this.mat.redLamp);
        lamp.position.set(front + out * 0.18, 2.55, 0);
        const steps = new THREE.Mesh(this.geo.box, this.mat.trim);
        steps.scale.set(1.0, 0.3, 1.8);
        steps.position.set(front + out * 0.5, 0.33, 0);
        g.add(door, canopy, lamp, steps);

        for (const dz of [-len / 3.2, len / 3.2]) {
            if (Math.random() < 0.25) continue;
            const sh = new THREE.Mesh(this.geo.box, this.mat.shutter);
            sh.scale.set(0.12, 2.1, 2.8);
            sh.position.set(front + out * 0.06, 1.25, dz);
            const box = new THREE.Mesh(this.geo.box, this.mat.pipe);
            box.scale.set(0.3, 0.3, 2.9);
            box.position.set(front + out * 0.15, 2.4, dz);
            g.add(sh, box);
        }

        if (Math.random() < 0.4) {
            const neon = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.6), pick(this.mat.neon));
            neon.rotation.y = out * Math.PI / 2;
            neon.position.set(front + out * 0.08, 3.0, pick([-len / 3.2, len / 3.2]));
            g.add(neon);
        }
    }

    placeBank(bank) {
        const { side, house } = bank.userData;
        const w = MODELS.bank[0].size;
        house.position.x = side * (11 + w + 0.5);
        bank.position.set(-side * (4 + w / 2 + 0.25), 0.18, 0);
        bank.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2; // вывеской к дороге
    }

    // Если модели павильонов не загрузились — фото-витрины на первом этаже
    bankFallback() {
        if (this.bankFallbackDone || this.modelFor("bank")) return;
        this.bankFallbackDone = true;
        for (const b of this.swaps.bank || []) this.addBankFront(b.userData.house, b.userData.front, b.userData.out);
    }

    // Отделение банка на первом этаже: фото-витрина со светящейся вывеской и банкоматом,
    // плюс цветное пятно света на мокром тротуаре перед ним
    addBankFront(g, front, out) {
        const bank = pick(this.mat.banks);
        const h = BANKS.height;
        const w = h * bank.aspect;
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(w, h), bank.mat);
        sign.rotation.y = out * Math.PI / 2;
        sign.position.set(front + out * 0.03, h / 2 + 0.1, 0);
        const spill = new THREE.Mesh(new THREE.PlaneGeometry(w * 1.1, 4), bank.spill);
        spill.rotation.set(-Math.PI / 2, 0, out * Math.PI / 2);
        spill.position.set(front + out * 2.1, 0.2, 0);
        spill.renderOrder = 3;
        g.add(sign, spill);
    }

    // ---- спрайты: вырезанные из концептов объекты (textures/sprites/*.webp) ------------------
    // Плоскость с альфой, всегда развёрнута к камере по вертикальной оси (см. update).

    spriteMaterial(name) {
        this.spriteMats ||= {};
        if (this.spriteMats[name]) return this.spriteMats[name];
        const t = new THREE.Texture();
        later(() => loader.load(`textures/sprites/${name}.webp`, (img) => { t.image = img.image; t.needsUpdate = true; m.visible = true; }));
        t.encoding = THREE.sRGBEncoding;
        t.anisotropy = 4;
        // лёгкое самосвечение, чтобы нарисованные объекты читались ночью
        const m = new THREE.MeshStandardMaterial({
            map: t, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: 0.32,
            alphaTest: 0.45, roughness: 0.85, metalness: 0.1, envMapIntensity: 0.3,
        });
        m.visible = false; // до загрузки картинки — не рисуем (иначе чёрный прямоугольник)
        this.spriteMats[name] = m;
        return m;
    }

    makeSprite(group) {
        const cfg = SPRITES[group];
        const v = pick(cfg.variants);
        const h = cfg.height, w = h * v.aspect;
        const geo = new THREE.PlaneGeometry(w, h);
        geo.translate(0, h / 2, 0);
        geo.userData.own = true;
        const mesh = new THREE.Mesh(geo, this.spriteMaterial(v.name));
        mesh.castShadow = true;
        const g = new THREE.Group();
        g.add(mesh);
        g.userData = { billboard: true, sprite: v.name, width: w, height: h };
        if (v.lamp) { // светящийся фонарь на объекте, пульсирует (см. updateSprites)
            const glow = new THREE.Mesh(this.geo.glow, new THREE.MeshBasicMaterial({
                map: this.glowTex, color: new THREE.Color(v.lamp.color).multiplyScalar(3), transparent: true,
                depthWrite: false, blending: THREE.AdditiveBlending,
            }));
            glow.scale.setScalar(h * 0.35);
            glow.position.set(v.lamp.x * w, v.lamp.y * h, 0.05);
            glow.material.userData.own = true;
            mesh.add(glow);
            g.userData.lamp = glow;
        }
        return g;
    }

    // Патрульная «пятёрка» у обочины: мигалка из двух светящихся пятен (красное/синее)
    makePoliceCar() {
        const g = this.makeSprite("police");
        const { width: w, height: h } = g.userData;
        for (const [k, color] of [[-1, 0xff2020], [1, 0x2050ff]]) {
            const glow = new THREE.Mesh(this.geo.glow, new THREE.MeshBasicMaterial({
                map: this.glowTex, color: new THREE.Color(color).multiplyScalar(3), transparent: true,
                depthWrite: false, blending: THREE.AdditiveBlending,
            }));
            glow.scale.setScalar(h * 0.45);
            glow.position.set(k * w * 0.1 + w * 0.08, h * 0.93, 0.05);
            glow.material.userData.own = true;
            g.children[0].add(glow);
            (g.userData.flashers ||= []).push(glow);
        }
        g.userData.police = true;
        return g;
    }

    addScenery(o, loop = STREET_LEN) {
        o.userData.loop = loop;
        this.scene.add(o);
        this.scenery.push(o);
        return o;
    }

    // Прохожие, патрули, урны и банки на тротуарах и обочинах
    buildStreetLife() {
        // все спрайты грузим сразу, чтобы препятствия не появлялись «пустыми»
        for (const cfg of Object.values(SPRITES)) for (const v of cfg.variants) this.spriteMaterial(v.name);
        const sideX = () => pick([-1, 1]);
        for (let i = 0; i < 6; i++) {
            const side = sideX();
            const girl = this.makeSprite("girl");
            girl.position.set(side * rnd(4.0, 5.2), 0.18, BEHIND_Z - rnd(10, STREET_LEN));
            girl.userData.faceY = -side * rnd(0.3, 0.9); // 3D-модель — к бегущему, вполоборота к дороге
            girl.userData.foot = { hx: 0.45, hz: 0.45 };
            this.addScenery(this.registerSwap("girl", girl));
        }
        for (let i = 0; i < 2; i++) {
            const side = i % 2 ? 1 : -1;
            const car = this.makePoliceCar();
            car.position.set(side * 4.6, 0.2, BEHIND_Z - 40 - i * 80); // на 2 см над тротуаром: шины не сливаются с его текстурой
            car.userData.faceY = -side * 0.35; // пост у обочины: машина вдоль дороги, инспектор лицом к бегущему
            car.userData.foot = { hx: 1.2, hz: 2.6, prio: 1 };
            this.addScenery(this.registerSwap("police", car));
            this.officerPosts.push({ car, side });
        }
        for (let i = 0; i < 10; i++) {
            const bin = this.makeSprite("bin");
            bin.position.set(sideX() * rnd(3.4, 3.7), 0.18, BEHIND_Z - rnd(0, STREET_LEN));
            bin.userData.faceY = rnd(0, Math.PI * 2);
            bin.userData.foot = { hx: 0.4, hz: 0.4 };
            this.addScenery(this.registerSwap("bin", bin));
        }
        for (let i = 0; i < 14; i++) { // банки валяются и на дороге — просто мусор, не мешают
            const can = this.makeSprite("can");
            const onRoad = Math.random() < 0.5;
            can.position.set(onRoad ? rnd(-2.8, 2.8) : sideX() * rnd(3.3, 6.5), onRoad ? 0 : 0.18, BEHIND_Z - rnd(0, STREET_LEN));
            can.userData.faceY = rnd(0, Math.PI * 2);
            this.addScenery(this.registerSwap("can", can));
        }
        // свет мигалок: одна пара реальных источников ездит за ближайшей патрульной машиной
        if (!this.tier.police) return; // мигалки без настоящего света: только светящиеся пятна (bloom)
        this.policeLights = [0xff1a1a, 0x1a3aff].map((c) => {
            const l = new THREE.PointLight(c, 0, 12, 1.6);
            this.scene.add(l);
            return l;
        });
    }

    buildRain() {
        const n = this.tier.rain;
        const pos = new Float32Array(n * 6);
        this.rainSpeed = new Float32Array(n);
        for (let i = 0; i < n; i++) {
            const x = rnd(-9, 9), y = rnd(0, 14), z = rnd(-40, 6);
            pos.set([x, y, z, x + 0.03, y - 0.45, z + 0.12], i * 6);
            this.rainSpeed[i] = rnd(18, 26);
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
        this.rain = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xc89090, transparent: true, opacity: 0.16 }));
        this.scene.add(this.rain);
    }

    // брызги из луж: пул мелких капель
    buildSplash() {
        this.drops = [];
        const geo = new THREE.SphereGeometry(0.04, 5, 4);
        const mat = new THREE.MeshBasicMaterial({ color: 0xffdcdc, transparent: true, opacity: 0.75 });
        for (let i = 0; i < 80; i++) {
            const d = new THREE.Mesh(geo, mat);
            d.visible = false;
            d.userData.v = new THREE.Vector3();
            this.scene.add(d);
            this.drops.push(d);
        }
        this.nextDrop = 0;

        // кольца волны на луже (подкат, приземление) и вспышки собранных монет — свои пулы,
        // у каждого свой материал (прозрачность своя), ничего не создаётся во время забега
        const ringTex = canvasTex(128, 128, (g, w, h) => {
            const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
            gr.addColorStop(0.5, "rgba(255,255,255,0)");
            gr.addColorStop(0.8, "rgba(255,255,255,0.9)");
            gr.addColorStop(1, "rgba(255,255,255,0)");
            g.fillStyle = gr;
            g.fillRect(0, 0, w, h);
        });
        this.rings = Array.from({ length: 6 }, () => {
            const r = new THREE.Mesh(this.geo.glow, new THREE.MeshBasicMaterial({
                map: ringTex, color: 0xffd8d0, transparent: true, depthWrite: false, opacity: 0,
            }));
            r.rotation.x = -Math.PI / 2;
            r.renderOrder = 3;
            r.visible = false;
            r.userData = { t: 0, dur: 0.4, size: 1 };
            this.scene.add(r);
            return r;
        });
        this.flashes = Array.from({ length: 6 }, () => {
            const f = new THREE.Sprite(new THREE.SpriteMaterial({
                map: this.glowTex, color: new THREE.Color(1.6, 3.2, 2.3), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
            }));
            f.visible = false;
            f.userData = { t: 0 };
            this.scene.add(f);
            return f;
        });
        this.nextRing = this.nextFlash = 0;
    }

    // волна по луже: кольцо расходится и гаснет
    ring(x, z, size = 1.6, dur = 0.45) {
        const r = this.rings[this.nextRing];
        this.nextRing = (this.nextRing + 1) % this.rings.length;
        r.position.set(x, 0.03, z);
        Object.assign(r.userData, { t: 0, dur, size });
        r.visible = true;
    }

    // «усы» брызг из-под героя в подкате: по капле влево и вправо
    spray(x, z) {
        for (const sx of [-1, 1]) {
            const d = this.drops[this.nextDrop];
            this.nextDrop = (this.nextDrop + 1) % this.drops.length;
            d.visible = true;
            d.position.set(x + sx * 0.25, 0.05, z + 0.2);
            d.userData.v.set(sx * rnd(2.5, 4), rnd(1.5, 2.8), rnd(1, 2.5));
        }
    }

    // вспышка на месте собранной монеты; gold — монета TRX
    flash(pos, gold = false) {
        const f = this.flashes[this.nextFlash];
        this.nextFlash = (this.nextFlash + 1) % this.flashes.length;
        f.position.copy(pos);
        f.material.color.setRGB(...(gold ? [2.4, 1.8, 0.6] : [0.9, 1.8, 1.3]));
        f.userData.t = 0;
        f.visible = true;
    }

    splash(x, z, n = 14, power = 1, y = 0.05) {
        for (let i = 0; i < n; i++) {
            const d = this.drops[this.nextDrop];
            this.nextDrop = (this.nextDrop + 1) % this.drops.length;
            d.visible = true;
            d.position.set(x + rnd(-0.3, 0.3), y, z + rnd(-0.2, 0.3));
            d.userData.v.set(rnd(-2, 2) * power, rnd(2, 4.5) * power, rnd(0, 2));
        }
    }

    // ---- препятствия -----------------------------------------------------------------------

    makeDumpster() {
        const g = new THREE.Group();
        const box = new THREE.Mesh(this.geo.dumpster, this.mat.dumpster);
        box.position.y = 0.6;
        const lid = new THREE.Mesh(this.geo.dumpsterLid, this.mat.dumpsterLid);
        lid.position.set(0, 1.13, 0.06);
        lid.rotation.x = -0.1;
        const rim = new THREE.Mesh(this.geo.dumpsterRim, this.mat.dumpsterLid);
        rim.position.set(0, 0.95, 0.52);
        g.add(box, lid, rim);
        for (const x of [-0.5, 0.5]) for (const zz of [-0.35, 0.35]) {
            const wheel = new THREE.Mesh(this.geo.wheel, this.mat.tire);
            wheel.rotation.z = Math.PI / 2;
            wheel.position.set(x, 0.08, zz);
            g.add(wheel);
        }
        g.userData = { type: "dumpster", halfZ: 0.55, top: 1.15 };
        return g;
    }

    // металлический отбойник поперёк полосы с табличкой «БЛОК» — только подкатом
    makeBarrier() {
        const g = new THREE.Group();
        for (const x of [-0.72, 0.72]) {
            const post = new THREE.Mesh(this.geo.post, this.mat.post);
            post.position.set(x, 0.65, 0.05);
            g.add(post);
        }
        const rail = new THREE.Mesh(this.geo.rail, this.mat.rail);
        rail.position.y = 1.05;
        const lip = new THREE.Mesh(this.geo.lip, this.mat.rail);
        lip.position.y = 1.2;
        const sign = new THREE.Mesh(this.geo.sign, [
            this.mat.post, this.mat.post, this.mat.post, this.mat.post, this.mat.sign, this.mat.sign,
        ]);
        sign.position.set(0, 1.05, 0.075);
        g.add(rail, lip, sign);
        g.userData = { type: "barrier", halfZ: 0.3 };
        return g;
    }

    // Уличный банкомат (фото-фасад из textures/atm*) — только объезжать
    makeAtm(decor = false) {
        const g = new THREE.Group();
        const a = pick(this.mat.atms);
        const h = 2.3, w = Math.min(1.3, h * a.aspect), d = 1.0;
        const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [
            this.mat.atmBody, this.mat.atmBody, this.mat.atmBody, this.mat.atmBody, a.front, this.mat.atmBody,
        ]);
        body.position.y = h / 2;
        const cap = new THREE.Mesh(new THREE.BoxGeometry(w + 0.1, 0.08, d + 0.1), this.mat.atmBody);
        cap.position.y = h + 0.04;
        // светящиеся боковые панели в цвет банкомата
        const panelMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(a.light).multiplyScalar(2.2) });
        for (const sx of [-1, 1]) {
            const panel = new THREE.Mesh(new THREE.PlaneGeometry(d * 0.7, h * 0.45), panelMat);
            panel.rotation.y = sx * Math.PI / 2;
            panel.position.set(sx * (w / 2 + 0.005), h * 0.62, 0);
            g.add(panel);
        }
        g.add(body, cap);
        g.traverse((m) => { if (m.geometry) m.geometry.userData.own = true; });
        panelMat.userData.own = true;
        g.userData = { type: "atm", halfZ: d / 2 + 0.05 };
        return g;
    }

    // Красный спорткар в духе Corvette C2: профиль кузова выдавлен (ExtrudeGeometry),
    // четыре круглые фары, хром, диски-«звёздочки», лак с бликами. Едет навстречу.
    makeCar() {
        const g = new THREE.Group();
        const extrude = (pts, width, bevel) => {
            const shape = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
            const geo = new THREE.ExtrudeGeometry(shape, {
                depth: width, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 8,
            });
            geo.translate(0, 0, -width / 2);
            geo.rotateY(-Math.PI / 2); // профиль X → ось машины Z (нос к +Z, к крысу)
            return geo;
        };
        // боковой профиль: [вдоль машины, высота]
        const body = new THREE.Mesh(extrude([
            [-2.05, 0.28], [2.0, 0.28], [2.12, 0.46], [2.02, 0.62], [1.2, 0.7], [0.3, 0.78],
            [-0.2, 0.8], [-1.85, 0.82], [-2.1, 0.7], [-2.12, 0.42],
        ], 1.56, 0.1), this.mat.paint);
        const cabin = new THREE.Mesh(extrude([
            [0.3, 0.78], [-0.3, 1.18], [-0.95, 1.22], [-1.85, 0.86], [-1.85, 0.78],
        ], 1.32, 0.06), this.mat.glass);
        const roof = new THREE.Mesh(extrude([
            [-0.32, 1.17], [-0.95, 1.21], [-1.5, 1.04], [-1.5, 1.0], [-0.95, 1.17], [-0.36, 1.13],
        ], 1.36, 0.04), this.mat.paint);
        g.add(body, cabin, roof);

        // колёса: шина + хромированный диск с пятью спицами
        const tireGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.28, 18);
        const rimGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.02, 16);
        const spokeGeo = new THREE.BoxGeometry(0.04, 0.03, 0.4);
        for (const x of [-0.82, 0.82]) for (const zz of [-1.32, 1.32]) {
            const tire = new THREE.Mesh(tireGeo, this.mat.tire);
            tire.rotation.z = Math.PI / 2;
            tire.position.set(x, 0.34, zz);
            const rim = new THREE.Mesh(rimGeo, this.mat.chrome);
            rim.rotation.z = Math.PI / 2;
            rim.position.set(x + Math.sign(x) * 0.14, 0.34, zz);
            g.add(tire, rim);
            for (let k = 0; k < 5; k++) {
                const spoke = new THREE.Mesh(spokeGeo, this.mat.chrome);
                spoke.position.copy(rim.position);
                spoke.position.x += Math.sign(x) * 0.012;
                spoke.rotation.x = (k / 5) * Math.PI;
                g.add(spoke);
            }
        }
        // четыре круглые фары и хромированный бампер спереди, стопы сзади
        const lampGeo = new THREE.CircleGeometry(0.1, 16);
        for (const x of [-0.62, -0.38, 0.38, 0.62]) {
            const ring = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.018, 6, 16), this.mat.chrome);
            ring.position.set(x, 0.58, 2.06);
            const lamp = new THREE.Mesh(lampGeo, this.mat.headlight);
            lamp.position.set(x, 0.58, 2.065);
            g.add(ring, lamp);
        }
        for (const x of [-0.5, 0.5]) {
            const bumper = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.07, 0.12), this.mat.chrome);
            bumper.position.set(x, 0.4, 2.2);
            const tl = new THREE.Mesh(new THREE.CircleGeometry(0.08, 12), this.mat.taillight);
            tl.rotation.y = Math.PI;
            tl.position.set(x, 0.6, -2.2);
            g.add(bumper, tl);
        }
        g.traverse((m) => { if (m.geometry) m.geometry.userData.own = true; }); // фары (общие) добавятся потом
        g.userData = { type: "car", ...OBSTACLE_STATS.car };
        return g;
    }

    // ---- монеты ------------------------------------------------------------------------------

    makeCoin(boost = false) {
        const t = this.modelFor(boost ? "boost" : "coin");
        if (t) { // 3D-монета Tether (USDT) или Tron (TRX — бонус ×2)
            const g = new THREE.Group();
            g.add(t.clone());
            g.children[0].position.y -= t.userData.cfg.size / 2; // центр монеты — в точке спавна
            g.userData = { boost, model: true };
            return g;
        }
        const m = boost ? [this.mat.boostEdge, this.mat.boost, this.mat.boost] : [this.mat.coinEdge, this.mat.coin, this.mat.coin];
        const coin = new THREE.Mesh(this.geo.coin, m);
        coin.rotation.x = Math.PI / 2;
        if (boost) coin.scale.setScalar(1.3);
        coin.userData = { boost };
        return coin;
    }

    // баночка на дороге: модель из Meshy (пока не загрузилась — простая банка своего цвета)
    addPickup(kind, lane, z) {
        const cfg = POWERUPS[kind];
        const g = new THREE.Group();
        const t = this.modelFor(kind);
        let body;
        if (t) {
            body = t.clone();
            body.position.y -= t.userData.cfg.size / 2;
        } else {
            body = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.6, 16),
                new THREE.MeshStandardMaterial({ color: 0x151515, emissive: cfg.color, emissiveIntensity: 0.35, roughness: 0.4 }));
            body.geometry.userData.own = body.material.userData.own = true;
        }
        g.add(body);
        g.position.set(this.lanes[lane], 0.95, z);
        g.userData = { pickup: kind, model: true, baseY: 0.95 };
        this.scene.add(g);
        this.coins.push(g);
    }

    addCoin(lane, z, y = 0.7, boost = false) {
        const c = this.makeCoin(boost);
        c.position.set(this.lanes[lane], y, z);
        c.userData.baseY = y;
        this.scene.add(c);
        this.coins.push(c);
    }

    // 3D-модели из Meshy (MODELS в config.js). Пока модель грузится или если её нет —
    // используется процедурная модель или спрайт, а загруженная подменяет их «на лету».
    loadObstacleModels() {
        this.templates = {};
        for (const [kind, list] of Object.entries(MODELS)) {
            for (const cfg of list) {
                const url = this.tier.lite ? cfg.url.replace("models/obj/", "models/obj/lite/") : cfg.url;
                loadModel(url, (gltf) => {
                    const m = gltf.scene;
                    m.rotation.y = cfg.rotateY || 0;
                    m.updateMatrixWorld(true);
                    const box = new THREE.Box3().setFromObject(m);
                    const size = box.getSize(new THREE.Vector3());
                    const k = cfg.size / (cfg.axis === "y" ? size.y : cfg.axis === "x" ? size.x : size.z);
                    m.scale.multiplyScalar(k);
                    m.updateMatrixWorld(true);
                    box.setFromObject(m);
                    const c = box.getCenter(new THREE.Vector3());
                    m.position.set(m.position.x - c.x, m.position.y - box.min.y, m.position.z - c.z);
                    m.traverse((o) => {
                        if (!o.isMesh) return;
                        o.castShadow = true;
                        o.receiveShadow = true;
                        if (cfg.glow) { // неон: светится собственной картинкой (bloom)
                            o.material.emissive.set(0xffffff);
                            o.material.emissiveMap = o.material.map;
                            o.material.emissiveIntensity = cfg.glow;
                        }
                    });
                    const holder = new THREE.Group(); // оборачиваем, чтобы rotation/scale модели не сбивались при клонировании
                    holder.add(m);
                    holder.userData = { cfg, size: box.getSize(new THREE.Vector3()) }; // габариты — для столкновений (makeObstacle)
                    if (kind === "car") { // фары — по габаритам модели (или cfg.lights, если не попали)
                        const b = new THREE.Box3().setFromObject(holder), s = b.getSize(new THREE.Vector3());
                        holder.userData.front = cfg.lights || { x: s.x * 0.3, y: b.min.y + s.y * 0.42, z: b.max.z };
                    }
                    (this.templates[kind] ||= []).push(holder);
                    this.warmQueue.push(holder.clone());
                    for (const g of this.swaps[kind] || []) if (!g.userData.swapped) this.swapIn(g, kind);
                }, () => { if (kind === "bank") this.bankFallback(); }, { deferred: true });
            }
        }
    }

    // Инспектор ДПС со скелетом: каждый — свой клон и свой микшер анимаций
    // масштаб и сдвиг модели со скелетом: по росту height или (кошка) по длине length вдоль Z; ноги — на земле
    fitRig(gltf, height, length) {
        const box = new THREE.Box3().setFromObject(gltf.scene);
        const size = box.getSize(new THREE.Vector3());
        const k = length ? length / size.z : height / size.y;
        const c = box.getCenter(new THREE.Vector3());
        return { gltf, k, offset: new THREE.Vector3(-c.x * k, -box.min.y * k, -c.z * k) };
    }

    // Кто бежит за героем после первого удара (CHASER) — Инспекторша Строгая (вымышленная)
    loadChaser() {
        loadModel(this.lite(CHASER.url), (gltf) => {
            this.chaserModel = this.fitRig(gltf, CHASER.height);
            this.warmQueue.push(this.makeChaser());
        }, () => {}, { deferred: true });
    }

    makeChaser() {
        return this.chaserModel ? this.rig(this.chaserModel, CHASER.run, { chaser: true }) : null;
    }

    // Живые NPC: девушки заменяют спрайты на тротуарах, кошки гуляют, голуби сидят стайками у бордюра
    // сколько живых NPC из total на этом уровне графики (QUALITY_TIERS.npc — доля); хотя бы один
    npcLimit(total) {
        return Math.min(total, Math.max(1, Math.round(total * (this.tier.npc ?? 1))));
    }

    loadNpcs() {
        for (const [kind, cfg] of Object.entries(NPCS)) {
            loadModel(this.lite(cfg.url), (gltf) => {
                const m = this.npcModels[kind] = this.fitRig(gltf, cfg.height, cfg.length);
                this.warmQueue.push(this.rig(m, null)); // шейдеры со скелетом — заранее (Game.warmUp)
                // на слабом уровне — меньше: остальные девушки остаются плоскими спрайтами, кошек и стаек меньше
                const girls = this.swaps.girl || [];
                if (kind === "girl") for (const g of girls.slice(0, this.npcLimit(girls.length))) this.makeGirl(g, m, cfg);
                if (kind === "cat") for (let i = 0; i < this.npcLimit(cfg.count); i++) this.makeCat(m, cfg);
                if (kind === "pigeon") for (let i = 0; i < this.npcLimit(cfg.flocks); i++) this.makeFlock(m, cfg, i);
            }, () => {}, { deferred: true });
        }
    }

    // Уровень графики сменился посреди игры (автоснижение, когда не хватает кадров): дождь короче, лишние живые NPC
    // прячутся. Число фонарей не меняем: другое число источников света — пересборка всех шейдеров, рывок в забеге.
    setTier(tier) {
        this.tier = tier;
        this.rainCount = Math.min(this.rainSpeed.length, tier.rain);
        this.rain.geometry.setDrawRange(0, this.rainCount * 2);
        const keep = (list, total) => { const n = this.npcLimit(total); list.forEach((o, i) => { o.visible = i < n; }); };
        keep(this.critters.filter((o) => o.userData.npc === "girl"), this.swaps.girl?.length || 0);
        keep(this.critters.filter((o) => o.userData.npc === "cat"), NPCS.cat.count);
        keep(this.flocks, NPCS.pigeon.flocks);
    }

    // гуляет вдоль тротуара (walk — м/с по Z) или танцует на месте
    makeGirl(g, m, cfg) {
        const walking = Math.random() < cfg.walkShare;
        const npc = this.rig(m, walking ? cfg.walk : cfg.idle);
        g.clear();
        g.add(npc);
        Object.assign(g.userData, { billboard: false, swapped: true, mixer: npc.userData.mixer, npc: "girl" });
        if (walking) { // гуляют своей дорожкой у стен — там ничего не стоит (банкоматы, урны, посты — ближе к дороге)
            const dir = pick([-1, 1]);
            g.position.x = Math.sign(g.position.x) * rnd(5.6, 6.0);
            delete g.userData.foot;
            g.userData.walk = dir * cfg.speed * rnd(0.8, 1.2);
            g.rotation.y = dir > 0 ? 0 : Math.PI; // модель смотрит в +Z
        } else {
            g.rotation.y = g.userData.faceY ?? 0;
        }
        if (!this.critters.includes(g)) this.critters.push(g);
    }

    makeCat(m, cfg) {
        const side = pick([-1, 1]), dir = pick([-1, 1]);
        const cat = this.rig(m, cfg.walk);
        cat.position.set(side * rnd(5.6, 6.1), 0.18, BEHIND_Z - rnd(0, STREET_LEN)); // дорожка у стен, как у гуляющих
        cat.userData.walk = dir * cfg.speed * rnd(0.8, 1.2);
        cat.userData.npc = "cat";
        cat.rotation.y = dir > 0 ? 0 : Math.PI;
        this.addScenery(cat);
        this.critters.push(cat);
    }

    // Стайка голубей у бордюра: сидят и клюют, а когда герой подбегает — взлетают в стороны
    makeFlock(m, cfg, i) {
        const side = i % 2 ? 1 : -1;
        const flock = new THREE.Group();
        flock.position.set(side * 3.7, 0.18, BEHIND_Z - 30 - i * (STREET_LEN / cfg.flocks));
        const n = cfg.flock[0] + Math.floor(Math.random() * (cfg.flock[1] - cfg.flock[0] + 1));
        const pigeons = [];
        for (let k = 0; k < n; k++) {
            const p = this.makePigeon(m);
            p.position.set(rnd(-0.5, 0.5), 0.07, rnd(-1.3, 1.3)); // чуть выше тротуара: в анимации клевания тело опускается ниже позы покоя
            p.rotation.y = rnd(0, Math.PI * 2);
            p.userData.home = p.position.clone();
            p.userData.homeY = p.rotation.y;
            flock.add(p);
            pigeons.push(p);
        }
        flock.userData = { pigeons, side, flee: cfg.flee, state: "rest", lastZ: flock.position.z, foot: { hx: 0.8, hz: 1.6 } };
        this.placeFree(flock);
        flock.userData.lastZ = flock.position.z;
        this.addScenery(flock);
        this.flocks.push(flock);
    }

    // голубь: свой скелет; крылья машут поворотом плечевых костей вокруг оси «вперёд» (у модели +Z)
    makePigeon(m) {
        const g = this.rig(m, null);
        const model = g.children[0];
        model.updateMatrixWorld(true);
        const wings = [];
        for (const [name, sign] of [["Bone_017", 1], ["Bone_020", -1]]) {
            const bone = model.getObjectByName(name);
            if (!bone) continue;
            const q = bone.getWorldQuaternion(new THREE.Quaternion()).invert();
            wings.push({ bone, sign, rest: bone.quaternion.clone(), axis: new THREE.Vector3(0, 0, 1).applyQuaternion(q) });
        }
        Object.assign(g.userData, { wings, v: new THREE.Vector3(), phase: rnd(0, 10) });
        return g;
    }

    // крылья: angle — насколько опущены от позы модели (в ней крылья подняты), 0 — как в модели
    setWings(p, angle) {
        const q = this._wingQ ||= new THREE.Quaternion();
        for (const w of p.userData.wings) w.bone.quaternion.copy(w.rest).multiply(q.setFromAxisAngle(w.axis, angle * w.sign));
    }

    updateFlocks(dt, t) {
        for (const f of this.flocks) {
            if (!f.visible) continue; // спрятана на слабом уровне графики
            const u = f.userData;
            if (f.position.z < u.lastZ - 1) { // стайка переехала в конец улицы — снова сидят
                u.state = "rest";
                for (const p of u.pigeons) { p.position.copy(p.userData.home); p.rotation.set(0, p.userData.homeY, 0); p.visible = true; }
            }
            u.lastZ = f.position.z;
            if (u.state === "rest" && f.position.z > -u.flee && f.position.z < 6 && Math.abs(f.position.x - this.playerX) < 4.5) {
                u.state = "fly";
                for (const p of u.pigeons) p.userData.v.set(u.side * rnd(0.6, 2.2), rnd(2.2, 3.6), rnd(-3, -0.5));
            }
            if (f.position.z < -70 || f.position.z > 8) continue; // дальше — туман
            for (const p of u.pigeons) {
                const d = p.userData;
                if (u.state === "rest") {
                    this.setWings(p, 1.25);
                    p.rotation.x = Math.max(0, Math.sin(t * 3 + d.phase)) * 0.35; // клюёт
                } else if (p.visible) {
                    d.v.y += 1.2 * dt;
                    p.position.addScaledVector(d.v, dt);
                    p.rotation.set(-0.35, Math.atan2(d.v.x, d.v.z), 0);
                    this.setWings(p, 0.15 + Math.sin(t * 28 + d.phase) * 0.75);
                    if (p.position.y > 10) p.visible = false;
                }
            }
        }
    }

    loadOfficer() {
        const cfg = POLICE_OFFICER;
        loadModel(this.lite(cfg.url), (gltf) => {
            this.officer = this.fitRig(gltf, cfg.height);
            this.warmQueue.push(this.makeOfficer(POLICE_OFFICER.run));
            for (const { car, side } of this.officerPosts) { // у постов на обочине — лицом к бегущему, вполоборота к дороге
                const o = this.makeOfficer(pick(cfg.idle));
                // перед капотом, а не в нём: машина 4,6 м длиной
                o.position.set(side * 3.6, 0.18, car.position.z + 3.3);
                o.userData.foot = { hx: 0.4, hz: 0.4 };
                this.placeFree(o);
                o.rotation.y = -side * 0.5;
                this.addScenery(o, car.userData.loop);
                this.officers.push(o);
            }
        }, () => {}, { deferred: true });
    }

    // Ислам у обочины (препятствие «Ислам дует») — та же модель, что у героя, клип «swing»
    loadIslam() {
        const cfg = WIND.npc;
        loadModel(cfg.url, (gltf) => {
            this.islam = this.fitRig(gltf, cfg.height);
            this.warmQueue.push(this.makeIslam());
        }, () => {}, { deferred: true });
    }

    makeIslam() {
        return this.islam ? this.rig(this.islam, WIND.npc.idle, { islam: true }) : null;
    }

    // поток ветра изо рта Ислама: штрихи и облачка летят конусом через дорогу
    buildWind() {
        const n = 40, pos = new Float32Array(n * 6);
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
        this.windLines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xe8f4ff, transparent: true, opacity: 0.55, depthWrite: false }));
        this.windLines.visible = false;
        this.windLines.frustumCulled = false;
        this.scene.add(this.windLines);
        const puffTex = canvasTex(64, 64, (g, w, h) => {
            const r = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
            r.addColorStop(0, "rgba(255,255,255,.9)"); r.addColorStop(1, "rgba(255,255,255,0)");
            g.fillStyle = r; g.fillRect(0, 0, w, h);
        });
        this.windPuffs = Array.from({ length: 12 }, () => {
            const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, color: 0xdfefff, transparent: true, depthWrite: false, opacity: 0 }));
            s.visible = false;
            this.scene.add(s);
            return s;
        });
        const seed = () => ({ t: Math.random(), v: rnd(1.6, 2.6), a: rnd(-1, 1), b: rnd(-1, 1), l: rnd(0.5, 1.2) });
        this.windSeed = Array.from({ length: n }, seed);
        this.puffSeed = this.windPuffs.map(seed);
        this.windSeedFn = seed;
    }

    // origin — рот Ислама (Vector3), dir — куда дует по X (±1); null — выключить. power 0…1 — сила (вдох → выдох)
    blowWind(origin, dir = 1, dt = 0, power = 1) {
        const on = !!origin && power > 0.02;
        this.windLines.visible = on;
        for (const p of this.windPuffs) p.visible = on;
        if (!on) return;
        const pos = this.windLines.geometry.attributes.position.array;
        const at = (s, d) => [origin.x + dir * d, origin.y + s.a * d * 0.18 - d * 0.06, origin.z + s.b * d * 0.32];
        this.windSeed.forEach((s, i) => {
            s.t += dt * s.v;
            if (s.t > 1) Object.assign(s, this.windSeedFn(), { t: 0 });
            const d = s.t * 9 * power, [x, y, z] = at(s, d);
            pos.set([x, y, z, x - dir * s.l * (0.3 + s.t), y, z], i * 6);
        });
        this.windLines.geometry.attributes.position.needsUpdate = true;
        this.windLines.material.opacity = 0.55 * power;
        this.puffSeed.forEach((s, i) => {
            s.t += dt * s.v * 0.8;
            if (s.t > 1) Object.assign(s, this.windSeedFn(), { t: 0 });
            const p = this.windPuffs[i], d = s.t * 8 * power;
            p.position.set(...at(s, d));
            p.scale.setScalar(0.25 + s.t * 1.1);
            p.material.opacity = Math.sin(s.t * Math.PI) * 0.35 * power;
        });
    }

    makeOfficer(clipName) {
        return this.officer ? this.rig(this.officer, clipName, { officer: true }) : null;
    }

    // Клон модели со скелетом (свой скелет и свой микшер) в группе; clipName — какой клип крутить (null — без анимации)
    rig({ gltf, k, offset }, clipName, data = {}) {
        const m = cloneSkinned(gltf.scene);
        m.scale.setScalar(k);
        m.position.copy(offset);
        // Отсечение по кадру оставляем включённым: без него рисовались все ~28 NPC, и за камерой, и в тумане
        // (на телефоне это 2/3 всех треугольников кадра). Сфера отсечения у скиннутой сетки — по позе покоя,
        // а в анимации руки и ноги выходят за неё — берём её с запасом (геометрия общая у всех клонов).
        m.traverse((o) => {
            if (!o.isMesh) return;
            o.castShadow = true;
            if (!o.isSkinnedMesh) return;
            const geo = o.geometry;
            if (!geo.userData.cullGrown) {
                if (!geo.boundingSphere) geo.computeBoundingSphere();
                geo.boundingSphere.radius *= 1.6;
                geo.userData.cullGrown = true;
            }
        });
        const g = new THREE.Group();
        g.add(m);
        g.userData = { ...data };
        const clip = clipName !== null && (gltf.animations.find((a) => a.name === clipName) || gltf.animations[0]);
        if (clip) {
            const mixer = new THREE.AnimationMixer(m);
            const action = mixer.clipAction(clip).play();
            action.time = Math.random() * clip.duration; // чтобы соседние не двигались синхронно
            g.userData.mixer = mixer;
        }
        return g;
    }

    // патрульная машина: 3D-модель, если загрузилась, иначе спрайт с мигалкой
    makePatrol() {
        const t = this.modelFor("police");
        if (!t) return this.makePoliceCar();
        const g = new THREE.Group();
        g.add(t.clone());
        g.userData = { police: true };
        return g;
    }

    modelFor(kind) {
        const list = this.templates?.[kind];
        return list?.length ? pick(list) : null;
    }

    // Декорация, которую можно заменить моделью, когда та загрузится
    registerSwap(kind, g) {
        (this.swaps[kind] ||= []).push(g);
        if (this.modelFor(kind)) this.swapIn(g, kind);
        return g;
    }

    swapIn(g, kind) {
        const t = this.modelFor(kind);
        g.clear();
        g.add(t.clone());
        g.userData.billboard = false;
        g.userData.swapped = true;
        g.userData.flashers = null;
        g.rotation.y = g.userData.faceY ?? 0;
        if (kind === "police") g.userData.police = true;
        if (kind === "bank") this.placeBank(g);
    }

    // Препятствия-спрайты: инспектор ДПС и бетонный блок — объезжать, ограждение — перепрыгнуть
    makeSpriteObstacle(kind) {
        const g = this.makeSprite(kind);
        const d = { halfZ: kind === "cop" ? 0.3 : 0.5, top: SPRITES[kind].top };
        Object.assign(g.userData, { type: kind, ...d });
        return g;
    }

    // Размеры для столкновений у процедурных препятствий и спрайтов (те же, что ставят makeDumpster/makeBarrier/…)
    obstacleStats(kind) {
        if (SPRITES[kind]?.obstacle) return { type: kind, halfZ: kind === "cop" ? 0.3 : 0.5, top: SPRITES[kind].top };
        return { type: kind, ...OBSTACLE_STATS[kind] };
    }

    makeObstacle(kind) {
        if (kind === "cop" && this.officer) { // живой инспектор на полосе: кричит или объясняет руками
            const g = this.makeOfficer(pick(POLICE_OFFICER.idle));
            Object.assign(g.userData, { type: "cop", halfZ: 0.3, police: true });
            return g;
        }
        const t = this.modelFor(kind);
        if (!t) { // модели нет (грузится или не загрузилась) — процедурная или спрайт
            const g = SPRITES[kind]?.obstacle ? this.makeSpriteObstacle(kind)
                : kind === "dumpster" ? this.makeDumpster() : kind === "barrier" ? this.makeBarrier()
                : kind === "atm" ? this.makeAtm() : this.makeCar();
            if (kind === "car") this.addHeadlights(g, CAR_FRONT);
            return g;
        }
        // Модель из .glb. Столкновения — по её габаритам, чтобы не расходились с тем, что видно: тележку высотой 1,4 м
        // перепрыгивали на 0,95, а блок длиной 1,7 м задевали только в середине. cfg.top / cfg.halfZ — переопределить.
        const g = new THREE.Group();
        g.add(t.clone());
        const base = this.obstacleStats(kind), { cfg, size } = t.userData;
        g.userData = { ...base, billboard: false, lamp: null, flashers: null };
        if (base.top) g.userData.top = cfg.top ?? size.y;
        g.userData.halfZ = cfg.halfZ ?? Math.max(base.halfZ, size.z * 0.45);
        if (kind === "cop") g.userData.police = true;
        if (kind === "car") this.addHeadlights(g, t.userData.front);
        return g;
    }

    // f — где фары: ±x от оси машины, высота y, передняя грань z (машина смотрит на игрока, в +Z)
    addHeadlights(g, f) {
        for (const sx of [-1, 1]) {
            const lamp = new THREE.Sprite(this.mat.headlamp);
            lamp.scale.setScalar(0.4);
            lamp.position.set(sx * f.x, f.y, f.z + 0.05);
            g.add(lamp);
        }
        const beam = new THREE.Mesh(this.geo.beam, this.mat.beam);
        beam.rotation.x = -Math.PI / 2;
        beam.position.set(0, 0.03, f.z + 3.2);
        beam.renderOrder = 3;
        beam.userData.fx = true; // не отбрасывает тень (см. addObstacle)
        const glare = new THREE.Sprite(this.mat.glare);
        glare.position.set(0, f.y, f.z + 0.3);
        glare.scale.setScalar(0.01);
        g.add(beam, glare);
        g.userData.glare = glare;
    }

    addObstacle(kind, lane, z) {
        const o = this.makeObstacle(kind);
        o.position.set(this.lanes[lane], 0, z);
        o.userData.lane = lane;
        o.traverse((m) => { if (m.isMesh && !m.userData.fx) m.castShadow = true; });
        this.scene.add(o);
        this.obstacles.push(o);
        return o;
    }

    // ---- стена-возражение: арка с вопросом над дорогой и три таблички с ответами на полосах ----------
    // answers — ответы по полосам, correct — номер полосы с правильным. Текст рисуется на холсте (свой у каждой стены,
    // освобождается вместе с ней). Таблички — препятствия type "answer": правильная ломается, неправильная — удар.
    addWall(q, answers, correct, z) {
        const type = CLIENT_TYPES[q.type];
        const wall = { q, answers, correct, answered: false, plates: [], type: q.type };
        const textMat = (w, h, draw) => {
            const map = canvasTex(w, h, draw);
            map.anisotropy = 4;
            const m = new THREE.MeshBasicMaterial({ map, transparent: true });
            m.userData.own = true;
            return m;
        };
        const col = type.color;
        // неоновая рамка: свечение наружу (поэтому в текстуре есть поле m под ореол), внутри — тёмное стекло
        const neon = (g, x, y, w, h, r, lw) => {
            g.save();
            g.strokeStyle = col; g.lineWidth = lw;
            g.shadowColor = col; g.shadowBlur = lw * 5;
            roundRect(g, x, y, w, h, r); g.stroke(); g.stroke();
            g.shadowBlur = 0; g.strokeStyle = "rgba(255,255,255,.55)"; g.lineWidth = Math.max(1.5, lw * 0.28);
            roundRect(g, x, y, w, h, r); g.stroke(); // белая сердцевина трубки
            g.restore();
        };
        const glass = (g, x, y, w, h, r) => {
            const gr = g.createLinearGradient(0, y, 0, y + h);
            gr.addColorStop(0, "rgba(34,34,40,.97)"); gr.addColorStop(1, "rgba(10,10,13,.97)");
            g.fillStyle = gr; roundRect(g, x, y, w, h, r); g.fill();
            g.save(); roundRect(g, x, y, w, h, r); g.clip(); // блик по верхней кромке и тонкие полосы «экрана»
            const hl = g.createLinearGradient(0, y, 0, y + h * 0.45);
            hl.addColorStop(0, "rgba(255,255,255,.10)"); hl.addColorStop(1, "rgba(255,255,255,0)");
            g.fillStyle = hl; g.fillRect(x, y, w, h * 0.45);
            g.fillStyle = "rgba(255,255,255,.025)";
            for (let yy = y; yy < y + h; yy += 6) g.fillRect(x, yy, w, 2);
            g.restore();
        };
        const lightMat = (this.wallLight ||= {})[col] ||= new THREE.MeshBasicMaterial({ color: col, toneMapped: false });
        const glowMat = (this.wallGlow ||= {})[col] ||= new THREE.MeshBasicMaterial({
            map: this.laneGlowTex ||= canvasTex(64, 128, (g, w, h) => {
                const r = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
                r.addColorStop(0, "rgba(255,255,255,.9)"); r.addColorStop(1, "rgba(255,255,255,0)");
                g.setTransform(1, 0, 0, h / w, 0, 0); g.fillStyle = r; g.fillRect(0, 0, w, w);
            }),
            color: col, transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending });
        // арка: две опоры с неоновыми кольцами и щит с вопросом
        const arch = new THREE.Group();
        for (const x of [-3.4, 3.4]) {
            const post = new THREE.Mesh(this.geo.box, this.mat.pole);
            post.scale.set(0.16, 5.6, 0.16);
            post.position.set(x, 2.8, 0);
            arch.add(post);
            for (const y of [1.2, 2.4, 3.6]) {
                const ring = new THREE.Mesh(this.geo.box, lightMat);
                ring.scale.set(0.2, 0.05, 0.2);
                ring.position.set(x, y, 0);
                arch.add(ring);
            }
        }
        const signGeo = new THREE.PlaneGeometry(7.2, 2.1);
        signGeo.userData.own = true;
        const sign = new THREE.Mesh(signGeo, textMat(1024, 300, (g, w, h) => {
            const m = 34, x = m, y = m + 18, bw = w - 2 * m, bh = h - 2 * m - 18;
            glass(g, x, y, bw, bh, 30);
            neon(g, x, y, bw, bh, 30, 7);
            // плашка типа клиента на верхней кромке
            g.font = '800 30px "Inter Tight", Arial, sans-serif';
            const label = type.name.toUpperCase(), pw = g.measureText(label).width + 56;
            g.save(); g.shadowColor = col; g.shadowBlur = 24; g.fillStyle = col;
            roundRect(g, (w - pw) / 2, y - 22, pw, 44, 22); g.fill(); g.restore();
            g.fillStyle = "#0d0d10"; g.textAlign = "center";
            g.fillText(label, w / 2, y + 10);
            g.save(); g.shadowColor = "rgba(255,255,255,.35)"; g.shadowBlur = 14; g.fillStyle = "#f4f4f4";
            fitText(g, q.q.length < 14 ? q.q : `«${q.q}»`, bw - 80, 72, '800 {s}px "Unbounded", "Arial Black", sans-serif');
            g.fillText(g.__line, w / 2, y + bh / 2 + 34);
            g.restore();
        }));
        sign.position.set(0, 5.1, 0);
        arch.add(sign);
        arch.position.z = z - 0.8;
        arch.userData = { type: "decor" };
        this.scene.add(arch);
        this.obstacles.push(arch);
        // таблички на полосах: стекло в неоне, стрелка полосы, ответ; под ними светящаяся планка и пятно на асфальте
        const plateGeo = new THREE.PlaneGeometry(1.86, 1.5);
        plateGeo.userData.own = true;
        const arrows = ["◀", "▲", "▶"];
        answers.forEach((text, lane) => {
            const g = new THREE.Group();
            const board = new THREE.Mesh(plateGeo, textMat(512, 412, (c, w, h) => {
                const m = 30, x = m, y = m, bw = w - 2 * m, bh = h - 2 * m;
                glass(c, x, y, bw, bh, 30);
                neon(c, x, y, bw, bh, 30, 7);
                // стрелка: куда свайпать за этим ответом
                c.save(); c.shadowColor = col; c.shadowBlur = 16; c.fillStyle = col;
                c.beginPath(); c.arc(w / 2, y + 2, 26, 0, Math.PI * 2); c.fill(); c.restore();
                c.fillStyle = "#0d0d10"; c.font = '900 26px Arial, sans-serif'; c.textAlign = "center";
                c.fillText(arrows[lane], w / 2, y + 11);
                c.fillStyle = "#f4f4f4";
                wrapText(c, text, w / 2, y + 36, bw - 44, bh - 82, '800 {s}px "Inter Tight", Arial, sans-serif');
                // подпись типа внизу, разреженно
                c.fillStyle = col; c.globalAlpha = 0.85;
                c.font = '700 19px "Inter Tight", Arial, sans-serif';
                if ("letterSpacing" in c) c.letterSpacing = "4px";
                c.fillText(`${type.tag} · ${type.name.toUpperCase()}`, w / 2, y + bh - 16);
            }));
            board.position.y = 1.32;
            g.add(board);
            const bar = new THREE.Mesh(this.geo.box, lightMat); // неоновая планка под табличкой
            bar.scale.set(1.3, 0.045, 0.05);
            bar.position.set(0, 0.6, 0.02);
            g.add(bar);
            const pole = new THREE.Mesh(this.geo.box, this.mat.pole);
            pole.scale.set(0.07, 0.62, 0.07);
            pole.position.set(0, 0.31, -0.04);
            g.add(pole);
            const base = new THREE.Mesh(this.geo.box, this.mat.pole);
            base.scale.set(0.5, 0.05, 0.3);
            base.position.set(0, 0.025, -0.04);
            g.add(base);
            const glow = new THREE.Mesh(this.geo.glow, glowMat); // отсвет на мокром асфальте
            glow.rotation.x = -Math.PI / 2;
            glow.scale.set(1.9, 3.2, 1);
            glow.position.set(0, 0.02, 0.9);
            g.add(glow);
            g.position.set(this.lanes[lane], 0, z);
            g.userData = { type: "answer", halfZ: 0.35, wall, correct: lane === correct, lane, text };
            this.scene.add(g);
            this.obstacles.push(g);
            wall.plates.push(g);
        });
        // ничего постороннего вплотную к стене: ряды препятствий и монеты в ±12 м убираем
        for (const o of [...this.obstacles]) {
            if (o.userData.type === "decor" || o.userData.type === "answer") continue;
            if ((o.position.z > z - 34 && o.position.z < z + 28) || (o.userData.oncoming && o.position.z < z)) { // перед стеной (там замедление и выбор) и после неё — пусто
                this.dropObstacle(o);
                this.obstacles.splice(this.obstacles.indexOf(o), 1);
            }
        }
        for (let i = this.coins.length - 1; i >= 0; i--) if (Math.abs(this.coins[i].position.z - z) < 6) this.removeCoin(i);
        return wall;
    }

    pickKind() {
        const total = Object.values(OBSTACLE_MIX).reduce((a, b) => a + b, 0);
        let r = Math.random() * total;
        for (const [kind, w] of Object.entries(OBSTACLE_MIX)) if ((r -= w) < 0) return kind;
        return "dumpster";
    }

    // Ряд препятствий: всегда остаётся хотя бы одна проходимая полоса. speed — скорость забега (м/с).
    // Тачка едет навстречу быстрее ряда (oncoming), поэтому ставим её дальше — так, чтобы до героя она доехала
    // вместе со своим рядом. Раньше она обгоняла соседние ряды и могла закрыть их свободную полосу — «стена»
    // из трёх полос, которую не пройти. Пока тачка едет сзади, в её полосе новые ряды ничего не ставят.
    spawnRow(z, difficulty, speed = 13) {
        const transit = new Set(this.obstacles.filter((o) => o.userData.oncoming && o.position.z < z + 3).map((o) => o.userData.lane));
        const open = [0, 1, 2].filter((l) => !transit.has(l));
        if (!open.length) return; // по всем трём полосам едут тачки — ряд пустой
        const free = pick(open);
        const blocked = open.filter((l) => l !== free && Math.random() < 0.35 + difficulty * 0.45);
        if (!blocked.length && open.length === 3) blocked.push((free + 1 + Math.floor(Math.random() * 2)) % 3);
        // монета или баночка не должна оказаться внутри препятствия соседнего ряда в той же полосе
        const taken = (lane, cz) => this.obstacles.some((o) => o.userData.lane === lane && o.userData.type !== "decor" && Math.abs(o.position.z - cz) < (o.userData.halfZ || 0.5) + 0.8);

        for (const lane of blocked) {
            let kind = this.pickKind();
            if (this.noCars && kind === "car") kind = "block"; // встречная тачка проехала бы сквозь стену-возражение
            const o = this.addObstacle(kind, lane, z);
            if (o.userData.oncoming) o.position.z = z * (1 + o.userData.oncoming / Math.max(1, speed));
            // пост ДПС: инспектор на полосе, патрульная машина у обочины — там, где на тротуаре свободно
            // (иначе она встаёт внутрь банкомата, урны или прохожей); места нет — инспектор без машины
            const side = lane === 0 ? -1 : lane === 2 ? 1 : pick([-1, 1]);
            const dz = kind === "cop" && [-2, -5, 1, -8, 4].find((d) => this.sidewalkFree(side * 4.4, z + d, 1.2, 2.6));
            if (dz !== undefined && dz !== false) {
                const car = this.makePatrol();
                car.position.set(side * 4.4, 0.2, z + dz);
                car.rotation.y = car.userData.billboard ? 0 : -side * 0.35;
                car.userData.type = "decor";
                this.scene.add(car);
                this.obstacles.push(car);
            }
            if ((kind === "dumpster" || SPRITES[kind]?.top) && Math.random() < 0.5) {
                // дуга монет над баком — награда за прыжок
                for (let i = -2; i <= 2; i++) this.addCoin(lane, z + i * 1.1, 1.9 - Math.abs(i) * 0.3);
            }
        }

        // дорожка монет по свободной полосе — обрывается перед препятствием ближнего ряда (на скорости ряды ближе, чем длина дорожки)
        if (Math.random() < 0.75) {
            const n = 4 + Math.floor(Math.random() * 4);
            const boostAt = Math.random() < 0.12 ? Math.floor(n / 2) : -1;
            for (let i = 0; i < n; i++) {
                const cz = z + 4 + i * 1.6;
                if (taken(free, cz)) break;
                this.addCoin(free, cz, 0.7, i === boostAt);
            }
        }
        // иногда — баночка из NS Store на свободной полосе
        if (!this.noPickups && !taken(free, z + 1.5) && ++this.sincePickup > POWERUP_SPAWN.gap && Math.random() < POWERUP_SPAWN.chance) {
            this.sincePickup = 0;
            this.addPickup(pick(Object.keys(POWERUPS)), free, z + 1.5);
        }
    }

    clear() {
        this.noPickups = false;
        this.sincePickup = 0;
        for (const o of [...this.obstacles, ...this.coins]) this.dropObstacle(o);
        this.obstacles = [];
        this.coins = [];
        for (const o of [...this.rings, ...this.flashes]) o.visible = false;
    }

    // У каждого инспектора свой скелет, а у скелета — текстура костей в видеопамяти: освобождаем вместе с ним.
    // Свои (не общие) геометрии и материалы процедурных препятствий помечены userData.own — их тоже: без моделей
    // каждая тачка и банкомат оставляли в видеопамяти десяток буферов.
    // убрать препятствия (не стены и не декор) между z0 и z1, монеты оставить
    clearZone(z0, z1) {
        for (let i = this.obstacles.length - 1; i >= 0; i--) {
            const o = this.obstacles[i], t = o.userData.type;
            if (t === "decor" || t === "answer" || o.userData.islam) continue;
            if ((o.position.z > z0 && o.position.z < z1) || (o.userData.oncoming && o.position.z < z1)) {
                this.dropObstacle(o);
                this.obstacles.splice(i, 1);
            }
        }
    }

    dropObstacle(o) {
        this.scene.remove(o);
        o.traverse((m) => {
            m.skeleton?.dispose();
            if (m.geometry?.userData.own) m.geometry.dispose();
            for (const mat of [].concat(m.material || [])) if (mat.userData?.own) { mat.map?.dispose(); mat.dispose(); }
        });
    }

    removeCoin(i) {
        this.dropObstacle(this.coins[i]); // у баночки-заглушки свои геометрия и материал
        this.coins.splice(i, 1);
    }

    // ---- кадр --------------------------------------------------------------------------------

    // Спрайты поворачиваются к камере; мигалки мигают; свет мигалок — у ближайшей патрульной
    updateSprites(t) {
        const cam = this.camera;
        if (!cam) return;
        const flashOn = Math.floor(t * 6) % 2 === 0;
        let nearest = null, best = Infinity;
        const visit = (o) => {
            const u = o.userData;
            if (u.billboard) o.rotation.y = Math.atan2(cam.position.x - o.position.x, cam.position.z - o.position.z);
            if (u.lamp) u.lamp.material.opacity = 0.55 + 0.45 * Math.abs(Math.sin(t * 5));
            if (u.flashers) {
                u.flashers[0].visible = flashOn;
                u.flashers[1].visible = !flashOn;
            }
            if (u.glare) { // блик фар: ближе и ровнее в твоей полосе — ярче
                const near = Math.max(0, 1 - -o.position.z / 45) * (o.position.z < 0 ? 1 : 0);
                const lane = Math.max(0, 1 - Math.abs(o.position.x - this.playerX) / 2.2);
                u.glare.scale.setScalar(0.4 + 3.4 * near * near * (0.35 + 0.65 * lane));
            }
            if (u.flashers || u.police) {
                const dz = -o.position.z;
                if (dz > -4 && dz < best) { best = dz; nearest = o; }
            }
        };
        for (const o of this.scenery) visit(o);
        for (const o of this.obstacles) visit(o);
        if (!this.policeLights) return;
        this.policeLights.forEach((l, i) => {
            l.intensity = nearest && best < 45 && (i === 0) === flashOn ? 6 : 0;
            if (nearest) l.position.set(nearest.position.x * 0.8, 2.2, nearest.position.z + 1);
        });
    }

    update(dt, move, t) {
        // дорога, разметка и плитка «едут» через сдвиг текстуры
        this.roadMap.offset.y += move * this.roadRepeat / STREET_LEN;
        this.dashMap.offset.y += move * (STREET_LEN / 8) / STREET_LEN;
        this.walkMap.offset.y += move * this.walkRepeat / STREET_LEN;

        for (const o of this.scenery) {
            o.position.z += move;
            if (o.position.z > BEHIND_Z) o.position.z -= o.userData.loop;
        }
        for (const l of this.lights) {
            l.position.z += move;
            if (l.position.z > DESPAWN_Z) l.position.z -= l.userData.loop;
        }

        // скелетная анимация только у тех, кто рядом и впереди (дальше — туман)
        for (const o of this.officers) if (o.position.z > -70 && o.position.z < 8) o.userData.mixer.update(dt);
        for (const o of this.critters) {
            if (o.userData.walk) o.position.z += o.userData.walk * dt; // гуляют вдоль тротуара
            if (o.visible && o.position.z > -70 && o.position.z < 8) o.userData.mixer?.update(dt);
        }
        this.updateFlocks(dt, t);
        for (const o of this.obstacles) if (o.userData.mixer && o.position.z > -70) o.userData.mixer.update(dt);

        for (let i = this.obstacles.length - 1; i >= 0; i--) {
            const o = this.obstacles[i];
            o.position.z += move + (o.userData.oncoming || 0) * dt;
            if (o.position.z > DESPAWN_Z) {
                this.dropObstacle(o);
                this.obstacles.splice(i, 1);
            }
        }
        for (let i = this.coins.length - 1; i >= 0; i--) {
            const c = this.coins[i];
            c.position.z += move;
            if (c.userData.model) c.rotation.y = t * 3; else c.rotation.z = t * 3;
            c.position.y = c.userData.baseY + Math.sin(t * 4 + c.position.z) * 0.06;
            if (c.position.z > DESPAWN_Z) this.removeCoin(i);
        }

        for (const d of this.drops) {
            if (!d.visible) continue;
            const v = d.userData.v;
            v.y -= 14 * dt;
            d.position.x += v.x * dt;
            d.position.y += v.y * dt;
            d.position.z += v.z * dt + move;
            if (d.position.y < 0) d.visible = false;
        }
        for (const r of this.rings) {
            if (!r.visible) continue;
            const u = r.userData;
            u.t += dt;
            const k = Math.min(1, u.t / u.dur);
            r.scale.setScalar(u.size * (0.3 + 0.7 * (1 - (1 - k) ** 3)));
            r.material.opacity = 0.7 * (1 - k);
            r.position.z += move;
            if (k >= 1) r.visible = false;
        }
        for (const f of this.flashes) {
            if (!f.visible) continue;
            f.userData.t += dt;
            const k = Math.min(1, f.userData.t / 0.18);
            f.scale.setScalar(0.35 + 0.65 * k); // небольшая короткая вспышка: в полёте монеты идут подряд и сливались в шар
            f.material.opacity = (1 - k) * 0.8;
            f.position.z += move;
            if (k >= 1) f.visible = false;
        }

        this.updateSprites(t);

        // дождь
        const pos = this.rain.geometry.attributes.position.array;
        for (let i = 0, n = this.rainCount ?? this.rainSpeed.length; i < n; i++) {
            const k = i * 6;
            const dy = this.rainSpeed[i] * dt;
            pos[k + 1] -= dy; pos[k + 4] -= dy;
            pos[k + 2] += move; pos[k + 5] += move;
            if (pos[k + 1] < 0 || pos[k + 2] > 8) {
                const x = rnd(-9, 9), y = rnd(10, 14), z = rnd(-40, 4);
                pos.set([x, y, z, x + 0.03, y - 0.45, z + 0.12], k);
            }
        }
        this.rain.geometry.attributes.position.needsUpdate = true;
    }
}

export { SPAWN_Z };
