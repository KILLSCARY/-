// Winter district: deterministic modular scenery, built once and recycled in 32 m sections.
// Geometry is batched by material; detailed artwork is shared by the entire street.
// No snowfall, mirror render, per-window lights or animated scenery on the mobile GPU.
import * as THREE from './vendor/three.module.js';
import { mergeBufferGeometries } from './vendor/jsm/BufferGeometryUtils.js';
import { curveShader, curveUniform, curveSide } from './curve.js';
import { cartoonRoad } from './road-art.js';
import { cartoonModel } from './toon-tex.js';
import { loadModel } from './models.js';
import { BANKS, ATMS, POLICE_OFFICER } from './config.js';

// Existing lightweight Corvette is used until the newly supplied high-resolution model is available.
const PARKED_CAR = 'models/obj/lite/car1.glb?v=3'; // красный Corvette C8 (30.10, с Диска «для кодекса»)
// сказочные дома вдоль улицы: настоящие модели, по две с каждой стороны секции; свет и цвет уже в текстуре
const HOUSES = ['cabin', 'purple', 'cozy'], HOUSE_WIDTH = 14, HOUSE_FRONT = 8.7, HOUSE_SLOTS = [-9.2, 9.2];

export const WINTER = {
    fog: 0xa98ac4, near: 60, far: 245, viewFar: 285,
    sky: { zenith: '#334e87', mid: '#8c9dcb', horizon: '#efc1c9' },
    hemi: [0xffdcd4, 0x6a62b4], light: 1, moon: 0xffb48a, // мультяшный вечер: тёплый закатный свет, тени в сиреневый
    rowGap: [16, 11],
};
export const WINTER_OBSTACLES = ['dumpster', 'dumpster', 'dumpster', 'roadblock', 'roadblock', 'barrier', 'cart', 'block', 'car', 'cop'];

function texture(width, height, draw) {
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    draw(canvas.getContext('2d'), width, height);
    const t = new THREE.CanvasTexture(canvas);
    t.encoding = THREE.sRGBEncoding; t.anisotropy = 8; // дорога и фасады под углом — без мыла вдали
    return t;
}

function random(seed) {
    return () => ((seed = Math.imul(1664525, seed) + 1013904223 >>> 0) / 4294967296);
}

function facadeTexture(emission = false) {
    return texture(1024, 1024, (g, W, H) => {
        const rand = random(804);
        g.fillStyle = emission ? '#000' : '#8a99ad'; g.fillRect(0, 0, W, H);
        if (!emission) {
            for (let i = 0; i < 23000; i++) {
                g.fillStyle = rand() > .5 ? '#ffffff0a' : '#111c3212';
                g.fillRect(rand() * W, rand() * H, 2, 2);
            }
            for (let y = 0; y < H; y += 16) {
                g.fillStyle = '#3b526025'; g.fillRect(0, y, W, 1);
                for (let x = ((y / 16) % 2) * 24; x < W; x += 48) g.fillRect(x, y, 1, 16);
            }
        }
        const litRandom = random(91);
        for (let row = 0; row < 5; row++) for (let col = 0; col < 8; col++) {
            const x = col * 128 + 30, y = row * 196 + 43, lit = litRandom() < .64;
            if (!emission) {
                g.fillStyle = '#405371'; g.fillRect(x - 8, y - 6, 78, 117);
                g.fillStyle = '#d1d5db'; g.fillRect(x - 3, y - 3, 68, 107);
            }
            const grad = g.createLinearGradient(x, y, x, y + 100);
            grad.addColorStop(0, lit ? '#ef9e42' : emission ? '#000' : '#24364f');
            grad.addColorStop(1, lit ? '#ffe0a1' : emission ? '#000' : '#526980');
            g.fillStyle = grad; g.fillRect(x, y, 62, 100);
            g.fillStyle = emission ? '#000' : '#bbb6aa';
            g.fillRect(x + 28, y, 5, 100); g.fillRect(x, y + 30, 62, 4);
            if (lit) {
                g.fillStyle = emission ? '#995b24' : '#c78a5aaa';
                g.fillRect(x + 3, y + 2, 9, 96); g.fillRect(x + 51, y + 2, 8, 96);
            }
            if (!emission) {
                g.fillStyle = '#41516a'; g.fillRect(x - 9, y + 105, 82, 7);
                g.fillStyle = '#e5edfb'; g.fillRect(x - 11, y + 101, 86, 6);
                g.fillStyle = '#ebf1ff'; g.fillRect(x - 5, y - 8, 72, 4);
            }
        }
    });
}

function shopTexture() {
    return texture(512, 512, (g, W, H) => {
        g.fillStyle = '#9e283c'; g.fillRect(0, 0, W, H);
        g.fillStyle = '#ffe6b3'; g.font = 'bold 54px Arial'; g.textAlign = 'center';
        g.fillText('ПРОДУКТЫ', 256, 70);
        g.fillStyle = '#efbd78'; g.fillRect(24, 112, 464, 360);
        const grad = g.createLinearGradient(0, 120, 0, 475);
        grad.addColorStop(0, '#ffd598'); grad.addColorStop(1, '#ad653d');
        g.fillStyle = grad; g.fillRect(36, 124, 440, 334);
        const rand = random(12);
        for (let row = 0; row < 4; row++) {
            for (let col = 0; col < 20; col++) {
                g.fillStyle = ['#b23f31', '#e9b550', '#768d58', '#f3e1aa'][Math.floor(rand() * 4)];
                g.fillRect(45 + col * 21, 165 + row * 66 - rand() * 15, 13, 32);
            }
            g.fillStyle = '#613e38'; g.fillRect(36, 198 + row * 66, 440, 6);
        }
        g.fillStyle = '#a13a34';
        for (const x of [28, 171, 329, 476]) g.fillRect(x, 112, 9, 360);
        g.fillRect(20, 302, 466, 9);
        g.fillStyle = '#fff4cc'; g.font = 'bold 20px Arial'; g.fillText('ХЛЕБ  •  МОЛОКО  •  24 ЧАСА', 256, 498);
    });
}

// Витрины на первых этажах (между подъездами): Сбер и Альфа — те же фото-вывески, что в районе (BANKS), обменники
// рисуются здесь. Всё «по-зимнему»: холоднее тон, иней по углам, шапка снега на вывеске (winterize), сосульки и полка
// снега сверху, цветной отсвет на сугробе. Порядок по домам (10 мест на улице), null — дом без витрины
// участки улицы с постом ДПС: слева на месте секции ограды машина стоит вдоль дороги, инспектор — у проёма
const POST_CHUNKS = [1, 3];
const STORE_ORDER = ['sber', 'obmen', 'alfa', null, 'p2p', 'sber', 'alfa', 'obmen', null, 'alfa'];
const STORE_LIGHT = { sber: 0x5fe39a, alfa: 0xff4a5a, obmen: 0x48e0ff, p2p: 0xffb347 };

