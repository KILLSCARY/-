import * as THREE from "./vendor/three.module.js";

// Крыс: накачанный, в белом сомбреро с красной лентой, белой бандане, чёрных штанах
// и с золотой цепью «70». Собран из примитивов Three.js. Смотрит в -Z.

const M = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...extra });

function pendantTexture() {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const g = c.getContext("2d");
    g.fillStyle = "#e9c25a";
    g.font = "bold 84px Arial Black, Arial, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.strokeStyle = "#7a5a10";
    g.lineWidth = 6;
    g.strokeText("70", 64, 68);
    g.fillText("70", 64, 68);
    const tex = new THREE.CanvasTexture(c);
    tex.encoding = THREE.sRGBEncoding;
    return tex;
}

export function createRat() {
    const fur = M(0x7a4528, { roughness: 0.55 });
    const furLight = M(0x9a6038, { roughness: 0.55 });
    const skin = M(0xe6a99a, { roughness: 0.5 });
    const pants = M(0x111114, { roughness: 0.8 });
    const white = M(0xd9d4cb, { roughness: 0.8 });
    const red = M(0x9c1420, { roughness: 0.6 });
    const gold = M(0xe9c25a, { metalness: 0.9, roughness: 0.25 });
    const silver = M(0xcfd3d8, { metalness: 0.9, roughness: 0.2 });
    const black = M(0x0a0a0a, { roughness: 0.3 });

    const rat = new THREE.Group();   // позиция в мире (полоса, высота прыжка)
    const rig = new THREE.Group();   // поза целиком: наклоны, подкат, падение
    rat.add(rig);
    const body = new THREE.Group();  // всё, кроме ног — качается при беге
    rig.add(body);

    // --- ноги: штаны + босые лапы. Пивот в бедре
    const legs = [];
    for (const side of [-1, 1]) {
        const hip = new THREE.Group();
        hip.position.set(side * 0.13, 0.62, 0);
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.09, 0.56, 10), pants);
        leg.position.y = -0.28;
        const foot = new THREE.Mesh(new THREE.SphereGeometry(0.085, 10, 8), skin);
        foot.scale.set(0.9, 0.55, 1.7);
        foot.position.set(0, -0.58, -0.07);
        hip.add(leg, foot);
        rig.add(hip);
        legs.push(hip);
    }
    const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.23, 0.16, 14), pants);
    belt.position.y = 0.66;
    const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.07, 0.02), silver);
    buckle.position.set(0, 0.7, -0.235);
    body.add(belt, buckle);

    // --- торс: широкая спина, грудь, пресс, плечи
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.28, 6, 14), fur);
    torso.scale.set(1.3, 1, 0.85);
    torso.position.y = 0.98;
    body.add(torso);
    for (const side of [-1, 1]) {
        const delt = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10), fur);
        delt.position.set(side * 0.31, 1.16, 0);
        const lat = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10), fur);
        lat.scale.set(0.8, 1.3, 0.7);
        lat.position.set(side * 0.17, 1.0, 0.07);
        const pec = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), furLight);
        pec.scale.set(1.1, 0.75, 0.6);
        pec.position.set(side * 0.12, 1.1, -0.13);
        body.add(delt, lat, pec);
        for (let r = 0; r < 3; r++) { // кубики пресса
            const ab = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), furLight);
            ab.scale.set(1, 0.8, 0.5);
            ab.position.set(side * 0.055, 0.93 - r * 0.08, -0.17);
            body.add(ab);
        }
    }

    // --- руки с серебряными браслетами. Пивот в плече
    const arms = [];
    for (const side of [-1, 1]) {
        const shoulder = new THREE.Group();
        shoulder.position.set(side * 0.35, 1.14, 0);
        const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.095, 0.2, 4, 10), fur);
        upper.position.y = -0.17;
        const fore = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.18, 4, 10), fur);
        fore.position.set(0, -0.4, -0.06);
        fore.rotation.x = 0.5;
        const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.022, 6, 14), silver);
        cuff.rotation.x = Math.PI / 2 + 0.5;
        cuff.position.set(0, -0.48, -0.1);
        const fist = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), skin);
        fist.position.set(0, -0.53, -0.14);
        shoulder.add(upper, fore, cuff, fist);
        shoulder.rotation.z = side * 0.25;
        body.add(shoulder);
        arms.push(shoulder);
    }

    // --- голова: злые брови, глаза, нос, резцы
    const head = new THREE.Group();
    head.position.y = 1.36;
    body.add(head);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 12), fur);
    skull.scale.set(1.05, 0.95, 1.05);
    const snout = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 10), furLight);
    snout.scale.set(1, 0.8, 1.2);
    snout.position.set(0, -0.06, -0.14);
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), black);
    nose.position.set(0, -0.03, -0.26);
    const teeth = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.02), white);
    teeth.position.set(0, -0.12, -0.24);
    head.add(skull, snout, nose, teeth);
    for (const side of [-1, 1]) {
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 8), white);
        eye.position.set(side * 0.07, 0.03, -0.14);
        const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), black);
        pupil.position.set(side * 0.065, 0.025, -0.175);
        const brow = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.025, 0.03), black);
        brow.position.set(side * 0.07, 0.085, -0.16);
        brow.rotation.z = side * 0.45; // сведены к переносице — злой взгляд
        const ear = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8), skin);
        ear.scale.set(1, 1, 0.3);
        ear.position.set(side * 0.17, 0.08, 0.02);
        ear.rotation.y = side * 0.6;
        head.add(eye, pupil, brow, ear);
    }

    // белая бандана на шее с узлом впереди
    const bandana = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.055, 8, 16), white);
    bandana.rotation.x = Math.PI / 2;
    bandana.position.y = 1.22;
    const knot = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.14, 4), white);
    knot.rotation.x = Math.PI;
    knot.position.set(0, 1.15, -0.17);
    body.add(bandana, knot);

    // золотая цепь с кулоном «70» на груди и на спине (сзади его видит камера)
    const chain = new THREE.Mesh(new THREE.TorusGeometry(0.21, 0.016, 6, 24), gold);
    chain.rotation.x = Math.PI / 2;
    chain.scale.set(1, 1.15, 1);
    chain.position.set(0, 1.12, 0);
    body.add(chain);
    const pendantMat = new THREE.MeshStandardMaterial({ map: pendantTexture(), transparent: true, metalness: 0.6, roughness: 0.3, emissive: 0x332200 });
    const front = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.2), pendantMat);
    front.position.set(0, 1.0, -0.22);
    front.rotation.y = Math.PI;
    const back = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.22), pendantMat);
    back.position.set(0, 1.03, 0.2);
    body.add(front, back);

    // --- белое сомбреро с красной лентой
    const hat = new THREE.Group();
    hat.position.set(0, 0.13, 0);
    hat.rotation.x = 0.1;
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.6, 0.035, 32), white);
    const roll = new THREE.Mesh(new THREE.TorusGeometry(0.58, 0.035, 8, 32), white);
    roll.rotation.x = Math.PI / 2;
    roll.position.y = 0.025;
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.22, 0.34, 20), white);
    crown.position.y = 0.18;
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.12, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), white);
    top.position.y = 0.35;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.205, 0.222, 0.06, 20, 1, true), red);
    band.position.y = 0.05;
    hat.add(brim, roll, crown, top, band);
    head.add(hat);

    // --- длинный розовый хвост
    const tailPivot = new THREE.Group();
    tailPivot.position.set(0, 0.62, 0.2);
    const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0.05, -0.15, 0.35),
        new THREE.Vector3(-0.1, -0.35, 0.75),
        new THREE.Vector3(0.12, -0.5, 1.15),
    ]);
    tailPivot.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 20, 0.035, 6), skin));
    rig.add(tailPivot);

    // мягкая «тень»-пятно под ногами (добавляется в сцену отдельно, чтобы не прыгала)
    const blob = new THREE.Mesh(
        new THREE.CircleGeometry(0.45, 20),
        new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.45, depthWrite: false })
    );
    blob.rotation.x = -Math.PI / 2;
    blob.position.y = 0.02;

    rig.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    rat.userData = { rig, body, legs, arms, head, hat, tailPivot, blob };
    return rat;
}

