// Нячанг — локация Димы и Саши Товаруса: вечер у моря. Слева за набережной пляж и море до горизонта, справа
// стена небоскрёбов с неоном на первых этажах, вдоль дороги пальмы. Улица та же (дорога, разметка, провода, фонари
// справа) — прячется только то, чего во Вьетнаме нет: хрущёвки, всё на левом тротуаре, патрули, дождь.
// Всё строится один раз при первом включении; потом World.setLocation только показывает/прячет.

import * as THREE from "./vendor/three.module.js";
import { VIETNAM } from "./config.js";
import { batchScenery } from "./scenery-batch.js";

const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function canvasTex(w, h, draw, srgb = true) {
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    draw(c.getContext("2d"), w, h);
    const t = new THREE.CanvasTexture(c);
    if (srgb) t.encoding = THREE.sRGBEncoding;
    t.anisotropy = 4;
    return t;
}

// окна башни: 8 столбцов × 16 этажей на картинку; горят не все, тёплые и холодные вперемешку (emissive — та же картинка)
function windowsTex(warm) {
    return canvasTex(256, 512, (g, w, h) => {
        g.fillStyle = "#1a1826"; g.fillRect(0, 0, w, h);
        const cw = w / 8, ch = h / 16;
        for (let y = 0; y < 16; y++) {
            g.fillStyle = "#2a2838"; g.fillRect(0, y * ch + ch - 4, w, 4); // перекрытия
            for (let x = 0; x < 8; x++) {
                const lit = Math.random() < 0.42;
                g.fillStyle = !lit ? "#0c0d16" : Math.random() < warm ? pick(["#ffcf8a", "#ffb870", "#ffe2b0"]) : pick(["#bfe0ff", "#9fd0ff", "#e8f4ff"]);
                g.fillRect(x * cw + 3, y * ch + 3, cw - 6, ch - 9);
            }
        }
    });
}

// листья пальмы: вытянутое перо с прожилками, прозрачный фон (alphaTest)
function frondTex() {
    return canvasTex(64, 256, (g, w, h) => {
        g.clearRect(0, 0, w, h);
        g.strokeStyle = "#3d5a2a"; g.lineWidth = 3;
        g.beginPath(); g.moveTo(w / 2, 0); g.lineTo(w / 2, h); g.stroke();
        for (let y = 6; y < h - 4; y += 5) {
            const k = Math.sin((y / h) * Math.PI) * 0.95 + 0.05;
            g.strokeStyle = pick(["#2f6b2a", "#3d7d30", "#28592a"]); g.lineWidth = 3;
            for (const s of [-1, 1]) { g.beginPath(); g.moveTo(w / 2, y); g.lineTo(w / 2 + s * (w / 2 - 2) * k, y + 10 * k); g.stroke(); }
        }
    });
}

// балюстрада набережной: белые столбики и перила (одна плоскость с прозрачностью, «едет» сдвигом текстуры)
function railTex() {
    return canvasTex(128, 64, (g, w, h) => {
        g.clearRect(0, 0, w, h);
        g.fillStyle = "#e9e2d4";
        g.fillRect(0, 0, w, 10); g.fillRect(0, h - 8, w, 8);
        for (let i = 0; i < 4; i++) {
            const x = i * 32 + 10;
            g.beginPath(); g.moveTo(x, 10); g.quadraticCurveTo(x - 6, 36, x + 2, h - 8); g.lineTo(x + 10, h - 8); g.quadraticCurveTo(x + 18, 36, x + 12, 10); g.fill();
        }
    });
}

// блики на воде: светлые штрихи (солнце и окна башен) — прибавляются к цвету моря
function seaTex() {
    const t = canvasTex(256, 256, (g, w, h) => {
        g.fillStyle = "#000"; g.fillRect(0, 0, w, h);
        for (let i = 0; i < 260; i++) {
            g.fillStyle = `rgba(255,${190 + Math.random() * 60 | 0},${150 + Math.random() * 80 | 0},${rnd(0.15, 0.7)})`;
            g.fillRect(rnd(0, w), rnd(0, h), rnd(6, 26), rnd(1, 2.5));
        }
    });
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
}

