// Winter district: deterministic modular scenery, built once and recycled in 32 m sections.
// Geometry is batched by material; detailed artwork is shared by the entire street.
// No snowfall, mirror render, per-window lights or animated scenery on the mobile GPU.
import * as THREE from './vendor/three.module.js';
import { mergeBufferGeometries } from './vendor/jsm/BufferGeometryUtils.js';
import { loadModel } from './models.js';

// Existing lightweight Corvette is used until the newly supplied high-resolution model is available.
const PARKED_CAR = 'models/obj/lite/car1.glb';

export const WINTER = {
    fog: 0x777fae, near: 38, far: 122,
    sky: { zenith: '#334e87', mid: '#8c9dcb', horizon: '#efc1c9' },
    hemi: [0x9bb6fa, 0x303c64], light: .66, moon: 0xb6c8ff,
    rowGap: [16, 11],
};
export const WINTER_OBSTACLES = ['dumpster', 'dumpster', 'dumpster', 'roadblock', 'roadblock', 'barrier', 'cart', 'block', 'car'];

function texture(width, height, draw) {
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    draw(canvas.getContext('2d'), width, height);
    const t = new THREE.CanvasTexture(canvas);
    t.encoding = THREE.sRGBEncoding; t.anisotropy = 4;
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

export class Winter {
    constructor(world, { streetLen, behindZ }) {
        this.world = world; this.length = streetLen; this.behind = behindZ;
        this.items = []; this.chunks = []; this.carSites = []; this.hidden = new Map(); this.on = false;
        this.build(); this.set(false);
        this.ready = this.loadArtwork().catch(error => { console.warn('[winter] Texture loading failed', error); });
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
                alphaTest: .45, side: THREE.DoubleSide, roughness: 1, envMapIntensity: .1 }),
            facade: new THREE.MeshStandardMaterial({ vertexColors: true, map: facadeTexture(), emissiveMap: facadeTexture(true),
                emissive: 0xffffff, emissiveIntensity: .63, roughness: 1 }),
            shop: new THREE.MeshBasicMaterial({ map: shopTexture(), color: 0xffe5c8 }),
            glow: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
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
            ball: new THREE.SphereGeometry(1, 10, 7),
            ornament: new THREE.SphereGeometry(1, 6, 4),
            bulb: new THREE.OctahedronGeometry(1),
            cylinder: new THREE.CylinderGeometry(1, 1, 1, 8),
            cone: new THREE.ConeGeometry(1, 1, 10),
            branch: new THREE.CylinderGeometry(.35, 1, 1, 7),
            plane: new THREE.PlaneGeometry(1, 1),
        };
        this.temp = new THREE.Object3D();
        const add = o => { this.world.scene.add(o); this.items.push(o); return o; };
        // A matte, opaque road: lane paint and wheel tracks are baked into one repeating map.
        this.roadMap = texture(512, 1024, (g, W, H) => {
            g.fillStyle = '#29364b'; g.fillRect(0, 0, W, H);
            const rand = random(111);
            for (let i = 0; i < 35000; i++) {
                g.fillStyle = rand() > .5 ? '#bec7df12' : '#111f3517';
                g.fillRect(rand() * W, rand() * H, 1 + rand() * 2, 1 + rand() * 3);
            }
            for (const x of [65, 105, 235, 275, 405, 445]) {
                g.fillStyle = '#22334a22'; g.fillRect(x, 0, 12, H);
            }
            g.fillStyle = '#c7d5de';
            for (const x of [W * .358, W * .642]) for (let y = 0; y < H; y += 256) g.fillRect(x, y, 5, 112);
            for (const x of [0, W - 14]) {
                g.fillStyle = '#b0c6e7'; g.fillRect(x, 0, 14, H);
                for (let y = 0; y < H; y += 7) { g.fillStyle = '#d7e2f0'; g.fillRect(x + rand() * 10, y, rand() * 10, 9); }
            }
        });
        this.roadMap.wrapS = this.roadMap.wrapT = THREE.RepeatWrapping;
        this.roadMap.repeat.set(1, this.length / 12);
        const road = new THREE.Mesh(new THREE.PlaneGeometry(6, this.length),
            new THREE.MeshStandardMaterial({ map: this.roadMap, roughness: .96, metalness: 0, envMapIntensity: .05 }));
        road.rotation.x = -Math.PI / 2; road.position.set(0, .014, this.behind - this.length / 2);
        road.receiveShadow = true; add(road);
        const ground = this.ground = new THREE.Mesh(new THREE.PlaneGeometry(130, this.length),
            new THREE.MeshStandardMaterial({ color: colours.snowShade, roughness: 1 }));
        ground.rotation.x = -Math.PI / 2; ground.position.set(0, -.04, road.position.z); add(ground);

        for (let index = 0; index < this.length / 32; index++) {
            this.chunkIndex = index;
            this.parts = {}; this.rand = random(170 + index * 337);
            for (const side of [-1, 1]) {
                this.building(side, 0, index);
                this.box(colours.snow, side * 6.1, .12, 0, 4.6, .27, 32);
                this.snowbank(side, index);
                for (const z of [-12, -4, 4, 12]) this.fence(side * 4.15, z, 7.5);
                this.lamp(side * 4.1, side < 0 ? -5 : 10);
                this.birch(side * 5.65, side < 0 ? 8 : 0, 6.1 + index % 3);
                this.birch(side * 7.3, side < 0 ? 14 : -15, 7.1);
                this.pine(side * 8, side < 0 ? -12 : 5, 5.8 + index % 2);
                this.bench(side * 5.5, side < 0 ? 2 : 14);
                this.bin(side * 5, side < 0 ? -14 : 8);
            }
            if (index % 2 === 0) this.kiosk(-6.3, -8);
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
                group.add(mesh); for (const piece of list) piece.dispose();
            }
            group.position.z = -index * 32;
            this.chunks.push(group); add(group);
        }
        for (const geometry of Object.values(this.geometry)) geometry.dispose();
        this.parts = this.geometry = this.temp = null;
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

    building(side, z, index) {
        const c = this.colours, x = side * 13, height = 13.5 + ((index + (side > 0 ? 1 : 0)) % 3) * 1.3;
        const tint = [0xc6cadb, 0xd8c8b1, 0xb4c7d7][(index + (side > 0 ? 1 : 0)) % 3];
        this.box([0x8694a9, 0x9e9cad, 0x9cabb8][index % 3], x, height / 2, z, 9, height, 28);
        this.part('plane', tint, side * 8.48, height / 2 + .2, z, 28, height - .4, 1,
            [0, -side * Math.PI / 2, 0], 'facade');
        this.part('plane', tint, x, height / 2 + .2, z + 14.015, 9, height - .4, 1, null, 'facade');
        this.box(0x5c6d85, side * 8.42, .5, z, .28, 1, 28.1);
        for (let floor = 1; floor < 5; floor++) {
            this.box(0x889bb7, side * 8.3, floor * (height / 5), z, .35, .13, 28.2);
            this.box(c.snow, side * 8.28, floor * (height / 5) + .1, z, .4, .09, 28.3);
        }
        this.box(c.snow, x, height + .08, z, 9.5, .35, 28.5);
        this.box(c.dark, x, height + .48, z, 8.6, .55, 27.6);
        this.box(c.snow, x, height + .8, z, 8.9, .2, 27.9);
        for (const dz of [-8, 7]) {
            this.box(0x69768c, x, height + 1.3, dz, 1.2, 1.2, .9);
            this.box(c.snow, x, height + 1.95, dz, 1.4, .15, 1.1);
        }
        // Entry porches, awnings and drainpipes provide actual depth in front of the facade.
        for (const dz of [-8, 7]) {
            this.box(0x304154, side * 8.24, 1.2, dz, .2, 2.4, 1.5);
            this.box(0xa6b7cc, side * 7.85, 2.55, dz, 1.35, .18, 2.2);
            this.box(c.snow, side * 7.84, 2.7, dz, 1.4, .16, 2.3);
            this.box(0x75849e, side * 7.95, .2, dz, 1.1, .35, 1.8);
        }
        for (const dz of [-13.5, 13.5]) this.part('cylinder', c.iron, side * 8.25, height / 2, dz, .065, height, .065);
        for (const dz of [-5.3, 5.3]) for (const floor of [2, 3, 4]) {
            const y = floor * height / 5 - .5;
            this.box(0x596a80, side * 8.04, y, dz, .95, .16, 2.2);
            this.box(c.snow, side * 8.04, y + .12, dz, 1.04, .12, 2.3);
            this.box(0x62728a, side * 7.58, y + .57, dz, .07, .77, 2.1);
            this.box(c.snow, side * 7.58, y + 1, dz, .13, .08, 2.2);
            for (const d of [-1.03, 1.03]) this.box(0x6c7f97, side * 8, y + .57, dz + d, .85, .77, .065);
        }
        this.part('plane', 0x233958, side * 7.4, .273, z, 3, 28, 1, [-Math.PI / 2, 0, 0], 'soft');
    }

    fence(x, z, length) {
        const c = this.colours;
        this.box(c.iron, x, .6, z, .055, .055, length);
        this.box(c.iron, x, 1.02, z, .075, .08, length);
        this.box(c.snow, x, 1.08, z, .11, .055, length);
        for (let d = -length / 2; d <= length / 2; d += .75) {
            this.box(c.iron, x, .64, z + d, .06, .88, .06);
            this.part('ball', c.snow, x, 1.1, z + d, .08, .055, .08);
        }
        for (const d of [-length / 2, length / 2]) {
            this.box(c.iron, x, .64, z + d, .13, 1.05, .13);
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
        this.part('cone', c.iron, x, 4.73, z, .43, .35, .43, [0, Math.PI / 4, 0]);
        this.part('cone', c.snow, x, 4.79, z, .4, .31, .4, [0, Math.PI / 4, 0]);
        this.part('ball', c.iron, x, 5, z, .07, .12, .07);
        // Warm light painted on snow, as opaque geometry, no extra light/shader pass.
        this.part('plane', 0xffa84e, x, .3, z, 5.4, 7, 1, [-Math.PI / 2, 0, 0], 'halo');
        this.part('plane', 0xffb75e, x, 4.35, z + .25, 2.5, 2.9, 1, null, 'halo');
        this.part('plane', 0xffbb6a, x, 4.35, z, 2.5, 2.9, 1, [0, Math.PI / 2, 0], 'halo');
        this.part('plane', 0xffa64e, Math.sign(x) * 2.5, .027, z + 1, 3.8, 6, 1, [-Math.PI / 2, 0, 0], 'halo');
    }

    birch(x, z, height) {
        const c = this.colours;
        this.rod(c.bark, [x, .2, z], [x + .25, height, z + .15], .16);
        this.rod(c.bark, [x + .1, height * .42, z], [x - .65, height * .92, z + .5], .085);
        for (let i = 0; i < 11; i++) {
            const angle = i * 2.4, y = height * (.35 + i * .052), reach = (1.4 + this.rand() * .8) * (1 - i * .035);
            const a = [x + .15, y, z], b = [x + Math.cos(angle) * reach, y + .65, z + Math.sin(angle) * reach];
            const mid = [(a[0] + b[0]) / 2, y + .18, (a[2] + b[2]) / 2];
            this.rod(c.bark, a, mid, .05); this.rod(c.dark, mid, b, .027);
            if (i % 2 === 0) this.rod(c.snow, [a[0], a[1] + .035, a[2]], [mid[0], mid[1] + .035, mid[2]], .047);
            for (let j = 0; j < 3; j++) {
                const turn = (j - 1) * .55;
                const twig = [b[0] + Math.cos(angle + turn) * .65, b[1] + .4 + this.rand() * .3, b[2] + Math.sin(angle + turn) * .65];
                this.rod(c.dark, b, twig, .014);
                this.rod(c.dark, twig, [twig[0] + Math.cos(angle + turn) * .35, twig[1] + .45, twig[2] + Math.sin(angle + turn) * .35], .007);
            }
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
        this.part('plane', 0x1c2b46, x, .278, z, 2.8, 5.4, 1, [-Math.PI / 2, 0, 0], 'soft');
    }

    bridge(z) {
        const c = this.colours;
        for (const x of [-7.3, 7.3]) this.box(0x8998ad, x, 2.4, z, .6, 4.8, 1.5);
        this.box(c.dark, 0, 4.9, z, 15.5, .32, 2);
        this.box(c.snow, 0, 5.1, z, 15.7, .15, 2.1);
        for (const dz of [-.9, .9]) {
            this.box(c.iron, 0, 6, z + dz, 15.5, .07, .07);
            this.box(c.snow, 0, 6.06, z + dz, 15.5, .06, .11);
            for (let x = -7.5; x <= 7.5; x += .55) this.box(c.iron, x, 5.55, z + dz, .045, .9, .045);
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
        for (const map of [facade, surfaces, foliage, kiosk]) { map.encoding = THREE.sRGBEncoding; map.anisotropy = 4; }
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
        this.materials.snow.map = snow; this.materials.snow.needsUpdate = true;
        this.materials.surface.map = surfaces; this.materials.surface.needsUpdate = true;
        const groundMap = snow.clone(); groundMap.repeat.set(130 / 2, this.length / 2);
        this.ground.material.map = groundMap; this.ground.material.needsUpdate = true;
        const g = this.roadMap.image.getContext('2d'), W = this.roadMap.image.width, H = this.roadMap.image.height;
        // Asphalt sample is repeated at a plausible stone scale before adding lane paint and tyre wear.
        const tile = document.createElement('canvas'); tile.width = tile.height = 96;
        tile.getContext('2d').drawImage(surfaces.image, surfaces.image.width / 2, 0,
            surfaces.image.width / 2, surfaces.image.height / 2, 0, 0, 96, 96);
        g.fillStyle = g.createPattern(tile, 'repeat'); g.fillRect(0, 0, W, H);
        g.fillStyle = 'rgba(26,37,57,.48)'; g.fillRect(0, 0, W, H);
        for (const x of [65, 105, 235, 275, 405, 445]) {
            g.fillStyle = '#12243926'; g.fillRect(x, 0, 12, H);
        }
        g.fillStyle = '#c7d5de';
        for (const x of [W * .358, W * .642]) for (let y = 0; y < H; y += 256) g.fillRect(x, y, 5, 112);
        for (const x of [0, W - 9]) { g.fillStyle = '#acbfdc'; g.fillRect(x, 0, 9, H); }
        this.roadMap.needsUpdate = true;
        await this.loadParkedCars(snow);
        this.assetsReady = true;
    }

    async loadParkedCars(snow) {
        const gltf = await new Promise((resolve, reject) => loadModel(PARKED_CAR, resolve, reject));
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
                shader.uniforms.winterSnow = { value: snow };
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
            root.position.set(site.x, .255, site.z); root.userData.parkedCar = true;
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
        }
        this.sync(); // includes asynchronously loaded NPCs and quality-dependent light batches
    }
}