const ALIAS = { fly: "jump", fall: "dead" };

// pose: "run" | "jump" | "slide" | "idle" | "dead" | "fly" | "fall"; t — время, phase — фаза бега
export function animateRat(rat, pose, t, phase, dt = 0, speed = 1) {
    if (rat.userData.model) return animateModel(rat, pose, t, phase, dt, speed);
    pose = ALIAS[pose] || pose; // у крыса из примитивов нет полёта и падения ничком
    const { rig, body, legs, arms, head, tailPivot } = rat.userData;
    const s = Math.sin(phase);

    rig.rotation.set(0, 0, 0);
    rig.position.set(0, 0, 0);
    body.rotation.set(0, 0, 0);
    body.position.set(0, 0, 0);
    head.rotation.set(0, 0, 0);
    for (const a of arms) a.rotation.x = 0;
    arms[0].rotation.z = -0.25;
    arms[1].rotation.z = 0.25;

    if (pose === "run") {
        legs[0].rotation.x = s * 0.95;
        legs[1].rotation.x = -s * 0.95;
        arms[0].rotation.x = -s * 0.9;
        arms[1].rotation.x = s * 0.9;
        body.position.y = Math.abs(Math.cos(phase)) * 0.06;
        body.rotation.x = -0.12;
        body.rotation.y = s * 0.12;
        head.rotation.y = -s * 0.08;
        tailPivot.rotation.y = Math.sin(phase * 0.5) * 0.35;
        tailPivot.rotation.x = Math.cos(phase) * 0.08;
    } else if (pose === "jump") {
        // поджал обе ноги, руки в стороны — как в ролике с баком
        legs[0].rotation.x = legs[1].rotation.x = -1.3;
        rig.position.y = 0.25;
        arms[0].rotation.z = -1.1;
        arms[1].rotation.z = 1.1;
        arms[0].rotation.x = arms[1].rotation.x = -0.3;
        body.rotation.x = -0.15;
        tailPivot.rotation.x = 0.6;
        tailPivot.rotation.y = Math.sin(t * 8) * 0.3;
    } else if (pose === "slide") {
        // подкат на спине по луже: ноги вперёд, одной рукой держит шляпу
        rig.rotation.x = 0.95;
        rig.position.set(0, -0.15, -0.4);
        legs[0].rotation.x = -2.5;
        legs[1].rotation.x = -2.3;
        arms[0].rotation.x = -2.9;
        arms[0].rotation.z = -0.6;
        arms[1].rotation.x = 0.9;
        arms[1].rotation.z = 0.7;
        head.rotation.x = -1.0;
        tailPivot.rotation.y = Math.sin(t * 20) * 0.2;
    } else if (pose === "idle") {
        const b = Math.sin(t * 2);
        legs[0].rotation.x = legs[1].rotation.x = 0;
        arms[0].rotation.x = arms[1].rotation.x = b * 0.05;
        body.position.y = b * 0.015;
        head.rotation.y = Math.sin(t * 0.7) * 0.4;
        tailPivot.rotation.y = Math.sin(t * 1.5) * 0.4;
    } else if (pose === "dead") {
        // шлёпнулся на пятую точку
        rig.rotation.x = 0.35;
        rig.position.set(0, -0.48, 0.2);
        legs[0].rotation.x = -1.5;
        legs[1].rotation.x = -1.2;
        arms[0].rotation.x = arms[1].rotation.x = 0.7;
        arms[0].rotation.z = -0.7;
        arms[1].rotation.z = 0.7;
        head.rotation.z = 0.25;
    }
}

