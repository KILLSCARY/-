import * as THREE from "./vendor/three.module.js";
import { animateRat } from "./rat.js";

// Экран нового рекорда, как в Subway Surfers: герой, на котором бежали, бежит на месте на фоне лучей в цветах игры.
// Своя маленькая сцена: улица за ним не рисуется. Касание — дальше, к обычному экрану проигрыша.
const RAYS = {
    uniforms: { time: { value: 0 }, aspect: { value: 0.5 } },
    vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 1.0, 1.0); }",
    fragmentShader: `
        uniform float time, aspect; varying vec2 vUv;
        void main() {
            vec2 p = (vUv - vec2(0.85, 0.62)) * vec2(aspect, 1.0);
            float a = atan(p.y, p.x), r = length(p);
            float rays = smoothstep(-0.15, 0.15, sin(a * 11.0 + time * 0.25));
            vec3 deep = mix(vec3(0.20, 0.03, 0.10), vec3(0.38, 0.05, 0.12), rays);
            vec3 hot = mix(vec3(0.89, 0.20, 0.23), vec3(1.0, 0.42, 0.30), rays);
            gl_FragColor = vec4(mix(hot, deep, smoothstep(0.0, 0.95, r)), 1.0);
        }`,
    depthTest: false, depthWrite: false,
};

export class RecordScreen {
    constructor(game, score, onDone) {
        this.game = game; this.onDone = onDone; this.t = 0;
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
        this.shadow = new THREE.Mesh(new THREE.CircleGeometry(0.62, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x14030a, transparent: true, opacity: 0.45 }));
        this.shadow.position.y = 0.01;
        this.scene.add(this.shadow, rat);
        rat.position.set(0, 0, 0);
        rat.quaternion.setFromEuler(new THREE.Euler(0, -0.62, 0)); // лицом к камере, вполоборота: бежит мимо нас
        this.cam = new THREE.PerspectiveCamera(30, 1, 0.1, 30);

        const el = this.el = document.getElementById("record");
        document.getElementById("record-score").textContent = Math.floor(score).toLocaleString("ru-RU");
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
        const fit = Math.max(3.1, 2.0 / cam.aspect) / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)));
        cam.position.set(0, 1.0, -fit);
        cam.lookAt(0, 1.08, 0);
        cam.updateProjectionMatrix();
        this.rays.material.uniforms.time.value = this.t;
        this.rays.material.uniforms.aspect.value = cam.aspect;
        animateRat(g.rat, "run", this.t, this.t * 6, dt, 6);
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
        this.shadow.geometry.dispose(); this.shadow.material.dispose();
        g.recordScreen = null;
        this.onDone();
    }
}