const SIGN_COLORS = ["#ff2d6a", "#2de0ff", "#ffd02d", "#7dff4a", "#c04dff"];
function signAtlas() {
    const rows = Math.ceil(VIETNAM.signs.length / 2);
    return canvasTex(512, rows * 64, (g) => {
        VIETNAM.signs.forEach((text, i) => {
            g.save(); g.translate((i % 2) * 256, Math.floor(i / 2) * 64);
            const color = SIGN_COLORS[i % SIGN_COLORS.length];
            g.fillStyle = "#120c1b"; g.fillRect(0, 0, 256, 64);
            g.font = "bold 38px Arial, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
            g.shadowColor = color; g.shadowBlur = 10; g.fillStyle = "#fff"; g.fillText(text, 128, 32, 242);
            g.shadowBlur = 0; g.strokeStyle = color; g.lineWidth = 3; g.strokeRect(3, 3, 250, 58); g.restore();
        });
    });
}

export class Vietnam {
    constructor(world, { streetLen, behindZ }) {
        this.world = world;
        this.len = streetLen;
        this.behind = behindZ;
        this.items = []; // всё своё (и статичное, и едущее по кругу) — показать/спрятать разом
        this.scroll = []; // текстуры, которые «едут» вместе с улицей: [texture, метров на повтор]
        this.build();
    }

