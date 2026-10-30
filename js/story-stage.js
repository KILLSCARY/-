import * as THREE from './vendor/three.module.js';

// Временные декорации перед боем: общие простые материалы, без теней и отдельных источников света.
export class StoryStage {
    constructor(scene, chapter, x) {
        this.scene = scene;
        this.root = new THREE.Group(); this.root.position.set(x, 0, -7);
        this.materials = [];
        const material = color => { const m = new THREE.MeshBasicMaterial({ color }); this.materials.push(m); return m; };
        const dark = material(0x192332), trim = material(0xa6b6c6), gold = material(0xf3c860), red = material(0xd5303d), blue = material(0x285eae);
        const box = (w, h, d, x, y, z, mat) => {
            const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
            o.position.set(x, y, z); this.root.add(o); return o;
        };
        const sign = (label, y, color = '#f4ca60') => {
            const c = document.createElement('canvas'); c.width = 512; c.height = 128;
            const ctx = c.getContext('2d'); ctx.fillStyle = '#101a2a'; ctx.fillRect(0, 0, 512, 128);
            ctx.strokeStyle = color; ctx.lineWidth = 5; ctx.strokeRect(3, 3, 506, 122);
            ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = 'bold 50px sans-serif'; ctx.fillText(label, 256, 64, 470);
            const texture = new THREE.CanvasTexture(c); texture.encoding = THREE.sRGBEncoding;
            const m = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide, toneMapped: false });
            this.materials.push(m);
            const o = new THREE.Mesh(new THREE.PlaneGeometry(3.2, .8), m); o.position.set(0, y, .23); this.root.add(o);
        };
        if (chapter === 1) {
            box(.35, 4, .45, -2, 2, 0, dark); box(.35, 4, .45, 2, 2, 0, dark);
            box(4.4, 1.05, .45, 0, 4, 0, dark); sign('СТАНЦИЯ «ОБМЕН»', 4);
            box(4.2, .08, .55, 0, 3.42, 0, gold);
        } else if (chapter === 2) {
            box(.2, 2.8, .3, -2.25, 1.4, 0, blue); box(.2, 2.8, .3, 2.25, 1.4, 0, blue);
            box(4.7, .9, .35, 0, 2.8, 0, dark); sign('ПРОВЕРКА', 2.8, '#a9d5ff');
            box(3.6, .27, .28, 0, .9, .2, trim);
            for (const x of [-1.2, 0, 1.2]) box(.42, .28, .3, x, .9, .23, red);
            box(.55, .36, .2, 1.3, .22, 1.4, dark); box(.22, .1, .1, 1.3, .43, 1.4, gold);
        } else {
            box(5, 5.5, .5, 0, 2.75, -.4, dark);
            box(2.6, 3.4, .12, 0, 1.7, -.1, blue);
            box(.08, 3.4, .1, 0, 1.7, 0, trim);
            box(4.4, .08, .2, 0, 3.75, 0, gold); sign('ШТАБ', 4.3);
        }
        scene.add(this.root);
    }
    dispose() {
        this.scene.remove(this.root);
        this.root.traverse(o => o.geometry?.dispose());
        for (const m of this.materials) { m.map?.dispose(); m.dispose(); }
    }
}
