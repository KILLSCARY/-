import * as THREE from "./vendor/three.module.js";
import { animateRat } from "./rat.js";

// Экран нового рекорда: герой радуется на пьедестале, из-за него бьют лучи, сверху падает золотое конфетти, счёт набегает.
// Своя маленькая сцена: улица за ним не рисуется. Касание — дальше, к обычному экрану проигрыша.
const RAYS = {
    uniforms: { time: { value: 0 }, aspect: { value: 0.5 } },
    vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 1.0, 1.0); }",
    fragmentShader: `
        uniform float time, aspect; varying vec2 vUv;
        float hash(float n) { return fract(sin(n) * 43758.5453); }
        void main() {
            vec2 p = (vUv - vec2(0.5, 0.47)) * vec2(aspect, 1.0);
            float a = atan(p.y, p.x), r = length(p);
            float rays = smoothstep(-0.12, 0.12, sin(a * 9.0 + time * 0.35));
            vec3 far = mix(vec3(0.11, 0.015, 0.075), vec3(0.24, 0.03, 0.10), rays);
            vec3 near = mix(vec3(0.62, 0.07, 0.13), vec3(0.95, 0.22, 0.16), rays);
            vec3 c = mix(near, far, smoothstep(0.08, 0.72, r));
            c += vec3(1.0, 0.62, 0.22) * smoothstep(0.42, 0.0, r) * 0.75; // золотое сияние за героем
            // конфетти: столбцы, в каждом свой шаг и скорость, вспыхивает при повороте
            vec2 q = vUv * vec2(aspect * 15.0, 1.0);
            float col = floor(q.x), sp = 0.1 + hash(col) * 0.16;
            float y = fract(vUv.y * 1.6 + time * sp + hash(col + 4.0));
            float x = fract(q.x) - 0.5 + sin(time * 2.0 + col) * 0.14;
            float flip = abs(sin(time * 3.5 + col * 2.3));
            float piece = step(abs(x), 0.09 + 0.09 * flip) * step(y, 0.014) * step(0.3, hash(col + 7.0));
            vec3 tint = mix(vec3(1.0, 0.72, 0.1), vec3(1.0, 0.88, 0.45), hash(col + 9.0));
            c = mix(c, tint * (0.82 + 0.18 * flip), piece);
            gl_FragColor = vec4(c, 1.0);
        }`,
    depthTest: false, depthWrite: false,
};

export class RecordScreen {
    constructor(game, score, prev, onDone) {
        this.game = game; this.onDone = onDone; this.t = 0; this.score = Math.floor(score);
        const rat = game.rat, r = game.renderer;
        this.parent = rat.parent;
        this.savedPos = rat.position.clone();
        this.savedQ = rat.quaternion.clone();
        this.saved = { enc: r.outputEncoding, tone: r.toneMapping, exp: r.toneMappingExposure };
        this.scene = new THREE.Scene();
        this.rays = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial(RAYS));
        this.rays.frustumCulled = false;
        this.rays.renderOrder = -1;
        this.scene.add(this.rays, new THREE.HemisphereLight(0xfff2e8, 0x6a2030, 1.15));
        const sun = new THREE.DirectionalLight(0xffffff, 1.5);
        sun.position.set(-1.5, 3, -3);
        this.scene.add(sun);
        // пьедестал: тёмный верх, золотой обод
        const stand = this.stand = new THREE.Group();
        const top = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.8, 0.16, 48), new THREE.MeshStandardMaterial({ color: 0x2a0912, roughness: 0.6 }));
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.73, 0.035, 12, 64).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffc95a, toneMapped: false }));
        ring.position.y = 0.08;
        stand.add(top, ring);
        stand.position.y = -0.08;
        this.scene.add(stand, rat);
        rat.position.set(0, 0, 0);
        rat.quaternion.setFromEuler(new THREE.Euler(0, -0.3, 0)); // лицом к камере, чуть вполоборота
        this.cam = new THREE.PerspectiveCamera(30, 1, 0.1, 30);

        const el = this.el = document.getElementById("record");
        this.scoreEl = document.getElementById("record-score");
        this.scoreEl.textContent = "0";
        const num = (n) => Math.floor(n).toLocaleString("ru-RU");
        document.getElementById("record-delta").textContent = prev > 0 ? `+${num(score - prev)} к прошлому рекорду` : "Первый рекорд!";
        document.getElementById("record-stats").innerHTML = `<span><b>${num(game.distance)}</b>метров</span><span><b>${num(game.usdt)}</b>USDT</span>`;
        document.getElementById("gorilla").hidden = true; // реплика героя не должна лежать под счётом
        game.show("record");
        el.hidden = false;
        document.getElementById("record-share").onclick = (e) => { e.stopPropagation(); document.getElementById("btn-share").onclick(); };
        this.armed = false;
        setTimeout(() => { this.armed = true; }, 500); // случайное касание сразу после удара не должно пролистывать экран
        el.onclick = () => { if (this.armed) this.close(); };
    }

    update(dt) {
        const g = this.game, r = g.renderer, cam = this.cam;
        this.t += dt;
        cam.aspect = g.camera.aspect;
        const fit = Math.max(3.5, 2.2 / cam.aspect) / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)));
        cam.position.set(0, 1.25, -fit);
        cam.lookAt(0, 1.02, 0);
        cam.updateProjectionMatrix();
        this.rays.material.uniforms.time.value = this.t;
        this.rays.material.uniforms.aspect.value = cam.aspect;
        animateRat(g.rat, "dance", this.t, this.t * 6, dt, 0);
        // счёт набегает за секунду, с замедлением в конце
        if (this.shown !== this.score) {
            const k = Math.min(1, this.t / 1);
            this.shown = k >= 1 ? this.score : Math.floor(this.score * (1 - (1 - k) ** 3));
            this.scoreEl.textContent = this.shown.toLocaleString("ru-RU");
        }
        r.outputEncoding = THREE.sRGBEncoding; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.05;
        r.render(this.scene, cam);
    }

    close() {
        const g = this.game, r = g.renderer, rat = g.rat;
        this.el.onclick = null;
        this.el.hidden = true;
        this.parent.add(rat);
        rat.position.copy(this.savedPos);
        rat.quaternion.copy(this.savedQ);
        r.outputEncoding = this.saved.enc; r.toneMapping = this.saved.tone; r.toneMappingExposure = this.saved.exp;
        this.rays.geometry.dispose(); this.rays.material.dispose();
        this.stand.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
        g.recordScreen = null;
        this.onDone();
    }
}
