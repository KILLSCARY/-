// Ночной район: мокрый асфальт, хрущёвки с окнами, рольставни, красные лампы у подъездов,
// оранжевые фонари, дождь. Плюс препятствия и монеты, которые едут навстречу крысу.
// Фасады и асфальт — текстуры из папки textures/ (см. TEXTURES в config.js),
// гофрометалл и бетон цоколя — Poly Haven (CC0).

import * as THREE from "./vendor/three.module.js";
import { Reflector } from "./vendor/jsm/Reflector.js";
import { TEXTURES, BANKS, ATMS, MODELS, SPRITES, OBSTACLE_MIX } from "./config.js";
import { loadModel } from "./models.js";

const SPAWN_Z = -95;   // где появляются предметы
const DESPAWN_Z = 12;  // где исчезают (уже за камерой)
const STREET_LEN = 160;
const BEHIND_Z = 45;   // улица тянется и за спину крыса — её видно с камеры меню
const FLOOR_H = 2.9;

const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

const loader = new THREE.TextureLoader();

const texCache = {};
function loadTex(file, repeat, srgb) {
    const t = (texCache[file] ||= loader.load(`textures/${file}`)).clone();
    t.needsUpdate = true;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(...repeat);
    t.anisotropy = 8;
    if (srgb) t.encoding = THREE.sRGBEncoding;
    return t;
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
                grad.addColorStop(0, "#14040a");
                grad.addColorStop(0.42, "#3a0810");
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
    constructor(scene, laneWidth) {
        this.scene = scene;
        this.lanes = [-laneWidth, 0, laneWidth];
        this.obstacles = [];
        this.coins = [];
        this.scenery = [];   // всё, что едет и переставляется в конец улицы

        this.swaps = {};
        this.buildMaterials();
        this.buildStreet();
        this.buildRain();
        this.buildSplash();
        this.buildStreetLife();
        this.loadObstacleModels();
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
        };
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
            s.add(pole);
            this.scenery.push(pole);
        }

        // настоящих источников света немного (дорого): красные у подъездов + оранжевые фонари
        this.lights = [];
        for (let i = 0; i < 4; i++) {
            const red = i % 2 === 0;
            const light = new THREE.PointLight(red ? 0xff2a1a : 0xff8a3a, red ? 3.5 : 3, 14, 1.6);
            const side = i % 2 ? 1 : -1;
            light.position.set(side * (red ? 6 : 3.3), red ? 2.6 : 5, -i * 22);
            light.userData = { loop: 88 };
            s.add(light);
            this.lights.push(light);
        }

        // мусорные пакеты на тротуарах
        for (let i = 0; i < 26; i++) {
            const bag = new THREE.Mesh(new THREE.SphereGeometry(rnd(0.22, 0.42), 10, 8), this.mat.trash);
            bag.scale.set(1, rnd(0.6, 0.8), 1.1);
            bag.position.set(pick([-1, 1]) * rnd(5.5, 6.7), 0.3, BEHIND_Z - rnd(0, STREET_LEN));
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
    }

    disableReflections() {
        if (!this.reflector) return;
        this.scene.remove(this.reflector);
        this.reflector.dispose();
        this.reflector = null;
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
        const t = loader.load(`textures/sprites/${name}.webp`);
        t.encoding = THREE.sRGBEncoding;
        t.anisotropy = 4;
        // лёгкое самосвечение, чтобы нарисованные объекты читались ночью
        const m = new THREE.MeshStandardMaterial({
            map: t, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: 0.32,
            alphaTest: 0.45, roughness: 0.85, metalness: 0.1, envMapIntensity: 0.3,
        });
        this.spriteMats[name] = m;
        return m;
    }

    makeSprite(group) {
        const cfg = SPRITES[group];
        const v = pick(cfg.variants);
        const h = cfg.height, w = h * v.aspect;
        const geo = new THREE.PlaneGeometry(w, h);
        geo.translate(0, h / 2, 0);
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
            girl.position.set(side * rnd(4.0, 6.2), 0.18, BEHIND_Z - rnd(10, STREET_LEN));
            girl.userData.faceY = -side * rnd(0.3, 0.9); // 3D-модель — к бегущему, вполоборота к дороге
            this.addScenery(this.registerSwap("girl", girl));
        }
        for (let i = 0; i < 2; i++) {
            const side = i % 2 ? 1 : -1;
            const car = this.makePoliceCar();
            car.position.set(side * 4.6, 0.18, BEHIND_Z - 40 - i * 80);
            car.userData.faceY = -side * 0.35; // пост у обочины: машина вдоль дороги, инспектор лицом к бегущему
            this.addScenery(this.registerSwap("police", car));
        }
        for (let i = 0; i < 10; i++) {
            const bin = this.makeSprite("bin");
            bin.position.set(sideX() * rnd(3.4, 3.7), 0.18, BEHIND_Z - rnd(0, STREET_LEN));
            bin.userData.faceY = rnd(0, Math.PI * 2);
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
        this.policeLights = [0xff1a1a, 0x1a3aff].map((c) => {
            const l = new THREE.PointLight(c, 0, 12, 1.6);
            this.scene.add(l);
            return l;
        });
    }

    buildRain() {
        const n = 700;
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
    }

    splash(x, z, n = 14, power = 1) {
        for (let i = 0; i < n; i++) {
            const d = this.drops[this.nextDrop];
            this.nextDrop = (this.nextDrop + 1) % this.drops.length;
            d.visible = true;
            d.position.set(x + rnd(-0.3, 0.3), 0.05, z + rnd(-0.2, 0.3));
            d.userData.v.set(rnd(-2, 2) * power, rnd(2, 4.5) * power, rnd(0, 2));
        }
    }

    // ---- препятствия -----------------------------------------------------------------------

    makeDumpster() {
        const g = new THREE.Group();
        const box = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.0, 1.0), this.mat.dumpster);
        box.position.y = 0.6;
        const lid = new THREE.Mesh(new THREE.BoxGeometry(1.36, 0.07, 1.06), this.mat.dumpsterLid);
        lid.position.set(0, 1.13, 0.06);
        lid.rotation.x = -0.1;
        const rim = new THREE.Mesh(new THREE.BoxGeometry(1.38, 0.1, 0.08), this.mat.dumpsterLid);
        rim.position.set(0, 0.95, 0.52);
        g.add(box, lid, rim);
        for (const x of [-0.5, 0.5]) for (const zz of [-0.35, 0.35]) {
            const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.06, 10), this.mat.tire);
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
            const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.3, 0.1), this.mat.post);
            post.position.set(x, 0.65, 0.05);
            g.add(post);
        }
        const rail = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.34, 0.12), this.mat.rail);
        rail.position.y = 1.05;
        const lip = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.05, 0.2), this.mat.rail);
        lip.position.y = 1.2;
        const sign = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.22, 0.03), [
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
        g.userData = { type: "car", halfZ: 2.2, oncoming: 6 };
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
                loadModel(cfg.url, (gltf) => {
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
                    m.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
                    const holder = new THREE.Group(); // оборачиваем, чтобы rotation/scale модели не сбивались при клонировании
                    holder.add(m);
                    holder.userData = { cfg };
                    (this.templates[kind] ||= []).push(holder);
                    for (const g of this.swaps[kind] || []) if (!g.userData.swapped) this.swapIn(g, kind);
                }, () => { if (kind === "bank") this.bankFallback(); });
            }
        }
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

    makeObstacle(kind) {
        const proc = SPRITES[kind]?.obstacle ? this.makeSpriteObstacle(kind)
            : kind === "dumpster" ? this.makeDumpster() : kind === "barrier" ? this.makeBarrier()
            : kind === "atm" ? this.makeAtm() : this.makeCar();
        const t = this.modelFor(kind);
        if (!t) return proc;
        const g = new THREE.Group(); // модель из .glb, а размеры для столкновений — от процедурной (или из конфига)
        g.add(t.clone());
        g.userData = { ...proc.userData, billboard: false, lamp: null, flashers: null };
        if (t.userData.cfg.halfZ) g.userData.halfZ = t.userData.cfg.halfZ;
        if (t.userData.cfg.top) g.userData.top = t.userData.cfg.top;
        if (kind === "cop") g.userData.police = true;
        return g;
    }

    addObstacle(kind, lane, z) {
        const o = this.makeObstacle(kind);
        o.position.set(this.lanes[lane], 0, z);
        o.userData.lane = lane;
        o.traverse((m) => { if (m.isMesh) m.castShadow = true; });
        this.scene.add(o);
        this.obstacles.push(o);
        return o;
    }

    pickKind() {
        const total = Object.values(OBSTACLE_MIX).reduce((a, b) => a + b, 0);
        let r = Math.random() * total;
        for (const [kind, w] of Object.entries(OBSTACLE_MIX)) if ((r -= w) < 0) return kind;
        return "dumpster";
    }

    // Ряд препятствий: всегда остаётся хотя бы одна проходимая полоса.
    spawnRow(z, difficulty) {
        const free = Math.floor(Math.random() * 3);
        const blocked = [0, 1, 2].filter((l) => l !== free && Math.random() < 0.35 + difficulty * 0.45);
        if (!blocked.length) blocked.push((free + 1 + Math.floor(Math.random() * 2)) % 3);

        for (const lane of blocked) {
            const kind = this.pickKind();
            this.addObstacle(kind, lane, z);
            if (kind === "cop" && !this.modelFor("cop")) { // пост ДПС: инспектор на полосе, патрульная машина у обочины
                const car = this.makePoliceCar();
                const side = lane === 0 ? -1 : lane === 2 ? 1 : pick([-1, 1]);
                car.position.set(side * 4.4, 0.18, z - 2);
                car.userData.type = "decor";
                this.scene.add(car);
                this.obstacles.push(car);
            }
            if ((kind === "dumpster" || SPRITES[kind]?.top) && Math.random() < 0.5) {
                // дуга монет над баком — награда за прыжок
                for (let i = -2; i <= 2; i++) this.addCoin(lane, z + i * 1.1, 1.9 - Math.abs(i) * 0.3);
            }
        }

        // дорожка монет по свободной полосе
        if (Math.random() < 0.75) {
            const n = 4 + Math.floor(Math.random() * 4);
            const boostAt = Math.random() < 0.12 ? Math.floor(n / 2) : -1;
            for (let i = 0; i < n; i++) this.addCoin(free, z + 4 + i * 1.6, 0.7, i === boostAt);
        }
    }

    clear() {
        for (const o of this.obstacles) this.scene.remove(o);
        for (const c of this.coins) this.scene.remove(c);
        this.obstacles = [];
        this.coins = [];
    }

    removeCoin(i) {
        this.scene.remove(this.coins[i]);
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

        for (let i = this.obstacles.length - 1; i >= 0; i--) {
            const o = this.obstacles[i];
            o.position.z += move + (o.userData.oncoming || 0) * dt;
            if (o.position.z > DESPAWN_Z) {
                this.scene.remove(o);
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

        this.updateSprites(t);

        // дождь
        const pos = this.rain.geometry.attributes.position.array;
        for (let i = 0; i < this.rainSpeed.length; i++) {
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