// ---- персонаж из .glb ----------------------------------------------------------------------

// Заменяет крыса из примитивов на загруженную модель: масштаб, разворот, анимации.
export function attachModel(rat, gltf, cfg) {
    const model = gltf.scene;
    model.rotation.set(0, cfg.rotateY ?? Math.PI, 0); // Meshy/Mixamo смотрят в +Z, а бежим мы в -Z
    model.position.set(0, 0, 0);
    model.scale.setScalar(1);
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const k = cfg.height / (size.y || 1);
    model.scale.multiplyScalar(k);
    model.updateMatrixWorld(true);
    box.setFromObject(model);
    const c = box.getCenter(new THREE.Vector3());
    model.position.x -= c.x;
    model.position.z -= c.z;
    model.position.y -= box.min.y;
    model.traverse((o) => {
        if (o.isMesh) {
            o.castShadow = true;
            o.frustumCulled = false; // у скиннутых мешей bbox не обновляется при анимации
        }
    });

    const { rig, blob } = rat.userData;
    rig.clear();
    rig.add(model);

    // clips: поза → имя клипа; timing: во сколько раз ускорить клип, чтобы он уложился в прыжок/подкат
    const mixer = new THREE.AnimationMixer(model);
    const actions = {}, timing = {};
    for (const [pose, name] of Object.entries(cfg.clips)) {
        const clip = gltf.animations.find((a) => a.name === name);
        if (!clip) continue;
        actions[pose] = mixer.clipAction(clip);
        if (cfg.durations?.[pose]) timing[pose] = clip.duration / cfg.durations[pose];
    }
    if (!actions.run && gltf.animations[0]) actions.run = mixer.clipAction(gltf.animations[0]);
    // бёдра в позе покоя — для pin (полёт: высоту задаёт игра, а не клип)
    let hips = null;
    model.traverse((o) => { if (!hips && o.isBone && /hips/i.test(o.name)) hips = o; });
    rig.updateMatrixWorld(true);
    const restHips = hips ? hips.getWorldPosition(new THREE.Vector3()).y - rig.getWorldPosition(new THREE.Vector3()).y : 0;
    rat.userData = { rig, blob, model, mixer, actions, timing, clipT: null, current: null, hips, restHips, pin: cfg.flyClip?.pin, pinUntil: cfg.flyClip?.touch,
        flyLoop: !!cfg.flyClip?.loop, hipsRest: hips?.position.clone() };
    if (cfg.flyClip?.loop && actions.fly) timing.fly = cfg.flyClip.speed || 1;
}

