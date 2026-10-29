// Ореол героя («Ночь+», LOOK2.glow): мягкое свечение вокруг силуэта, как обводка персонажа в мобильных раннерах.
// Не зависит от нормалей и карт рельефа (поэтому без крапинок на шерсти): героя отдельно рисуем белой маской
// в уменьшенный буфер, размываем и прибавляем к кадру только снаружи силуэта.
// Герой — объекты на слое GLOW_LAYER (markGlow). Стоимость: 2–5 вызовов отрисовки маски и четыре прохода размытия в ½ экрана.
import * as THREE from "./vendor/three.module.js";
import { Pass, FullScreenQuad } from "./vendor/jsm/Pass.js";

export const GLOW_LAYER = 5;

// пометить героя (все меши внутри root) — виден и в кадре (слой 0), и в маске
export function markGlow(root) {
    root.traverse((o) => o.layers.enable(GLOW_LAYER));
}

const VERT = `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

// размытие по Гауссу в одну сторону (dir — шаг в пикселях буфера)
const blurMat = () => new THREE.ShaderMaterial({
    uniforms: { tMap: { value: null }, dir: { value: new THREE.Vector2() } },
    vertexShader: VERT,
    fragmentShader: `uniform sampler2D tMap; uniform vec2 dir; varying vec2 vUv;
        void main() {
            float w[5]; w[0] = 0.227; w[1] = 0.194; w[2] = 0.121; w[3] = 0.054; w[4] = 0.016;
            float s = texture2D(tMap, vUv).r * w[0];
            for (int i = 1; i < 5; i++) { s += texture2D(tMap, vUv + dir * float(i)).r * w[i]; s += texture2D(tMap, vUv - dir * float(i)).r * w[i]; }
            gl_FragColor = vec4(s, s, s, 1.0);
        }`,
    depthTest: false, depthWrite: false,
});

export class HeroGlowPass extends Pass {
    // opts: { color, strength — яркость ореола, radius — ширина (в пикселях уменьшенного буфера на шаг размытия) }
    constructor(scene, camera, opts = {}) {
        super();
        this.scene = scene;
        this.camera = camera;
        this.color = new THREE.Color(opts.color ?? 0xb9a8ff);
        this.strength = opts.strength ?? 1.2;
        this.radius = opts.radius ?? 1.6;
        const rt = () => new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: true });
        this.mask = rt();
        this.blurA = rt();
        this.blurB = rt();
        this.near = rt(); // маска, чуть размытая: мягкая граница силуэта, по ней ореол гасится внутри героя
        this.white = new THREE.MeshBasicMaterial({ color: 0xffffff });
        this.blur = new FullScreenQuad(blurMat());
        this.mix = new FullScreenQuad(new THREE.ShaderMaterial({
            uniforms: { tScene: { value: null }, tMask: { value: null }, tBlur: { value: null }, col: { value: new THREE.Vector3() } },
            vertexShader: VERT,
            fragmentShader: `uniform sampler2D tScene, tMask, tBlur; uniform vec3 col; varying vec2 vUv;
                void main() {
                    vec4 c = texture2D(tScene, vUv);
                    // ореол снаружи силуэта: широкое размытие, погашенное мягкой маской (без ступенек у края героя)
                    float halo = texture2D(tBlur, vUv).r * (1.0 - smoothstep(0.1, 0.6, texture2D(tMask, vUv).r));
                    gl_FragColor = vec4(c.rgb + col * halo, c.a);
                }`,
            depthTest: false, depthWrite: false,
        }));
    }

    setSize(w, h) {
        const W = Math.max(1, Math.round(w / 2)), H = Math.max(1, Math.round(h / 2));
        for (const t of [this.mask, this.blurA, this.blurB, this.near]) t.setSize(W, H);
        this.px = new THREE.Vector2(1 / W, 1 / H);
    }

    render(renderer, writeBuffer, readBuffer) {
        const { scene, camera } = this;
        // 1. маска: только слой героя, белым, без неба/тумана/теней
        const keep = { bg: scene.background, fog: scene.fog, ov: scene.overrideMaterial, mask: camera.layers.mask, sh: renderer.shadowMap.autoUpdate, clr: renderer.getClearColor(new THREE.Color()), a: renderer.getClearAlpha() };
        scene.background = null; scene.fog = null; scene.overrideMaterial = this.white;
        camera.layers.set(GLOW_LAYER);
        renderer.shadowMap.autoUpdate = false;
        renderer.setClearColor(0x000000, 1);
        renderer.setRenderTarget(this.mask);
        renderer.clear();
        renderer.render(scene, camera);
        scene.background = keep.bg; scene.fog = keep.fog; scene.overrideMaterial = keep.ov;
        camera.layers.mask = keep.mask;
        renderer.shadowMap.autoUpdate = keep.sh;
        renderer.setClearColor(keep.clr, keep.a);
        // 2. размытие: узкое (near — мягкий край силуэта) и широкое (blurB — сам ореол)
        const m = this.blur.material, r = this.radius;
        const pass = (src, dst, x, y) => { m.uniforms.tMap.value = src.texture; m.uniforms.dir.value.set(this.px.x * x, this.px.y * y); renderer.setRenderTarget(dst); this.blur.render(renderer); };
        pass(this.mask, this.blurA, 1.2, 0); pass(this.blurA, this.near, 0, 1.2);
        pass(this.near, this.blurA, r, 0); pass(this.blurA, this.blurB, 0, r);
        // 3. кадр + ореол
        const u = this.mix.material.uniforms;
        u.tScene.value = readBuffer.texture; u.tMask.value = this.near.texture; u.tBlur.value = this.blurB.texture;
        u.col.value.set(this.color.r, this.color.g, this.color.b).multiplyScalar(this.strength);
        renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
        this.mix.render(renderer);
    }

    dispose() {
        for (const t of [this.mask, this.blurA, this.blurB, this.near]) t.dispose();
        this.white.dispose(); this.blur.dispose(); this.mix.dispose();
    }
}
