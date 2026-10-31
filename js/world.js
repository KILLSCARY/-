import { CoinBatch } from "./coin-batch.js";
import { updateAmbientAnimation } from "./frame-timing.js";
// Ночной район: мокрый асфальт, хрущёвки с окнами, рольставни, красные лампы у подъездов,
// оранжевые фонари, дождь. Плюс препятствия и монеты, которые едут навстречу крысу.
// Фасады и асфальт — текстуры из папки textures/ (см. TEXTURES в config.js),
// гофрометалл и бетон цоколя — Poly Haven (CC0).

import * as THREE from "./vendor/three.module.js";
import { cartoonRoad } from "./road-art.js";
import { cartoonModel, paintImage } from "./toon-tex.js";

const KEEP_PHOTO = ["coin", "testo", "choline", "ezhovik", "atm", "bank", "starbox"];
import { Reflector } from "./vendor/jsm/Reflector.js";
import { TEXTURES, BANKS, ATMS, MODELS, SPRITES, OBSTACLE_MIX, POWERUPS, POWERUP_SPAWN, POLICE_OFFICER, CLIENT_TYPES, LANE_LABELS, CHARACTERS, CHASER, NPCS, SKY, WIND, WIRES, LAMP_GLOW, CHASERS } from "./config.js";
import { clone as cloneSkinned } from "./vendor/jsm/SkeletonUtils.js";
import { mergeBufferGeometries } from "./vendor/jsm/BufferGeometryUtils.js";
import { loadModel, later } from "./models.js";
import { aim, ik } from "./catch-scene.js";
import { Vietnam } from "./vietnam.js";
import { Winter, WINTER_OBSTACLES } from "./winter.js";

