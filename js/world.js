// Ночной район: мокрый асфальт, хрущёвки с окнами, рольставни, красные лампы у подъездов,
// оранжевые фонари, дождь. Плюс препятствия и монеты, которые едут навстречу крысу.
// Поверхности — фотограмметрия Poly Haven (CC0) из папки textures/.

import * as THREE from "./vendor/three.module.js";

const SPAWN_Z = -95;   // где появляются предметы
const DESPAWN_Z = 12;  // где исчезают (уже за камерой)
const STREET_LEN = 160;
const BEHIND_Z = 45;   // улица тянется и за спину крыса — её видно с камеры меню
const ROAD_REPEAT = STREET_LEN / 4;

const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

const loader = new THREE.TextureLoader();

function pbr(name, repeat, anisotropy = 8) {
    const load = (suffix, srgb) => {
        const t = loader.load(`textures/${name}_${suffix}.jpg`);
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.repeat.set(...repeat);
        t.anisotropy = anisotropy;
        if (srgb) t.encoding = THREE.sRGBEncoding;
        return t;
    };
    return { map: load("diff", true), normalMap: load("nor"), roughnessMap: load("rough") };
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

// свет в окне: тёплая комната, шторы по краям, иногда силуэт люстры
function windowTexture() {
    return canvasTex(64, 96, (g, w, h) => {
        const grad = g.createRadialGradient(w / 2, h * 0.35, 4, w / 2, h * 0.4, h * 0.7);
        grad.addColorStop(0, "#fff1c8");
        grad.addColorStop(0.5, "#f0a24a");
        grad.addColorStop(1, "#5a2a12");
        g.fillStyle = grad;
        g.fillRect(0, 0, w, h);
        g.fillStyle = "rgba(90,30,20,0.75)";
        g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(w * 0.35, h * 0.5, w * 0.12, h); g.lineTo(0, h); g.fill();
        g.beginPath(); g.moveTo(w, 0); g.quadraticCurveTo(w * 0.65, h * 0.5, w * 0.88, h); g.lineTo(w, h); g.fill();
        g.fillStyle = "rgba(40,20,10,0.9)"; // рама-крестовина
        g.fillRect(w / 2 - 2, 0, 4, h);
        g.fillRect(0, h * 0.32, w, 4);
    });
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

        this.buildMaterials();
        this.buildStreet();
        this.buildRain();
        this.buildSplash();
    }

    buildMaterials() {
        const wall = pbr("wall", [2, 2]);
        const iron = pbr("iron", [2, 1]);
        const std = (o) => new THREE.MeshStandardMaterial(o);
        this.mat = {
            walls: [0x8a7d76, 0x6f6460, 0x7d7068, 0x857a72].map((c) => std({ ...wall, color: c, normalScale: new THREE.Vector2(1.2, 1.2) })),
            trim: std({ ...wall, color: 0x4a403d }),
            plinth: std({ ...wall, color: 0x3a302d }),
            winLit: new THREE.MeshBasicMaterial({ map: windowTexture(), color: 0xffffff }),
            winDark: std({ color: 0x07080b, roughness: 0.08, metalness: 0.9, envMapIntensity: 1.4 }),
            frame: std({ color: 0x2a2220, roughness: 0.8 }),
            balcony: std({ ...wall, color: 0x5d524d }),
            shutter: std({ ...iron, color: 0x8a8580, metalness: 0.6, roughness: 1 }),
            door: std({ color: 0x3b2a22, roughness: 0.7 }),
            ac: std({ color: 0xc2bcb2, roughness: 0.5, metalness: 0.2 }),
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
            puddle: std({ color: 0x3a1a1e, roughness: 0.06, metalness: 0.85, envMapIntensity: 1.8, transparent: true, opacity: 0.8, depthWrite: false }),
        };
        this.geo = {
            coin: new THREE.CylinderGeometry(0.32, 0.32, 0.07, 24),
            box: new THREE.BoxGeometry(1, 1, 1),
            window: new THREE.PlaneGeometry(1, 1),
        };
    }

    // ---- окружение -------------------------------------------------------------------------

    buildStreet() {
        const s = this.scene;
        const centerZ = BEHIND_Z - STREET_LEN / 2;

        // мокрый асфальт: фото-текстура + низкая шероховатость → отражает зарево и фонари
        const road = pbr("road", [1.5, ROAD_REPEAT]);
        this.roadMap = road.map;
        const roadMesh = new THREE.Mesh(
            new THREE.PlaneGeometry(6, STREET_LEN),
            new THREE.MeshStandardMaterial({
                ...road, color: 0x3c3536, roughness: 0.5, metalness: 0.1,
                normalScale: new THREE.Vector2(0.8, 0.8), envMapIntensity: 0.7,
            })
        );
        roadMesh.rotation.x = -Math.PI / 2;
        roadMesh.position.z = centerZ;
        s.add(roadMesh);

        // разметка между полосами
        this.dashMap = dashTexture();
        this.dashMap.wrapT = THREE.RepeatWrapping;
        this.dashMap.repeat.set(1, STREET_LEN / 8);
        const dashMat = new THREE.MeshStandardMaterial({ map: this.dashMap, transparent: true, roughness: 0.4, depthWrite: false });
        for (const x of [-0.85, 0.85]) {
            const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.12, STREET_LEN), dashMat);
            dash.rotation.x = -Math.PI / 2;
            dash.position.set(x * 1, 0.006, centerZ);
            s.add(dash);
        }

        // тротуары из плитки и бордюр
        const walk = pbr("walk", [2, STREET_LEN / 2]);
        this.walkMap = walk.map;
        const walkMat = new THREE.MeshStandardMaterial({ ...walk, color: 0x8a7e7a, roughness: 0.8, envMapIntensity: 0.8 });
        const curbMat = this.mat.trim;
        for (const side of [-1, 1]) {
            const w = new THREE.Mesh(new THREE.BoxGeometry(4, 0.18, STREET_LEN), walkMat);
            w.position.set(side * 5, 0.09, centerZ);
            const curb = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.24, STREET_LEN), curbMat);
            curb.position.set(side * 3.05, 0.12, centerZ);
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
        // лужи-зеркала на дороге
        for (let i = 0; i < 16; i++) {
            const p = new THREE.Mesh(new THREE.CircleGeometry(1, 28), this.mat.puddle);
            p.rotation.x = -Math.PI / 2;
            p.rotation.z = rnd(0, Math.PI);
            p.scale.set(rnd(0.6, 1.5), rnd(0.9, 2.4), 1);
            p.position.set(rnd(-2.6, 2.6), 0.01, BEHIND_Z - rnd(0, STREET_LEN));
            p.userData.loop = STREET_LEN;
            s.add(p);
            this.scenery.push(p);
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
        return g;
    }

    // Хрущёвка: бетонные стены, ряды окон (часть горит), карнизы, балконы, кондиционеры;
    // внизу подъезд с красной лампой, рольставни магазинов, иногда неоновая вывеска.
    makeBuilding(side, z, slot) {
        const g = new THREE.Group();
        const floors = 4 + Math.floor(Math.random() * 2);
        const floorH = 2.9;
        const h = floors * floorH + 0.8;
        const len = slot - 1.2;
        const depth = 8;
        const face = -side * depth / 2; // x фасада, смотрящего на дорогу (в координатах группы)
        const out = -side;              // направление «наружу», к дороге

        const wall = new THREE.Mesh(this.geo.box, pick(this.mat.walls));
        wall.scale.set(depth, h, len);
        wall.position.y = h / 2;
        g.add(wall);
        const plinth = new THREE.Mesh(this.geo.box, this.mat.plinth);
        plinth.scale.set(0.15, 0.8, len);
        plinth.position.set(face + out * 0.07, 0.4, 0);
        const roof = new THREE.Mesh(this.geo.box, this.mat.trim);
        roof.scale.set(depth + 0.4, 0.35, len + 0.4);
        roof.position.y = h + 0.17;
        g.add(plinth, roof);
        // межэтажные швы панелей
        for (let f = 1; f < floors; f++) {
            const seam = new THREE.Mesh(this.geo.box, this.mat.trim);
            seam.scale.set(0.08, 0.1, len);
            seam.position.set(face + out * 0.04, f * floorH + 0.4, 0);
            g.add(seam);
        }

        // окна этажей 2+ (на первом — подъезд и магазины)
        const cols = 5;
        const step = len / cols;
        const lit = [], dark = [];
        for (let f = 1; f < floors; f++) {
            for (let c = 0; c < cols; c++) {
                const wz = -len / 2 + step * (c + 0.5);
                const wy = f * floorH + 1.7;
                (Math.random() < 0.3 ? lit : dark).push([wz, wy]);
                if (Math.random() < 0.18) { // балкон
                    const b = new THREE.Mesh(this.geo.box, this.mat.balcony);
                    b.scale.set(0.9, 1.0, 1.9);
                    b.position.set(face + out * 0.45, wy - 1.0, wz);
                    g.add(b);
                }
                if (Math.random() < 0.12) { // кондиционер
                    const ac = new THREE.Mesh(this.geo.box, this.mat.ac);
                    ac.scale.set(0.35, 0.5, 0.75);
                    ac.position.set(face + out * 0.2, wy - 0.9, wz + 0.9);
                    g.add(ac);
                }
            }
        }
        const addWindows = (list, mat) => {
            if (!list.length) return;
            const inst = new THREE.InstancedMesh(this.geo.window, mat, list.length);
            const frames = new THREE.InstancedMesh(this.geo.box, this.mat.frame, list.length);
            const m = new THREE.Matrix4(), q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), out * Math.PI / 2);
            list.forEach(([wz, wy], i) => {
                m.compose(new THREE.Vector3(face + out * 0.02, wy, wz), q, new THREE.Vector3(1.15, 1.45, 1));
                inst.setMatrixAt(i, m);
                // подоконник-отлив под окном
                m.compose(new THREE.Vector3(face + out * 0.06, wy - 0.78, wz), new THREE.Quaternion(), new THREE.Vector3(0.12, 0.08, 1.35));
                frames.setMatrixAt(i, m);
            });
            g.add(inst, frames);
        };
        addWindows(lit, this.mat.winLit);
        addWindows(dark, this.mat.winDark);

        // водосточная труба
        const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, h, 6), this.mat.pipe);
        pipe.position.set(face + out * 0.12, h / 2, len / 2 - 0.4);
        g.add(pipe);

        // подъезд: дверь, козырёк, красная лампа, ступеньки
        const door = new THREE.Mesh(this.geo.box, this.mat.door);
        door.scale.set(0.12, 2.1, 1.2);
        door.position.set(face + out * 0.05, 1.05 + 0.3, 0);
        const canopy = new THREE.Mesh(this.geo.box, this.mat.trim);
        canopy.scale.set(1.0, 0.1, 2.0);
        canopy.position.set(face + out * 0.5, 2.75, 0);
        const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), this.mat.redLamp);
        lamp.position.set(face + out * 0.18, 2.55, 0);
        const steps = new THREE.Mesh(this.geo.box, this.mat.plinth);
        steps.scale.set(1.0, 0.3, 1.8);
        steps.position.set(face + out * 0.5, 0.33, 0);
        g.add(door, canopy, lamp, steps);

        // рольставни магазинов по бокам от подъезда
        for (const dz of [-len / 3.2, len / 3.2]) {
            if (Math.random() < 0.25) continue;
            const sh = new THREE.Mesh(this.geo.box, this.mat.shutter);
            sh.scale.set(0.12, 2.1, 2.8);
            sh.position.set(face + out * 0.06, 1.25, dz);
            const box = new THREE.Mesh(this.geo.box, this.mat.pipe);
            box.scale.set(0.3, 0.3, 2.9);
            box.position.set(face + out * 0.15, 2.4, dz);
            g.add(sh, box);
        }

        if (Math.random() < 0.4) {
            const neon = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.6), pick(this.mat.neon));
            neon.rotation.y = out * Math.PI / 2;
            neon.position.set(face + out * 0.08, 3.25, pick([-len / 3.2, len / 3.2]));
            g.add(neon);
        }

        g.position.set(side * 11, 0, z);
        g.userData.loop = STREET_LEN;
        this.scene.add(g);
        return g;
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

    // «девятка» едет навстречу: кузов с капотом и багажником, стёкла, фары
    makeCar() {
        const g = new THREE.Group();
        const paint = pick(this.mat.car);
        const body = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.55, 3.6), paint);
        body.position.y = 0.58;
        const cabin = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.78, 1.7, 4, 1), paint);
        cabin.rotation.y = Math.PI / 4;
        cabin.scale.set(1.02, 0.55, 1.55);
        cabin.position.set(0, 1.08, -0.05);
        // стёкла поверх кабины
        const glassMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.76, 1.6, 4, 1), this.mat.glass);
        glassMesh.rotation.y = Math.PI / 4;
        glassMesh.scale.set(1.04, 0.5, 1.5);
        glassMesh.position.set(0, 1.07, -0.05);
        g.add(body, cabin, glassMesh);
        for (const x of [-0.72, 0.72]) for (const zz of [-1.15, 1.15]) {
            const w = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.22, 14), this.mat.tire);
            w.rotation.z = Math.PI / 2;
            w.position.set(x, 0.3, zz);
            const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.23, 10), this.mat.chrome);
            hub.rotation.z = Math.PI / 2;
            hub.position.copy(w.position);
            g.add(w, hub);
        }
        const bumper = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.14, 0.12), this.mat.chrome);
        bumper.position.set(0, 0.38, 1.82);
        g.add(bumper);
        // фары смотрят на крыса (машина едет навстречу), сзади — стопы
        for (const x of [-0.52, 0.52]) {
            const hl = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.14, 0.04), this.mat.headlight);
            hl.position.set(x, 0.68, 1.81);
            const tl = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.04), this.mat.taillight);
            tl.position.set(x, 0.68, -1.81);
            g.add(hl, tl);
        }
        g.userData = { type: "car", halfZ: 1.85, oncoming: 6 };
        return g;
    }

    // ---- монеты ------------------------------------------------------------------------------

    makeCoin(boost = false) {
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

    addObstacle(kind, lane, z) {
        const o = kind === "dumpster" ? this.makeDumpster() : kind === "barrier" ? this.makeBarrier() : this.makeCar();
        o.position.set(this.lanes[lane], 0, z);
        o.userData.lane = lane;
        this.scene.add(o);
        this.obstacles.push(o);
        return o;
    }

    // Ряд препятствий: всегда остаётся хотя бы одна проходимая полоса.
    spawnRow(z, difficulty) {
        const free = Math.floor(Math.random() * 3);
        const blocked = [0, 1, 2].filter((l) => l !== free && Math.random() < 0.35 + difficulty * 0.45);
        if (!blocked.length) blocked.push((free + 1 + Math.floor(Math.random() * 2)) % 3);

        for (const lane of blocked) {
            const r = Math.random();
            const kind = r < 0.45 ? "dumpster" : r < 0.75 ? "barrier" : "car";
            this.addObstacle(kind, lane, z);
            if (kind === "dumpster" && Math.random() < 0.5) {
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

    update(dt, move, t) {
        // дорога, разметка и плитка «едут» через сдвиг текстуры
        this.roadMap.offset.y += move * ROAD_REPEAT / STREET_LEN;
        this.dashMap.offset.y += move * (STREET_LEN / 8) / STREET_LEN;
        this.walkMap.offset.y += move * (STREET_LEN / 2) / STREET_LEN;

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
            c.rotation.z = t * 3;
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
