// Dubai at sunset. Keep the legacy Vietnam export/location ID for saved hero routes.
// Five recycled blocks and one stationary skyline, batched by material. No extra lights.
import * as THREE from './vendor/three.module.js';
import { mergeBufferGeometries } from './vendor/jsm/BufferGeometryUtils.js';
import { loadModel } from './models.js';
import { billboardAtlas } from './dubai-art.js';
import { makeYachtParts } from './dubai-yacht.js';

function texture(w, h, draw) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = 4;
    return t;
}
const rng = seed => () => ((seed = Math.imul(seed, 1664525) + 1013904223 >>> 0) / 4294967296);

export class Vietnam {
    constructor(world, { streetLen, behindZ }) {
        this.world = world; this.len = streetLen; this.behind = behindZ;
        this.items = []; this.chunks = []; this.yachtSites = []; this.billboardSites = []; this.hidden = new Map(); this.rand = rng(492);
        this.build(); this.set(false);
        this.ready = Promise.all([this.loadArtwork(), this.loadCars(), this.loadDetailArtwork()]).then(() => { this.assetsReady = true; })
            .catch(e => console.warn('[dubai] Artwork unavailable; using fallback', e));
    }

    build() {
        const rand = this.rand;
        const facade = texture(512, 1024, (g, w, h) => {
            const sky = g.createLinearGradient(0, 0, w, h);
            sky.addColorStop(0, '#254e65'); sky.addColorStop(.38, '#688b96');
            sky.addColorStop(.7, '#c29778'); sky.addColorStop(1, '#e6be87');
            g.fillStyle = sky; g.fillRect(0, 0, w, h);
            for (let row = 0; row < 32; row++) for (let col = 0; col < 8; col++) {
                const x = col * 64, y = row * 32;
                g.fillStyle = `rgba(13,35,54,${.08 + rand() * .25})`; g.fillRect(x + 2, y + 2, 60, 27);
                if (rand() < .22) {
                    g.fillStyle = ['#d8a66c', '#f6d6a0', '#b99478'][Math.floor(rand() * 3)];
                    g.fillRect(x + 6, y + 6, 52, 19);
                    g.fillStyle = '#6b6053'; g.fillRect(x + 28, y + 6, 2, 19);
                }
                g.fillStyle = '#223e50'; g.fillRect(x, y, 2, 32); g.fillRect(x, y + 29, 64, 3);
                g.fillStyle = '#b5bab1'; g.fillRect(x + 2, y, 1, 29);
            }
        });
        facade.wrapS = facade.wrapT = THREE.RepeatWrapping;
        const frond = texture(128, 256, (g, w, h) => {
            g.strokeStyle = '#a6ae54'; g.lineWidth = 3;
            g.beginPath(); g.moveTo(w / 2, 0); g.lineTo(w / 2, h); g.stroke();
            for (let y = 5; y < h - 5; y += 4) for (const side of [-1, 1]) {
                const reach = Math.sin(y / h * Math.PI) * 59;
                g.strokeStyle = ['#425c35', '#67834a', '#9b9b57'][Math.floor(rand() * 3)]; g.lineWidth = 3;
                g.beginPath(); g.moveTo(64, y); g.lineTo(64 + side * reach, y + 20); g.stroke();
            }
        });
        const bark = texture(128, 256, (g, w, h) => {
            g.fillStyle = '#88725a'; g.fillRect(0, 0, w, h);
            for (let row = 0; row < 24; row++) for (let col = 0; col < 6; col++) {
                const x = col * 25 + (row % 2) * 12, y = row * 11;
                g.fillStyle = ['#5e4f40', '#a68a66', '#75634c'][Math.floor(rand() * 3)];
                g.beginPath(); g.moveTo(x, y); g.lineTo(x + 12, y - 5); g.lineTo(x + 24, y); g.lineTo(x + 12, y + 7); g.closePath(); g.fill();
            }
        });
        bark.wrapS = bark.wrapT = THREE.RepeatWrapping; bark.repeat.set(1, 3);
        const stone = texture(256, 256, (g, w, h) => {
            g.fillStyle = '#e0c7a2'; g.fillRect(0, 0, w, h);
            for (let i = 0; i < 5000; i++) { g.fillStyle = rand() > .5 ? '#ffffff13' : '#6b493111'; g.fillRect(rand() * w, rand() * h, 2, 1); }
            g.strokeStyle = '#ad947555'; g.lineWidth = 1;
            for (let y = 0; y <= h; y += 64) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
        });
        stone.wrapS = stone.wrapT = THREE.RepeatWrapping;
        this.materials = {
            stone: new THREE.MeshStandardMaterial({ map: stone, vertexColors: true, roughness: .88 }),
            metal: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .45, metalness: .45 }),
            glass: new THREE.MeshStandardMaterial({ map: facade, emissiveMap: facade, emissive: 0xffd5a1,
                emissiveIntensity: .18, vertexColors: true, roughness: .3, metalness: .35 }),
            glow: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
            bark: new THREE.MeshStandardMaterial({ map: bark, roughness: 1 }),
            leaves: new THREE.MeshStandardMaterial({ color: 0xb3caa8, map: frond, alphaTest: .45, side: THREE.DoubleSide, roughness: .9 }),
        };
        const deck = texture(256, 256, (g, w, h) => {
            g.fillStyle = '#a77e54'; g.fillRect(0, 0, w, h);
            for (let x = 0; x < w; x += 16) {
                g.fillStyle = '#493f30'; g.fillRect(x, 0, 1, h);
                for (let j = 0; j < 20; j++) { g.fillStyle = '#e4c88d20'; g.fillRect(x + 2 + rand() * 10, rand() * h, 1, 10 + rand() * 50); }
            }
        });
        deck.wrapS = deck.wrapT = THREE.RepeatWrapping;
        const paving = texture(512, 512, (g, w, h) => {
            g.fillStyle = '#8f8a80'; g.fillRect(0, 0, w, h);
            for (let y = 0; y < h; y += 64) for (let x = -32; x < w; x += 64) {
                const offset = y % 128 ? 32 : 0, shade = 186 + Math.floor(rand() * 22);
                g.fillStyle = `rgb(${shade + 14},${shade + 8},${shade})`; g.fillRect(x + offset + 1, y + 1, 62, 62);
            }
            for (let i = 0; i < 13000; i++) { g.fillStyle = rand() > .5 ? '#ffffff0b' : '#0000000a'; g.fillRect(rand() * w, rand() * h, 1, 1); }
        });
        paving.wrapS = paving.wrapT = THREE.RepeatWrapping;
        Object.assign(this.materials, {
            paving: new THREE.MeshStandardMaterial({ map: paving, vertexColors: true, roughness: .88 }),
            deck: new THREE.MeshStandardMaterial({ map: deck, vertexColors: true, roughness: .8 }),
            plants: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 }),
            hull: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .35, metalness: .1 }),
            darkGlass: new THREE.MeshStandardMaterial({ color: 0x254652, roughness: .22, metalness: .5 }),
            banners: new THREE.MeshBasicMaterial({ color: 0xeee6da, toneMapped: false }),
        });
        this.materials.darkGlass.map = texture(256, 256, (g, w, h) => {
            const sky = g.createLinearGradient(0, 0, 0, h);
            sky.addColorStop(0, '#587585'); sky.addColorStop(.42, '#3e5969');
            sky.addColorStop(.5, '#a99c8b'); sky.addColorStop(.56, '#405766'); sky.addColorStop(1, '#192c39');
            g.fillStyle = sky; g.fillRect(0, 0, w, h);
            g.fillStyle = '#e6d2ab18'; g.fillRect(0, h * .22, w, 5); g.fillRect(0, h * .29, w, 2);
        });
        this.materials.darkGlass.color.set(0xa3b9c4);
        this.materials.darkGlass.emissiveMap = this.materials.darkGlass.map;
        this.materials.darkGlass.emissive.set(0x8498ac); this.materials.darkGlass.emissiveIntensity = .12;
        this.materials.cushion = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1,
            map: texture(128, 128, (g, w, h) => {
                g.fillStyle = '#e5e1d8'; g.fillRect(0, 0, w, h); g.fillStyle = '#b7b2a820';
                for (let i = 0; i < w; i += 3) { g.fillRect(i, 0, 1, h); g.fillRect(0, i, w, 1); }
            }) });
        const shadow = texture(128, 256, (g, w, h) => {
            g.strokeStyle = '#302a35'; g.lineWidth = 5;
            g.beginPath(); g.moveTo(w / 2, h); g.lineTo(w / 2, h * .3); g.stroke();
            for (let i = 0; i < 14; i++) {
                const a = i / 14 * Math.PI * 2;
                g.lineWidth = 7; g.beginPath(); g.moveTo(w / 2, h * .3);
                g.quadraticCurveTo(w / 2 + Math.cos(a) * 30, h * .3 + Math.sin(a) * 36,
                    w / 2 + Math.cos(a) * 60, h * .3 + Math.sin(a) * 62); g.stroke();
            }
        });
        this.materials.shadow = new THREE.MeshBasicMaterial({ map: shadow, transparent: true, opacity: .19, depthWrite: false });
        this.sources = { box: new THREE.BoxGeometry(1, 1, 1), cylinder: new THREE.CylinderGeometry(1, 1, 1, 8),
            cone: new THREE.ConeGeometry(1, 1, 10), plane: new THREE.PlaneGeometry(1, 1, 1, 5),
            dome: new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2) };
        this.yachtGeometry = makeYachtParts();
        Object.assign(this.sources, { round: new THREE.CylinderGeometry(1, 1, 1, 24),
            bush: new THREE.IcosahedronGeometry(1, 1), blossom: new THREE.OctahedronGeometry(1), trunk: new THREE.CylinderGeometry(.58, 1, 1, 9, 7) });
        const trunk = this.sources.trunk.attributes.position;
        for (let i = 0; i < trunk.count; i++) { const t = trunk.getY(i) + .5; trunk.setX(i, trunk.getX(i) + 1.6 * t * t); }
        this.sources.trunk.computeVertexNormals();
        const leaf = this.sources.leaf = new THREE.PlaneGeometry(1, 1, 1, 8);
        const points = leaf.attributes.position;
        for (let i = 0; i < points.count; i++) {
            const t = points.getY(i) + .5;
            points.setXYZ(i, points.getX(i), .16 * Math.sin(t * Math.PI) - .25 * t * t, -t);
        }
        leaf.computeVertexNormals();
        this.temp = new THREE.Object3D();
        this.roadMap = texture(512, 1024, (g, w, h) => {
            g.fillStyle = '#55515a'; g.fillRect(0, 0, w, h);
            for (let i = 0; i < 18000; i++) { g.fillStyle = rand() > .5 ? '#ffffff0b' : '#00000013'; g.fillRect(rand() * w, rand() * h, 1, 2); }
            g.fillStyle = '#ebdcb7'; for (const x of [w * .358, w * .642]) for (let y = 0; y < h; y += 256) g.fillRect(x, y, 5, 110);
            g.fillStyle = '#e6c073'; for (const x of [6, w - 12]) g.fillRect(x, 0, 5, h);
        });
        this.roadMap.wrapS = this.roadMap.wrapT = THREE.RepeatWrapping; this.roadMap.repeat.set(1, 480 / 12);
        // 30.10: земля, дорога и вода идут и на 160 м за спину героя — в меню камера смотрит назад, там было пусто
        const ground = new THREE.Mesh(new THREE.PlaneGeometry(220, 520, 1, 70), new THREE.MeshStandardMaterial({ color: 0xd8b585, roughness: 1 }));
        ground.rotation.x = -Math.PI / 2; ground.position.set(0, -.08, -50); this.add(ground);
        const road = this.road = new THREE.Mesh(new THREE.PlaneGeometry(7, 480, 1, 70), new THREE.MeshStandardMaterial({ map: this.roadMap, roughness: .92 }));
        road.rotation.x = -Math.PI / 2; road.position.set(0, .015, -35); this.add(road);
        // Gulf water is a single opaque surface, without a reflection render pass.
        const waterMap = texture(256, 256, (g, w, h) => {
            g.fillStyle = '#476e79'; g.fillRect(0, 0, w, h);
            for (let i = 0; i < 500; i++) { g.fillStyle = '#f6c68b40'; g.fillRect(rand() * w, rand() * h, 4 + rand() * 25, 1); }
        });
        waterMap.wrapS = waterMap.wrapT = THREE.RepeatWrapping; waterMap.repeat.set(10, 35);
        const sea = new THREE.Mesh(new THREE.PlaneGeometry(150, 500, 1, 70), new THREE.MeshStandardMaterial({ map: waterMap, roughness: .4, metalness: .25 }));
        const waterNormal = texture(128, 128, (g, w, h) => {
            const pixels = g.createImageData(w, h);
            for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
                const i = (y * w + x) * 4, a = x / w * Math.PI * 2, b = y / h * Math.PI * 2;
                pixels.data[i] = 128 + 22 * Math.cos(a * 3 + b * 2);
                pixels.data[i + 1] = 128 + 28 * Math.cos(b * 4 + Math.sin(a) * 2);
                pixels.data[i + 2] = 250; pixels.data[i + 3] = 255;
            }
            g.putImageData(pixels, 0, 0);
        });
        waterNormal.encoding = THREE.LinearEncoding; waterNormal.wrapS = waterNormal.wrapT = THREE.RepeatWrapping;
        waterNormal.repeat.set(20, 59); sea.material.normalMap = waterNormal; sea.material.normalScale.set(.3, .2);
        sea.material.emissive.set(0x245d67); sea.material.emissiveIntensity = .28;
        sea.rotation.x = -Math.PI / 2; sea.position.set(-85, -.04, -45); this.sea = sea; this.waterMap = waterMap; this.add(sea);
        for (let i = 0; i < 5; i++) {
            this.parts = {};
            for (const side of [-1, 1]) {
                this.part('box', 'paving', 0xffffff, side * 6.8, .12, -16, 6.6, .24, 32);
                this.part('box', 'deck', 0xdcc1a0, side * 8.6, .247, -16, .8, .025, 32);
                for (let z = -30; z < 0; z += 2) this.part('box', 'metal', (z / 2) % 2 ? 0xd8c5a8 : 0x3a383d, side * 3.65, .15, z, .25, .3, 1.95);
                for (const z of [-7, -23]) {
                    this.palm(side * 6, z, 6.2 + rand() * 1.4);
                    this.lamp(side * 4.2, z + 3);
                }
                this.garden(side * 6, -7, 2.5, 2.8);
                this.garden(side * 8.3, -24, 1.7, 5);
                this.bench(side * 5.8, -15, side);
                this.part('cylinder', 'metal', 0x9c805b, side * 4.5, .65, -18, .35, 1.2, .35);
                this.part('cylinder', 'metal', 0x403c39, side * 4.5, 1.25, -18, .37, .1, .37);
                for (let z = -30; z < 0; z += 4) {
                    this.part('box', 'metal', 0x56595a, side * 3.4, .025, z, .15, .025, .7);
                    for (let dz = -.26; dz < .3; dz += .1) this.part('box', 'metal', 0x252a2d, side * 3.4, .04, z + dz, .12, .01, .025);
                    this.part('box', 'glow', 0xefcd8b, side * 3.2, .028, z, .05, .025, .1);
                }
            }
            this.tower(16.5, -17, 28 + (i * 11 % 24), 12, 23, i);
            this.entrance(9.3, -20);
            for (const dx of [-1.15, 1.15]) this.part('box', 'hull', 0xded8c9, 7.8 + dx, .247, -29, .06, .015, 5);
            this.part('box', 'hull', 0xded8c9, 7.8, .247, -31.5, 2.35, .015, .06);
            this.billboard(6.1, 9.8, -3.5, 7.8, 4.2, i % 4);
            // Unobstructed waterfront: only towers beyond the moving marina, never between road and boats.
            this.fence(-9.9, -18, 28);
            this.part('box', 'stone', 0xf0dcc0, -10.3, .15, -2, 1, .15, 1.8);
            this.part('box', 'stone', 0xe4d8bd, -10.1, .05, -16, .45, .4, 32);
            this.part('box', 'deck', 0xffffff, -14.6, .13, -2, 9, .18, 1.7);
            for (const x of [-10.8, -14, -18.4]) {
                this.part('cylinder', 'metal', 0x41484b, x, -.1, -2, .16, 1.1, .16);
                this.part('cylinder', 'metal', 0xddd8cc, x, .35, -2, .12, .25, .12);
            }
            this.yacht(-13.4, -18, i % 2);
            if (i % 2 === 1) this.billboard(-7.8, 6.8, -27, 6.4, 3.5, (i + 1) % 4);
            const chunk = this.merge(); chunk.position.z = this.behind - i * 32;
            this.chunks.push(chunk); this.add(chunk);
        }
        this.buildSkyline();
        for (const source of Object.values(this.sources)) source.dispose();
        for (const part of this.yachtGeometry) part.geometry.dispose();
        this.yachtGeometry = null; this.sources = null; this.parts = null;
    }

    add(o) { o.userData.dubai = true; this.items.push(o); this.world.scene.add(o); return o; }
    part(type, kind, color, x, y, z, sx, sy, sz, rotation = [0, 0, 0]) {
        const source = this.sources[type], geo = source.index ? source.toNonIndexed() : source.clone();
        const t = this.temp; t.position.set(x, y, z); t.scale.set(sx, sy, sz); t.rotation.set(...rotation); t.updateMatrix(); geo.applyMatrix4(t.matrix);
        if (this.materials[kind].vertexColors) {
            const c = new THREE.Color(color), count = geo.attributes.position.count, colors = new Float32Array(count * 3);
            for (let i = 0; i < count; i++) colors.set([c.r, c.g, c.b], i * 3);
            geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        }
        if (['glass', 'stone', 'paving', 'deck'].includes(kind)) {
            const p = geo.attributes.position, n = geo.attributes.normal, uv = geo.attributes.uv;
            for (let i = 0; i < p.count; i++) {
                const horizontal = Math.abs(n.getY(i)) > .5;
                const u = Math.abs(n.getX(i)) > .5 ? p.getZ(i) : p.getX(i);
                uv.setXY(i, u / (kind === 'glass' ? 16 : kind === 'deck' ? 2 : 3), (horizontal ? p.getZ(i) : p.getY(i)) / (kind === 'glass' ? 32 : 3));
            }
        }
        (this.parts[kind] ||= []).push(geo);
    }
    merge(landmark = false) {
        const group = new THREE.Group();
        for (const [kind, pieces] of Object.entries(this.parts)) {
            const geo = mergeBufferGeometries(pieces); geo.computeBoundingSphere();
            const mat = landmark ? this.materials[kind].clone() : this.materials[kind];
            if (landmark) mat.fog = false;
            const mesh = new THREE.Mesh(geo, mat); mesh.matrixAutoUpdate = false; mesh.userData.dubaiMaterial = kind; group.add(mesh);
            for (const piece of pieces) piece.dispose();
        }
        return group;
    }
    tower(x, z, height, width, depth, style) {
        const tint = [0xd6dbe0, 0xb8d2db, 0xe9c8a2][style % 3];
        this.part('box', 'stone', 0xf0dfc9, x, 2, z, width + 2, 4, depth + 1);
        if (style % 3 === 0) {
            for (let tier = 0; tier < 4; tier++) {
                const inset = 1 - tier * .09, y = 4 + (tier + .5) * height / 4;
                this.part('box', 'glass', tint, x, y, z, width * inset, height / 4, depth * inset);
                this.part('box', 'metal', 0xc2b8a5, x, y + height / 8, z, width * inset + .7, .25, depth * inset + .7);
                for (const side of [-1, 1]) this.part('box', 'hull', 0x496850, x + side * width * inset / 2, y + height / 8 + .22, z, .45, .4, depth * inset - 1);
            }
        } else if (style % 3 === 1) {
            this.part('round', 'glass', tint, x, 4 + height / 2, z, width * .56, height, depth * .5);
            for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) this.part('cylinder', 'metal', 0xaeb7b8,
                x + Math.cos(a) * width * .56, 4 + height / 2, z + Math.sin(a) * depth * .5, .08, height, .08);
            this.part('round', 'metal', 0xb9b0a0, x, height + 4.2, z, width * .59, .4, depth * .53);
        } else {
            for (let tier = 0; tier < 7; tier++) {
                const a = tier * .065;
                this.part('box', 'glass', tint, x, 4 + (tier + .5) * height / 7, z, width, height / 7, depth * .7, [0, a, 0]);
                this.part('box', 'metal', 0xb8ab94, x, 4 + (tier + 1) * height / 7, z, width + .4, .2, depth * .7 + .4, [0, a, 0]);
            }
        }
        for (const dx of [-width / 2, width / 2]) this.part('box', 'metal', 0xb4a490, x + dx, 4 + height / 2, z + depth / 2 + .03, .18, height, .1);


        this.part('box', 'glow', 0xffc982, x, 3.7, z + depth / 2 + .55, width + 1.5, .12, .12);
        // Recessed warm storefronts and a shade canopy along the boulevard.
        const front = x - Math.sign(x) * (width / 2 + 1.02);
        for (let dz = -depth / 2 + 2; dz < depth / 2; dz += 4) {
            this.part('box', 'glass', 0xf4d3a4, front, 1.8, z + dz, .08, 2.8, 2.8);
            this.part('box', 'glow', 0xffcb88, front - Math.sign(x) * .05, 3.3, z + dz, .1, .1, 2.8);
        }
        this.part('box', 'metal', 0xd0b288, front, 3.5, z, 2, .15, depth);
        if (style % 2) this.part('cone', 'metal', 0xb9b8b0, x, height + 7, z, width * .35, 5, depth * .35);
    }
    lamp(x, z) {
        this.part('cylinder', 'metal', 0x504c4b, x, 2.7, z, .06, 5.4, .06);
        this.part('box', 'metal', 0x84715b, x - Math.sign(x) * .45, 5.35, z, 1, .09, .22);
        this.part('box', 'glow', 0xffd995, x - Math.sign(x) * .55, 5.27, z, .75, .07, .19);
    }
    palm(x, z, height) {
        this.part('trunk', 'bark', 0xffffff, x, height / 2, z, .24, height, .24, [0, 0, .025]);
        this.part('plane', 'shadow', 0xffffff, x, .251, z + 4.2, 5, 9, 1, [-Math.PI / 2, 0, -.22]);
        const crownX = x + .384 - Math.sin(.025) * height;
        for (let i = 0; i < 11; i++) {
            const a = i * Math.PI * 2 / 11, length = 2.7 + this.rand() * .65;
            this.part('leaf', 'leaves', 0xffffff, crownX, height, z, .85, length, length, [0, a, 0]);
        }
        for (let i = 0; i < 5; i++) this.part('leaf', 'leaves', 0xffffff, crownX, height + .12, z,
            .7, 2.2, 2.2, [.35, i * Math.PI * 2 / 5, 0]);
        for (let y = .5; y < height - .2; y += .7) this.part('cylinder', 'glow', 0xf8c17b, x + .384 * (y / height) ** 2 - Math.sin(.025) * y, y, z, .24 * (1 - .42 * y / height) + .01, .025, .24 * (1 - .42 * y / height) + .01);
    }
    buildSkyline() {
        this.parts = {};
        for (let i = 0; i < 8; i++) {
            const side = i % 2 ? -1 : 1, x = side * (15 + (i % 3) * 11), z = -145 - Math.floor(i / 2) * 25;
            this.tower(x, z, 26 + i * 4, 7 + i % 4, 12, i);
        }
        // за спиной героя (вид в меню): ряд башен вдоль бульвара, через марину — ещё башни, у причала — яхты и пальмы
        for (let i = 0; i < 6; i++) {
            const z = 66 + i * 26;
            this.tower(16.5 + (i % 2) * 3, z, 24 + (i * 13 % 30), 11, 20, i + 1);
            this.tower(-34 - (i % 3) * 9, z + 8, 30 + (i * 17 % 34), 9, 14, i + 2);
            this.palm(6, z - 6, 6.4); this.palm(-6, z + 4, 6.8);
            if (i < 4) this.yacht(-13.4, z + 2, i % 2);
        }
        this.skyline = this.merge(); this.add(this.skyline);
        this.parts = {};
        // A stepped, three-wing tower and needle keep Dubai recognisable on narrow screens.
        for (let tier = 0; tier < 9; tier++) {
            const width = 11 - tier * 1.05, y = tier * 8 + 4;
            this.part('cylinder', 'glass', 0xd5dce0, 0, y, -220, width / 2, 8, width / 2);
            for (let wing = 0; wing < 3; wing++) {
                const a = wing * Math.PI * 2 / 3;
                this.part('box', 'glass', 0xdee0dc, Math.cos(a) * width * .34, y - 1, -220 + Math.sin(a) * width * .34,
                    width * .44, 6, width * .66, [0, -a, 0]);
            }
            this.part('cylinder', 'glow', 0xf7c98c, 0, y + 4, -220, width / 2 + .04, .12, width / 2 + .04);
        }
        this.part('cone', 'metal', 0xd5d9dc, 0, 82, -220, .8, 21, .8);
        // Sail-shaped waterfront hotel: a curved glass face between two pale structural ribs.
        const z = -171, x = -36;
        for (let i = 0; i < 13; i++) {
            const y = 3 + i * 3.2, width = Math.sin((i + 1) / 15 * Math.PI) * 11;
            this.part('box', 'glass', 0xe2ddd4, x, y, z, width, 3.2, 5);
            for (const side of [-1, 1]) this.part('box', 'stone', 0xfff6e2, x + side * width / 2, y, z + 2.65, .55, 3.4, .6);
        }
        this.part('cylinder', 'stone', 0xffffff, x, 24, z - 3.5, .4, 48, .4);
        this.part('cylinder', 'metal', 0xb0ae9c, x + 6, 32, z + 3, 3, .35, 3);
        this.landmark = this.merge(true); this.add(this.landmark);
    }
    async loadArtwork() {
        const map = await new THREE.TextureLoader().loadAsync('textures/dubai/facade-v1.webp');
        map.encoding = THREE.sRGBEncoding; map.wrapS = map.wrapT = THREE.RepeatWrapping; map.anisotropy = 4;
        const fallback = this.materials.glass.map;
        this.materials.glass.map = map; this.materials.glass.emissiveMap = map; this.materials.glass.needsUpdate = true;
        for (const mesh of this.landmark.children) if (mesh.userData.dubaiMaterial === 'glass') {
            mesh.material.map = map; mesh.material.emissiveMap = map; mesh.material.needsUpdate = true;
        }
        fallback.dispose();
    }
    fence(x, z, length) {
        for (const y of [.62, 1.15]) this.part('box', 'metal', 0x6b6b60, x, y, z, .065, .06, length);
        this.part('box', 'metal', 0xc4a978, x, 1.22, z, .11, .08, length);
        for (let dz = -length / 2 + .5; dz < length / 2; dz += 1.3) {
            this.part('box', 'metal', 0x555e5d, x, .7, z + dz, .065, 1.1, .065);
            this.part('box', 'metal', 0xa6a18b, x, .65, z + dz + .33, .04, .55, .04, [.65, 0, 0]);
        }
    }
    bench(x, z, side) {
        for (let slat = 0; slat < 5; slat++) {
            this.part('box', 'deck', 0xffffff, x - .36 + slat * .18, .7, z, .15, .09, 2.7);
            this.part('box', 'deck', 0xf4d8b6, x + side * .45, .9 + slat * .12, z, .09, .095, 2.7, [0, 0, side * -.12]);
        }
        for (const dz of [-1.05, 1.05]) {
            this.part('box', 'metal', 0x3c474a, x, .4, z + dz, .65, .65, .1);
            this.part('box', 'metal', 0x3c474a, x + side * .4, 1, z + dz, .08, .8, .08);
            this.part('box', 'metal', 0x3c474a, x, 1, z + dz, .85, .07, .07);
        }
    }
    garden(x, z, width, length) {
        this.part('box', 'stone', 0xe5d6bb, x, .45, z, width, .45, length);
        this.part('box', 'metal', 0x453e32, x, .69, z, width - .18, .04, length - .18);
        for (let dz = -length / 2 + .45; dz < length / 2; dz += .65) {
            this.part('bush', 'plants', 0x416443, x, .96, z + dz, width * .43, .42, .5);
            for (const dx of [-width * .32, width * .32]) this.part('blossom', 'plants', dz > 0 ? 0xe7a38e : 0xc77fa3,
                x + dx, 1.06, z + dz, .13, .14, .17);
        }
    }
    entrance(x, z) {
        // Steps, door frames and canopy sit behind the sidewalk, outside all running lanes.
        for (let step = 0; step < 3; step++) this.part('box', 'stone', 0xffedcf, x + step * .24, .3 + step * .13, z, 1.3 - step * .24, .2, 5);
        this.part('box', 'darkGlass', 0xffffff, x + .8, 2, z, .12, 3.1, 3.5);
        for (const dz of [-1.8, 0, 1.8]) this.part('box', 'metal', 0xc1a272, x + .72, 2, z + dz, .1, 3.2, .06);
        for (const dz of [-.18, .18]) this.part('box', 'metal', 0xe7d3af, x + .62, 1.7, z + dz, .1, .5, .04);
        this.part('box', 'metal', 0xc3bda9, x, 3.8, z, 2.5, .25, 5.7);
        this.part('box', 'glow', 0xffd293, x - 1.2, 3.66, z, .07, .05, 5.3);
        for (const dz of [-2.4, 2.4]) this.part('cylinder', 'metal', 0x8d9290, x - .8, 1.9, z + dz, .06, 3.7, .06);
    }
    billboard(x, y, z, width, height, index) {
        this.part('box', 'metal', 0x252d35, x, y, z, width + .28, height + .28, .35);
        for (const dx of [-width * .32, width * .32]) this.part('box', 'metal', 0x4c545a, x + dx, y / 2, z - .15, .18, y, .2);
        this.part('box', 'glow', 0xe5b974, x, y - height / 2 - .1, z + .19, width + .2, .05, .04);
        this.part('plane', 'banners', 0xffffff, x, y, z + .19, width, height, 1);
        const uv = this.parts.banners[this.parts.banners.length - 1].attributes.uv;
        for (let i = 0; i < uv.count; i++) uv.setXY(i, (index % 2 + .004 + uv.getX(i) * .992) / 2,
            (1 - Math.floor(index / 2) + .004 + uv.getY(i) * .992) / 2);
        this.billboardSites.push({ x, y, z, index });
    }
    yacht(x, z, style) {
        const scale = style ? .88 : 1;
        this.yachtSites.push({ x, z, scale });
        const matrix = new THREE.Matrix4().compose(new THREE.Vector3(x, -.12, z),
            new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -.08), new THREE.Vector3(scale, scale, scale));
        for (const part of this.yachtGeometry) {
            const geo = part.geometry.index ? part.geometry.toNonIndexed() : part.geometry.clone(); geo.applyMatrix4(matrix);
            // Extruded trim has extra attributes that are not shared with the lofted hull.
            for (const name of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(name)) geo.deleteAttribute(name);
            if (this.materials[part.kind].vertexColors) {
                const c = new THREE.Color(part.color), count = geo.attributes.position.count, colors = new Float32Array(count * 3);
                for (let i = 0; i < count; i++) colors.set([c.r, c.g, c.b], i * 3);
                geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
            }
            (this.parts[part.kind] ||= []).push(geo);
        }
    }
    async loadDetailArtwork() {
        const loader = new THREE.TextureLoader();
        const [asphalt, normal, roughness, palm, boards] = await Promise.all([
            loader.loadAsync('models/reserve/ambientcg/asphalt_Color.webp'),
            loader.loadAsync('models/reserve/ambientcg/asphalt_NormalGL.webp'),
            loader.loadAsync('models/reserve/ambientcg/asphalt_Roughness.webp'),
            loader.loadAsync('textures/dubai/palm-frond-v1.webp'), billboardAtlas(),
        ]);
        const g = this.roadMap.image.getContext('2d'), W = this.roadMap.image.width, H = this.roadMap.image.height;
        const tile = document.createElement('canvas'); tile.width = tile.height = 128;
        tile.getContext('2d').drawImage(asphalt.image, 0, 0, 128, 128);
        g.fillStyle = g.createPattern(tile, 'repeat'); g.fillRect(0, 0, W, H);
        // Subtle tyre wear, clean lane paint and amber edge lines baked into the asphalt.
        for (const x of [63, 102, 236, 275, 409, 448]) {
            const wear = g.createLinearGradient(x - 8, 0, x + 8, 0);
            wear.addColorStop(0, '#17232a00'); wear.addColorStop(.5, '#17232a22'); wear.addColorStop(1, '#17232a00');
            g.fillStyle = wear; g.fillRect(x - 8, 0, 16, H);
        }
        g.fillStyle = '#eee7d5';
        for (const x of [W * .358, W * .642]) for (let y = 0; y < H; y += 256) g.fillRect(x, y, 5, 110);
        g.fillStyle = '#c9ac64'; for (const x of [6, W - 12]) g.fillRect(x, 0, 5, H);
        this.roadMap.needsUpdate = true; asphalt.dispose();
        for (const map of [normal, roughness]) { map.wrapS = map.wrapT = THREE.RepeatWrapping; map.repeat.set(4, 320 * 8 / 12); map.anisotropy = 4; }
        this.road.material.normalMap = normal; this.road.material.normalScale.set(.32, .32);
        this.road.material.roughnessMap = roughness; this.road.material.roughness = .85; this.road.material.color.set(0x566b81); this.road.material.needsUpdate = true;
        const fallback = this.materials.leaves.map;
        palm.encoding = THREE.sRGBEncoding; palm.anisotropy = 4;
        this.materials.leaves.map = palm; this.materials.leaves.color.set(0xffffff);
        this.materials.leaves.emissiveMap = palm; this.materials.leaves.emissive.set(0xadc285); this.materials.leaves.emissiveIntensity = .35; this.materials.leaves.needsUpdate = true; fallback.dispose();
        this.materials.plants.map = texture(128, 128, (g, w, h) => {
            g.fillStyle = '#95a18e'; g.fillRect(0, 0, w, h);
            const rand = rng(82);
            for (let i = 0; i < 1600; i++) {
                g.fillStyle = ['#c9d1b9', '#657b5b', '#9aaa8b', '#42523d'][i % 4];
                g.beginPath(); g.ellipse(rand() * w, rand() * h, 1 + rand() * 2, 3, rand() * 6, 0, 7); g.fill();
            }
        });
        this.materials.plants.needsUpdate = true;
        this.materials.banners.map = boards; this.materials.banners.needsUpdate = true;
        this.detailArtworkReady = true;
    }
    async loadCars() {
        const gltf = await new Promise((resolve, reject) => loadModel('models/obj/lite/car1.glb?v=4', resolve, reject));
        const model = gltf.scene.clone(true), bounds = new THREE.Box3().setFromObject(model), size = bounds.getSize(new THREE.Vector3());
        if (size.x > size.z) model.rotation.y = Math.PI / 2;
        model.updateMatrixWorld(true); bounds.setFromObject(model); bounds.getSize(size); model.scale.multiplyScalar(4.4 / size.z);
        model.updateMatrixWorld(true); bounds.setFromObject(model);
        const center = bounds.getCenter(new THREE.Vector3()); model.position.set(-center.x, -bounds.min.y, -center.z);
        for (let i = 0; i < this.chunks.length; i += 2) {
            const root = new THREE.Group(); root.add(model.clone(true)); root.position.set(7.8, .24, -29); this.chunks[i].add(root);
        }
    }
    hide(o) { if (!o || o.userData.dubai) return; if (!this.hidden.has(o)) this.hidden.set(o, o.visible); o.visible = false; }
    sync() {
        if (!this.on) return;
        const w = this.world;
        for (const list of [w.streetRoots, w.scenery, w.officers, w.lights, w.policeLights]) for (const o of list || []) if (!o.userData.npc) this.hide(o);
        // прохожие (девушки, кошки) и голуби остаются — бульвар не пустой (30.10); спрятать только тех, кто попал в марину
        // (картинка девушки, спрятанная до загрузки модели, стала живой — вернуть)
        for (const o of [...(w.critters || []), ...(w.flocks || [])]) {
            if (o.position.x < -9.5) this.hide(o);
            else if (this.hidden.has(o)) { o.visible = this.hidden.get(o); this.hidden.delete(o); }
        }
        for (const o of [w.rain, w.ripples, w.reflector, w.lampPools, w.lampCones]) this.hide(o);
    }
    set(on) {
        this.on = on; for (const o of this.items) o.visible = on;
        if (on) this.sync(); else { for (const [o, visible] of this.hidden) o.visible = visible; this.hidden.clear(); }
    }
    update(dt, move) {
        if (!this.on) return;
        this.roadMap.offset.y = (this.roadMap.offset.y + move / 12) % 1;
        for (const map of [this.road.material.normalMap, this.road.material.roughnessMap]) if (map) map.offset.y = (map.offset.y + move * 8 / 12) % 1;
        this.waterMap.offset.y = (this.waterMap.offset.y + dt * .006) % 1;
        this.sea.material.normalMap.offset.y = (this.sea.material.normalMap.offset.y + dt * .009) % 1;
        for (const chunk of this.chunks) { chunk.position.z += move; while (chunk.position.z > this.behind) chunk.position.z -= this.len; }
        this.sync();
    }
}