    build() {
        const w = this.world, s = w.scene, L = this.len, cz = this.behind - L / 2;
        const std = (o) => new THREE.MeshStandardMaterial(o);
        const moving = [];
        const add = (o, loop) => {
            if (loop) moving.push(o);
            else { s.add(o); this.items.push(o); }
            return o;
        };

        // море до горизонта: тёмная вода, отражает небо (environment), поверх — бегущие блики
        this.seaGlint = seaTex();
        this.seaGlint.repeat.set(30, 60);
        const sea = new THREE.Mesh(new THREE.PlaneGeometry(260, 420), std({
            color: VIETNAM.sea, roughness: 0.18, metalness: 0.55, envMapIntensity: 1.6,
            emissive: 0xffffff, emissiveMap: this.seaGlint, emissiveIntensity: 0.55,
        }));
        sea.rotation.x = -Math.PI / 2;
        sea.position.set(-16 - 130, -0.25, cz - 100);
        add(sea);
        this.scroll.push([this.seaGlint, 420 / 60]);

        // пляж: песок от набережной до воды, с полосой мокрого песка у кромки
        const sandMap = canvasTex(64, 64, (g, W, H) => {
            g.fillStyle = "#fff"; g.fillRect(0, 0, W, H);
            for (let i = 0; i < 500; i++) { g.fillStyle = `rgba(0,0,0,${rnd(0.03, 0.12)})`; g.fillRect(rnd(0, W), rnd(0, H), 1.5, 1.5); }
        });
        sandMap.wrapS = sandMap.wrapT = THREE.RepeatWrapping;
        sandMap.repeat.set(3, L / 4);
        const sand = new THREE.Mesh(new THREE.PlaneGeometry(9.5, L), std({ color: VIETNAM.sand, map: sandMap, roughness: 1 }));
        sand.rotation.x = -Math.PI / 2;
        sand.position.set(-11.6, -0.05, cz);
        add(sand);
        this.scroll.push([sandMap, 4]);
        const wet = new THREE.Mesh(new THREE.PlaneGeometry(2.2, L), std({ color: 0x6e5a48, roughness: 0.25, metalness: 0.2 }));
        wet.rotation.x = -Math.PI / 2;
        wet.position.set(-16.6, -0.12, cz);
        add(wet);
        // пена прибоя у кромки
        const foamMap = canvasTex(64, 256, (g, W, H) => {
            g.clearRect(0, 0, W, H);
            for (let i = 0; i < 90; i++) { g.fillStyle = `rgba(255,255,255,${rnd(0.3, 0.9)})`; g.beginPath(); g.ellipse(rnd(10, W - 10), rnd(0, H), rnd(2, 8), rnd(4, 14), 0, 0, 7); g.fill(); }
        });
        foamMap.wrapS = foamMap.wrapT = THREE.RepeatWrapping;
        foamMap.repeat.set(1, L / 6);
        const foam = new THREE.Mesh(new THREE.PlaneGeometry(1.4, L), new THREE.MeshBasicMaterial({ map: foamMap, transparent: true, depthWrite: false, color: 0xffeedd }));
        foam.rotation.x = -Math.PI / 2;
        foam.position.set(-17.8, -0.08, cz);
        add(foam);
        this.scroll.push([foamMap, 6]);
        this.foam = foam;

        // набережная: парапет из белых балясин вдоль левого тротуара
        const railMap = railTex();
        railMap.wrapS = THREE.RepeatWrapping;
        railMap.repeat.set(L / 1.6, 1);
        const rail = new THREE.Mesh(new THREE.PlaneGeometry(L, 1.0), std({ map: railMap, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.8 }));
        rail.rotation.y = Math.PI / 2;
        rail.position.set(-6.9, 0.68, cz);
        add(rail);
        this.scroll.push([railMap, -1.6]); // плоскость повёрнута: U идёт против Z
        const top = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.08, L), std({ color: 0xf1ebdf, roughness: 0.7 }));
        top.position.set(-6.9, 1.2, cz);
        add(top);

        // пальмы вдоль набережной и у башен
        const trunkMat = std({ color: 0x6b5236, roughness: 0.95 });
        const frondMat = std({ map: frondTex(), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.8, color: 0xc8d8b0 });
        for (let i = 0; i < 12; i++) {
            const p = this.makePalm(trunkMat, frondMat);
            p.position.set(-6.2 + rnd(-0.15, 0.15), 0.18, this.behind - 6 - i * (L / 12));
            add(p, L);
        }
        for (let i = 0; i < 6; i++) {
            const p = this.makePalm(trunkMat, frondMat);
            p.position.set(6.5, 0.18, this.behind - 14 - i * (L / 6));
            add(p, L);
        }

        // небоскрёбы справа: подиум с неоном, над ним башня с окнами, на крыше красные огни
        this.towerMats = [0.85, 0.5, 0.2].map((warm) => {
            const t = windowsTex(warm);
            t.wrapS = t.wrapT = THREE.RepeatWrapping;
            return t;
        });
        this.redLamp = new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 0.3, 0.2) });
        this.towerMaterials = this.towerMats.map(map => std({ map, emissiveMap: map, emissive: 0xffffff,
            emissiveIntensity: 1.6, roughness: 0.4, metalness: 0.5, envMapIntensity: 1.2, color: 0x9aa0b8 }));
        this.podiumMaterial = std({ color: 0x2a2430, roughness: .7 });
        this.signMaterial = new THREE.MeshBasicMaterial({ map: signAtlas(), color: new THREE.Color(1.8, 1.8, 1.8) });
        this.shopMaterials = SIGN_COLORS.map(c => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(.25).add(new THREE.Color(.9, .7, .45)) }));
        const slot = VIETNAM.slot;
        for (let i = 0; i < L / slot; i++) add(this.makeTower(slot), L).position.z = this.behind - 6 - i * slot;
        // второй ряд — дальше от дороги, выше: силуэт города над первым рядом
        for (let i = 0; i < L / 32; i++) {
            const t = this.makeTower(30, 1.5);
            t.position.set(34, 0, this.behind - 20 - i * 32);
            add(t, L);
        }

        this.buildPromenade(add);
        for (const group of batchScenery(moving, { behind: this.behind })) {
            group.userData.walkBoxes = []; // крупные графические пакеты не являются стенами для прохожих
            w.addScenery(group, L); this.items.push(group);
        }
        this.itemSet = new Set(this.items);
        this.hideAll(true);
    }

    // Низкополигональные 3D-объекты набережной. Общие геометрии/материалы, без новых источников света;
    // при завершении сборки все детали попадут в пространственные пакеты вместе с пальмами.
    buildPromenade(add) {
        const mat = (color) => new THREE.MeshStandardMaterial({ color, roughness: .82, flatShading: true });
        const wood = mat(0x9b6943), white = mat(0xf4ddba), metal = mat(0x4f656c), rubber = mat(0x262332);
        const green = mat(0x467f4a), fruit = mat(0xe9bc4e), hull = mat(0x287e9f);
        const colors = [0xe87757, 0x43a7ae, 0xe4bf59, 0x9182b2].map(mat);
        const box = new THREE.BoxGeometry(1, 1, 1), cyl = new THREE.CylinderGeometry(1, 1, 1, 10);
        const ball = new THREE.SphereGeometry(1, 8, 6), cone = new THREE.ConeGeometry(1, 1, 8, 1, true);
        const part = (g, geo, material, x, y, z, sx, sy, sz) => {
            const mesh = new THREE.Mesh(geo, material);
            mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz); g.add(mesh); return mesh;
        };
        this.propCounts = {};
        const place = (g, type, x, z, angle = 0) => {
            this.propCounts[type] = (this.propCounts[type] || 0) + 1;
            g.position.set(x, 0, z); g.rotation.y = angle; add(g, this.len);
        };
        for (let i = 0; i < 8; i++) {
            const z = this.behind - 12 - i * this.len / 8, color = colors[i % colors.length];
            const umbrella = new THREE.Group();
            part(umbrella, cyl, wood, 0, 1.1, 0, .035, 2.2, .035);
            part(umbrella, cone, color, 0, 2.15, 0, 1.55, .48, 1.55);
            part(umbrella, ball, white, 0, 2.41, 0, .07, .08, .07);
            place(umbrella, 'umbrellas', -10.1, z);
            const chair = new THREE.Group();
            part(chair, box, white, 0, .35, 0, .68, .09, 1.5);
            part(chair, box, color, 0, .42, .12, .6, .06, 1.1);
            const back = part(chair, box, white, 0, .65, -.7, .68, .08, .85); back.rotation.x = -.65;
            for (const x of [-.27, .27]) for (const zz of [-.55, .55]) part(chair, cyl, wood, x, .18, zz, .035, .36, .035);
            place(chair, 'loungers', -11.8, z + 1.9, .2);
        }
        for (let i = 0; i < 3; i++) {
            const boat = new THREE.Group();
            part(boat, ball, hull, 0, -.05, 0, 1, .42, 2.8);
            part(boat, box, wood, 0, .19, 0, 1.3, .1, 3.4);
            part(boat, box, white, 0, .5, .4, .9, .5, 1.1);
            for (const z of [-.75, .75]) part(boat, cyl, wood, 0, 1.05, z, .035, 1.7, .035);
            part(boat, box, colors[i], 0, 1.85, 0, 1.6, .12, 2.3);
            part(boat, box, metal, .8, .35, -1.7, .12, .1, 2.2).rotation.y = .35;
            place(boat, 'boats', -23 - i * 3, this.behind - 30 - i * 45, -.2 + i * .3);
        }
        for (let i = 0; i < 6; i++) {
            const scooter = new THREE.Group(), color = colors[i % colors.length];
            for (const z of [-.5, .5]) {
                const wheel = part(scooter, cyl, rubber, 0, .25, z, .24, .12, .24); wheel.rotation.z = Math.PI / 2;
                const hub = part(scooter, cyl, metal, .07, .25, z, .1, .13, .1); hub.rotation.z = Math.PI / 2;
            }
            part(scooter, box, color, 0, .5, -.12, .4, .4, .85);
            part(scooter, box, rubber, 0, .76, -.25, .43, .09, .65);
            part(scooter, box, color, 0, .82, .4, .35, .55, .16).rotation.x = -.25;
            part(scooter, box, metal, 0, 1.13, .36, .65, .05, .05);
            part(scooter, ball, white, 0, 1, .5, .12, .1, .04);
            place(scooter, 'scooters', 5.9, this.behind - 17 - i * this.len / 6, -.6);
        }
        for (let i = 0; i < 4; i++) {
            const cart = new THREE.Group(), color = colors[(i + 1) % colors.length];
            part(cart, box, wood, 0, .7, 0, .9, .9, 1.5);
            part(cart, box, white, 0, 1.18, 0, 1.05, .12, 1.65);
            part(cart, box, color, 0, 2, 0, 1.3, .15, 1.9);
            for (const z of [-.65, .65]) {
                part(cart, cyl, metal, .35, 1.57, z, .025, .8, .025);
                for (const x of [-.48, .48]) {
                    const wheel = part(cart, cyl, rubber, x, .22, z, .22, .08, .22); wheel.rotation.z = Math.PI / 2;
                }
            }
            for (let j = 0; j < 5; j++) part(cart, ball, fruit, -.16, 1.33, -.5 + j * .23, .12, .12, .12);
            // Вывеска из того же атласа, что у магазинов: нового материала не появляется.
            const signGeo = new THREE.PlaneGeometry(.8, .24), uv = signGeo.attributes.uv;
            const rows = Math.ceil(VIETNAM.signs.length / 2), idx = i % VIETNAM.signs.length;
            for (let j = 0; j < uv.count; j++) uv.setXY(j, (idx % 2 + uv.getX(j)) / 2, 1 - (Math.floor(idx / 2) + 1) / rows + uv.getY(j) / rows);
            const sign = new THREE.Mesh(signGeo, this.signMaterial);
            sign.rotation.y = -Math.PI / 2; sign.position.set(-.46, .8, 0); cart.add(sign);
            place(cart, 'foodCarts', 6.4, this.behind - 34 - i * this.len / 4);
        }
        for (let i = 0; i < 5; i++) {
            const cafe = new THREE.Group();
            part(cafe, cyl, wood, 0, .76, 0, .42, .07, .42);
            part(cafe, cyl, metal, 0, .4, 0, .05, .75, .05);
            part(cafe, cyl, white, 0, .84, 0, .055, .12, .055);
            for (const z of [-.7, .7]) {
                part(cafe, cyl, colors[i % colors.length], 0, .44, z, .21, .07, .21);
                part(cafe, cyl, wood, 0, .22, z, .05, .44, .05);
            }
            place(cafe, 'cafeTables', -5.4, this.behind - 8 - i * this.len / 5);
        }
        for (let i = 0; i < 8; i++) {
            const planter = new THREE.Group();
            part(planter, box, wood, 0, .3, 0, .65, .6, .65);
            for (const x of [-.18, .18]) part(planter, ball, green, x, .76, 0, .24, .4, .28);
            place(planter, 'planters', i % 2 ? 5.6 : -5.4, this.behind - 19 - i * this.len / 8);
        }
    }

    makePalm(trunkMat, frondMat) {
        const g = new THREE.Group();
        const h = rnd(5.5, 8), lean = rnd(-0.25, 0.25), segs = 6;
        let x = 0, y = 0;
        for (let i = 0; i < segs; i++) { // ствол — изогнутый из сегментов
            const sh = h / segs, ang = lean * (i / segs) * 1.6;
            const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.13 - i * 0.008, 0.16 - i * 0.008, sh * 1.04, 7), trunkMat);
            seg.position.set(x + Math.sin(ang) * sh / 2, y + sh / 2, 0);
            seg.rotation.z = -ang;
            g.add(seg);
            x += Math.sin(ang) * sh; y += Math.cos(ang) * sh;
        }
        const crown = new THREE.Group();
        crown.position.set(x, y, 0);
        const n = 9;
        for (let i = 0; i < n; i++) {
            const len = rnd(2.6, 3.4);
            const geo = new THREE.PlaneGeometry(0.9, len, 1, 6);
            geo.translate(0, len / 2, 0);
            const pos = geo.attributes.position;
            for (let k = 0; k < pos.count; k++) { const t = pos.getY(k) / len; pos.setZ(k, -t * t * 1.6); } // перо свисает к концу
            geo.rotateX(-Math.PI / 2 + rnd(0.25, 0.55));
            const f = new THREE.Mesh(geo, frondMat);
            f.rotation.y = (i / n) * Math.PI * 2 + rnd(-0.2, 0.2);
            crown.add(f);
        }
        g.add(crown);
        g.userData.foot = { hx: 0.3, hz: 0.3, prio: 0 };
        return g;
    }

    makeTower(slot, far = 1) {
        const g = new THREE.Group();
        const len = slot - rnd(2, 5);
        const depth = 12;
        const h = rnd(...VIETNAM.towers) * far;
        const material = pick(this.towerMaterials);
        const geometry = new THREE.BoxGeometry(depth, h, len);
        const uv = geometry.attributes.uv, ox = Math.random(), oy = Math.random();
        for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * len / 25.6 + ox, uv.getY(i) * h / 51.2 + oy);
        const body = new THREE.Mesh(geometry, material);
        body.position.set(depth / 2 + 3, h / 2 + 4.5, 0);
        g.add(body);
        if (far === 1) {
            // подиум с магазинами и неоновыми вывесками по-вьетнамски
            const podium = new THREE.Mesh(new THREE.BoxGeometry(depth + 3, 4.5, len + 1), this.podiumMaterial);
            podium.position.set(depth / 2 + 1.5, 2.25, 0);
            g.add(podium);
            for (const dz of [-len / 4, len / 4]) {
                if (Math.random() < 0.2) continue;
                const idx = Math.floor(Math.random() * VIETNAM.signs.length), rows = Math.ceil(VIETNAM.signs.length / 2);
                const geometry = new THREE.PlaneGeometry(3.4, .85), uv = geometry.attributes.uv;
                for (let i = 0; i < uv.count; i++) uv.setXY(i, (idx % 2 + uv.getX(i)) / 2, 1 - (Math.floor(idx / 2) + 1) / rows + uv.getY(i) / rows);
                const sign = new THREE.Mesh(geometry, this.signMaterial);
                sign.rotation.y = -Math.PI / 2;
                sign.position.set(-0.05, 3.4, dz);
                // витрина под вывеской — тёплый свет из магазина
                const shop = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 2.2), this.shopMaterials[idx % this.shopMaterials.length]);
                shop.rotation.y = -Math.PI / 2;
                shop.position.set(-0.04, 1.3, dz);
                g.add(sign, shop);
            }
        }
        for (const dz of [-len / 2 + 1, len / 2 - 1]) { // авиаогни на крыше
            const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.25 * far, 6, 4), this.redLamp);
            lamp.position.set(3.5, h + 4.6, dz);
            g.add(lamp);
        }
        g.position.x = 7.2;
        return g;
    }

    hideAll(hidden) { for (const o of this.items) o.visible = !hidden; }

    // включить/выключить: своё показать, городское спрятать (и наоборот)
    set(on) {
        this.on = on;
        this.hideAll(!on);
        this.sync();
    }

    // что из обычного района прятать во Вьетнаме: дома, всё слева от дороги (там набережная и море), патрули
    sync() {
        const w = this.world;
        const city = (o) => o.userData.city || o.userData.police || w.officers.includes(o) || o.position.x < -3;
        for (const o of [...w.scenery, ...w.critters, ...w.officers]) {
            if (this.itemSet.has(o)) continue;
            if (o.userData.vnHidden !== undefined || city(o)) {
                if (this.on && city(o)) { if (o.userData.vnHidden === undefined) o.userData.vnHidden = o.visible; o.visible = false; }
                else if (!this.on && o.userData.vnHidden !== undefined) { o.visible = o.userData.vnHidden; delete o.userData.vnHidden; }
            }
        }
        for (const f of w.flocks) {
            if (this.on && f.position.x < 0) { if (f.userData.vnHidden === undefined) f.userData.vnHidden = f.visible; f.visible = false; }
            else if (!this.on && f.userData.vnHidden !== undefined) { f.visible = f.userData.vnHidden; delete f.userData.vnHidden; }
        }
        w.rain.visible = !this.on;
        w.ripples.visible = !this.on;
    }

    update(dt, move, t) {
        if (!this.on) return;
        for (const [tex, metres] of this.scroll) {
            if (tex === this.seaGlint) { tex.offset.y += move / metres; tex.offset.x += dt * 0.01; }
            else if (metres < 0) tex.offset.x -= move / metres; // перила: плоскость повёрнута, U идёт навстречу
            else tex.offset.y += move / metres;
        }
        this.foam.position.x = -17.8 + Math.sin(t * 0.8) * 0.35; // прибой накатывает и отходит
        this.redLamp.color.setScalar(0).setRGB(Math.sin(t * 3) > 0.6 ? 5 : 0.4, 0.2, 0.15); // авиаогни мигают
        if ((this.syncTick = (this.syncTick || 0) + 1) % 90 === 0) this.sync(); // догрузились NPC, инспекторы — тоже спрятать
    }
}