// Иней и снег поверх вывески: углы в изморози, по краю — крупинки, сверху — неровная шапка с подтёками.
// emissive — та же форма для карты свечения: снег и иней гасят свет
function winterize(g, W, H, seed, emissive) {
    const rand = random(seed);
    if (!emissive) { // холодный вечер: тени уходят в синеву
        g.globalCompositeOperation = 'multiply'; g.fillStyle = 'rgba(196,208,240,.35)'; g.fillRect(0, 0, W, H);
        g.globalCompositeOperation = 'source-over';
    }
    for (const [cx, cy] of [[0, 0], [W, 0], [0, H], [W, H]]) {
        const r = Math.min(W, H) * (.45 + rand() * .2), fade = g.createRadialGradient(cx, cy, 0, cx, cy, r);
        fade.addColorStop(0, emissive ? 'rgba(0,0,0,.85)' : 'rgba(236,244,255,.75)'); fade.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = fade; g.fillRect(0, 0, W, H);
    }
    g.fillStyle = emissive ? '#000' : 'rgba(240,247,255,.8)';
    for (let i = 0; i < 1400; i++) { // крупинки инея — гуще у краёв
        const edge = Math.pow(rand(), 3) * Math.min(W, H) * .22, side = Math.floor(rand() * 4);
        const x = side === 0 ? edge : side === 1 ? W - edge : rand() * W;
        const y = side === 2 ? edge : side === 3 ? H - edge : rand() * H;
        g.fillRect(x, y, 1 + rand() * 2.5, 1 + rand() * 2.5);
    }
    const cap = H * .1; // шапка снега: неровный край и подтёки
    g.beginPath(); g.moveTo(0, 0); g.lineTo(W, 0);
    for (let x = W; x >= 0; x -= W / 40) g.lineTo(x, cap * (.55 + rand() * .45) + (rand() < .12 ? cap * (.6 + rand()) : 0));
    g.closePath();
    if (!emissive) { g.shadowColor = 'rgba(20,32,70,.55)'; g.shadowBlur = H * .03; g.shadowOffsetY = H * .012; }
    const snow = g.createLinearGradient(0, 0, 0, cap * 1.6);
    snow.addColorStop(0, emissive ? '#000' : '#ffffff'); snow.addColorStop(1, emissive ? '#000' : '#d6e3f8');
    g.fillStyle = snow; g.fill();
    g.shadowColor = 'transparent'; g.shadowBlur = 0; g.shadowOffsetY = 0;
}

// Обменник: тёмная вывеска с неоновой надписью, за стеклом тёплый зал и табло курса; emissive — только то, что светится
function exchangeTexture(kind, emissive) {
    return texture(1024, 640, (g, W, H) => {
        const neon = kind === 'p2p' ? '#ffb347' : '#48e0ff', title = kind === 'p2p' ? 'P2P ОБМЕН' : 'ОБМЕН ВАЛЮТ';
        g.fillStyle = emissive ? '#000' : '#1b2436'; g.fillRect(0, 0, W, H);
        const top = H * .3;
        const hall = g.createLinearGradient(0, top, 0, H); // зал за стеклом: тёплый свет и стойка
        hall.addColorStop(0, emissive ? '#7a4a1c' : '#ffd29a'); hall.addColorStop(1, emissive ? '#2a1606' : '#a8642e');
        g.fillStyle = hall; g.fillRect(40, top + 30, W - 80, H - top - 70);
        g.fillStyle = emissive ? '#000' : '#5a3a26'; g.fillRect(40, H - 150, W - 80, 60);
        g.fillStyle = '#05070c'; g.fillRect(W * .58, top + 60, W * .34, H * .3); // табло курса
        g.font = '700 46px Arial, sans-serif'; g.textAlign = 'left'; g.textBaseline = 'middle';
        g.shadowColor = '#ffcf3a'; g.shadowBlur = 12; g.fillStyle = '#ffd84a';
        g.fillText('USDT  94.20', W * .6, top + 105); g.fillText('RUB  ⇄  USDT', W * .6, top + 165);
        g.shadowBlur = 0;
        if (!emissive) { // рамы витрины и плакат
            g.fillStyle = '#121a28';
            for (const x of [40, W * .36, W * .54, W - 52]) g.fillRect(x, top + 30, 12, H - top - 70);
            g.fillRect(40, top + 24, W - 80, 12);
            g.fillStyle = '#f4efe6'; g.fillRect(W * .1, top + 70, W * .2, H * .32);
            g.fillStyle = '#1b2436'; g.font = '800 34px Arial Black, Arial, sans-serif'; g.textAlign = 'center';
            g.fillText(kind === 'p2p' ? 'БЕЗ' : 'ВЫГОДНЫЙ', W * .2, top + 130); g.fillText(kind === 'p2p' ? 'КОМИССИИ' : 'КУРС', W * .2, top + 175);
        }
        g.fillStyle = emissive ? '#000' : '#0d1422'; g.fillRect(0, 0, W, top); // вывеска: неон на тёмной плашке
        g.font = '900 110px Arial Black, Arial, sans-serif'; g.textAlign = 'center';
        g.shadowColor = neon; g.shadowBlur = 28; g.fillStyle = neon; g.fillText(title, W / 2, top * .55);
        g.shadowBlur = 8; g.fillStyle = '#ffffff'; g.globalAlpha = .55; g.fillText(title, W / 2, top * .55); g.globalAlpha = 1;
        g.shadowBlur = 0;
        g.font = '700 30px Arial, sans-serif'; g.fillStyle = emissive ? '#555' : '#c6d4ea';
        g.fillText('USDT · RUB · 24/7', W / 2, top * .9);
        winterize(g, W, H, kind === 'p2p' ? 41 : 17, emissive);
    });
}

// Консоль — светящаяся вывеска поперёк тротуара: её видно по ходу бега, а витрину на стене — только сбоку
function bladeTexture(kind) {
    return texture(256, 320, (g, W, H) => {
        const look = {
            sber: ['#1a9f45', '#ffffff', 'СБЕР', 'БАНК'], alfa: ['#e8262f', '#ffffff', 'А', 'АЛЬФА'],
            obmen: ['#0d1422', '#48e0ff', 'ОБМЕН', '₮ ⇄ ₽'], p2p: ['#0d1422', '#ffb347', 'P2P', 'ОБМЕН'],
        }[kind];
        g.fillStyle = '#1c2738'; g.fillRect(0, 0, W, H);
        g.fillStyle = look[0]; g.fillRect(14, 14, W - 28, H - 28);
        g.textAlign = 'center'; g.textBaseline = 'middle'; g.shadowColor = look[1]; g.shadowBlur = 16; g.fillStyle = look[1];
        g.font = `900 ${look[2].length > 3 ? 48 : 120}px Arial Black, Arial, sans-serif`; g.fillText(look[2], W / 2, H * .44);
        g.font = '800 40px Arial Black, Arial, sans-serif'; g.fillText(look[3], W / 2, H * .76);
        g.shadowBlur = 0;
        winterize(g, W, H, kind.length * 7, false);
    });
}

export class Winter {
    constructor(world, { streetLen, behindZ }) {
        this.world = world; this.length = streetLen; this.behind = behindZ;
        this.items = []; this.chunks = []; this.carSites = []; this.hidden = new Map(); this.on = false;
        this.build(); this.set(false);
        this.ready = this.loadArtwork().catch(error => { console.warn('[winter] Texture loading failed', error); });
        this.loadHouses();
    }