const SPAWN_Z = -95;   // где появляются предметы
const DESPAWN_Z = 12;  // где исчезают (уже за камерой)
const STREET_LEN = 160;
// Ночью препятствия, полиция и прохожие сливались с асфальтом: подсвечиваем их собственной текстурой.
// Без новых источников света: другое число источников — пересборка всех шейдеров и рывок в забеге
const LIFT = { object: 0.34, character: 0.3 };
function liftDark(root, k) {
    root.traverse((o) => {
        if (!o.isMesh) return;
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
            if (!m.emissive) continue;
            m.emissive.copy(m.map ? new THREE.Color(0xffffff) : m.color);
            m.emissiveMap = m.map || null;
            m.emissiveIntensity = k;
            m.needsUpdate = true;
        }
    });
}
const NIKITA_X = { street: 3.9, winter: 3.25, vietnam: 4.4 }; // где у района край дороги: в зимнем сразу за ней сугроб и ограда
const BEHIND_Z = 45;   // улица тянется и за спину крыса — её видно с камеры меню
const FLOOR_H = 2.9;
const CAR_FRONT = { x: 0.5, y: 0.58, z: 2.12 }; // фары машины, собранной в коде (makeCar)
const RIPPLES = 72; // кругов от капель дождя на асфальте — пул (сколько видно — по графике: tier.rain / 10)
const _blobBox = new THREE.Box3(), _blobPart = new THREE.Box3();
const BLOBS = 64; // пятен-теней на кадр не больше (один InstancedMesh на все)
const BLOB_KINDS = new Set(["bin", "police"]); // на тротуаре пятно-тень у урн и патрульных машин (прохожие ходят — без)
// размеры для столкновений процедурных препятствий: halfZ — полудлина, top — что перепрыгнуть, oncoming — едет навстречу (м/с)
const OBSTACLE_STATS = {
    dumpster: { halfZ: 0.55, top: 0.75 }, // перепрыгнуть: прыжок до ~1.4 м, порог ниже крышки — окно прыжка ~0.45 с
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
function loadTex(file, repeat, srgb, opts) {
    let entry = texCache[file];
    if (!entry) {
        entry = texCache[file] = { copies: [], ready: false };
        entry.tex = new THREE.Texture();
        const load = () => loader.load(`textures/${file}`, (img) => {
            entry.tex.image = opts ? paintImage(img.image, opts) : img.image; // источник общий у всех копий
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

// Свет фонаря без настоящего источника (их на телефоне 1–2): kind "pool" — тёплое пятно на асфальте (круг на плоскости),
// "cone" — конус света в дымке (ярче у лампы, к земле и к краям гаснет). Сложение цвета (additive); с расстоянием
// гаснет сам (far — где пропадает): обычный туман для таких сеток не годится — подмешивал бы фиолетовый и светил вдали
function lampGlowMaterial(kind, color, strength, far) {
    return new THREE.ShaderMaterial({
        uniforms: { color: { value: new THREE.Color(color).multiplyScalar(strength) }, far: { value: far } },
        vertexShader: `
            varying vec2 vUv; varying float vY, vDepth; varying vec3 vN, vV;
            void main() {
                vUv = uv; vY = position.y;
                #ifdef USE_INSTANCING
                    vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0); // все фонари — одна отрисовка (World.updateLampGlow)
                    vN = normalize(normalMatrix * mat3(instanceMatrix) * normal);
                #else
                    vec4 mv = modelViewMatrix * vec4(position, 1.0);
                    vN = normalize(normalMatrix * normal);
                #endif
                vDepth = -mv.z; vV = normalize(-mv.xyz);
                curveBend(mv);
                gl_Position = projectionMatrix * mv;
            }`,
        fragmentShader: `
            uniform vec3 color; uniform float far; varying vec2 vUv; varying float vY, vDepth; varying vec3 vN, vV;
            void main() {
                float a;
                ${kind === "pool"
                    ? "float r = length(vUv - 0.5) * 2.0; a = pow(max(0.0, 1.0 - r), 2.2);"
                    : `float t = clamp(vY / ${CONE_H.toFixed(2)} + 0.5, 0.0, 1.0); a = pow(t, 1.6) * pow(abs(dot(vN, vV)), 1.5);`}
                a *= 1.0 - smoothstep(far * 0.45, far, vDepth);
                gl_FragColor = vec4(color * a, 1.0);
            }`,
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: kind === "cone" ? THREE.DoubleSide : THREE.FrontSide,
    });
}
const CONE_H = 5.1;

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
// paint — перекрасить цвет под мультяшный стиль (см. paintImage)
function pbr(name, repeat, maps = ["nor", "rough"], paint) {
    const out = { map: loadTex(`${name}_diff.jpg`, repeat, true, paint) };
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

// несколько строк по центру блока (align "left" — по левому краю): подбираем размер, чтобы влезло по ширине и высоте
function wrapText(g, text, cx, top, maxW, maxH, font, align = "center", start = 60) {
    for (let s = start; s >= 26; s -= 2) {
        g.font = font.replace("{s}", s);
        const words = text.split(" "), lines = [];
        let line = "";
        for (const w of words) {
            const t = line ? `${line} ${w}` : w;
            if (g.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t;
        }
        lines.push(line);
        const lh = s * 1.15;
        if (s <= 26 || (lines.length * lh <= maxH && lines.every((l) => g.measureText(l).width <= maxW))) { // не влезло и мелко — всё равно пишем
            const y0 = top + (maxH - lines.length * lh) / 2 + s * 0.9;
            g.textAlign = align; // "left" — cx это левый край
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
        for (let i = 0; i < 14; i++) g.clearRect(rnd(2, w - 3), rnd(0, h * 0.5), 1, 2); // немного стёртой краски (было 60 крупных — разметка шла чёрными точками)
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
export function buildEnvironment(renderer, colors = SKY.env) {
    const env = new THREE.Scene();
    const sky = new THREE.Mesh(
        new THREE.SphereGeometry(50, 32, 16),
        new THREE.MeshBasicMaterial({
            side: THREE.BackSide,
            map: canvasTex(16, 256, (g, w, h) => {
                const grad = g.createLinearGradient(0, 0, 0, h);
                const [z, a, hz, b, n] = colors; // отражения — в цветах неба (сиреневая ночь; у Нячанга — день, VIETNAM.env)
                grad.addColorStop(0, z);
                grad.addColorStop(0.42, a);
                grad.addColorStop(0.5, hz);
                grad.addColorStop(0.56, b);
                grad.addColorStop(1, n);
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
        const beforeStreet = new Set(scene.children);
        this.buildStreet();
        this.streetRoots = scene.children.filter(o => !beforeStreet.has(o));
        this.buildRain();
        this.buildRipples();
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

    // Локации строятся при первом выборе; перед переключением восстанавливаем скрытые объекты предыдущей.
    setLocation(name) {
        if ((this.location || "street") === name) return;
        this.winter?.set(false);
        this.vietnam?.set(false);
        this.location = name;
        if (name === "vietnam" && !this.vietnam) this.vietnam = new Vietnam(this, { streetLen: STREET_LEN, behindZ: BEHIND_Z });
        if (name === "winter" && !this.winter) this.winter = new Winter(this, { streetLen: STREET_LEN, behindZ: BEHIND_Z });
        if (name === "vietnam") this.vietnam.set(true); // асфальт и лужи те же: после тропического ливня он тоже мокрый
        if (name === "winter") this.winter.set(true);
        if (this.roadMat) this.wetSheen(); // но днём асфальт матовее (wetSheen)
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
        const wall = pbr(TEXTURES.wall || "wall", [2, 2]);
        const iron = pbr(TEXTURES.iron || "iron", [2, 1]);
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
            trashBag: std({ color: 0x17181a, roughness: 0.72, metalness: 0.05 }),
            cardboard: std({ color: 0x71513a, roughness: 0.92, metalness: 0 }),
            tin: std({ color: 0x6e787d, roughness: 0.36, metalness: 0.82 }),
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
            blob: new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), // пятно-тень под предметом (groundBlob)
            trashBag: new THREE.SphereGeometry(1, 14, 10),
            cardboard: new THREE.BoxGeometry(1, 1, 1),
            tin: new THREE.CylinderGeometry(1, 1, 1, 12),
        };
        // пятно-тень: мягкий край (радиальный градиент), только форма — альфа; сила — по графике (tier.blob, 0 — нет)
        this.mat.blob = new THREE.MeshBasicMaterial({
            color: 0x000000, alphaMap: canvasTex(64, 64, (g, w) => {
                const r = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
                r.addColorStop(0, "rgba(255,255,255,1)"); r.addColorStop(0.5, "rgba(255,255,255,.7)"); r.addColorStop(1, "rgba(255,255,255,0)");
                g.fillStyle = r; g.fillRect(0, 0, w, w);
            }),
            transparent: true, depthWrite: false, opacity: this.tier.blob ?? 0.5, visible: (this.tier.blob ?? 0.5) > 0,
            polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
        });
        this.blobs = new THREE.InstancedMesh(this.geo.blob, this.mat.blob, BLOBS); // все пятна — одна отрисовка (updateBlobs)
        this.blobs.frustumCulled = false; // экземпляры по всей улице — общая рамка у меша неверная
        this.blobs.renderOrder = 1;
        this.blobs.count = 0;
        this.scene.add(this.blobs);

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

        // мультяшный ночной асфальт: без разметки, она отдельным слоем ниже
        this.roadMap = canvasTex(1024, 1024, (g, W, H) => cartoonRoad(g, W, H, { base: "#2c2a38", light: "rgba(150,140,180,.05)", dark: "rgba(14,12,24,.07)", track: "rgba(22,12,40,.2)", dashes: 0 }));
        this.roadMap.wrapS = this.roadMap.wrapT = THREE.RepeatWrapping;
        this.roadMap.anisotropy = 8;
        this.roadRepeat = STREET_LEN / 6;
        this.roadMap.repeat.set(1, this.roadRepeat);
        this.roadMat = new THREE.MeshStandardMaterial({ map: this.roadMap, roughness: 0.85, metalness: 0.05, envMapIntensity: 0.35 });
        const roadMesh = new THREE.Mesh(new THREE.PlaneGeometry(6, STREET_LEN, 1, 40), this.roadMat);
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
            const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.12, STREET_LEN, 1, 40), dashMat);
            dash.rotation.x = -Math.PI / 2;
            dash.position.set(x, 0.006, centerZ);
            dash.renderOrder = 2;
            s.add(dash);
        }

        // тротуары и бордюр
        const walkTex = pbr(TEXTURES.sidewalk, [1.5, STREET_LEN / 3], [], { size: 1024, smooth: 2, sat: 0.9, gain: 0.62 });
        this.walkMap = walkTex.map;
        this.walkRepeat = STREET_LEN / 3;
        const walkMat = new THREE.MeshStandardMaterial({ ...walkTex, roughness: 0.9, envMapIntensity: 0.3 });
        for (const side of [-1, 1]) {
            const w = new THREE.Mesh(new THREE.BoxGeometry(4, 0.18, STREET_LEN, 1, 1, 40), walkMat);
            w.position.set(side * 5, 0.09, centerZ);
            w.receiveShadow = true;
            const curb = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.24, STREET_LEN, 1, 1, 40), this.mat.trim);
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

        if (WIRES.on) this.buildWires();

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
        this.reflector = new Reflector(new THREE.PlaneGeometry(6, STREET_LEN, 1, 40), {
            textureWidth: width, textureHeight: height, color: new THREE.Color(0.42, 0.4, 0.4),
        });
        // мокрый асфальт отражает не зеркалом: размыто, вытянуто по вертикали (полосы от фонарей и окон) и с рябью.
        // Было texture2DProj — чёткое отражение, как пластик
        const sh = this.reflector.material;
        sh.vertexShader = sh.vertexShader.replace("gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );", "vec4 mv = modelViewMatrix * vec4(position, 1.0); curveBend(mv); gl_Position = projectionMatrix * mv;");
        sh.fragmentShader = sh.fragmentShader
            .replace("void main() {", "float rh(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }\n\t\tvoid main() {")
            .replace("vec4 base = texture2DProj( tDiffuse, vUv );", `vec2 p = vUv.xy / vUv.w;
			p += (vec2(rh(floor(gl_FragCoord.xy / 2.0)), rh(floor(gl_FragCoord.yx / 2.0) + 3.1)) - 0.5) * 0.005;
			vec4 base = texture2D(tDiffuse, p) * 0.32
				+ (texture2D(tDiffuse, p + vec2(0.0, 0.008)) + texture2D(tDiffuse, p - vec2(0.0, 0.008))) * 0.22
				+ (texture2D(tDiffuse, p + vec2(0.0, 0.018)) + texture2D(tDiffuse, p - vec2(0.0, 0.018))) * 0.12;`);
        sh.needsUpdate = true;
        // зеркало луж рисует сцену второй раз — на телефоне через кадр (tier.mirrorEvery): лужи размыты, разница не видна
        const mirror = this.reflector.onBeforeRender;
        let frame = 0;
        this.reflector.onBeforeRender = (...a) => { if ((this.tier.mirrorEvery || 1) > 1 && frame++ % this.tier.mirrorEvery) return; mirror.apply(this.reflector, a); };
        this.reflector.rotation.x = -Math.PI / 2;
        this.reflector.position.set(0, 0, this.roadCenterZ);
        this.reflector.renderOrder = 0;
        this.scene.add(this.reflector);
        this.roadMat.transparent = true; // сквозь «мокрые» места асфальта видно зеркало
        this.roadMat.alphaMap = this.roadMat.roughnessMap;
        this.wetSheen(false);
        this.roadMat.needsUpdate = true;
    }

    // без зеркала (средняя и слабая графика) асфальт был матовой массой: глаже и сильнее отражает окружение —
    // мокрый блеск от неба и неона (scene.environment) почти даром
    wetSheen(on = this.sheenOn) {
        this.sheenOn = on;
        const day = (this.location || "street") === "vietnam"; // днём (Нячанг) яркое небо в отражении — асфальт блестел фольгой
        this.roadMat.roughness = day ? 0.82 : 0.85;
        this.roadMat.metalness = day ? 0.08 : 0.05;
        this.roadMat.envMapIntensity = 0.35;
        // зеркало луж (хорошая графика) затемнено под ночь — днём лужи выходили чёрными «нефтяными» пятнами
        this.reflector?.material.uniforms.color.value.setRGB(...(day ? [0.55, 0.55, 0.58] : [0.42, 0.4, 0.4]));
    }

    disableReflections() {
        // асфальт делаем непрозрачным всегда: на телефоне зеркала не было с самого начала, но прозрачность стояла
        if (this.reflector) {
            this.scene.remove(this.reflector);
            this.reflector.dispose();
            this.reflector = null;
        }
        this.wetSheen(true);
        if (!this.roadMat.transparent) return;
        this.roadMat.transparent = false;
        this.roadMat.alphaMap = null;
        this.roadMat.needsUpdate = true;
    }

    // Столбы с проводами, как в Subway Surfers: пара столбов у бордюров, растяжка поперёк, над полосами —
    // два контактных провода, вдоль тротуаров — по три провода ЛЭП. Пролёт до следующей пары — в той же группе,
    // поэтому при переносе группы по кругу (STREET_LEN кратна шагу) провода не рвутся. Провода — тонкие трубки
    // (вблизи заметны, вдали тают в тумане), все пролёты пары — одна сетка, столбы — одна. Высота выше полёта.
    buildWires() {
        const { step, height: H, sag, thick } = WIRES, n = Math.round(STREET_LEN / step);
        const wireMat = new THREE.MeshBasicMaterial({ color: WIRES.color });
        const concrete = new THREE.MeshStandardMaterial({ color: WIRES.pole, roughness: 0.92, metalness: 0 });
        const V = (x, y, z) => new THREE.Vector3(x, y, z);
        const span = (a, b, dip, seg = 12) => { // провисший пролёт — парабола
            const pts = [];
            for (let i = 0; i <= seg; i++) { const t = i / seg, p = a.clone().lerp(b, t); p.y -= dip * 4 * t * (1 - t); pts.push(p); }
            const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), seg, thick, 3, false);
            geo.deleteAttribute("uv"); geo.deleteAttribute("normal");
            return geo;
        };
        for (let i = 0; i < n; i++) {
            const g = new THREE.Group(), wires = [];
            for (const side of [-1, 1]) {
                const x = side * WIRES.x;
                const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.15, H + 0.4, 7), concrete);
                pole.position.set(x, (H + 0.4) / 2, 0);
                const arm = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.1, 0.1), concrete); // траверса над тротуаром
                arm.position.set(x + side * 0.6, H - 0.1, 0);
                g.add(pole, arm);
                for (const dx of [0.2, 0.75, 1.3]) wires.push(span(V(x + side * dx, H, 0), V(x + side * dx, H, -step), sag * 1.3)); // ЛЭП вдоль тротуара
            }
            wires.push(span(V(-WIRES.x, H - 0.4, 0), V(WIRES.x, H - 0.4, 0), 0.25, 8)); // растяжка поперёк дороги
            for (const x of [-1.7, 1.7]) wires.push(span(V(x, H - 0.55, 0), V(x, H - 0.55, -step), sag)); // над полосами
            mergeStatic(g);
            g.add(new THREE.Mesh(mergeBufferGeometries(wires), wireMat));
            g.position.z = BEHIND_Z - WIRES.offset - i * step;
            g.userData.loop = STREET_LEN;
            this.scene.add(g);
            this.scenery.push(g);
        }
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
        // свет фонаря: пятно на асфальте под лампой и конус в дымке (на слабой графике — только пятно). Рисуются все
        // фонари сразу (updateLampGlow: два InstancedMesh) — здесь только где лампа: раньше у каждого фонаря свои
        // пятно и конус, +16 отрисовок на кадр
        g.userData.glowX = -side * 1.1;
        (this.lampGlows ||= []).push(g);
        return g;
    }

    // пятна и конусы света всех фонарей — две отрисовки на кадр; конусы — только если графика тянет 2+ фонаря (tier.lights)
    updateLampGlow() {
        const lamps = this.lampGlows;
        if (!lamps?.length) return;
        if (!this.lampPools) {
            const pool = lampGlowMaterial("pool", 0xff8a3a, LAMP_GLOW.pool, LAMP_GLOW.far);
            const cone = lampGlowMaterial("cone", 0xffa060, LAMP_GLOW.cone, LAMP_GLOW.far);
            this.lampPools = new THREE.InstancedMesh(new THREE.PlaneGeometry(LAMP_GLOW.size, LAMP_GLOW.size).rotateX(-Math.PI / 2), pool, lamps.length);
            this.lampCones = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.18, 1.7, CONE_H, 20, 1, true), cone, lamps.length);
            this.lampPools.renderOrder = 2; // поверх асфальта и луж
            for (const m of [this.lampPools, this.lampCones]) { m.frustumCulled = false; this.scene.add(m); }
            this.dayGlow(this.glowK ?? 1);
        }
        const mx = this.lampMatrix ||= new THREE.Matrix4();
        let n = 0;
        for (const g of lamps) {
            if (!g.visible || g.position.z < -this.tier.far - 10 || g.position.z > 16) continue;
            const c = Math.cos(g.rotation.y), s = Math.sin(g.rotation.y), x = g.position.x + g.userData.glowX * c, z = g.position.z - g.userData.glowX * s;
            this.lampPools.setMatrixAt(n, mx.makeRotationY(g.rotation.y).setPosition(x, 0.04, z));
            this.lampCones.setMatrixAt(n, mx.setPosition(x, 5.15 - CONE_H / 2, z));
            n++;
        }
        this.lampPools.count = n;
        this.lampCones.count = this.tier.lights > 1 ? n : 0;
        this.lampPools.instanceMatrix.needsUpdate = this.lampCones.instanceMatrix.needsUpdate = true;
    }

    // днём (Нячанг) свет фонарей тусклее: k — доля ночной яркости (1 — ночь). Пятна и конуса создаются при первом
    // кадре (updateLampGlow) — тогда k применится там
    dayGlow(k) {
        this.glowK = k;
        for (const m of [this.lampPools?.material, this.lampCones?.material]) {
            if (!m) continue;
            m.userData.base ||= m.uniforms.color.value.clone();
            m.uniforms.color.value.copy(m.userData.base).multiplyScalar(k);
        }
    }

    // Материал фасада: картинка дома натянута на всю высоту, по ширине виден кусок len метров
    // (variant сдвигает его, чтобы соседние дома не были одинаковыми); окна горят (bloom)
    facadeMaterial(index, len, variant) {
        const key = `${index}_${variant}`;
        if (this.mat.facades[key]) return this.mat.facades[key];
        const f = TEXTURES.facades[index];
        const h = f.floors * FLOOR_H + 0.8;
        const share = Math.min(1, len / (h * f.aspect)); // какая доля ширины картинки помещается на дом
        // мультяшные дома: темнота поднята в сиреневый, стены читаются; окна светятся своей картой
        const maps = pbr(f.name, [share, 1], ["glow"], { size: 2048, smooth: 1.5, sat: 1, gain: 1.15, lift: [14, 12, 24] });
        maps.map.offset.x = maps.emissiveMap.offset.x = (1 - share) * variant / 2;
        const m = new THREE.MeshStandardMaterial({
            ...maps, color: 0xffffff, roughness: 0.92, emissive: 0xffffff, emissiveIntensity: 2.2,
            envMapIntensity: 0.3,
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
        g.userData.city = true; // в Дубае (js/vietnam.js) вместо хрущёвок — небоскрёбы
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
        if (this.winter?.on) this.winter.hide(o);
        if (this.vietnam?.on) this.vietnam.hide(o);
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
            car.children[0].visible = false; // картинку не показываем: пост появится, когда загрузится 3D-модель (swapIn)
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

    // круги от капель на асфальте: дождь шёл, а дорога оставалась сухой. Одна отрисовка на все (InstancedMesh):
    // кольцо растёт и гаснет за ~0,5 с, яркость — цветом экземпляра (сложение света: чёрный — невидим), едет с дорогой
    buildRipples() {
        const ring = canvasTex(64, 64, (g, w) => {
            g.clearRect(0, 0, w, w);
            g.strokeStyle = "rgba(255,255,255,1)"; g.lineWidth = 4;
            g.shadowColor = "#fff"; g.shadowBlur = 4;
            g.beginPath(); g.arc(w / 2, w / 2, w / 2 - 6, 0, Math.PI * 2); g.stroke();
            g.lineWidth = 1.2; g.globalAlpha = 0.45;
            g.beginPath(); g.arc(w / 2, w / 2, w / 2 - 15, 0, Math.PI * 2); g.stroke(); // второе, внутреннее кольцо
        });
        const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
        const mat = new THREE.MeshBasicMaterial({ map: ring, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
        this.ripples = new THREE.InstancedMesh(geo, mat, RIPPLES);
        this.ripples.frustumCulled = false; // экземпляры по всей дороге — общая рамка у меша неверная
        this.ripples.renderOrder = 2;
        this.rippleState = Array.from({ length: RIPPLES }, () => ({ x: 0, z: 0, age: 1, life: 0.5 }));
        this.rippleBase = new THREE.Color(0xb4acec); // светлее асфальта: на пёстрой мокрой дороге тусклые кольца терялись
        const c = new THREE.Color(0);
        for (let i = 0; i < RIPPLES; i++) this.ripples.setColorAt(i, c);
        this.ripples.count = Math.min(RIPPLES, Math.round(this.tier.rain / 10));
        this.scene.add(this.ripples);
    }

    updateRipples(dt, move) {
        const r = this.ripples, n = r.count;
        if (!n || !r.visible) return;
        const m = this.rippleMatrix ||= new THREE.Matrix4(), c = this.rippleColor ||= new THREE.Color();
        for (let i = 0; i < n; i++) {
            const s = this.rippleState[i];
            s.age += dt; s.z += move;
            if (s.age >= s.life || s.z > 6) { // новая капля: на дороге перед камерой, с разбросом во времени
                s.x = rnd(-3.6, 3.6); s.z = rnd(-28, 4); s.life = rnd(0.35, 0.65); s.age = -rnd(0, 0.4);
            }
            const k = Math.max(0, s.age) / s.life, size = s.age < 0 ? 0 : 0.1 + k * 0.42;
            m.makeScale(size, 1, size).setPosition(s.x, 0.016, s.z);
            r.setMatrixAt(i, m);
            r.setColorAt(i, c.copy(this.rippleBase).multiplyScalar(s.age < 0 ? 0 : 0.85 * Math.pow(1 - k, 1.5)));
        }
        r.instanceMatrix.needsUpdate = true;
        r.instanceColor.needsUpdate = true;
    }

    // мягкое пятно-тень под предметом (контактная тень): машины, баки, урны «садятся» на асфальт. Без настоящих теней
    // (средняя графика) — единственная тень; на хорошей затеняет стык с асфальтом, куда тень от луны не достаёт.
    // Здесь только мерка (размер по габаритам без поворота, сдвиг от центра группы) — в userData.shade; рисуются
    // все пятна одним InstancedMesh (updateBlobs). Раньше у каждого предмета был свой меш — +20–30 отрисовок на кадр
    groundBlob(g) {
        g.userData.shade = null;
        const rot = g.rotation.y;
        g.rotation.y = 0;
        g.updateMatrixWorld(true);
        // мерка — по самому предмету: без пятна света фар (userData.fx, 7 м вперёд) и светящихся спрайтов — иначе тень
        // машины тянулась вперёд и чёрным овалом закрывала свет фар на дороге
        _blobBox.makeEmpty();
        g.traverse((m) => {
            if (!m.isMesh || m.isSprite || m.userData.fx || !m.geometry) return;
            if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
            _blobPart.copy(m.geometry.boundingBox).applyMatrix4(m.matrixWorld);
            _blobBox.union(_blobPart);
        });
        g.rotation.y = rot;
        const sx = _blobBox.max.x - _blobBox.min.x, sz = _blobBox.max.z - _blobBox.min.z;
        if (!Number.isFinite(sx) || sx <= 0 || sx > 8) return;
        const w = Math.max(sx, 0.4), d = Math.max(sz, sx * 0.6, 0.4); // спрайт плоский (глубина 0) — пятно по ширине
        g.userData.shade = {
            x: (_blobBox.min.x + _blobBox.max.x) / 2 - g.position.x, z: (_blobBox.min.z + _blobBox.max.z) / 2 - g.position.z,
            y: g.position.y >= 0.15 ? 0.185 : 0.012, // тротуар или асфальт
            w: w * 1.25, d: d * 1.3,
        };
    }

    // все пятна-тени за кадр: под каждым видимым предметом с меркой userData.shade (препятствия на дороге, урны и машины на тротуаре)
    updateBlobs() {
        const b = this.blobs;
        if (!this.mat.blob.visible) { b.count = 0; return; }
        const m = this.blobMatrix ||= new THREE.Matrix4(), q = this.blobQuat ||= new THREE.Quaternion();
        const p = this.blobPos ||= new THREE.Vector3(), s = this.blobScale ||= new THREE.Vector3(), up = this.blobUp ||= new THREE.Vector3(0, 1, 0);
        let n = 0;
        for (const list of [this.obstacles, this.scenery]) {
            for (const o of list) {
                const bl = o.userData.shade;
                if (!bl || !o.visible || o.position.z < -this.tier.far || o.position.z > 14) continue;
                if (n >= BLOBS) break;
                const ry = o.rotation.y, c = Math.cos(ry), sn = Math.sin(ry);
                p.set(o.position.x + bl.x * c + bl.z * sn, bl.y, o.position.z - bl.x * sn + bl.z * c);
                m.compose(p, q.setFromAxisAngle(up, ry), s.set(bl.w * o.scale.x, 1, bl.d * o.scale.z));
                b.setMatrixAt(n++, m);
            }
        }
        b.count = n;
        b.instanceMatrix.needsUpdate = true;
    }

    // брызги из луж: пул мелких капель
    // Одно облако точек на все капли (раньше — 80 отдельных белых шариков: 80 вызовов отрисовки, а свечение
    // раздувало их в белые пятна у ног). Капли мелкие, мягкие, полупрозрачные, цвета ночного неба, без свечения.
    buildSplash() {
        const N = 80;
        this.drops = [];
        for (let i = 0; i < N; i++) this.drops.push({ visible: false, position: new THREE.Vector3(0, -50, 0), userData: { v: new THREE.Vector3() } });
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(N * 3).fill(-50), 3));
        const dot = canvasTex(32, 32, (g, w) => {
            const r = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
            r.addColorStop(0, "rgba(255,255,255,1)"); r.addColorStop(0.5, "rgba(255,255,255,.5)"); r.addColorStop(1, "rgba(255,255,255,0)");
            g.fillStyle = r; g.fillRect(0, 0, w, w);
        });
        this.dropPoints = new THREE.Points(geo, new THREE.PointsMaterial({ map: dot, size: 0.07, color: 0xb9b0e0, transparent: true, opacity: 0.35, depthWrite: false, toneMapped: false }));
        this.dropPoints.frustumCulled = false;
        this.scene.add(this.dropPoints);
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

    // вспышка на месте собранной монеты; gold — золотая монета ×2
    flash(pos, gold = false) {
        const f = this.flashes[this.nextFlash];
        this.nextFlash = (this.nextFlash + 1) % this.flashes.length;
        f.position.copy(pos);
        // цвет ниже порога bloom: было 0,9/1,8/1,3 — свечение раздувало вспышку, монеты подряд сливались в зелёный шар
        // поверх героя (на телефоне при сниженном разрешении — на полэкрана). Золотая (×2, арка, верный ответ) — ярче
        f.material.color.setRGB(...(gold ? [1.5, 1.15, 0.45] : [0.35, 0.7, 0.5]));
        f.userData.gold = gold;
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
        g.userData = { type: "dumpster", halfZ: 0.55, top: OBSTACLE_STATS.dumpster.top };
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
        if (t && !boost) {
            if (!this.coinBatch) {
                this.coinBatch = CoinBatch.fromTemplate(t);
                if (this.coinBatch) this.scene.add(this.coinBatch.mesh);
            }
            const instance = this.coinBatch?.add();
            if (instance) return instance;
        }
        if (t) { // 3D-монета Tether (USDT)
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
        if (!c.userData.instanced) this.scene.add(c);
        this.coins.push(c);
    }

    // 3D-модели из Meshy (MODELS в config.js). Пока модель грузится или если её нет —
    // используется процедурная модель или спрайт, а загруженная подменяет их «на лету».
    loadObstacleModels() {
        this.templates = {};
        for (const [kind, list] of Object.entries(MODELS)) {
            for (const cfg of list) {
                if (this.tier.lite && cfg.noLite) continue;
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
                    // вывески и банкоматы с текстом и логотипами не трогаем: читаемость важнее стиля
                    if (!cfg.glow && !KEEP_PHOTO.includes(kind)) cartoonModel(m, cfg.clean ? { smooth: 24, sat: 0.08, gain: 1.05, lift: [14, 16, 24] } : undefined); // clean — смыть грязь и граффити
                    if (!cfg.glow && kind !== "coin") liftDark(m, LIFT.object);
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
                    let animated = gltf.animations.length > 0;
                    m.traverse((o) => { if (o.isSkinnedMesh) animated = true; });
                    if (!animated) m.traverse((o) => { o.updateMatrix(); o.matrixAutoUpdate = false; });
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
        liftDark(gltf.scene, LIFT.character);
        let box = new THREE.Box3().setFromObject(gltf.scene);
        let size = box.getSize(new THREE.Vector3());
        // сборки tools/meshy-convert (Малахов, Дима, Товарус): коробка скина в других единицах, чем кости (×100) —
        // тогда габариты по вершинам с учётом костей (как heroBox в rat.js)
        const bones = new THREE.Box3(), p = new THREE.Vector3();
        gltf.scene.updateMatrixWorld(true);
        gltf.scene.traverse((o) => { if (o.isBone) bones.expandByPoint(o.getWorldPosition(p)); });
        const bh = bones.getSize(p).y;
        if (bh > 0 && (size.y / bh > 1.6 || size.y / bh < 0.6)) {
            const real = new THREE.Box3();
            gltf.scene.traverse((o) => {
                if (!o.isSkinnedMesh) return;
                o.skeleton.update();
                o.frustumCulled = false; // сфера отсечения тоже в «чужих» единицах — иначе меш пропадает с экрана
                for (let i = 0, n = o.geometry.attributes.position.count; i < n; i += 5) real.expandByPoint(o.getVertexPosition(i, p).applyMatrix4(o.matrixWorld));
            });
            if (!real.isEmpty()) { box = real; size = box.getSize(new THREE.Vector3()); }
        }
        const k = length ? length / size.z : height / size.y;
        const c = box.getCenter(new THREE.Vector3());
        return { gltf, k, offset: new THREE.Vector3(-c.x * k, -box.min.y * k, -c.z * k) };
    }

    // Кто бежит за героем после первого удара (CHASER) — Мизулина
    loadChaser() {
        loadModel(this.lite(CHASER.url), (gltf) => {
            this.chaserModel = this.fitRig(gltf, CHASER.height);
            this.warmQueue.push(this.makeChaser());
        }, () => {}, { deferred: true });
    }

    // свой преследователь героя (CHASERS, у Димы и Саши Товаруса — Малахов): грузится, когда героя выбрали
    loadHeroChaser(key) {
        if (!key || !CHASERS[key] || (this.chaserModels ||= {})[key] !== undefined) return;
        this.chaserModels[key] = null;
        const cfg = CHASERS[key];
        loadModel(cfg.url, (gltf) => {
            this.chaserModels[key] = this.fitRig(gltf, cfg.height);
            this.warmQueue.push(this.makeChaser(key));
        }, () => {}); // сразу, не в очереди: иначе на телефоне весь первый забег за героем бежала бы замена
    }

    makeChaser(key = null) {
        const m = key ? this.chaserModels?.[key] : this.chaserModel;
        if (!m) return null;
        const c = this.rig(m, (key ? CHASERS[key] : CHASER).run, { chaser: true });
        c.userData.chaserKey = key;
        return c;
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
                if (kind === "nikita") { // ночью текстура почти чёрная и он теряется на фоне бака: подсвечиваем её саму, без лишнего источника света
                    m.gltf.scene.traverse((o) => { if (o.isMesh) { o.material.emissive.set(0xffffff); o.material.emissiveMap = o.material.map; o.material.emissiveIntensity = 0.42; o.material.needsUpdate = true; } });
                    loadModel(this.lite(cfg.bin), (bin) => { // сцены ставим, когда загрузились и бак, и Никита
                        const b = bin.scene;
                        b.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.material.emissive.set(0xffffff); o.material.emissiveMap = o.material.map; o.material.emissiveIntensity = 0.3; o.material.needsUpdate = true; } });
                        this.warmQueue.push(b.clone());
                        const spawn = () => { for (let i = 0; i < cfg.spots.length; i++) this.makeNikita(m, cfg, i, b); this.placeNikitas(); };
                        loadModel(this.lite(cfg.panties), (gltf) => {
                            const s = gltf.scene, k = 0.52 / new THREE.Box3().setFromObject(s).getSize(new THREE.Vector3()).x;
                            s.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.material.side = THREE.DoubleSide; o.material.emissive.set(0xffffff); o.material.emissiveMap = o.material.map; o.material.emissiveIntensity = 0.35; o.material.needsUpdate = true; } });
                            s.scale.setScalar(k);
                            this.pantiesModel = new THREE.Group().add(s);
                            this.warmQueue.push(this.pantiesModel.clone());
                            spawn();
                        }, spawn, { deferred: true });
                    }, () => {}, { deferred: true });
                }
            }, () => {}, { deferred: true });
        }
    }

    // Уровень графики сменился посреди игры (автоснижение, когда не хватает кадров): дождь короче, лишние живые NPC
    // прячутся. Число фонарей не меняем: другое число источников света — пересборка всех шейдеров, рывок в забеге.
    setTier(tier) {
        this.tier = tier;
        this.rainCount = Math.min(this.rainSpeed.length, tier.rain);
        this.rain.geometry.setDrawRange(0, this.rainCount * 2);
        this.ripples.count = Math.min(RIPPLES, Math.round(tier.rain / 10));
        this.mat.blob.opacity = tier.blob ?? 0.5;
        this.mat.blob.visible = this.mat.blob.opacity > 0;
        const keep = (list, total) => { const n = this.npcLimit(total); list.forEach((o, i) => { o.visible = i < n; }); };
        keep(this.critters.filter((o) => o.userData.npc === "girl"), this.swaps.girl?.length || 0);
        keep(this.critters.filter((o) => o.userData.npc === "cat"), NPCS.cat.count);
        keep(this.flocks, NPCS.pigeon.flocks);
        for (const bin of this.swaps.bin || []) this.addLitter(bin);
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
            g.position.x = Math.sign(g.position.x) * rnd(5.25, 5.4); // перед выступами домов (они с 5.7)
            delete g.userData.foot;
            g.userData.walk = dir * cfg.speed * rnd(0.8, 1.2);
            g.rotation.y = dir > 0 ? 0 : Math.PI; // модель смотрит в +Z
        } else {
            g.rotation.y = g.userData.faceY ?? 0;
        }
        if (!this.critters.includes(g)) this.critters.push(g);
    }

    // низкие части декора на тротуаре у стен (ступени, выступы, урны) — коробки относительно своего объекта, считаются один раз
    walkBoxes(o) {
        if (o.userData.walkBoxes) return o.userData.walkBoxes;
        const out = [];
        o.updateMatrixWorld(true);
        const b = new THREE.Box3();
        o.traverse((m) => {
            if (!m.isMesh || m.isSkinnedMesh || m.isInstancedMesh) return;
            b.setFromObject(m);
            if (b.isEmpty() || b.min.y > 0.6 || b.max.y < 0.12) return; // выше головы кота или плоское покрытие
            const band = (lo, hi) => b.max.x > lo && b.min.x < hi;
            if (!band(4.8, 6.6) && !band(-6.6, -4.8)) return; // не на дорожке у стен
            out.push({ x0: b.min.x, x1: b.max.x, z0: b.min.z - o.position.z, z1: b.max.z - o.position.z });
        });
        return (o.userData.walkBoxes = out);
    }

    // гуляющий упрётся в декор в ближайшие ~0.6 м?
    walkBlocked(w) {
        const hit = (z) => {
            const x = w.position.x;
            for (const o of this.scenery) {
                if (o === w || o.userData.walk !== undefined) continue;
                for (const b of this.walkBoxes(o)) {
                    if (x > b.x0 - 0.25 && x < b.x1 + 0.25 && z > o.position.z + b.z0 - 0.1 && z < o.position.z + b.z1 + 0.1) return true;
                }
            }
            for (const o of this.obstacles) if (Math.abs(o.position.z - z) < 0.6 && Math.abs(o.position.x - x) < 0.7) return true; // урны, банкоматы у тротуара
            return false;
        };
        // уже стоит внутри (так появился) — идёт дальше, чтобы выйти, а не дёргается на месте
        return !hit(w.position.z) && hit(w.position.z + Math.sign(w.userData.walk) * 0.6);
    }

    makeCat(m, cfg) {
        const side = pick([-1, 1]), dir = pick([-1, 1]);
        const cat = this.rig(m, cfg.walk);
        cat.position.set(side * rnd(5.25, 5.4), 0.18, BEHIND_Z - rnd(0, STREET_LEN)); // дорожка у стен, как у гуляющих
        cat.userData.walk = dir * cfg.speed * rnd(0.8, 1.2);
        cat.userData.npc = "cat";
        cat.rotation.y = dir > 0 ? 0 : Math.PI;
        this.addScenery(cat);
        this.critters.push(cat);
    }

    // Никита Енот у мусорки: своя сцена у каждого бака. Стоит во всех районах, поэтому не в общей декорации улицы
    // имя не makeDumpster: так называется препятствие на дороге, и второй метод с этим именем подменял его
    makeNikitaBin(binModel, cfg, side) {
        const m = (this.dumpMat ||= {
            bag: new THREE.MeshStandardMaterial({ color: 0x2b2b33, roughness: 0.35, emissive: 0x08080c }),
            box: new THREE.MeshStandardMaterial({ color: 0xa8804f, roughness: 1 }),
            trash: new THREE.MeshStandardMaterial({ color: 0xd8c24a, roughness: 0.8 }),
        });
        const g = new THREE.Group(), H = 1.12, k = H / cfg.binRim, bin = binModel.clone();
        bin.scale.multiplyScalar(k);
        bin.rotation.y = -side * Math.PI / 2; // открытая крышка — к домам, бак раскрыт к дороге
        g.add(bin);
        const box = (w, h, d, mat, x, y, z) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); b.position.set(x, y, z); b.castShadow = true; g.add(b); return b; };
        const bag = (x, y, z, r) => { const b = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), m.bag); b.position.set(x, y, z); b.scale.y = 0.8; b.rotation.y = x * 3; b.castShadow = true; g.add(b); return b; };
        return { g, m, H, box, bag };
    }

    makeNikita(model, cfg, i, binModel) {
        const mode = cfg.spots[i], side = i % 2 ? 1 : -1, d = this.makeNikitaBin(binModel, cfg, side), root = d.g;
        root.position.set(side * NIKITA_X.street, 0, BEHIND_Z - 40 - i * (STREET_LEN / cfg.spots.length));
        const rig = this.rig(model, "look");
        rig.userData.mixer.stopAllAction();
        const face = -side * 0.75; // к дороге и навстречу бегущему
        const u = root.userData = { mode, rig, side, t: 0, step: -1, y: 0, yTo: 0, mixer: rig.userData.mixer, acts: {}, thrown: [], nextThrow: 0, rim: d.H };
        for (const c of model.gltf.animations) { const a = u.mixer.clipAction(c); a.setLoop(THREE.LoopPingPong, Infinity); u.acts[c.name] = a; }
        root.add(rig);
        // Размеры сняты с модели бака и с костей клипов. Наклон shovel и смех внутри бака выводили руки и голову за стенку — там их нет
        if (mode === "dig") { // снаружи роется в куче у бака и швыряет мусор
            rig.position.set(-side * 0.15, 0, 1.4); rig.rotation.y = -side * Math.PI / 2;
            d.bag(-side * 0.72, 0.2, 1.72, 0.28); d.bag(-side * 0.82, 0.17, 1.2, 0.24);
            d.box(0.42, 0.3, 0.42, d.m.box, -side * 0.98, 0.15, 1.5).rotation.y = 0.5;
            d.bag(side * 0.05, d.H - 0.08, 0.1, 0.32);
            u.script = [["dig", 5, 0, true], ["look", 2.6, 0], ["dig", 4, 0, true], ["laugh", 3, 0], ["frustrated", 2.4, 0]];
        } else if (mode === "sit") { // сидит на переднем крае бака, таз ровно над кромкой, ноги свисают к дороге; швыряет мусор
            rig.position.x = -side * 0.59;
            rig.rotation.y = -side * (Math.PI / 2 - 0.35);
            d.bag(side * 0.1, d.H - 0.08, 0.1, 0.32);
            d.bag(side * -0.3, 0.2, 1.1, 0.26); d.bag(side * 0.25, 0.17, 1.15, 0.2);
            u.script = [["sit", 8, cfg.sitY]];
            u.rub = { pants: this.makePants(), bones: {} };
            root.add(u.rub.pants);
            rig.traverse((b) => { if (b.isBone) u.rub.bones[b.name.replace(/^mixamorig:?/, "")] = b; });
        } else { // в баке: выглядывает, ныряет с головой, вылетает мусор, снова выглядывает
            d.bag(side * 0.2, 0.2, 1.12, 0.24);
            d.box(0.95, 0.2, 1.05, d.m.bag, 0, 0.1, 0); // под днищем: ноги ныряющего не видны между колёсами
            rig.rotation.y = face;
            u.script = [["look", 3, cfg.insideY], ["look", 2.6, cfg.diveY, true], ["look", 1.8, cfg.insideY], ["look", 2.2, cfg.diveY, true]];
        }
        if (this.pantiesModel) { // одни висят на краю бака, другие валяются на земле лицевой стороной вверх
            const hang = this.pantiesModel.clone();
            u.panties = [hang];
            hang.position.set(-side * 0.65, 0.78, 0.4);
            hang.rotation.y = -side * Math.PI / 2;
            root.add(hang);
            const floor = this.pantiesModel.clone();
            floor.rotation.order = "YXZ";
            floor.position.set(-side * 0.95, 0.04, -0.85);
            floor.rotation.set(-1.42, -side * 1.1, 0);
            root.add(floor);
            u.panties.push(floor);
        }
        rig.visible = true;
        for (let k = 0; k < 5; k++) { // что вылетает из бака
            const t = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.08, 0.14), k % 2 ? d.m.box : d.m.trash);
            t.visible = false; t.castShadow = true; root.add(t); u.thrown.push({ t, v: new THREE.Vector3(), on: false });
        }
        this.scene.add(root);
        (this.nikitas ||= []).push(root);
        this.warmQueue.push(this.rig(model, null));
    }

    // в начале забега и в меню баки снова на своих местах. Первый — в кадре меню справа от героя: камера меню повёрнута,
    // дальше по улице бак уходит за спину героя, а на другой стороне — за край узкого экрана телефона
    placeNikitas() {
        (this.nikitas || []).forEach((o, i, all) => { o.position.z = 6 - i * (STREET_LEN / all.length); });
    }

    // женские трусы: сетка с вырезанным по текстуре силуэтом, чтобы ткань мялась (Nikita rubPants двигает вершины)
    makePants() {
        const tex = (this.pantsTex ||= (() => {
            const c = document.createElement("canvas"); c.width = 128; c.height = 96;
            const g = c.getContext("2d");
            g.beginPath(); g.moveTo(2, 8); g.lineTo(126, 8); g.lineTo(126, 24);
            g.quadraticCurveTo(84, 44, 76, 92); g.lineTo(52, 92); g.quadraticCurveTo(44, 44, 2, 24); g.closePath();
            g.fillStyle = "#ff78ad"; g.fill(); g.save(); g.clip();
            g.fillStyle = "#ffe3ee";
            for (let y = 16; y < 96; y += 14) for (let x = (y % 28 ? 0 : 7); x < 128; x += 14) { g.beginPath(); g.arc(x, y, 2.6, 0, Math.PI * 2); g.fill(); }
            g.restore();
            g.fillStyle = "#fff"; g.fillRect(2, 6, 124, 8); // кружевной пояс
            g.fillStyle = "#d81e5b"; g.beginPath(); g.moveTo(64, 15); g.lineTo(54, 10); g.lineTo(54, 20); g.closePath(); g.moveTo(64, 15); g.lineTo(74, 10); g.lineTo(74, 20); g.closePath(); g.fill(); // бантик
            const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding;
            return t;
        })());
        const geo = new THREE.PlaneGeometry(0.3, 0.22, 14, 10);
        const p = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.9, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.3 }));
        p.castShadow = true;
        p.frustumCulled = false;
        p.userData.base = geo.attributes.position.array.slice();
        return p;
    }

    // ткань сжимается между ладонями и идёт складками; вершин мало, а считается только у ближнего бака
    crumplePants(p, t) {
        const pos = p.geometry.attributes.position, b = p.userData.base, sq = 0.62 + 0.16 * Math.sin(t * 13), lift = 0.86 + 0.08 * Math.cos(t * 13);
        for (let i = 0; i < pos.count; i++) {
            const x = b[i * 3], y = b[i * 3 + 1], edge = Math.abs(x) / 0.15;
            pos.setXYZ(i, x * sq, y * lift + Math.sin(x * 34 + t * 8) * 0.012,
                Math.sin(x * 42 + t * 11) * Math.cos(y * 30 - t * 7) * 0.028 * (1 - 0.4 * edge) + Math.sin(y * 52 + t * 13) * 0.012);
        }
        pos.needsUpdate = true;
        p.geometry.computeVertexNormals();
    }

    // сидит на баке и трёт трусы: кисти ходят навстречу друг другу, поверх клипа sit
    rubPants(o, t, weak) {
        const u = o.userData, { pants, bones: b } = u.rub, A = this._rubA ||= { c: new THREE.Vector3(), f: new THREE.Vector3(), l: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0), L: new THREE.Vector3(), R: new THREE.Vector3(), p: new THREE.Vector3() };
        u.rig.updateMatrixWorld(true);
        u.rig.getWorldDirection(A.f);
        A.f.y = 0; A.f.normalize();
        A.l.crossVectors(A.up, A.f).normalize();
        // клип sit сгорблен: голова падала на руки. Спина прямая, голова чуть наклонена к рукам (направления мировые, не накапливаются)
        const back = A.up.clone().addScaledVector(A.f, 0.06), neck = A.up.clone().addScaledVector(A.f, 0.2), look = A.up.clone().addScaledVector(A.f, 0.55);
        aim(b.Spine, b.Spine1, back); aim(b.Spine1, b.Spine2, back); aim(b.Spine2, b.Neck, back); aim(b.Neck, b.Head, neck); aim(b.Head, b.HeadTop_End, look);
        const s = Math.sin(t * 13), c = Math.cos(t * 13);
        b.Hips.getWorldPosition(A.c);
        const mid = A.p.copy(A.c).addScaledVector(A.f, 0.36).addScaledVector(A.up, 0.2); // над коленями, далеко от лица
        A.L.copy(mid).addScaledVector(A.l, 0.11 + s * 0.05).addScaledVector(A.f, c * 0.035);
        A.R.copy(mid).addScaledVector(A.l, -0.11 + s * 0.05).addScaledVector(A.f, -c * 0.035);
        const pole = (side) => A.l.clone().multiplyScalar(side * 0.8).addScaledVector(A.up, -0.6).addScaledVector(A.f, -0.2);
        ik(b.LeftArm, b.LeftForeArm, b.LeftHand, A.L, pole(1));
        ik(b.RightArm, b.RightForeArm, b.RightHand, A.R, pole(-1));
        b.LeftHand.getWorldPosition(A.L); b.RightHand.getWorldPosition(A.R);
        mid.copy(A.L).add(A.R).multiplyScalar(0.5).addScaledVector(A.f, 0.05); // ткань между настоящими кистями
        o.worldToLocal(mid);
        pants.position.copy(mid);
        pants.rotation.set(-0.5 + c * 0.06, u.rig.rotation.y * 0.45, s * 0.12); // развёрнуты к камере забега
        pants.scale.setScalar(1.2);
        if (!weak) this.crumplePants(pants, t); // на самых слабых телефонах ткань без складок
    }

    updateNikitas(dt, move) {
        if (!this.nikitas) return;
        const y0 = (this.location || "street") === "street" ? 0.18 : 0.02;
        const npc = this.tier.npc ?? 1, active = npc >= 1 ? 4 : npc >= 0.6 ? 3 : 2, weak = npc < 0.5; // сколько баков тянет уровень графики
        for (let i = 0; i < this.nikitas.length; i++) {
            const o = this.nikitas[i];
            o.position.z += move;
            if (o.position.z > BEHIND_Z) o.position.z -= STREET_LEN;
            o.position.y = y0;
            o.position.x = o.userData.side * NIKITA_X[this.location || "street"];
            const u = o.userData, z = o.position.z;
            o.visible = i < active && z > -85; // дальше всё равно дымка и горизонт
            if (!o.visible) continue;
            if (u.panties) for (let k = 0; k < u.panties.length; k++) u.panties[k].visible = z > -22 && !(weak && k); // мелочь видна только вблизи
            if (u.rub) u.rub.pants.visible = z > -30;
            updateAmbientAnimation(o, dt, this.tier);
            if (o.position.z > 8 && o.position.z < 16) u.mixer.update(dt); // в кадре меню: общая анимация дальше 8 м за героем стоит
            if (u.rub && z > -30 && z < 16) this.rubPants(o, this.rubT = (this.rubT || 0) + dt, weak);
            if (o.position.z < -75 || o.position.z > 16) continue;
            u.t -= dt;
            if (u.t <= 0) { // следующий шаг сценки
                u.step = (u.step + 1) % u.script.length;
                const [clip, time, y, throws] = u.script[u.step], act = u.acts[clip];
                if (u.act && u.act !== act) u.act.fadeOut(0.35);
                if (u.act !== act) { act.reset(); act.time = Math.random() * act.getClip().duration * 0.5; act.fadeIn(0.35).play(); }
                u.act = act; u.t = time; u.yTo = y; u.throws = !!throws; u.nextThrow = 1.2;
            }
            u.y += (u.yTo - u.y) * Math.min(1, dt * 6);
            u.rig.position.y = u.y;
            u.rig.visible = u.y > -0.62 && z > -50; // нырнул с головой: кисти иначе торчали бы под днищем
            if (u.throws && (u.nextThrow -= dt) <= 0) {
                u.nextThrow = 1 + Math.random() * 0.8;
                const p = u.thrown[u.nextItem = ((u.nextItem || 0) + 1) % u.thrown.length]; // старый мусор лежит, пока до него не дойдёт очередь
                { p.on = true; p.t.visible = true; p.t.position.set(0, u.rim + 0.1, Math.random() * 0.5 - 0.25); p.v.set(-u.side * (1 + Math.random() * 0.8), 2.4 + Math.random(), Math.random() * 1.6 - 0.8); }
            }
            for (const p of u.thrown) {
                if (!p.on) continue;
                p.v.y -= 9.8 * dt;
                p.t.position.addScaledVector(p.v, dt);
                p.t.rotation.x += dt * 9; p.t.rotation.z += dt * 6;
                if (p.t.position.y < 0.05) { p.t.position.y = 0.05; p.on = false; p.t.rotation.set(0, Math.random() * 3, 0); }
            }
        }
    }

    // Стайка голубей у бордюра: сидят и клюют, а когда герой подбегает — взлетают в стороны
    makeFlock(m, cfg, i) {
        const side = i % 2 ? 1 : -1;
        const flock = new THREE.Group();
        flock.position.set(side * 3.7, 0.18, BEHIND_Z - 30 - i * (STREET_LEN / cfg.flocks));
        const n = Math.min(this.tier.lite ? 3 : 9, cfg.flock[0] + Math.floor(Math.random() * (cfg.flock[1] - cfg.flock[0] + 1))); // на телефоне стайки меньше
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
            if (cfg.clips) fetch(cfg.clips).then((r) => r.json()).then((list) => { // вдох и выдох из общей библиотеки анимаций
                for (const c of list) { const clip = THREE.AnimationClip.parse(c); clip.uuid = THREE.MathUtils.generateUUID(); gltf.animations.push(clip); }
            }).catch(() => {});
        }, () => {}, { deferred: true });
    }

    makeIslam() {
        return this.islam ? this.rig(this.islam, WIND.npc.idle, { islam: true }) : null;
    }

    // Большой напольный вентилятор («Ислам вентилирует»): подставка, стойка, решётка-кольцо, три лопасти на роторе
    // (крутит игра — userData.rotor). Дует вдоль своей +Z: к дороге его разворачивает игра. Геометрии свои — own.
    makeFan() {
        const g = new THREE.Group(), own = (m) => { m.geometry.userData.own = true; return m; };
        const dark = this.mat.pole, chrome = this.mat.chrome;
        const base = own(new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 0.08, 20), dark));
        base.position.y = 0.04;
        const pole = own(new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.065, 1.15, 10), chrome));
        pole.position.y = 0.62;
        const head = new THREE.Group();
        head.position.y = 1.3;
        const motor = own(new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.18, 0.32, 16), dark));
        motor.rotation.x = Math.PI / 2;
        motor.position.z = -0.18;
        const rotor = new THREE.Group();
        rotor.position.z = 0.04;
        // лопасти полупрозрачные: на больших оборотах они бледнеют, а поверх — размытый диск (blur), как у настоящего винта
        const bladeMat = new THREE.MeshStandardMaterial({ color: 0x9aa6b4, metalness: 0.6, roughness: 0.35, transparent: true });
        bladeMat.userData.own = true;
        for (let i = 0; i < 3; i++) {
            const arm = new THREE.Group();
            arm.rotation.z = (i / 3) * Math.PI * 2;
            const blade = own(new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.46, 0.015), bladeMat));
            blade.position.y = 0.27;
            blade.rotation.y = 0.45; // наклон лопасти — видно, что винт
            arm.add(blade);
            rotor.add(arm);
        }
        const hub = own(new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 8), chrome));
        rotor.add(hub);
        // размытый винт: три мягких «смаза» лопастей по кругу; крутит игра медленнее настоящего (без стробоскопа)
        const blurTex = canvasTex(128, 128, (c, w) => {
            c.clearRect(0, 0, w, w);
            c.translate(w / 2, w / 2);
            for (let i = 0; i < 3; i++) {
                c.rotate((Math.PI * 2) / 3);
                const gr = c.createRadialGradient(0, 0, 6, 0, 0, w / 2 - 2);
                gr.addColorStop(0, "rgba(190,205,220,.75)"); gr.addColorStop(1, "rgba(190,205,220,.15)");
                c.fillStyle = gr;
                c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, w / 2 - 2, -0.2, 0.75); c.closePath(); c.fill();
            }
            c.fillStyle = "rgba(190,205,220,.12)"; c.beginPath(); c.arc(0, 0, w / 2 - 2, 0, Math.PI * 2); c.fill();
        });
        const blurMat = new THREE.MeshBasicMaterial({ map: blurTex, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
        blurMat.userData.own = true;
        const blur = own(new THREE.Mesh(new THREE.CircleGeometry(0.52, 32), blurMat));
        blur.position.z = 0.05;
        head.add(motor, rotor, blur);
        for (const z of [0.12, -0.04]) { // решётка: два кольца и спицы спереди
            const ring = own(new THREE.Mesh(new THREE.TorusGeometry(0.56, 0.018, 6, 40), chrome));
            ring.position.z = z;
            head.add(ring);
        }
        for (let i = 0; i < 8; i++) {
            const spoke = own(new THREE.Mesh(new THREE.BoxGeometry(0.012, 1.1, 0.012), chrome));
            spoke.rotation.z = (i / 8) * Math.PI;
            spoke.position.z = 0.12;
            head.add(spoke);
        }
        const ledMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 0.3, 0.3) });
        ledMat.userData.own = true;
        const led = own(new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), ledMat));
        led.position.set(0, 0.1, 0.42);
        g.add(base, pole, head, led);
        g.traverse((m) => { if (m.isMesh && m !== blur) m.castShadow = true; });
        g.userData = { type: "decor", fan: true, rotor, led, head, blur, bladeMat };
        return g;
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
    // Патрульная машина у обочины — только 3D-модель: плоская вырезанная картинка смотрелась картонкой (30.10).
    // Модель ещё не загрузилась — машины нет, инспектор на полосе стоит один
    makePatrol() {
        const t = this.modelFor("police");
        if (!t) return null;
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
        else if (BLOB_KINDS.has(kind)) this.groundBlob(g);
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
        if (kind === "bin") this.addLitter(g);
        if (BLOB_KINDS.has(kind)) this.groundBlob(g); // g.clear() убрал и пятно спрайта — новое под модель
    }

    // У урн не остаётся одинокая идеальная модель: на высокой графике рядом появляются пакет, картон и банка.
    // Геометрия и материалы общие, поэтому это не тянет новых текстур и почти не влияет на память.
    addLitter(bin) {
        if (bin.userData.litter) {
            bin.userData.litter.visible = !this.tier.lite;
            return;
        }
        if (this.tier.lite) return;
        const litter = new THREE.Group();
        const side = Math.random() < 0.5 ? -1 : 1;
        const bag = new THREE.Mesh(this.geo.trashBag, this.mat.trashBag);
        bag.scale.set(0.19, 0.14, 0.16);
        bag.position.set(side * 0.38, 0.13, -0.12);
        bag.rotation.set(0.18, Math.random() * Math.PI, side * 0.16);
        const box = new THREE.Mesh(this.geo.cardboard, this.mat.cardboard);
        box.scale.set(0.23, 0.035, 0.16);
        box.position.set(side * 0.19, 0.045, 0.26);
        box.rotation.set(0.06, Math.random() * Math.PI, 0.1);
        const can = new THREE.Mesh(this.geo.tin, this.mat.tin);
        can.scale.set(0.038, 0.11, 0.038);
        can.rotation.z = Math.PI / 2;
        can.position.set(side * 0.53, 0.05, 0.18);
        litter.add(bag, box, can);
        litter.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
        bin.add(litter);
        bin.userData.litter = litter;
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
        this.groundBlob(o);
        this.scene.add(o);
        this.obstacles.push(o);
        return o;
    }

    // ---- стена-возражение: арка с вопросом над дорогой и три таблички с ответами на полосах ----------
    // answers — ответы по полосам, correct — номер полосы с правильным. Текст рисуется на холсте (свой у каждой стены,
    // освобождается вместе с ней). Таблички — препятствия type "answer": правильная ломается, неправильная — удар.
    addWall(q, answers, correct, z) {
        // У стены препятствия не бьют (Game.collide: за 35 м до неё и 8 м после) — значит, их там и не должно быть:
        // ряды, вставшие до стены, иначе оставались на дороге, и герой видимо пробегал сквозь баки и блоки
        this.clearZone(z - 8, z + 36);
        const type = CLIENT_TYPES[q.type];
        const wall = { q, answers, correct, answered: false, plates: [], type: q.type };
        const textMat = (w, h, draw) => {
            const map = canvasTex(w, h, draw);
            map.anisotropy = 16; // видеокарта сама ограничит своим максимумом; под углом издалека текст не расплывается
            // надписи — часть интерфейса: без дымки (зимой она с 60 м и светлая — щит и таблички выцветали в белые пятна)
            // и без тонмаппинга (он сереет белое и гасит контраст букв)
            const m = new THREE.MeshBasicMaterial({ map, transparent: true, fog: false, toneMapped: false });
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
        wall.parts = [arch]; // рамка стены — двигается вместе с табличками (полёт отодвигает стену)
        // таблички на полосах — сообщения в чате, как карточка вопроса в HUD: светлый пузырь с хвостиком слева внизу,
        // обводка и ореол цвета типа клиента, сверху тёмная плашка «куда бежать», ниже ответ тёмным крупно (по левому краю,
        // размер подбирается). Пузырь не чисто белый: белое выше порога bloom — расплывалось бы ореолом и съедало буквы.
        // Под табличкой светящаяся планка и пятно на асфальте. Два варианта — карточки шире (стоят на крайних полосах)
        const two = answers.length === 2;
        // 30.10: выше (было 1,5 м) и буквы крупнее — издалека «+20 USDT» читалось с трудом. Шире нельзя: полосы через 1,7 м
        const PW = two ? 2.5 : 1.86, PH = 2, CW = two ? 680 : 512, CH = Math.round(CW * PH / PW);
        const plateGeo = new THREE.PlaneGeometry(PW, PH);
        plateGeo.userData.own = true;
        answers.forEach((text, i) => {
            const lane = two ? i * 2 : i;
            const g = new THREE.Group();
            const board = new THREE.Mesh(plateGeo, textMat(CW, CH, (c, w, h) => {
                const m = 22, tail = 28, x = m, y = m, bw = w - 2 * m, bh = h - 2 * m - tail;
                const bubble = () => { // пузырь и хвостик одним контуром
                    roundRect(c, x, y, bw, bh, { tl: 46, tr: 46, br: 46, bl: 12 });
                    // в ту же сторону, что и пузырь (по часовой): иначе при заливке nonzero место наложения осталось бы пустым
                    c.moveTo(x, y + bh - 26); c.lineTo(x + 52, y + bh - 2); c.lineTo(x - 4, y + bh + tail - 4); c.closePath();
                };
                c.save(); c.shadowColor = col; c.shadowBlur = 26; c.strokeStyle = col; c.lineWidth = 12; c.lineJoin = "round";
                bubble(); c.stroke(); c.restore();
                c.fillStyle = "#ececf0"; bubble(); c.fill();
                // плашка «◀ ВЛЕВО»: тёмная, буквы цвета типа
                c.font = '900 30px "Unbounded", "Arial Black", sans-serif';
                if ("letterSpacing" in c) c.letterSpacing = "2px";
                const label = LANE_LABELS[lane], px = x + 26, py = y + 24, ph = 52, pw = c.measureText(label).width + 40;
                c.fillStyle = "#121216"; roundRect(c, px, py, pw, ph, ph / 2); c.fill();
                c.fillStyle = col; c.textAlign = "left";
                c.fillText(label, px + 20, py + 37);
                if ("letterSpacing" in c) c.letterSpacing = "0px";
                // ответ: тёмный, крупно, в оставшейся части пузыря
                c.fillStyle = "#121216";
                wrapText(c, text, x + 30, py + ph + 8, bw - 60, y + bh - py - ph - 26, '800 {s}px "Inter Tight", Arial, sans-serif', "left", 96);
            }));
            board.position.y = 0.6 + PH / 2 + 0.02; // низ таблички — на светящейся планке
            g.add(board);
            const bar = new THREE.Mesh(this.geo.box, lightMat); // неоновая планка под табличкой
            bar.scale.set(PW * 0.7, 0.045, 0.05);
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
            g.userData = { type: "answer", halfZ: 0.35, wall, correct: i === correct, lane, text };
            this.scene.add(g);
            this.obstacles.push(g);
            wall.plates.push(g);
        });
        this.clearAround(z);
        return wall;
    }

    // ничего постороннего вплотную к стене: ряды препятствий и монеты рядом убираем (и когда стену отодвинул полёт).
    // before / after — сколько метров пусто до стены и после неё; на скорости игра их удлиняет (Game.wallClear → this.wallClear)
    clearAround(z, before = this.wallClear?.before ?? 28, after = this.wallClear?.after ?? 34) {
        for (const o of [...this.obstacles]) {
            if (o.userData.type === "decor" || o.userData.type === "answer" || o.userData.islam) continue;
            if ((o.position.z > z - after && o.position.z < z + before) || (o.userData.oncoming && o.position.z < z)) { // перед стеной (там замедление и выбор) и после неё — пусто
                this.dropObstacle(o);
                this.obstacles.splice(this.obstacles.indexOf(o), 1);
            }
        }
        for (let i = this.coins.length - 1; i >= 0; i--) if (Math.abs(this.coins[i].position.z - z) < 6) this.removeCoin(i);
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
            let kind = this.location === 'winter' ? pick(WINTER_OBSTACLES) : this.pickKind();
            if (this.noCars && kind === "car") kind = "block"; // встречная тачка проехала бы сквозь стену-возражение
            const o = this.addObstacle(kind, lane, z);
            if (o.userData.oncoming) o.position.z = z * (1 + o.userData.oncoming / Math.max(1, speed));
            // пост ДПС: инспектор на полосе, патрульная машина у обочины — там, где на тротуаре свободно
            // (иначе она встаёт внутрь банкомата, урны или прохожей); места нет — инспектор без машины
            const side = lane === 0 ? -1 : lane === 2 ? 1 : pick([-1, 1]);
            // в зимнем районе по обочине идёт ограда — машина встала бы в неё; там посты ДПС свои, в проёмах ограды
            const dz = kind === "cop" && this.location !== "winter" && [-2, -5, 1, -8, 4].find((d) => this.sidewalkFree(side * 4.4, z + d, 1.2, 2.6));
            const car = dz !== undefined && dz !== false && this.makePatrol();
            if (car) {
                car.position.set(side * 4.4, 0.2, z + dz);
                car.rotation.y = -side * 0.35;
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
            const here = Object.keys(POWERUPS).filter((k) => !POWERUPS[k].location || POWERUPS[k].location === this.location);
            this.addPickup(pick(here), free, z + 1.5);
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
    // убрать препятствия одной полосы между z0 и z1 (дорога к выбранному ответу), монеты оставить
    clearLane(lane, z0, z1) {
        for (let i = this.obstacles.length - 1; i >= 0; i--) {
            const o = this.obstacles[i], t = o.userData.type;
            if (t === "decor" || t === "answer" || o.userData.islam || o.userData.lane !== lane) continue;
            if ((o.position.z > z0 && o.position.z < z1) || (o.userData.oncoming && o.position.z < z1)) {
                this.dropObstacle(o);
                this.obstacles.splice(i, 1);
            }
        }
    }

    // убрать препятствия (не стены и не декор) между z0 и z1, монеты оставить
    clearZone(z0, z1) {
        for (let i = this.obstacles.length - 1; i >= 0; i--) {
            const o = this.obstacles[i], t = o.userData.type;
            // патрульная машина поста ДПС — тоже «декор», но её убираем вместе с инспектором: она стоит на обочине (x 4,4)
            // ровно там, где встаёт Ислам (3,7), — он оказывался внутри машины, и «Ислам дует» шёл без Ислама
            if ((t === "decor" && !o.userData.police) || t === "answer" || o.userData.islam) continue;
            if ((o.position.z > z0 && o.position.z < z1) || (o.userData.oncoming && o.position.z < z1)) {
                this.dropObstacle(o);
                this.obstacles.splice(i, 1);
            }
        }
    }

    dropObstacle(o) {
        if (this.coinBatch?.remove(o)) return;
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
            if ((u.flashers || u.police) && o.visible && o.children[0]?.visible !== false) { // спрятанная картинка поста — без мигалок
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
        this.winter?.update(dt, move);
        // дорога, разметка и плитка «едут» через сдвиг текстуры
        this.roadMap.offset.y += move * this.roadRepeat / STREET_LEN;
        this.dashMap.offset.y += move * (STREET_LEN / 8) / STREET_LEN;
        this.walkMap.offset.y += move * this.walkRepeat / STREET_LEN;

        for (const o of this.scenery) {
            o.position.z += move;
            if (o.position.z > BEHIND_Z) o.position.z -= o.userData.loop;
        }
        this.updateNikitas(dt, move);
        for (const l of this.lights) {
            l.position.z += move;
            if (l.position.z > DESPAWN_Z) l.position.z -= l.userData.loop;
        }

        // скелетная анимация только у тех, кто рядом и впереди (дальше — туман)
        for (const o of this.officers) if (o.visible) updateAmbientAnimation(o, dt, this.tier); // спрятанных локацией не анимируем
        this.walkCheck = (this.walkCheck || 0) + 1;
        for (const o of this.critters) {
            if (o.visible && o.userData.walk) {
                // впереди ступени, выступ или урна — разворачивается (проверка раз в 8 кадров), а не идёт сквозь
                if (this.walkCheck % 8 === 0 && o.position.z > -80 && o.position.z < 10 && this.walkBlocked(o)) {
                    o.userData.walk *= -1;
                    o.rotation.y = o.userData.walk > 0 ? 0 : Math.PI;
                }
                o.position.z += o.userData.walk * dt; // гуляют вдоль тротуара
            }
            updateAmbientAnimation(o, dt, this.tier);
        }
        this.updateFlocks(dt, t);
        for (const o of this.obstacles) updateAmbientAnimation(o, dt, this.tier);

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

        const dp = this.dropPoints.geometry.attributes.position;
        let any = false;
        this.drops.forEach((d, i) => {
            if (!d.visible) { if (dp.array[i * 3 + 1] !== -50) { dp.setXYZ(i, 0, -50, 0); any = true; } return; }
            const v = d.userData.v;
            v.y -= 14 * dt;
            d.position.x += v.x * dt;
            d.position.y += v.y * dt;
            d.position.z += v.z * dt + move;
            if (d.position.y < 0) d.visible = false;
            dp.setXYZ(i, d.position.x, d.visible ? d.position.y : -50, d.position.z);
            any = true;
        });
        if (any) dp.needsUpdate = true;
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
            const k = Math.min(1, f.userData.t / 0.16);
            f.scale.setScalar((0.25 + 0.4 * k) * (f.userData.gold ? 1.5 : 1)); // искра, а не шар: монеты подряд не сливаются
            f.material.opacity = (1 - k) * 0.7;
            f.position.z += move;
            if (k >= 1) f.visible = false;
        }

        this.updateSprites(t);
        if (this.ripples.visible) this.updateRipples(dt, move);
        this.updateBlobs();
        this.updateLampGlow();
        this.vietnam?.update(dt, move, t);

        // Невидимый дождь (Нячанг, зима) не требует ни CPU-обновления, ни загрузки буфера на GPU.
        if (!this.rain.visible) return;
        const pos = this.rain.geometry.attributes.position.array;
        for (let i = 0, n = this.rainCount ?? this.rainSpeed.length; i < n; i++) {
            const k = i * 6;
            const dy = this.rainSpeed[i] * dt;
            pos[k + 1] -= dy; pos[k + 4] -= dy;
            pos[k + 2] += move; pos[k + 5] += move;
            if (pos[k + 1] < 0 || pos[k + 2] > 8) {
                const x = rnd(-9, 9), y = rnd(10, 14), z = rnd(-40, 4);
                pos[k] = x; pos[k + 1] = y; pos[k + 2] = z;
                pos[k + 3] = x + 0.03; pos[k + 4] = y - 0.45; pos[k + 5] = z + 0.12;
            }
        }
        this.rain.geometry.attributes.position.needsUpdate = true;
    }
}

export { SPAWN_Z };
