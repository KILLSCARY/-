// Крыс: накачанный, в белом сомбреро, чёрных штанах и с цепью «7.0» на спине.
// Собран из примитивов Three.js. Смотрит в -Z (камера сзади, как в роликах).

const M = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...extra });

function pendantTexture() {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const g = c.getContext("2d");
    g.fillStyle = "#e9c25a";
    g.font = "bold 78px Arial Black, Arial, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.strokeStyle = "#7a5a10";
    g.lineWidth = 6;
    g.strokeText("7.0", 64, 68);
    g.fillText("7.0", 64, 68);
    const tex = new THREE.CanvasTexture(c);
    tex.encoding = THREE.sRGBEncoding;
    return tex;
}

export function createRat() {
    const fur = M(0x7a4528, { roughness: 0.55 });
    const skin = M(0xe6a99a, { roughness: 0.5 });
    const pants = M(0x111114, { roughness: 0.8 });
    const white = M(0xf2efe8, { roughness: 0.75 });
    const gold = M(0xe9c25a, { metalness: 0.9, roughness: 0.25 });
    const silver = M(0xcfd3d8, { metalness: 0.9, roughness: 0.2 });

    const rat = new THREE.Group();
    const body = new THREE.Group();          // всё, кроме ног — качается при беге
    rat.add(body);

    // --- ноги: штаны + босые лапы. Пивот в бедре
    const legs = [];
    for (const side of [-1, 1]) {
        const hip = new THREE.Group();
        hip.position.set(side * 0.13, 0.62, 0);
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.085, 0.56, 10), pants);
        leg.position.y = -0.28;
        const foot = new THREE.Mesh(new THREE.SphereGeometry(0.085, 10, 8), skin);
        foot.scale.set(0.9, 0.55, 1.6);
        foot.position.set(0, -0.58, -0.06);
        hip.add(leg, foot);
        rat.add(hip);
        legs.push(hip);
    }
    const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.23, 0.16, 14), pants);
    belt.position.y = 0.66;
    body.add(belt);

    // --- торс: широкая спина и плечи
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.28, 6, 14), fur);
    torso.scale.set(1.25, 1, 0.85);
    torso.position.y = 0.98;
    body.add(torso);
    for (const side of [-1, 1]) {
        const delt = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), fur);
        delt.position.set(side * 0.3, 1.16, 0);
        body.add(delt);
        const lat = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10), fur);
        lat.scale.set(0.8, 1.3, 0.7);
        lat.position.set(side * 0.17, 1.0, 0.07);
        body.add(lat);
    }

    // --- руки с серебряными браслетами. Пивот в плече
    const arms = [];
    for (const side of [-1, 1]) {
        const shoulder = new THREE.Group();
        shoulder.position.set(side * 0.34, 1.14, 0);
        const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.2, 4, 10), fur);
        upper.position.y = -0.17;
        const fore = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.18, 4, 10), fur);
        fore.position.set(0, -0.4, -0.06);
        fore.rotation.x = 0.5;
        const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.022, 6, 14), silver);
        cuff.rotation.x = Math.PI / 2 + 0.5;
        cuff.position.set(0, -0.48, -0.1);
        const fist = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), skin);
        fist.position.set(0, -0.53, -0.14);
        shoulder.add(upper, fore, cuff, fist);
        shoulder.rotation.z = side * 0.25;
        body.add(shoulder);
        arms.push(shoulder);
    }

    // --- голова
    const head = new THREE.Group();
    head.position.y = 1.36;
    body.add(head);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 12), fur);
    skull.scale.set(1, 0.95, 1.05);
    const snout = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.24, 12), fur);
    snout.rotation.x = -Math.PI / 2;
    snout.position.set(0, -0.04, -0.2);
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), skin);
    nose.position.set(0, -0.04, -0.32);
    head.add(skull, snout, nose);
    for (const side of [-1, 1]) {
        const ear = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8), skin);
        ear.scale.set(1, 1, 0.3);
        ear.position.set(side * 0.16, 0.08, 0.02);
        ear.rotation.y = side * 0.6;
        head.add(ear);
    }

    // белая бандана на шее
    const bandana = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.055, 8, 16), white);
    bandana.rotation.x = Math.PI / 2;
    bandana.position.y = 1.22;
    body.add(bandana);

    // золотая цепь, кулон «7.0» висит на спине — его видно из камеры
    const chain = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.014, 6, 24), gold);
    chain.rotation.x = Math.PI / 2 - 0.35;
    chain.position.set(0, 1.12, 0.03);
    body.add(chain);
    const pendant = new THREE.Mesh(
        new THREE.PlaneGeometry(0.24, 0.24),
        new THREE.MeshStandardMaterial({ map: pendantTexture(), transparent: true, metalness: 0.6, roughness: 0.3, emissive: 0x332200 })
    );
    pendant.position.set(0, 1.03, 0.2);
    body.add(pendant);

    // --- белое сомбреро
    const hat = new THREE.Group();
    hat.position.set(0, 0.13, 0);
    hat.rotation.x = 0.12;
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.6, 0.035, 32), white);
    const roll = new THREE.Mesh(new THREE.TorusGeometry(0.58, 0.035, 8, 32), white);
    roll.rotation.x = Math.PI / 2;
    roll.position.y = 0.025;
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.22, 0.36, 20), white);
    crown.position.y = 0.19;
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), white);
    top.position.y = 0.37;
    hat.add(brim, roll, crown, top);
    head.add(hat);

    // --- длинный розовый хвост, тянется назад к камере
    const tailPivot = new THREE.Group();
    tailPivot.position.set(0, 0.62, 0.2);
    const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0.05, -0.15, 0.35),
        new THREE.Vector3(-0.1, -0.35, 0.75),
        new THREE.Vector3(0.12, -0.5, 1.15),
    ]);
    const tail = new THREE.Mesh(new THREE.TubeGeometry(curve, 20, 0.035, 6), skin);
    tailPivot.add(tail);
    rat.add(tailPivot);

    // мягкая «тень»-пятно под ногами
    const blob = new THREE.Mesh(
        new THREE.CircleGeometry(0.45, 20),
        new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.45, depthWrite: false })
    );
    blob.rotation.x = -Math.PI / 2;
    blob.position.y = 0.02;

    rat.userData = { body, legs, arms, head, hat, tailPivot, blob };
    return rat;
}