function animateModel(rat, pose, t, phase, dt, speed) {
    const u = rat.userData;
    const { rig, actions, mixer } = u;
    rig.rotation.set(0, 0, 0);
    rig.position.set(0, 0, 0);
    rig.scale.set(1, 1, 1);
    if (!Object.keys(actions).length) return animateStatic(rig, ALIAS[pose] || pose, t, phase);

    // нет своего клипа для позы — играем бег и доворачиваем модель целиком
    const want = actions[pose] ? pose : pose === "fall" && actions.dead ? "dead" : "run";
    if (want !== u.current) {
        const next = actions[want];
        const once = want !== "run" && want !== "idle" && !(want === "fly" && u.flyLoop); // плавание в полёте — по кругу
        next.reset();
        next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
        next.clampWhenFinished = once;
        next.timeScale = u.timing[want] ?? 1;
        next.fadeIn(0.12).play();
        if (u.current) actions[u.current].fadeOut(0.12);
        u.current = want;
    }
    if (pose === "slide" && !actions.slide) {
        rig.rotation.x = 0.9;
        rig.position.set(0, -0.2, -0.4);
    } else if (pose === "jump" && !actions.jump) {
        rig.rotation.x = -0.2;
    } else if ((pose === "dead" || pose === "fall") && !actions.dead) {
        rig.rotation.x = 0.5;
        rig.position.y = -0.3;
    }
    const scale = want === "run" ? (pose === "idle" ? 0.25 : Math.max(0.8, speed / 14)) : 1;
    // кадр полёта ставит игра (взлёт → полёт в верхней точке → приземление), сам клип не идёт
    if (want === "fly" && u.clipT !== null) {
        actions.fly.timeScale = 0;
        actions.fly.time = u.clipT;
    }
    mixer.update(dt * scale);
    // у плавания в клипе тело уплывает вперёд — держим бёдра на месте (по X и Z), летит герой за счёт игры
    if (want === "fly" && u.flyLoop && u.hips && u.hipsRest) { u.hips.position.x = u.hipsRest.x; u.hips.position.z = u.hipsRest.z; }
    if (want === "fly" && u.pin && u.hips && u.clipT !== null && u.clipT < u.pinUntil) {
        pinHips(u);
    }
}

// гасим высоту, «вшитую» в клип: бёдра остаются на высоте покоя, поднимает героя игра
function pinHips(u) {
    u.model.updateMatrixWorld(true);
    const v = new THREE.Vector3();
    const base = u.rig.getWorldPosition(new THREE.Vector3()).y;
    const h = u.hips.getWorldPosition(v).y - base;
    u.rig.position.y -= h - u.restHips;
}

// Модель без скелета (застывшая поза бега из Meshy): бег «покадровый» — на каждом шаге
// модель отражается по X, и вперёд выходит то одна, то другая нога; плюс подпрыгивание и наклон.
function animateStatic(rig, pose, t, phase) {
    const step = Math.sin(phase);
    if (pose === "run") {
        rig.scale.x = step >= 0 ? 1 : -1;
        const bounce = Math.abs(Math.cos(phase));
        rig.position.y = bounce * 0.07;
        rig.scale.y = 0.97 + bounce * 0.05;
        rig.rotation.x = -0.06;
        rig.rotation.z = step * 0.05;
    } else if (pose === "jump") {
        rig.rotation.x = -0.25;
        rig.scale.y = 1.05;
    } else if (pose === "slide") {
        // подкат на спине, ногами вперёд
        rig.rotation.x = 1.1;
        rig.position.set(0, 0.15, -0.5);
    } else if (pose === "idle") {
        const b = Math.sin(t * 2);
        rig.scale.y = 1 + b * 0.012;
        rig.rotation.y = Math.sin(t * 0.7) * 0.15;
    } else if (pose === "dead") {
        rig.rotation.x = 1.35;
        rig.position.set(0, 0.25, 0.6);
    }
}
