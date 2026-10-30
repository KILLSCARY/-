import * as THREE from './vendor/three.module.js';

// A coherent 18 m motor yacht, authored in metres. Shared by all marina berths.
// Geometry follows the hull sheer and deck profile; rails/windows never float above it.
export function makeYachtParts() {
    const parts = [];
    const add = (kind, color, geometry) => { parts.push({ kind, color, geometry }); return geometry; };
    const transform = (g, x, y, z, rx = 0, ry = 0, rz = 0) => {
        g.rotateX(rx); g.rotateY(ry); g.rotateZ(rz); g.translate(x, y, z); return g;
    };
    const box = (kind, color, x, y, z, sx, sy, sz, rotation = 0) => add(kind, color,
        transform(new THREE.BoxGeometry(sx, sy, sz), x, y, z, rotation));
    const tube = (kind, color, points, radius = .025, segments = 24) => add(kind, color,
        new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p))), segments, radius, 5, false));
    const panel = (kind, color, points) => {
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(points.flat(), 3));
        g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
        g.setIndex([0, 1, 2, 0, 2, 3]); g.computeVertexNormals(); return add(kind, color, g);
    };
    const rounded = (kind, color, x, y, z, width, depth, height, radius = .25) => {
        const shape = new THREE.Shape(), w = width / 2, d = depth / 2, r = Math.min(radius, w, d);
        shape.moveTo(-w + r, -d); shape.lineTo(w - r, -d); shape.quadraticCurveTo(w, -d, w, -d + r);
        shape.lineTo(w, d - r); shape.quadraticCurveTo(w, d, w - r, d);
        shape.lineTo(-w + r, d); shape.quadraticCurveTo(-w, d, -w, d - r);
        shape.lineTo(-w, -d + r); shape.quadraticCurveTo(-w, -d, -w + r, -d);
        const g = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, curveSegments: 5 });
        // Positive extrusion becomes positive Y; XY outline becomes the XZ deck.
        g.rotateX(-Math.PI / 2); g.translate(x, y, z); return add(kind, color, g);
    };
    // Longitudinal sections: z, half beam, gunwale height, keel height.
    const sections = [[-8.7, 2.05, 1.5, -.15], [-8, 2.4, 1.65, -.45], [-6, 2.6, 1.8, -.62],
        [-3, 2.65, 1.95, -.7], [0, 2.55, 2.05, -.65], [3, 2.2, 2.15, -.45],
        [5, 1.75, 2.28, -.1], [7, 1.1, 2.42, .35], [8.2, .48, 2.52, .9], [9, .025, 2.6, 1.6]];
    const profile = [[-1, 1], [-.99, .8], [-.87, .38], [-.52, .08], [0, 0], [.52, .08], [.87, .38], [.99, .8], [1, 1]];
    const p = [], uv = [], indices = [], count = profile.length;
    for (const [z, beam, top, bottom] of sections) for (const [x, y] of profile) {
        p.push(x * beam, bottom + y * (top - bottom), z); uv.push((x + 1) / 2, (z + 9) / 18);
    }
    for (let i = 0; i < sections.length - 1; i++) for (let j = 0; j < count; j++) {
        const a = i * count + j, b = i * count + (j + 1) % count;
        indices.push(a, b, b + count, a, b + count, a + count);
    }
    for (let j = 1; j < count - 1; j++) {
        indices.push(0, j + 1, j);
        const a = (sections.length - 1) * count; indices.push(a, a + j, a + j + 1);
    }
    const hull = new THREE.BufferGeometry(); hull.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    hull.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); hull.setIndex(indices); hull.computeVertexNormals();
    add('hull', 0xf7f3e9, hull);
    // Teak inset follows the sloping foredeck rather than forming a separate floating slab.
    for (let i = 0; i < sections.length - 1; i++) {
        const a = sections[i], b = sections[i + 1], aw = Math.max(.01, a[1] - .2), bw = Math.max(.01, b[1] - .2);
        panel('deck', 0xe6c49c, [[-aw, a[2] + .025, a[0]], [-bw, b[2] + .025, b[0]],
            [bw, b[2] + .025, b[0]], [aw, a[2] + .025, a[0]]]);
    }
    for (const side of [-1, 1]) {
        tube('metal', 0xaeb9bc, sections.map(([z, w, y]) => [side * w * .97, y + .035, z]), .035, 24);
        tube('darkGlass', 0xffffff, sections.slice(0, -1).map(([z, w, y]) => [side * w * .97, y - .55, z]), .065, 24);
        tube('metal', 0xd2d9d9, sections.map(([z, w, y]) => [side * w * .94, y + .65, z]), .023, 24);
        for (const [z, w, y] of sections.slice(0, -1)) tube('metal', 0xd2d9d9,
            [[side * w * .94, y + .06, z], [side * w * .94, y + .65, z]], .018, 1);
        // Three elongated hull windows set into the flanks, above the waterline.
        for (const z of [-5.5, -2.5, .5]) {
            const x = side * (z < -4 ? 2.53 : z < 0 ? 2.59 : 2.46);
            box('darkGlass', 0xffffff, x, 1.2, z, .055, .28, 1.9);
        }
    }
    // Main saloon: white lower body, a raked windshield and continuous side glazing.
    rounded('hull', 0xf7f3e9, 0, 1.92, -2.4, 4.25, 8.3, .48, .65);
    const back = -6.25, frontBottom = 2.2, frontTop = 1.1, bottom = 2.37, top = 3.65;
    for (const side of [-1, 1]) {
        const points = [[side * 2.05, bottom, back], [side * 2.02, bottom, frontBottom],
            [side * 1.83, top, frontTop], [side * 1.85, top, back + .45]];
        if (side > 0) points.reverse();
        panel('darkGlass', 0xffffff, points);
        for (const z of [-4.5, -1.9]) tube('hull', 0xf7f3e9,
            [[side * 2.065, bottom, z], [side * 1.86, top, z - .25]], .065, 1);
        tube('metal', 0x8cabb4, [[side * 2.055, bottom + .18, back + .2], [side * 2.02, bottom + .18, frontBottom - .15]], .025, 8);
    }
    panel('darkGlass', 0xffffff, [[-2.02, bottom, frontBottom], [2.02, bottom, frontBottom],
        [1.83, top, frontTop], [-1.83, top, frontTop]]);
    panel('darkGlass', 0xffffff, [[1.85, top, back + .45], [-1.85, top, back + .45], [-2.05, bottom, back], [2.05, bottom, back]].reverse());
    tube('hull', 0xf7f3e9, [[0, bottom, frontBottom + .025], [0, top, frontTop + .025]], .045, 1);
    rounded('hull', 0xffffff, 0, 3.65, -2.4, 4.65, 8.35, .22, .8);
    rounded('deck', 0xffffff, 0, 3.88, -2.8, 3.75, 5.4, .025, .6);
    // Flybridge canopy on two sloped supports, a low windscreen and seating.
    for (const x of [-1.65, 1.65]) tube('hull', 0xf7f3e9, [[x, 3.86, -5.25], [x, 5.2, -4.25]], .12, 1);
    rounded('hull', 0xffffff, 0, 5.2, -3.5, 4.15, 3.9, .16, .55);
    panel('darkGlass', 0xffffff, [[-1.65, 3.9, -.1], [1.65, 3.9, -.1], [1.4, 4.48, -.55], [-1.4, 4.48, -.55]]);
    rounded('cushion', 0xd5c3ac, 0, 3.95, -3.8, 2.8, 1.3, .42, .22);
    rounded('cushion', 0xe4d9c5, 0, 4.2, -4.3, 2.8, .3, .55, .12);
    // Foredeck cushions and stern lounge, with visible seams and a bathing platform.
    for (const x of [-.72, .72]) {
        rounded('cushion', 0xe5d8c3, x, 2.3, 4.6, 1.35, 2.65, .17, .16);
        rounded('cushion', 0xf1e7d5, x, 2.47, 3.7, 1.3, .55, .12, .12);
    }
    rounded('cushion', 0xdfcfb8, 0, 1.7, -7.5, 3.8, .85, .4, .22);
    rounded('cushion', 0xf3e8d6, 0, 1.95, -7.9, 3.75, .25, .55, .12);
    rounded('deck', 0xffffff, 0, .65, -9.1, 3.9, 1.25, .12, .2);
    for (let i = 0; i < 3; i++) box('deck', 0xf0dfc8, 1.6, .9 + i * .23, -8.8 + i * .24, .65, .12, .3);
    // Radar, antenna and soft rubber fenders hang at the waterline; no extra lights.
    box('hull', 0xffffff, 0, 5.55, -3.8, .16, .55, .18);
    box('hull', 0xffffff, 0, 5.8, -3.8, 1.45, .12, .25);
    tube('metal', 0xc2c6c5, [[-.8, 5.35, -4.25], [-.8, 6.35, -4.5]], .018, 1);
    add('hull', 0xffffff, transform(new THREE.SphereGeometry(.23, 10, 6), .8, 5.5, -3.7));
    for (const z of [-6, -3]) {
        tube('metal', 0x5b6668, [[2.5, 2.1, z], [2.7, .85, z]], .018, 1);
        rounded('hull', 0xe5e4d9, 2.72, .5, z, .24, .3, .8, .1);
    }
    // Remove duplicate topology attributes before material batching and use physical teak UVs.
    for (const part of parts) if (part.kind === 'deck') {
        const pos = part.geometry.attributes.position, tex = part.geometry.attributes.uv;
        for (let i = 0; i < pos.count; i++) tex.setXY(i, pos.getX(i) / 2, pos.getZ(i) / 3);
    }
    return parts;
}