// pose: "run" | "jump" | "slide" | "idle" | "dead"; t — время, phase — фаза бега
export function animateRat(rat, pose, t, phase) {
    const { body, legs, arms, head, tailPivot } = rat.userData;
    const s = Math.sin(phase);

    body.rotation.set(0, 0, 0);
    body.position.set(0, 0, 0);
    rat.scale.set(1, 1, 1);

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
        legs[0].rotation.x = -1.1;
        legs[1].rotation.x = 0.4;
        arms[0].rotation.x = -2.4;
        arms[1].rotation.x = 0.8;
        body.rotation.x = -0.25;
        tailPivot.rotation.x = 0.5;
        tailPivot.rotation.y = Math.sin(t * 8) * 0.3;
    } else if (pose === "slide") {
        // подкат: крыс сжимается и наклоняется вперёд, шляпу придерживает
        rat.scale.set(1.1, 0.5, 1.1);
        body.rotation.x = -0.5;
        legs[0].rotation.x = -1.3;
        legs[1].rotation.x = -1.3;
        arms[0].rotation.x = -2.6;
        arms[1].rotation.x = 0.6;
        tailPivot.rotation.y = Math.sin(t * 20) * 0.2;
    } else if (pose === "idle") {
        const b = Math.sin(t * 2);
        for (const l of legs) l.rotation.x = 0;
        arms[0].rotation.x = arms[1].rotation.x = b * 0.05;
        body.position.y = b * 0.015;
        head.rotation.y = Math.sin(t * 0.7) * 0.4;
        tailPivot.rotation.y = Math.sin(t * 1.5) * 0.4;
    } else if (pose === "dead") {
        body.rotation.x = 0.5;
        legs[0].rotation.x = legs[1].rotation.x = 0.6;
        arms[0].rotation.x = arms[1].rotation.x = -1.4;
    }
}
