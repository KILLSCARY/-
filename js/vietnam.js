// Dubai at sunset. Keep the legacy Vietnam export/location ID for saved hero routes.
// Five recycled blocks and one stationary skyline, batched by material. No extra lights.
import * as THREE from './vendor/three.module.js';
import { mergeBufferGeometries } from './vendor/jsm/BufferGeometryUtils.js';
import { loadModel } from './models.js';

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
        this.items = []; this.chunks = []; this.hidden = new Map(); this.rand = rng(492);
        this.build(); this.set(false);
        this.ready = Promise.all([this.loadArtwork(), this.loadCars()]).then(() => { this.assetsReady = true; })
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
        this.sources = { box: new THREE.BoxGeometry(1, 1, 1), cylinder: new THREE.CylinderGeometry(1, 1, 1, 10),
            cone: new THREE.ConeGeometry(1, 1, 10), plane: new THREE.PlaneGeometry(1, 1, 1, 5),
            dome: new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2) };
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
        this.roadMap.wrapS = this.roadMap.wrapT = THREE.RepeatWrapping; this.roadMap.repeat.set(1, 320 / 12);
        const ground = new THREE.Mesh(new THREE.PlaneGeometry(220, 360), new THREE.MeshStandardMaterial({ color: 0xd8b585, roughness: 1 }));
        ground.rotation.x = -Math.PI / 2; ground.position.set(0, -.08, -130); this.add(ground);
        const road = new THREE.Mesh(new THREE.PlaneGeometry(7, 320), new THREE.MeshStandardMaterial({ map: this.roadMap, roughness: .92 }));
        road.rotation.x = -Math.PI / 2; road.position.set(0, .015, -115); this.add(road);
        // Gulf water is a single opaque surface, without a reflection render pass.
        const waterMap = texture(256, 256, (g, w, h) => {
            g.fillStyle = '#476e79'; g.fillRect(0, 0, w, h);
            for (let i = 0; i < 500; i++) { g.fillStyle = '#f6c68b40'; g.fillRect(rand() * w, rand() * h, 4 + rand() * 25, 1); }
        });
        waterMap.wrapS = waterMap.wrapT = THREE.RepeatWrapping; waterMap.repeat.set(10, 24);
        const sea = new THREE.Mesh(new THREE.PlaneGeometry(150, 340), new THREE.MeshStandardMaterial({ map: waterMap, roughness: .4, metalness: .25 }));
        sea.rotation.x = -Math.PI / 2; sea.position.set(-96, -.04, -125); this.add(sea);
        for (let i = 0; i < 5; i++) {
            this.parts = {};
            for (const side of [-1, 1]) {
                this.part('box', 'stone', 0xffedcf, side * 6.8, .12, -16, 6.6, .24, 32);
                for (let z = -30; z < 0; z += 2) this.part('box', 'metal', (z / 2) % 2 ? 0xd8c5a8 : 0x3a383d, side * 3.65, .15, z, .25, .3, 1.95);
                for (const z of [-7, -23]) {
                    this.palm(side * 6, z, 6.2 + rand() * 1.4);
                    this.lamp(side * 4.2, z + 3);
                }
                this.part('box', 'stone', 0xffffff, side * 6, .45, -7, 2.3, .6, 2.3);
                this.part('box', 'metal', 0x597045, side * 6, .8, -7, 2, .15, 2);
                this.part('box', 'metal', 0x876246, side * 5.6, .65, -15, .8, .18, 2.5);
                for (const z of [-16, -14]) this.part('box', 'metal', 0x3c4147, side * 5.6, .35, z, .65, .55, .12);
                this.part('cylinder', 'metal', 0x9c805b, side * 4.5, .65, -18, .35, 1.2, .35);
            }
            this.tower(15, -16, 25 + (i * 11 % 24), 10, 23, i);
            if (i % 2 === 0) this.tower(-16, -21, 20 + i * 4, 9, 15, i + 1);
            // Promenade barrier leaves views between buildings open to the water.
            this.part('box', 'metal', 0xa58c66, -9.9, 1, -16, .08, .08, 32);
            for (let z = -31; z < 0; z += 2) this.part('box', 'metal', 0x776d60, -9.9, .6, z, .07, 1.2, .07);
            const chunk = this.merge(); chunk.position.z = this.behind - i * 32;
            this.chunks.push(chunk); this.add(chunk);
        }
        this.buildSkyline();
        for (const source of Object.values(this.sources)) source.dispose();
        this.sources = null; this.parts = null;
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
        if (kind === 'glass' || kind === 'stone') {
            const p = geo.attributes.position, n = geo.attributes.normal, uv = geo.attributes.uv;
            for (let i = 0; i < p.count; i++) {
                const horizontal = Math.abs(n.getY(i)) > .5;
                const u = Math.abs(n.getX(i)) > .5 ? p.getZ(i) : p.getX(i);
                uv.setXY(i, u / (kind === 'glass' ? 16 : 3), (horizontal ? p.getZ(i) : p.getY(i)) / (kind === 'glass' ? 32 : 3));
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
        this.part('box', 'glass', tint, x, 4 + height / 2, z, width, height, depth);
        for (const dx of [-width / 2, width / 2]) this.part('box', 'metal', 0xb4a490, x + dx, 4 + height / 2, z + depth / 2 + .03, .18, height, .1);
        for (let y = 7; y < height + 4; y += 6) this.part('box', 'metal', 0xa79b8c, x, y, z, width + .3, .14, depth + .3);
        this.part('box', 'metal', 0xb5a185, x, height + 4.4, z, width + .5, .8, depth + .5);
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
        this.part('cylinder', 'bark', 0xffffff, x, height / 2, z, .17, height, .17, [0, 0, .025]);
        this.part('plane', 'shadow', 0xffffff, x, .251, z + 4.2, 5, 9, 1, [-Math.PI / 2, 0, -.22]);
        const crownX = x - Math.sin(.025) * height;
        for (let i = 0; i < 11; i++) {
            const a = i * Math.PI * 2 / 11, length = 2.7 + this.rand() * .65;
            this.part('leaf', 'leaves', 0xffffff, crownX, height, z, .85, length, length, [0, a, 0]);
        }
        for (let i = 0; i < 5; i++) this.part('leaf', 'leaves', 0xffffff, crownX, height + .12, z,
            .7, 2.2, 2.2, [.35, i * Math.PI * 2 / 5, 0]);
        for (let y = .5; y < height - .2; y += .7) this.part('cylinder', 'glow', 0xf8c17b, x - Math.sin(.025) * y, y, z, .18, .035, .18);
    }
    buildSkyline() {
        this.parts = {};
        for (let i = 0; i < 10; i++) {
            const side = i % 2 ? -1 : 1, x = side * (15 + (i % 3) * 11), z = -145 - Math.floor(i / 2) * 25;
            this.tower(x, z, 26 + i * 4, 7 + i % 4, 12, i);
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
    async loadCars() {
        const gltf = await new Promise((resolve, reject) => loadModel('models/obj/lite/car1.glb', resolve, reject));
        const model = gltf.scene.clone(true), bounds = new THREE.Box3().setFromObject(model), size = bounds.getSize(new THREE.Vector3());
        if (size.x > size.z) model.rotation.y = Math.PI / 2;
        model.updateMatrixWorld(true); bounds.setFromObject(model); bounds.getSize(size); model.scale.multiplyScalar(4.4 / size.z);
        model.updateMatrixWorld(true); bounds.setFromObject(model);
        const center = bounds.getCenter(new THREE.Vector3()); model.position.set(-center.x, -bounds.min.y, -center.z);
        for (let i = 0; i < this.chunks.length; i += 2) {
            const root = new THREE.Group(); root.add(model.clone(true)); root.position.set(8.6, .24, -12); this.chunks[i].add(root);
        }
    }
    hide(o) { if (!o || o.userData.dubai) return; if (!this.hidden.has(o)) this.hidden.set(o, o.visible); o.visible = false; }
    sync() {
        if (!this.on) return;
        const w = this.world;
        for (const list of [w.streetRoots, w.scenery, w.critters, w.officers, w.flocks, w.lights, w.policeLights]) for (const o of list || []) this.hide(o);
        for (const o of [w.rain, w.ripples, w.reflector, w.lampPools, w.lampCones]) this.hide(o);
    }
    set(on) {
        this.on = on; for (const o of this.items) o.visible = on;
        if (on) this.sync(); else { for (const [o, visible] of this.hidden) o.visible = visible; this.hidden.clear(); }
    }
    update(dt, move) {
        if (!this.on) return;
        this.roadMap.offset.y = (this.roadMap.offset.y + move / 12) % 1;
        for (const chunk of this.chunks) { chunk.position.z += move; while (chunk.position.z > this.behind) chunk.position.z -= this.len; }
        this.sync();
    }
}