    build() {
        const colours = { snow: 0xdfebff, snowShade: 0xb1c8ee, iron: 0x243447, bark: 0xdce3ed,
            dark: 0x34425a, wood: 0x784d40, red: 0xa92e43, gold: 0xe4ac53, pine: 0x28485a };
        this.colours = colours;
        this.materials = {
            solid: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .92, metalness: 0 }),
            snow: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .95, envMapIntensity: .1 }),
            surface: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .9, envMapIntensity: .15 }),
            foliage: new THREE.MeshStandardMaterial({ map: texture(1, 1, g => g.clearRect(0, 0, 1, 1)),
                alphaTest: .45, alphaToCoverage: true, side: THREE.DoubleSide, roughness: 1, envMapIntensity: .1 }), // края хвои сглаживает MSAA: иначе на бегу рябят
            facade: new THREE.MeshStandardMaterial({ vertexColors: true, map: facadeTexture(), emissiveMap: facadeTexture(true),
                emissive: 0xffffff, emissiveIntensity: .63, roughness: 1 }),
            shop: new THREE.MeshBasicMaterial({ map: shopTexture(), color: 0xffe5c8 }),
            glow: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
            flatSnow: new THREE.MeshBasicMaterial({ vertexColors: true }), // ровный белый снег у домов: освещённый на телефоне выходил серым
            soft: new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide,
                map: texture(64, 64, (g, w, h) => {
                    const fade = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
                    fade.addColorStop(0, 'rgba(255,255,255,.65)'); fade.addColorStop(.35, 'rgba(255,255,255,.28)'); fade.addColorStop(1, 'rgba(255,255,255,0)');
                    g.fillStyle = fade; g.fillRect(0, 0, w, h);
                }) }),
        };
        this.materials.halo = new THREE.MeshBasicMaterial({ map: this.materials.soft.map, vertexColors: true,
            transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false });
        this.geometry = {
            box: new THREE.BoxGeometry(1, 1, 1),
            ball: this.world.tier.lite ? new THREE.SphereGeometry(1, 6, 4) : new THREE.SphereGeometry(1, 10, 7), // шапки снега на столбиках: их сотни
            ornament: new THREE.SphereGeometry(1, 6, 4),
            bulb: new THREE.OctahedronGeometry(1),
            cylinder: new THREE.CylinderGeometry(1, 1, 1, 8),
            cone: new THREE.ConeGeometry(1, 1, 10),
            branch: new THREE.CylinderGeometry(.35, 1, 1, 7),
            plane: new THREE.PlaneGeometry(1, 1),
        };
        this.temp = new THREE.Object3D();
        this.stores = {}; // витрины: вид → { mat, aspect } (материал заводится, когда витрина встречается впервые)
        const add = o => { this.world.scene.add(o); this.items.push(o); return o; };
        // A matte, opaque road: lane paint and wheel tracks are baked into one repeating map.
        this.roadMap = texture(1024, 2048, (g, W, H) => cartoonRoad(g, W, H, { base: "#3d4a66", light: "rgba(120,136,176,.09)", dark: "rgba(24,32,58,.13)", track: "rgba(22,30,54,.2)", edge: "snow" }));
        this.roadMap.wrapS = this.roadMap.wrapT = THREE.RepeatWrapping;
        this.roadMap.repeat.set(1, this.length / 12);
        // дорога и снег: 320 м вперёд и 160 м за спину — в меню камера смотрит назад, раньше там улица обрывалась в небо
        const vistaLength = 480, vistaBack = 160;
        this.vistaLength = vistaLength;
        this.roadMap.repeat.y = vistaLength / 12;
        const road = new THREE.Mesh(new THREE.PlaneGeometry(6, vistaLength, 1, 60),
            new THREE.MeshStandardMaterial({ map: this.roadMap, roughness: .96, metalness: 0, envMapIntensity: .05 }));
        road.rotation.x = -Math.PI / 2; road.position.set(0, .014, this.behind + vistaBack - vistaLength / 2);
        road.receiveShadow = true; add(road);
        const ground = this.ground = new THREE.Mesh(new THREE.PlaneGeometry(130, vistaLength, 1, 60),
            new THREE.MeshStandardMaterial({ color: colours.snowShade, roughness: 1 }));
        // заметно ниже снега: снег гнётся вместе с миром реже, чем земля, и на изгибе она вылезала сквозь него и мерцала
        ground.rotation.x = -Math.PI / 2; ground.position.set(0, -2.5, road.position.z); add(ground);

        for (let index = 0; index < this.length / 32; index++) {
            this.chunkIndex = index;
            this.parts = {}; this.rand = random(170 + index * 337);
            for (const side of [-1, 1]) {
                this.building(side, 0, index);
                this.part('box', 0xe4ecfb, side * 6.1, .1, 0, 4.6, .22, 32, null, 'flatSnow'); // ниже верха бровки: иначе поверхности совпадают и мерцают
                this.part('box', 0xe4ecfb, side * 26, .09, 0, 36, .18, 32, null, 'flatSnow'); // за забором всё под снегом: между домами и за ними
                // за домами — снежные холмы и ели: в просветах не видно пустоты и края мира
                for (const dz of [-16, 0, 16]) this.part('ball', colours.snowShade, side * 27, 0, dz, 11, 10 + (index + (dz > 0 ? 1 : 0)) % 2 * 2, 13);
                this.pine(side * 13, .5, 7);
                this.pine(side * 12.5, 15.8, 6.4);
                for (const [dx, dz, r] of [[3.4, 15.5, 3], [8, 15.8, 4.2], [14, 0, 4.5], [20, 15, 5]]) this.part('ball', colours.snow, side * (8.4 + dx), .25, dz, r, .9 + r * .12, r * .8); // сугробы в просветах
                this.snowbank(side, index);
                for (const z of [-12, -4, 4, 12]) {
                    if (side < 0 && z === -12 && POST_CHUNKS.includes(index)) continue; // проём под патрульную машину
                    this.fence(side * 4.15, z, 7.5);
                }
                this.lamp(side * 4.1, side < 0 ? -5 : 10);
                this.birch(side * 5.65, side < 0 ? 8 : 0, 6.1 + index % 3);
                // на слабых устройствах улица реже: мелочь у домов на бегу всё равно не разглядеть
                if (!this.world.tier.lite) this.birch(side * 7.3, side < 0 ? 14 : -15, 7.1);
                if (!this.world.tier.lite || index % 2) this.pine(side * 8, side < 0 ? -12 : 5, 5.8 + index % 2);
                if (!this.world.tier.lite) { this.bench(side * 5.5, side < 0 ? 2 : 14); this.bin(side * 5, side < 0 ? -14 : 8); }
            }
            if (index % 2 === 0) { this.playground(7, -15); this.car(6.5, -6); }
            else this.car(6.5, -4);
            if (index === 2) this.bridge(-7);
            const group = new THREE.Group();
            group.userData.winter = true;
            for (const [kind, list] of Object.entries(this.parts)) {
                const geo = mergeBufferGeometries(list);
                geo.computeBoundingSphere();
                const mesh = new THREE.Mesh(geo, this.materials[kind]);
                mesh.receiveShadow = kind === 'solid'; mesh.matrixAutoUpdate = false;
                if (kind === 'soft') mesh.renderOrder = 1;
                if (this.world.tier.lite && /^(store_|atm_|blade_|halo)/.test(kind)) (group.userData.signs ||= []).push(mesh); // на слабых устройствах вывески вдали не рисуем: у каждой свой материал, это лишний вызов отрисовки
                group.add(mesh); for (const piece of list) piece.dispose();
            }
            group.position.z = this.behind - 16 - index * 32; // улица и за спиной героя: в меню камера смотрит назад
            this.chunks.push(group); add(group);
        }
        this.policePosts();
        this.buildDistant(add);
        for (const geometry of Object.values(this.geometry)) geometry.dispose();
        this.parts = this.geometry = this.temp = null;
    }

    buildDistant(add) {
        // A persistent low-detail skyline behind the recycled street, sharing its texture atlases.
        // Never clone the expensive foreground trees, cars or apartment interiors into this layer.
        this.parts = {};
        const c = this.colours;
        // dir −1 — впереди (вид в забеге), +1 — за спиной героя (вид в меню): там улица кончалась пустым небом
        for (const dir of [-1, 1]) for (let row = 0; row < (dir < 0 ? 5 : 4); row++) for (const side of [-1, 1]) {
            const z = dir < 0 ? -124 - row * 29 : 75 + row * 29;
            this.box(c.snowShade, side * 6.25, .1, z, 6.5, .2, 29);
            this.box(c.snow, side * 26, .13, z, 36, .26, 29);
            this.lamp(side * 4.1, z + 4);
            // Snowy tree crowns need only eighteen foliage cards at this distance.
            for (let tier = 0; tier < 3; tier++) for (let spoke = 0; spoke < 6; spoke++) {
                const angle = spoke * Math.PI / 3, reach = 2.4 - tier * .65;
                this.part('plane', 0xffffff, side * 7 + Math.cos(angle) * reach * .45, 1.3 + tier * 1.3,
                    z - 6 + Math.sin(angle) * reach * .45, reach, reach * .6, 1, [0, -angle, 0], 'foliage');
            }
        }
        const group = this.distant = new THREE.Group(); group.userData.winter = true;
        this.mergeDistantParts(group);
        this.parts = {};
        // The chapel is a visible landmark, with its own fog-free material variants.
        // Texture maps remain shared; this adds no lights or full-screen render passes.
        this.box(0x6b7698, 0, 8, -215, 18, 16, 10);
        this.part('plane', 0xc4cee1, 0, 8, -209.98, 18, 16, 1, null, 'facade');
        this.box(c.snow, 0, 16.2, -215, 18.5, .4, 10.5);
        this.box(0x64708c, 0, 20, -215, 5, 12, 5);
        this.part('cone', c.snow, 0, 28, -215, 4.1, 5.2, 4.1, [0, Math.PI / 4, 0]);
        this.part('cylinder', 0xf7d69b, 0, 22.5, -212.45, 1.65, .1, 1.65, [Math.PI / 2, 0, 0], 'glow');
        this.box(c.dark, 0, 23.1, -212.35, .12, 1.25, .08);
        this.box(c.dark, .43, 22.5, -212.34, .95, .12, .08);
        this.chapel = new THREE.Group();
        this.mergeDistantParts(this.chapel, true);
        // часовню-панельку в конце улицы не показываем: в конце улицы — только небо и маленькие дома
        add(group);
    }

    mergeDistantParts(group, landmark = false) {
        for (const [kind, pieces] of Object.entries(this.parts)) {
            const geo = mergeBufferGeometries(pieces); geo.computeBoundingSphere();
            const material = landmark ? this.materials[kind].clone() : this.materials[kind];
            if (landmark) material.fog = false;
            const mesh = new THREE.Mesh(geo, material); mesh.matrixAutoUpdate = false;
            mesh.userData.winterMaterial = kind;
            group.add(mesh); for (const piece of pieces) piece.dispose();
        }
    }

    part(type, colour, x, y, z, sx, sy, sz, rotation = null, kind = 'solid') {
        const source = this.geometry[type];
        const geo = source.index ? source.toNonIndexed() : source.clone();
        const uv = geo.attributes.uv;
        if (kind === 'solid' && [this.colours.snow, this.colours.snowShade].includes(colour)) {
            kind = 'snow'; colour = colour === this.colours.snow ? 0xffffff : 0xdbe5f6;
        } else if (kind === 'solid' && [this.colours.bark, this.colours.wood].includes(colour)) {
            const wood = colour === this.colours.wood;
            kind = 'surface'; colour = 0xffffff;
            // Atlas bottom row: birch on the left, wood on the right. Inset prevents mip bleed.
            for (let i = 0; i < uv.count; i++) uv.setXY(i, (wood ? .502 : .002) + uv.getX(i) * .496, .002 + uv.getY(i) * .496);
        }
        const o = this.temp;
        o.position.set(x, y, z); o.scale.set(sx, sy, sz);
        o.rotation.set(...(rotation || [0, 0, 0])); o.updateMatrix(); geo.applyMatrix4(o.matrix);
        if (kind === 'snow') {
            // Planar UVs keep the grain continuous over rounded drifts, without pinching at sphere poles.
            const p = geo.attributes.position, n = geo.attributes.normal;
            for (let i = 0; i < uv.count; i++) {
                if (type === 'box' && Math.abs(n.getY(i)) < .5) {
                    uv.setXY(i, (Math.abs(n.getX(i)) > .5 ? p.getZ(i) : p.getX(i)) * 1.4, p.getY(i) * 1.4);
                } else uv.setXY(i, p.getX(i) * 1.4, p.getZ(i) * 1.4);
            }
        }
        if (this.materials[kind].vertexColors) {
            const color = new THREE.Color(colour), data = new Float32Array(geo.attributes.position.count * 3);
            for (let i = 0; i < data.length; i += 3) color.toArray(data, i);
            geo.setAttribute('color', new THREE.BufferAttribute(data, 3));
        }
        (this.parts[kind] ||= []).push(geo);
    }

    box(c, x, y, z, sx, sy, sz, rotation) { this.part('box', c, x, y, z, sx, sy, sz, rotation); }
    rod(c, a, b, radius) {
        const p = new THREE.Vector3(...a), end = new THREE.Vector3(...b), d = end.sub(p);
        const r = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()));
        p.addScaledVector(d, .5);
        this.part('branch', c, p.x, p.y, p.z, radius, d.length(), radius, [r.x, r.y, r.z]);
    }

    snowbank(side, index) {
        const p = [], uv = [], indices = [];
        const profile = [[0, .018], [.1, .12], [.23, .29], [.42, .4], [.63, .44], [.85, .38], [1.12, .3], [1.45, .252]];
        const columns = profile.length;
        for (let row = 0; row <= 32; row++) {
            const z = row - 16, phase = (z - index * 32) / 160 * Math.PI * 2;
            const ridge = Math.sin(phase * 13) * .06 + Math.cos(phase * 7) * .04;
            for (let j = 0; j < columns; j++) {
                const [dx, height] = profile[j], blend = Math.sin(j / (columns - 1) * Math.PI);
                const x = side * (3 + dx + ridge * blend), y = height + ridge * blend;
                p.push(x, y, z); uv.push(x * 1.4, z * 1.4);
                if (row < 32 && j < columns - 1) {
                    const a = row * columns + j, b = a + columns;
                    indices.push(...(side > 0 ? [a, b, a + 1, b, b + 1, a + 1] : [a, a + 1, b, b, a + 1, b + 1]));
                }
            }
        }
        const source = new THREE.BufferGeometry();
        source.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
        source.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
        source.setIndex(indices); source.computeVertexNormals();
        const geo = source.toNonIndexed(); source.dispose();
        geo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 3).fill(1), 3));
        (this.parts.snow ||= []).push(geo);
    }

    // Участок у дороги: сами дома — модели (loadHouses). Витрину и банкомат держит маленький павильон в просвете между домами
    building(side, z, index) {
        const c = this.colours, kind = STORE_ORDER[(index * 2 + (side > 0 ? 1 : 0)) % STORE_ORDER.length];
        for (const dz of HOUSE_SLOTS) this.part('ball', c.snow, side * (HOUSE_FRONT + .3), .2, z + dz, 1.5, .62, 7.4); // сугроб вдоль фасада: дом стоит в снегу
        if (kind) {
            this.box(c.wood, side * 9.7, 1.75, z - .5, 2.8, 3.5, 6.4);
            this.box(0x5a3a2c, side * 8.28, 3.35, z - .5, .1, .3, 6.5); // доска над витриной
            this.part('box', 0xf1f5ff, side * 9.7, 3.68, z - .5, 3.2, .36, 6.8, null, 'flatSnow');
            this.part('ball', c.snow, side * 9.7, 3.86, z - .5, 1.5, .55, 3.2); // снежная шапка
            this.storefront(side, z - .5, kind, index);
            this.part('plane', 0x0d1630, side * 8, .225, z - .5, 2.6, 8, 1, [-Math.PI / 2, 0, 0], 'soft');
            for (const dz of [-3.7, 2.7]) this.part('ball', c.snow, side * 8.7, .18, z + dz, 1, .42, 1.1); // сугробы у углов
            this.part('box', 0xe4ecfb, side * 8.12, .24, z - .5, .16, .12, 6.5, null, 'flatSnow'); // снег вдоль низа витрины
        }
        this.atm(side, z + (side < 0 ? 4.3 : -5.2), /* справа на +4 стоит ель */(index * 2 + (side > 0 ? 1 : 0)) % ATMS.length);
    }

    loadHouses() {
        const dir = this.world.tier.lite ? 'models/winter/lite/' : 'models/winter/';
        this.houses = [];
        HOUSES.forEach((name, n) => loadModel(`${dir}house_${name}.glb?v=6`, (gltf) => {
            const model = gltf.scene;
            model.traverse((o) => { if (o.isMesh) o.material = new THREE.MeshBasicMaterial({ map: o.material.map, side: THREE.DoubleSide }); }); // сетка генератора не замкнута: с одной стороны сквозь дом видно насквозь
            const box = new THREE.Box3().setFromObject(model), size = box.getSize(new THREE.Vector3()), centre = box.getCenter(new THREE.Vector3()), k = HOUSE_WIDTH / size.x;
            // земля — там, где стоит основная масса дома, а не самая нижняя точка: иначе корни ёлок и край крыльца приподнимают дом
            const ys = [], p = new THREE.Vector3();
            model.updateMatrixWorld(true);
            model.traverse((o) => { if (!o.isMesh) return; const a = o.geometry.attributes.position; for (let i = 0; i < a.count; i += 3) ys.push(p.fromBufferAttribute(a, i).applyMatrix4(o.matrixWorld).y); });
            ys.sort((a, b) => a - b);
            const floor = ys[Math.floor(ys.length * .06)] + size.y * .012; // чуть в снег
            model.position.set(-centre.x, -floor, -centre.z);
            const house = new THREE.Group().add(model);
            house.scale.setScalar(k);
            this.houses[n] = { house, width: HOUSE_WIDTH, height: size.y * k, depth: size.z * k };
            this.world.warmQueue.push(house.clone());
        }, () => {}));
    }

    // Вдоль улицы стоят настоящие модели. Только ряды вдали (за 120 м, в дымке) — снимки моделей: плоскость всегда лицом
    // к смотрящему вдоль улицы, поэтому ребром она не видна. Вызывает Game, когда есть renderer
    bakeHouses(renderer) {
        if (this.baked || HOUSES.some((_, n) => !this.houses?.[n])) return;
        this.baked = true;
        const cell = 512, rt = new THREE.WebGLRenderTarget(cell * HOUSES.length, cell, { generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter });
        const was = { target: renderer.getRenderTarget(), auto: renderer.autoClear, alpha: renderer.getClearAlpha(), colour: renderer.getClearColor(new THREE.Color()), curve: curveUniform.value, side: curveSide.value };
        curveUniform.value = 0; curveSide.value = 0;
        renderer.setClearColor(0x4a4560, 0); // цвет прозрачного поля: без светлой каймы на краю силуэта
        renderer.setRenderTarget(rt); renderer.clear();
        renderer.autoClear = false;
        rt.scissorTest = true;
        this.houses.forEach((h, col) => {
            const scene = new THREE.Scene(), S = h.frame = Math.max(h.width, h.height, h.depth) * 1.02;
            scene.add(h.house);
            const cam = new THREE.OrthographicCamera(-S / 2, S / 2, S / 2, -S / 2, .1, 200);
            rt.viewport.set(col * cell, 0, cell, cell); rt.scissor.set(col * cell, 0, cell, cell);
            renderer.setRenderTarget(rt);
            cam.position.set(0, S / 2, 80); cam.lookAt(0, S / 2, 0); cam.updateMatrixWorld();
            renderer.render(scene, cam);
            scene.remove(h.house);
        });
        rt.scissorTest = false;
        renderer.setRenderTarget(was.target); renderer.autoClear = was.auto; renderer.setClearColor(was.colour, was.alpha);
        curveUniform.value = was.curve; curveSide.value = was.side;
        rt.texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
        const material = this.materials.houseCard = new THREE.MeshBasicMaterial({ map: rt.texture, alphaTest: .5, side: THREE.DoubleSide });
        this.chunks.forEach((chunk, index) => {
            for (const side of [-1, 1]) HOUSE_SLOTS.forEach((dz, slot) => {
                const pick = (index * 2 + (side > 0 ? 1 : 0) + slot * 2 + (slot ? index : 0)) % HOUSES.length, copy = this.houses[pick].house.clone();
                copy.rotation.y = -side * Math.PI / 2; // модели смотрят в +Z: лицом к дороге
                copy.position.set(side * (HOUSE_FRONT + this.houses[pick].depth / 2), 0, dz);
                chunk.add(copy);
            });
        });
        const far = [];
        for (const dir of [-1, 1]) for (let row = 0; row < (dir < 0 ? 5 : 4); row++) for (const side of [-1, 1]) {
            const z = dir < 0 ? -124 - row * 29 : 75 + row * 29;
            for (const [dx, dz] of [[0, -7], [3, 7]]) {
                const n = (row + (dz > 0 ? 1 : 0) + (side > 0 ? 1 : 0)) % HOUSES.length, S = this.houses[n].frame, geo = new THREE.PlaneGeometry(S, S), uv = geo.attributes.uv;
                for (let i = 0; i < uv.count; i++) uv.setX(i, (n + uv.getX(i)) / HOUSES.length);
                if (dir > 0) geo.rotateY(Math.PI); // за спиной: лицом к камере меню
                geo.translate(side * (HOUSE_FRONT + S / 2 + dx), S / 2, z + dz);
                far.push(geo);
            }
        }
        const geo = mergeBufferGeometries(far);
        geo.computeBoundingSphere();
        for (const piece of far) piece.dispose();
        const mesh = new THREE.Mesh(geo, material);
        mesh.matrixAutoUpdate = false;
        this.distant.add(mesh);
    }

    // Банкомат у стены между витриной и подъездом: корпус, лицевая панель (фото ATMS по-зимнему), снег на крыше, отсвет
    atm(side, z, n) {
        const cfg = ATMS[n], id = `atm_${cfg.name}`, h = 1.95, w = h * cfg.aspect, c = this.colours;
        if (!this.materials[id]) this.materials[id] = this.photoSign(cfg.name, Math.round(512 * cfg.aspect), 512, 1.3);
        this.box(0x2b3445, side * 7.75, h / 2, z, .7, h, w + .12);
        this.part('plane', 0xffffff, side * 7.39, h / 2, z, w, h, 1, [0, -side * Math.PI / 2, 0], id);
        this.box(c.snow, side * 7.73, h + .07, z, .8, .14, w + .22);
        this.part('plane', 0x0d1630, side * 7.3, .225, z, 1.7, w + 1.2, 1, [-Math.PI / 2, 0, 0], 'soft');
        this.part('ball', c.snow, side * 7.75, .16, z, .75, .3, w * .85); // снег у основания
        this.part('plane', cfg.light, side * 6.9, .31, z, 1.6, w + .9, 1, [-Math.PI / 2, 0, 0], 'halo');
    }

    // Витрина между подъездами (они на dz −8 и 7): вывеска с рамой, полка снега и сосульки сверху, отсвет на снегу
    storefront(side, z, kind, index) {
        const bank = kind === 'sber' || kind === 'alfa';
        const id = bank ? `bank_${kind}${(index % 4) + 1}` : kind, store = this.store(id, kind);
        const h = 2.45, w = Math.min(5.6, h * store.aspect), c = this.colours;
        this.part('plane', 0xffffff, side * 8.2, .3 + h / 2, z, w, h, 1, [0, -side * Math.PI / 2, 0], `store_${id}`);
        this.box(0x1c2738, side * 8.3, .3 + h / 2, z, .16, h + .24, w + .24); // рама
        this.box(0x8fa1ba, side * 8.05, .3 + h + .16, z, .45, .1, w + .5); // козырёк
        this.box(c.snow, side * 8.03, .3 + h + .27, z, .5, .14, w + .55); // снег на козырьке
        const rand = random(900 + index * 31 + (side > 0 ? 7 : 0));
        for (let i = 0; i < 9; i++) { // сосульки с края козырька
            const len = .15 + rand() * .35;
            this.part('cone', 0xd8e9ff, side * 7.84, .3 + h + .11 - len / 2, z - w / 2 + .2 + rand() * (w - .4), .035, len, .035, [Math.PI, 0, 0]);
        }
        this.part('plane', STORE_LIGHT[kind], side * 7.1, .31, z, 3.4, w + 2, 1, [-Math.PI / 2, 0, 0], 'halo'); // отсвет на снегу
        // консоль у ближнего к бегущему края витрины: кронштейн, двусторонняя вывеска, снег сверху
        const bz = z + w / 2 + .35;
        this.box(c.iron, side * 7.75, 3.62, bz, .9, .06, .06);
        this.part('plane', 0xffffff, side * 7.55, 3.2, bz, .8, 1, 1, null, `blade_${kind}`);
        this.box(c.snow, side * 7.55, 3.73, bz, .84, .08, .1);
    }

    // Материал витрины (один на вид, общий для всех кусков улицы): банк — фото-вывеска BANKS по-зимнему, обменник — рисованный
    store(id, kind) {
        if (this.stores[id]) return this.stores[id];
        const cfg = BANKS.list.find((b) => b.name === id);
        const mat = cfg ? this.photoSign(id, 1024, Math.round(1024 / cfg.aspect), 1.5)
            : new THREE.MeshStandardMaterial({ emissive: 0xffffff, emissiveIntensity: 1.5, roughness: .55, metalness: .1, envMapIntensity: .3 });
        if (!cfg) {
            mat.map = exchangeTexture(kind, false); mat.emissiveMap = exchangeTexture(kind, true);
        }
        this.materials[`store_${id}`] = mat;
        if (!this.materials[`blade_${kind}`]) {
            const map = bladeTexture(kind);
            this.materials[`blade_${kind}`] = new THREE.MeshStandardMaterial({ map, emissiveMap: map, emissive: 0xffffff, emissiveIntensity: 1.1, roughness: .6, side: THREE.DoubleSide });
        }
        return (this.stores[id] = { mat, aspect: cfg ? cfg.aspect : 1.6 });
    }

    // Фото-вывеска из textures/<name>_diff/_glow по-зимнему: иней, шапка снега; зал за стеклом чуть светится
    photoSign(name, W, H, glow) {
        const mat = new THREE.MeshStandardMaterial({ emissive: 0xffffff, emissiveIntensity: glow, roughness: .55, metalness: .1, envMapIntensity: .3 });
        const id = name, seed = id.length * 13 + Number(id.replace(/\D/g, '').slice(-1) || 0);
        {
            mat.map = texture(W, H, (g) => { g.fillStyle = '#1b2436'; g.fillRect(0, 0, W, H); });
            mat.emissiveMap = texture(W, H, (g) => { g.fillStyle = '#000'; g.fillRect(0, 0, W, H); });
            const loader = new THREE.ImageLoader();
            loader.load(`textures/${id}_diff.jpg`, (img) => {
                const g = mat.map.image.getContext('2d'); g.drawImage(img, 0, 0, W, H); winterize(g, W, H, seed, false); mat.map.needsUpdate = true;
                mat.map.userData.drawn = true; mat.map.userData.after?.();
            });
            loader.load(`textures/${id}_glow.jpg`, (img) => {
                // свет из окон отделения: вся витрина чуть светится (без этого в зимних сумерках — тёмное пятно), вывеска — ярко
                const g = mat.emissiveMap.image.getContext('2d');
                const draw = () => { g.globalAlpha = .45; g.drawImage(mat.map.image, 0, 0, W, H); g.globalAlpha = 1; g.globalCompositeOperation = 'lighter'; g.drawImage(img, 0, 0, W, H); g.globalCompositeOperation = 'source-over'; winterize(g, W, H, seed, true); mat.emissiveMap.needsUpdate = true; };
                mat.map.userData.drawn ? draw() : (mat.map.userData.after = draw);
            });
        }
        return mat;
    }

    // Пост ДПС во дворе за оградой (участки 1 и 3, слева): патрульная машина с мигалкой лицом к бегущему,
    // инспектор у ограды. Едут вместе с участком улицы; инспектор — когда загрузится его модель (world.officer)
    policePosts() {
        const w = this.world;
        this.posts = [];
        for (const i of POST_CHUNKS) {
            const chunk = this.chunks[i];
            if (!chunk) continue;
            const car = new THREE.Group();
            car.position.set(-5.05, .19, -12); // вдоль дороги в проёме ограды, на расчищенной обочине
            const flashers = [0xff2020, 0x2050ff].map((color, k) => {
                const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: w.glowTex, color: new THREE.Color(color).multiplyScalar(3),
                    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
                glow.scale.setScalar(.9);
                glow.position.set(0, 1.62, k ? .35 : -.35);
                car.add(glow);
                return glow;
            });
            car.userData.flashers = flashers;
            chunk.add(car);
            this.posts.push({ chunk, car, officer: null, model: null });
        }
        this.placeOfficers();
    }

    placeOfficers() {
        const w = this.world;
        for (const p of this.posts || []) { // 3D-патруль, когда загрузились модели машин (MODELS.police)
            if (p.model) continue;
            const t = w.modelFor('police');
            if (!t) break;
            p.model = t.clone();
            p.car.add(p.model);
        }
        if (!w.officer) return;
        for (const p of this.posts || []) {
            if (p.officer) continue;
            const o = w.makeOfficer(POLICE_OFFICER.idle[0]);
            if (!o) return;
            o.position.set(-4.3, .3, -7.5); // у края проёма, в шаге перед машиной
            o.rotation.y = .55; // к бегущему, вполоборота к дороге
            p.chunk.add(o);
            p.officer = o;
        }
    }

    fence(x, z, length) {
        // забор толще и мягче по цвету: тонкие тёмные линии на белом снегу на бегу дрожат и мерцают
        const c = this.colours, iron = 0x4d5f80;
        this.box(iron, x, .6, z, .12, .12, length);
        this.box(iron, x, 1.02, z, .15, .14, length);
        this.box(c.snow, x, 1.12, z, .2, .08, length);
        for (let d = -length / 2; d <= length / 2; d += 1.5) this.box(iron, x, .64, z + d, .12, .88, .12);
        for (const d of [-length / 2, length / 2]) {
            this.box(iron, x, .64, z + d, .18, 1.05, .18);
            this.part('ball', c.snow, x, 1.22, z + d, .15, .09, .15);
        }
    }

    lamp(x, z) {
        const c = this.colours;
        this.part('cylinder', c.iron, x, 2, z, .065, 3.9, .065);
        this.part('cylinder', c.iron, x, .4, z, .14, .7, .14);
        this.box(c.iron, x, 4.02, z, .5, .12, .5);
        this.part('box', new THREE.Color(2.5, 1.4, .45), x, 4.34, z, .38, .53, .38, null, 'glow');
        for (const dx of [-.21, .21]) for (const dz of [-.21, .21]) this.box(c.iron, x + dx, 4.32, z + dz, .045, .62, .045);
        this.part('plane', 0xb57d3a, x, 4.34, z, 2.6, 2.6, 1, null, 'halo'); // жёлтое свечение вокруг фонаря: без постобработки, поэтому и на телефоне
        this.part('cone', c.iron, x, 4.73, z, .43, .35, .43, [0, Math.PI / 4, 0]);
        this.part('cone', c.snow, x, 4.79, z, .4, .31, .4, [0, Math.PI / 4, 0]);
        this.part('ball', c.iron, x, 5, z, .07, .12, .07);
        // Warm light painted on snow, as opaque geometry, no extra light/shader pass.
        // 30.10: пятна света на снегу и на дороге в 2–2,5 раза тусклее: на хорошей графике свечение (bloom) раздувало их
        // в жёлтые кляксы с цветными крапинами асфальта посреди полосы
        // пятно света — только на ровном снегу за забором: на сугробе у дороги плоскость врезалась в него и мерцала рваными кусками
        this.part('plane', 0x6a4520, Math.sign(x) * 6.3, .27, z, 3.4, 5.4, 1, [-Math.PI / 2, 0, 0], 'halo');
    }

    birch(x, z, height) {
        const c = this.colours;
        this.rod(c.bark, [x, .2, z], [x + .25, height, z + .15], .16);
        this.rod(c.bark, [x + .1, height * .42, z], [x - .65, height * .92, z + .5], .085);
        for (let i = 0; i < 11; i++) {
            const angle = i * 2.4, y = height * (.35 + i * .052), reach = (1.4 + this.rand() * .8) * (1 - i * .035);
            const a = [x + .15, y, z], b = [x + Math.cos(angle) * reach, y + .65, z + Math.sin(angle) * reach];
            const mid = [(a[0] + b[0]) / 2, y + .18, (a[2] + b[2]) / 2];
            this.rod(c.bark, a, mid, .07); this.rod(c.bark, mid, b, .05); // без тонких веточек: толщиной в доли пикселя они мерцали на бегу
            if (i % 2 === 0) this.rod(c.snow, [a[0], a[1] + .035, a[2]], [mid[0], mid[1] + .035, mid[2]], .047);
        }
        this.part('ball', c.snow, x, .25, z, .55, .25, .65);
        this.part('plane', 0x24395b, x, .275, z, 2.5, 3.6, 1, [-Math.PI / 2, 0, 0], 'soft');
    }

    pine(x, z, height) {
        const c = this.colours;
        this.part('branch', c.wood, x, height / 2, z, .16, height, .16);
        for (let i = 0; i < 8; i++) {
            const reach = (1 - i / 8.7) * height * .32, y = .8 + i * height * .115;
            for (let j = 0; j < 6; j++) {
                const angle = j * Math.PI / 3 + i * .47;
                this.part('plane', 0xffffff, x + Math.cos(angle) * reach * .49, y, z + Math.sin(angle) * reach * .49,
                    reach, reach * .55, 1, [0, -angle, 0], 'foliage');
            }
        }
        for (let i = 0; i < 18; i++) {
            const y = 1.1 + i / 18 * height * .77, a = i * 1.13;
            const radius = height * .31 * (1 - i / 23);
            this.part('bulb', [0xffb343, 0xffd887, 0xff704b][i % 3], x + Math.cos(a) * radius, y, z + Math.sin(a) * radius,
                .065, .065, .065, null, 'glow');
            if (i % 3 === 0) {
                this.part('ornament', [0xd32b42, 0xe9b745, 0x319a9c][i / 3 % 3], x + Math.cos(a) * radius,
                    y - .17, z + Math.sin(a) * radius, .16, .2, .16);
            }
        }
        this.part('bulb', 0xffd377, x, height + .05, z, .19, .34, .19, null, 'glow');
    }

    bin(x, z) {
        const c = this.colours;
        this.box(0x35565b, x, .7, z, .85, .95, .7);
        this.box(c.dark, x, 1.2, z, .94, .13, .79);
        this.box(c.snow, x, 1.29, z, .94, .08, .79);
        for (const dx of [-.31, .31]) {
            this.part('bulb', c.dark, x + dx, .26, z + .22, .11, .11, .11);
            this.box(0x718989, x + dx, .7, z + .36, .045, .74, .04);
        }
        this.box(c.dark, x, 1.05, z + .42, .28, .06, .08);
    }

    bench(x, z) {
        const c = this.colours;
        for (const dz of [-.85, .85]) {
            this.box(c.iron, x, .5, z + dz, .45, .65, .09);
            this.box(c.iron, x + .26, .95, z + dz, .08, .65, .08);
        }
        this.box(c.wood, x, .76, z, .68, .1, 2);
        this.box(c.snow, x, .84, z, .65, .07, 2.05);
        this.box(c.wood, x + .28, 1.14, z, .08, .45, 2);
        this.box(c.snow, x + .28, 1.39, z, .13, .07, 2.05);
    }

    kiosk(x, z) {
        const c = this.colours;
        this.box(c.red, x, 1.5, z, 3.4, 2.7, 3.6);
        this.part('plane', 0xffffff, x, 1.57, z + 1.81, 3.2, 2.6, 1, null, 'shop');
        this.part('plane', 0xffffff, x + 1.71, 1.57, z, 3.35, 2.6, 1, [0, Math.PI / 2, 0], 'shop');
        this.box(c.red, x, 3.03, z, 3.8, .28, 4);
        this.part('ball', c.snow, x, 3.2, z, 2, .34, 2.1);
        this.box(c.snow, x, 3.2, z, 3.9, .17, 4.1);
        this.box(0xd9ac78, x + 1.95, .26, z, .5, .035, 3.5);
        this.part('plane', 0xffb963, x + 1.9, .281, z, 3, 5, 1, [-Math.PI / 2, 0, 0], 'soft');
    }

    playground(x, z) {
        const c = this.colours;
        this.box(0x567ca3, x, 1.3, z, 1.6, .15, 1.6);
        for (const dx of [-.7, .7]) for (const dz of [-.7, .7]) this.box(c.gold, x + dx, 1.4, z + dz, .11, 2.4, .11);
        this.part('cone', c.red, x, 3, z, 1.4, .95, 1.4, [0, Math.PI / 4, 0]);
        this.part('cone', c.snow, x, 3.1, z, 1.28, .85, 1.28, [0, Math.PI / 4, 0]);
        // Yellow slide towards the viewer, entirely outside the running lanes.
        this.box(0xefbc50, x, .85, z + 1.95, .85, .1, 2.9, [-.42, 0, 0]);
        for (const dx of [-.48, .48]) this.box(0xf5cc65, x + dx, .98, z + 1.95, .09, .25, 2.9, [-.42, 0, 0]);
        for (let i = 0; i < 5; i++) this.box(c.red, x, .35 + i * .22, z - 1.7 + i * .16, 1, .08, .13);
    }

    car(x, z) {
        this.carSites.push({ chunk: this.chunkIndex, x, z });
        this.part('plane', 0x0d1630, x, .225, z, 3.4, 6.2, 1, [-Math.PI / 2, 0, 0], 'soft');
    }

    // сказочный мостик под стать домам: кирпичные опоры со снежными шапками, деревянный настил, распорки и гирлянда
    bridge(z) {
        const c = this.colours, brick = 0x8a4238, wood = 0x6e4432, trim = 0xc99a6b;
        // низ настила на 7,4 м: в полёте макушка героя на 6,2 м, камера на 5,9 м, обоим проходить под мостом
        const up = 2.65, deck = 4.9 + up;
        for (const sx of [-1, 1]) {
            const x = sx * 7.3;
            this.box(0x5e3a38, x, .45, z, 1.3, .9, 1.9); // цоколь
            this.box(brick, x, deck / 2, z, .85, deck, 1.4);
            for (const y of [2.4, 4.6]) this.box(trim, x, y, z, .95, .12, 1.5); // пояса
            this.box(trim, x, deck - .3, z, 1.1, .22, 1.7);
            this.box(c.snow, x, 8.55, z, 1.2, .3, 1.8); // снег на опоре, поверх перил
            this.box(wood, x, 8.25, z, .9, .35, 1.5);
            // ступенчатые распорки у опор: настил не лежит плоской доской
            this.box(wood, sx * 6.3, deck - .42, z, 1.3, .5, 1.5);
            this.box(wood, sx * 5.2, deck - .27, z, 1, .22, 1.5);
        }
        this.box(wood, 0, deck, z, 15.5, .32, 2);
        this.box(trim, 0, deck - .2, z + 1.02, 15.5, .1, .06); // кант вдоль настила
        this.box(trim, 0, deck - .2, z - 1.02, 15.5, .1, .06);
        this.box(c.snow, 0, deck + .22, z, 15.7, .15, 2.1);
        for (const dz of [-.9, .9]) {
            this.box(wood, 0, deck + 1.1, z + dz, 14.2, .09, .09);
            this.box(c.snow, 0, deck + 1.17, z + dz, 14.2, .07, .13);
            for (let x = -6.6; x <= 6.6; x += 1.1) this.box(wood, x, deck + .65, z + dz, .08, .9, .08);
        }
        // гирлянда под настилом со стороны бегущего: лампочки по провисающей линии
        const lights = [0xffd27a, 0xff6a5a, 0x8fd8ff];
        for (let i = 0; i <= 18; i++) {
            const x = -6.3 + i * .7, y = deck - .28 - Math.abs(Math.sin(i / 6 * Math.PI)) * .28;
            this.part('bulb', lights[i % 3], x, y, z + 1.1, .075, .075, .075, null, 'glow');
        }
    }

    async loadArtwork() {
        const loader = new THREE.TextureLoader();
        const [facade, surfaces, foliage, kiosk] = await Promise.all([
            loader.loadAsync('textures/winter/facade-v1.webp'),
            loader.loadAsync('textures/winter/surfaces-v1.webp'),
            loader.loadAsync('textures/winter/spruce-bough-v1.webp'),
            loader.loadAsync('textures/winter/kiosk-v1.webp'),
        ]);
        for (const map of [facade, surfaces, foliage, kiosk]) { map.encoding = THREE.sRGBEncoding; map.anisotropy = 8; }
        this.materials.foliage.map.dispose(); this.materials.foliage.map = foliage; this.materials.foliage.needsUpdate = true;
        this.materials.shop.map.dispose(); this.materials.shop.map = kiosk; this.materials.shop.needsUpdate = true;
        const mat = this.materials.facade;
        mat.map.dispose(); mat.emissiveMap.dispose(); mat.map = facade;
        // Extract only warm indoor pixels for emission; cool masonry stays shaded by the actual scene.
        mat.emissiveMap = texture(512, 512, (g, W, H) => {
            g.drawImage(facade.image, 0, 0, W, H);
            const pixels = g.getImageData(0, 0, W, H), p = pixels.data;
            for (let i = 0; i < p.length; i += 4) {
                const warm = p[i] > 150 && p[i + 1] > 85 && p[i] > p[i + 2] * 1.55;
                const strength = warm ? Math.min(1, (p[i] - p[i + 2] * 1.55) / 65) : 0;
                p[i] *= strength; p[i + 1] *= strength; p[i + 2] *= strength;
            }
            g.putImageData(pixels, 0, 0);
        });
        mat.emissiveIntensity = .85; mat.needsUpdate = true;
        const snow = texture(512, 512, (g, W, H) => {
            g.drawImage(surfaces.image, 0, 0, surfaces.image.width / 2, surfaces.image.height / 2, 0, 0, W, H);
            g.fillStyle = 'rgba(228,237,252,.3)'; g.fillRect(0, 0, W, H);
        });
        snow.wrapS = snow.wrapT = THREE.RepeatWrapping;
        this.materials.surface.map = surfaces; this.materials.surface.needsUpdate = true;
        for (const mesh of this.chapel.children) {
            mesh.material.copy(this.materials[mesh.userData.winterMaterial]);
            mesh.material.fog = false; mesh.material.needsUpdate = true;
        }
        const groundMap = snow.clone(); groundMap.repeat.set(130 / 2, this.vistaLength / 2);
        this.ground.material.map = groundMap; this.ground.material.needsUpdate = true;
        await this.loadParkedCars(snow);
        this.assetsReady = true;
    }

    async loadParkedCars(snow) {
        const gltf = await new Promise((resolve, reject) => loadModel(PARKED_CAR, resolve, reject));
        cartoonModel(gltf.scene);
        const model = gltf.scene.clone(true), box = new THREE.Box3().setFromObject(model);
        let size = box.getSize(new THREE.Vector3());
        if (size.x > size.z) model.rotation.y += Math.PI / 2;
        model.updateMatrixWorld(true); box.setFromObject(model); size = box.getSize(new THREE.Vector3());
        model.scale.multiplyScalar(4.4 / size.z);
        model.updateMatrixWorld(true); box.setFromObject(model);
        const centre = box.getCenter(new THREE.Vector3());
        model.position.x -= centre.x; model.position.y -= box.min.y; model.position.z -= centre.z;
        // Snow settles on upward-facing bodywork. Keep the source geometry and textured car silhouette.
        model.traverse(o => {
            if (!o.isMesh) return;
            const original = o.material, material = original.clone();
            material.roughness = .65; material.metalness = .2;
            material.onBeforeCompile = shader => {
                curveShader(shader); shader.uniforms.winterSnow = { value: snow };
                shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying float vWinterUp; varying vec3 vWinterPoint;')
                    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWinterUp = normalize(mat3(modelMatrix) * normal).y; vWinterPoint = position;');
                shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D winterSnow; varying float vWinterUp; varying vec3 vWinterPoint;')
                    .replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, texture2D(winterSnow, vWinterPoint.xz * .3).rgb, smoothstep(.62, .94, vWinterUp) * .92);');
            };
            material.customProgramCacheKey = () => 'winter-parked-car-snow-v1';
            o.material = material; o.castShadow = false; o.receiveShadow = true;
        });
        for (const site of this.carSites) {
            const root = new THREE.Group(); root.add(model.clone(true));
            root.position.set(site.x, .19, site.z); root.userData.parkedCar = true;
            this.chunks[site.chunk].add(root);
        }
        this.carModel = PARKED_CAR;
    }

    hide(object) {
        if (!object || object.userData.winter) return;
        if (!this.hidden.has(object)) this.hidden.set(object, object.visible);
        object.visible = false;
    }

    sync() {
        if (!this.on) return;
        const w = this.world;
        for (const list of [w.streetRoots, w.scenery, w.critters, w.officers, w.flocks, w.lights, w.policeLights]) {
            for (const o of list || []) this.hide(o);
        }
        for (const o of [w.rain, w.ripples, w.reflector, w.lampPools, w.lampCones]) this.hide(o);
    }

    set(on) {
        this.on = on;
        for (const o of this.items) o.visible = on;
        if (on) this.sync();
        else {
            for (const [o, visible] of this.hidden) o.visible = visible;
            this.hidden.clear();
        }
    }

    update(dt, move) {
        if (!this.on) return;
        this.roadMap.offset.y = (this.roadMap.offset.y + move / 12) % 1;
        for (const o of this.chunks) {
            o.position.z += move;
            while (o.position.z > this.behind) o.position.z -= this.length;
            const near = o.position.z > -70;
            if (o.userData.signs && o.userData.signsOn !== near) { o.userData.signsOn = near; for (const m of o.userData.signs) m.visible = near; }
        }
        this.flash = (this.flash || 0) + dt; // мигалки постов ДПС: красный и синий по очереди
        const on = Math.floor(this.flash * 3) % 2 === 0;
        for (const p of this.posts || []) {
            const f = p.car.userData.flashers;
            if (f) { f[0].visible = on; f[1].visible = !on; }
            const z = p.chunk.position.z + p.car.position.z;
            if (p.officer && z > -70 && z < 8) p.officer.userData.mixer?.update(dt);
        }
        if (this.posts?.some((p) => !p.officer || !p.model)) this.placeOfficers();
        this.sync(); // includes asynchronously loaded NPCs and quality-dependent light batches
    }
}
