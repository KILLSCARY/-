// Ночной район: мокрая дорога, панельки с жёлтыми окнами, красные фонари у подъездов,
// дождь. Плюс препятствия и монеты, которые едут навстречу крысу.

const SPAWN_Z = -95;   // где появляются предметы
const DESPAWN_Z = 12;  // где исчезают (уже за камерой)
const STREET_LEN = 160;
const BEHIND_Z = 45;   // улица тянется и за спину крыса — её видно с камеры меню

function canvasTex(w, h, draw, repeat) {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    draw(c.getContext("2d"), w, h);
    const tex = new THREE.CanvasTexture(c);
    tex.encoding = THREE.sRGBEncoding;
    tex.anisotropy = 4;
    if (repeat) {
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(...repeat);
    }
    return tex;
}

const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// Фасад панельки: швы плит, окна (часть горит), балконы. Возвращает {map, glow}
function facadeTextures(seed) {
    const cols = 6, rows = 9;
    const lit = [];
    for (let i = 0; i < cols * rows; i++) lit.push(Math.random() < 0.22 + seed * 0.05);
    const draw = (glowOnly) => (g, w, h) => {
        g.fillStyle = glowOnly ? "#000" : pick(["#3b2426", "#33201f", "#402a2a"]);
        g.fillRect(0, 0, w, h);
        const cw = w / cols, rh = h / rows;
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const x = c * cw, y = r * rh;
                if (!glowOnly) {
                    g.strokeStyle = "rgba(0,0,0,0.35)";
                    g.lineWidth = 2;
                    g.strokeRect(x + 1, y + 1, cw - 2, rh - 2);
                }
                const on = lit[r * cols + c];
                const wx = x + cw * 0.22, wy = y + rh * 0.2, ww = cw * 0.56, wh = rh * 0.52;
                if (glowOnly) {
                    if (on) {
                        g.fillStyle = Math.random() < 0.8 ? "#ffc56a" : "#ff6a4a";
                        g.fillRect(wx, wy, ww, wh);
                    }
                } else {
                    g.fillStyle = on ? "#ffcf7a" : "#140b0d";
                    g.fillRect(wx, wy, ww, wh);
                    g.fillStyle = "rgba(60,40,40,0.9)";
                    g.fillRect(wx + ww / 2 - 1, wy, 2, wh);
                    if ((c + r) % 3 === 0) { // балкон
                        g.fillStyle = "#2a1a1b";
                        g.fillRect(x + cw * 0.12, y + rh * 0.62, cw * 0.76, rh * 0.3);
                    }
                }
            }
        }
    };
    return { map: canvasTex(256, 384, draw(false)), glow: canvasTex(256, 384, draw(true)) };
}

function roadTexture() {
    return canvasTex(256, 512, (g, w, h) => {
        g.fillStyle = "#1b1214";
        g.fillRect(0, 0, w, h);
        for (let i = 0; i < 2500; i++) { // зерно асфальта
            const v = Math.floor(rnd(15, 45));
            g.fillStyle = `rgb(${v + 6},${v},${v})`;
            g.fillRect(rnd(0, w), rnd(0, h), 2, 2);
        }
        for (let i = 0; i < 6; i++) { // трещины
            g.strokeStyle = "rgba(0,0,0,0.6)";
            g.beginPath();
            let x = rnd(0, w), y = rnd(0, h);
            g.moveTo(x, y);
            for (let k = 0; k < 5; k++) g.lineTo((x += rnd(-20, 20)), (y += rnd(5, 25)));
            g.stroke();
        }
        g.fillStyle = "rgba(220,210,200,0.55)"; // разметка между полосами
        for (const x of [w / 3, (2 * w) / 3]) {
            g.fillRect(x - 3, 0, 6, h * 0.45);
        }
    }, [1, 6]);
}

function sidewalkTexture() {
    return canvasTex(128, 128, (g, w, h) => {
        g.fillStyle = "#2a1c1d";
        g.fillRect(0, 0, w, h);
        g.strokeStyle = "#160e0f";
        g.lineWidth = 3;
        for (let i = 0; i <= 4; i++) {
            g.beginPath(); g.moveTo(0, (i * h) / 4); g.lineTo(w, (i * h) / 4); g.stroke();
        }
        for (let i = 0; i < 400; i++) {
            g.fillStyle = `rgba(0,0,0,${rnd(0.1, 0.4)})`;
            g.fillRect(rnd(0, w), rnd(0, h), 2, 2);
        }
    }, [2, 40]);
}

function shutterTexture() {
    return canvasTex(64, 128, (g, w, h) => {
        g.fillStyle = "#4a4446";
        g.fillRect(0, 0, w, h);
        for (let y = 0; y < h; y += 6) {
            g.fillStyle = "rgba(0,0,0,0.45)";
            g.fillRect(0, y, w, 2);
        }
        for (let i = 0; i < 4; i++) { // граффити-пятна
            g.fillStyle = `hsla(${rnd(0, 360)},60%,40%,0.5)`;
            g.fillRect(rnd(0, w), rnd(h * 0.5, h), rnd(8, 24), rnd(4, 14));
        }
    });
}

function neonTexture() {
    return canvasTex(256, 64, (g, w, h) => {
        g.font = "bold 40px Arial Black, Arial, sans-serif";
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.shadowColor = "#ff2040";
        g.shadowBlur = 18;
        g.fillStyle = "#ff8090";
        g.fillText(pick(["ОБМЕН 24/7", "P2P", "USDT", "КРИПТА"]), w / 2, h / 2);
    });
}

function usdtTexture(label, bg, fg) {
    return canvasTex(128, 128, (g) => {
        g.fillStyle = bg;
        g.beginPath(); g.arc(64, 64, 62, 0, Math.PI * 2); g.fill();
        g.strokeStyle = "rgba(255,255,255,0.6)";
        g.lineWidth = 6;
        g.beginPath(); g.arc(64, 64, 52, 0, Math.PI * 2); g.stroke();
        g.fillStyle = fg;
        g.font = `bold ${label.length > 1 ? 54 : 78}px Arial Black, Arial, sans-serif`;
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText(label, 64, 70);
    });
}

function signTexture(text) {
    return canvasTex(256, 64, (g, w, h) => {
        for (let i = 0; i < 8; i++) {
            g.fillStyle = i % 2 ? "#f2f2f2" : "#d0121b";
            g.beginPath();
            g.moveTo(i * 36 - 20, h); g.lineTo(i * 36 + 12, 0); g.lineTo(i * 36 + 48, 0); g.lineTo(i * 36 + 16, h);
            g.fill();
        }
        g.fillStyle = "rgba(0,0,0,0.75)";
        g.fillRect(w * 0.18, 8, w * 0.64, h - 16);
        g.fillStyle = "#ff3b3b";
        g.font = "bold 34px Arial Black, Arial, sans-serif";
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText(text, w / 2, h / 2 + 2);
    });
}

export class World {
    constructor(scene, laneWidth) {
        this.scene = scene;
        this.lanes = [-laneWidth, 0, laneWidth];
        this.obstacles = [];
        this.coins = [];
        this.scenery = [];   // всё, что едет и переставляется в конец улицы
        this.roadOffset = 0;

        this.buildMaterials();
        this.buildStreet();
        this.buildRain();
        this.buildSplash();
    }

    buildMaterials() {
        this.facades = [0, 1, 2].map((i) => facadeTextures(i));
        this.mat = {
            dumpster: new THREE.MeshStandardMaterial({ color: 0x2d3a30, roughness: 0.5, metalness: 0.6 }),
            dumpsterLid: new THREE.MeshStandardMaterial({ color: 0x1d2620, roughness: 0.4, metalness: 0.7 }),
            post: new THREE.MeshStandardMaterial({ color: 0x777777, roughness: 0.4, metalness: 0.8 }),
            sign: new THREE.MeshStandardMaterial({ map: signTexture("БЛОК"), roughness: 0.5, emissive: 0x330000 }),
            rail: new THREE.MeshStandardMaterial({ color: 0x8c9096, roughness: 0.35, metalness: 0.85 }),
            shutter: new THREE.MeshStandardMaterial({ map: shutterTexture(), roughness: 0.6, metalness: 0.4 }),
            ac: new THREE.MeshStandardMaterial({ color: 0xb8b2aa, roughness: 0.6 }),
            neon: new THREE.MeshBasicMaterial({ map: neonTexture(), transparent: true }),
            car: [0x5a1d1d, 0x2b2f3a, 0x8b8a83, 0x1f3326].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.25, metalness: 0.7 })),
            glass: new THREE.MeshStandardMaterial({ color: 0x0b0d12, roughness: 0.05, metalness: 0.9 }),
            tire: new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.9 }),
            headlight: new THREE.MeshBasicMaterial({ color: 0xfff1c0 }),
            taillight: new THREE.MeshBasicMaterial({ color: 0xff2020 }),
            coin: new THREE.MeshStandardMaterial({ map: usdtTexture("₮", "#26a17b", "#fff"), metalness: 0.4, roughness: 0.35, emissive: 0x0a3a2a }),
            coinEdge: new THREE.MeshStandardMaterial({ color: 0x1d7a5d, metalness: 0.8, roughness: 0.3 }),
            boost: new THREE.MeshStandardMaterial({ map: usdtTexture("×2", "#e9b730", "#3a2500"), metalness: 0.6, roughness: 0.3, emissive: 0x4a3000 }),
            boostEdge: new THREE.MeshStandardMaterial({ color: 0xb8860b, metalness: 0.9, roughness: 0.2 }),
            trash: new THREE.MeshStandardMaterial({ color: 0x0c0c0e, roughness: 0.3, metalness: 0.2 }),
            lamp: new THREE.MeshBasicMaterial({ color: 0xff2a2a }),
            door: new THREE.MeshStandardMaterial({ color: 0x4a1515, roughness: 0.6 }),
            puddle: new THREE.MeshBasicMaterial({ color: 0x6a0f18, transparent: true, opacity: 0.55, depthWrite: false }),
        };
        this.geo = {
            coin: new THREE.CylinderGeometry(0.32, 0.32, 0.07, 24),
        };
    }

    // ---- статичное окружение -------------------------------------------------------------

    buildStreet() {
        const s = this.scene;

        // мокрая дорога: низкая шероховатость → красные блики фонарей
        this.roadTex = roadTexture();
        const road = new THREE.Mesh(
            new THREE.PlaneGeometry(6, STREET_LEN),
            new THREE.MeshStandardMaterial({ map: this.roadTex, roughness: 0.22, metalness: 0.55 })
        );
        road.rotation.x = -Math.PI / 2;
        road.position.z = -STREET_LEN / 2 + 45;
        s.add(road);

        this.walkTex = sidewalkTexture();
        for (const side of [-1, 1]) {
            const walk = new THREE.Mesh(
                new THREE.BoxGeometry(4, 0.18, STREET_LEN),
                new THREE.MeshStandardMaterial({ map: this.walkTex, roughness: 0.5, metalness: 0.3 })
            );
            walk.position.set(side * 5, 0.09, -STREET_LEN / 2 + 45);
            s.add(walk);
            const curb = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.22, STREET_LEN), new THREE.MeshStandardMaterial({ color: 0x4a3a3a, roughness: 0.6 }));
            curb.position.set(side * 3.05, 0.11, -STREET_LEN / 2 + 45);
            s.add(curb);
        }

        // красное зарево в конце улицы
        const glow = new THREE.Mesh(
            new THREE.PlaneGeometry(80, 40),
            new THREE.MeshBasicMaterial({
                map: canvasTex(256, 128, (g, w, h) => {
                    const grad = g.createRadialGradient(w / 2, h * 0.7, 4, w / 2, h * 0.7, w * 0.6);
                    grad.addColorStop(0, "rgba(255,70,60,1)");
                    grad.addColorStop(0.25, "rgba(160,20,30,0.8)");
                    grad.addColorStop(1, "rgba(40,4,8,0)");
                    g.fillStyle = grad;
                    g.fillRect(0, 0, w, h);
                }),
                transparent: true, fog: false, depthWrite: false,
            })
        );
        glow.position.set(0, 10, -140);
        s.add(glow);

        // панельки по обе стороны, переставляются по кругу
        const slot = 16;
        for (const side of [-1, 1]) {
            for (let i = 0; i < STREET_LEN / slot; i++) {
                this.scenery.push(this.makeBuilding(side, 40 - i * slot, slot));
            }
        }

        // фонари у подъездов: настоящих источников света немного (дорого), остальное — свечение
        this.lights = [];
        for (let i = 0; i < 4; i++) {
            const light = new THREE.PointLight(0xff2a1a, 3.5, 12, 1.6);
            const side = i % 2 ? 1 : -1;
            light.position.set(side * 5.5, 2.6, -i * 22);
            light.userData = { loop: 88 };
            s.add(light);
            this.lights.push(light);
        }

        // мусор, пакеты, лужи на обочинах
        for (let i = 0; i < 30; i++) {
            const bag = new THREE.Mesh(new THREE.SphereGeometry(rnd(0.2, 0.4), 8, 6), this.mat.trash);
            bag.scale.y = 0.7;
            bag.position.set(pick([-1, 1]) * rnd(3.4, 6.5), 0.25, -rnd(0, STREET_LEN - 20));
            bag.userData.loop = STREET_LEN - 20;
            s.add(bag);
            this.scenery.push(bag);
        }
        for (let i = 0; i < 14; i++) {
            const p = new THREE.Mesh(new THREE.CircleGeometry(1, 24), this.mat.puddle);
            p.rotation.x = -Math.PI / 2;
            p.scale.set(rnd(0.5, 1.4), rnd(0.8, 2.2), 1);
            p.position.set(rnd(-2.6, 2.6), 0.012, -rnd(0, STREET_LEN - 20));
            p.userData.loop = STREET_LEN - 20;
            s.add(p);
            this.scenery.push(p);
        }
    }

    makeBuilding(side, z, slot) {
        const g = new THREE.Group();
        const h = rnd(14, 22);
        const tex = pick(this.facades);
        const mat = new THREE.MeshStandardMaterial({
            map: tex.map, emissiveMap: tex.glow, emissive: 0xffffff, emissiveIntensity: 0.9, roughness: 0.9,
        });
        mat.map = tex.map.clone();
        mat.map.needsUpdate = true;
        mat.map.wrapS = mat.map.wrapT = THREE.RepeatWrapping;
        mat.map.repeat.set(2, h / 9);
        mat.emissiveMap = tex.glow.clone();
        mat.emissiveMap.needsUpdate = true;
        mat.emissiveMap.wrapS = mat.emissiveMap.wrapT = THREE.RepeatWrapping;
        mat.emissiveMap.repeat.copy(mat.map.repeat);
        const block = new THREE.Mesh(new THREE.BoxGeometry(6, h, slot - 1.5), mat);
        block.position.y = h / 2;
        g.add(block);

        // подъезд: козырёк, дверь, красная лампа
        const door = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2, 1.2), this.mat.door);
        door.position.set(-side * 3.02, 1, 0);
        const canopy = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.1, 1.8), this.mat.dumpsterLid);
        canopy.position.set(-side * 3.4, 2.3, 0);
        const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), this.mat.lamp);
        lamp.position.set(-side * 3.15, 2.1, 0);
        const step = new THREE.Mesh(new THREE.BoxGeometry(1, 0.3, 1.8), this.mat.post);
        step.position.set(-side * 3.4, 0.15, 0);
        g.add(door, canopy, lamp, step);

        // рольставни магазинов на первом этаже, кондиционеры, иногда неон
        for (const dz of [-4.2, 4.2]) {
            if (Math.random() < 0.3) continue;
            const sh = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.2, 2.6), this.mat.shutter);
            sh.position.set(-side * 3.02, 1.1, dz + rnd(-0.4, 0.4));
            g.add(sh);
        }
        for (let i = 0; i < 4; i++) {
            const ac = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.45, 0.7), this.mat.ac);
            ac.position.set(-side * 3.2, rnd(3.5, h - 2), rnd(-6, 6));
            g.add(ac);
        }
        if (Math.random() < 0.35) {
            const neon = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.6), this.mat.neon);
            neon.rotation.y = -side * Math.PI / 2;
            neon.position.set(-side * 3.05, 3.2, rnd(-3, 3));
            g.add(neon);
        }

        g.position.set(side * 10, 0, z);
        g.userData.loop = STREET_LEN;
        this.scene.add(g);
        return g;
    }

    buildRain() {
        const n = 700;
        const pos = new Float32Array(n * 6);
        this.rainSpeed = new Float32Array(n);
        for (let i = 0; i < n; i++) {
            const x = rnd(-9, 9), y = rnd(0, 14), z = rnd(-40, 6);
            pos.set([x, y, z, x + 0.03, y - 0.45, z + 0.12], i * 6);
            this.rainSpeed[i] = rnd(18, 26);
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
        this.rain = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xff9a9a, transparent: true, opacity: 0.35 }));
        this.scene.add(this.rain);
    }

    // брызги из луж: пул мелких капель
    buildSplash() {
        this.drops = [];
        const geo = new THREE.SphereGeometry(0.045, 5, 4);
        const mat = new THREE.MeshBasicMaterial({ color: 0xffd8d8, transparent: true, opacity: 0.8 });
        for (let i = 0; i < 80; i++) {
            const d = new THREE.Mesh(geo, mat);
            d.visible = false;
            d.userData.v = new THREE.Vector3();
            this.scene.add(d);
            this.drops.push(d);
        }
        this.nextDrop = 0;
    }

    splash(x, z, n = 14, power = 1) {
        for (let i = 0; i < n; i++) {
            const d = this.drops[this.nextDrop];
            this.nextDrop = (this.nextDrop + 1) % this.drops.length;
            d.visible = true;
            d.position.set(x + rnd(-0.3, 0.3), 0.05, z + rnd(-0.2, 0.3));
            d.userData.v.set(rnd(-2, 2) * power, rnd(2, 4.5) * power, rnd(0, 2));
        }
    }

    // ---- препятствия -----------------------------------------------------------------------

    makeDumpster() {
        const g = new THREE.Group();
        const box = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.0, 1.0), this.mat.dumpster);
        box.position.y = 0.55;
        const lid = new THREE.Mesh(new THREE.BoxGeometry(1.36, 0.08, 1.06), this.mat.dumpsterLid);
        lid.position.set(0, 1.08, 0.08);
        lid.rotation.x = -0.12;
        const rim = new THREE.Mesh(new THREE.BoxGeometry(1.36, 0.1, 0.08), this.mat.dumpsterLid);
        rim.position.set(0, 0.85, 0.52);
        g.add(box, lid, rim);
        for (const x of [-0.5, 0.5]) {
            const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.05, 8), this.mat.tire);
            wheel.rotation.z = Math.PI / 2;
            wheel.position.set(x, 0.06, 0.4);
            g.add(wheel);
        }
        g.userData = { type: "dumpster", halfZ: 0.55, top: 1.12 };
        return g;
    }

    // металлический отбойник поперёк полосы с табличкой «БЛОК» — только подкатом
    makeBarrier() {
        const g = new THREE.Group();
        for (const x of [-0.72, 0.72]) {
            const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.3, 0.1), this.mat.post);
            post.position.set(x, 0.65, 0.05);
            g.add(post);
        }
        const rail = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.34, 0.12), this.mat.rail);
        rail.position.y = 1.05;
        const lip = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.05, 0.2), this.mat.rail);
        lip.position.y = 1.2;
        const sign = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.22, 0.03), [
            this.mat.post, this.mat.post, this.mat.post, this.mat.post, this.mat.sign, this.mat.sign,
        ]);
        sign.position.set(0, 1.05, 0.075);
        g.add(rail, lip, sign);
        g.userData = { type: "barrier", halfZ: 0.3 };
        return g;
    }

    makeCar() {
        const g = new THREE.Group();
        const paint = pick(this.mat.car);
        const body = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.6, 3.4), paint);
        body.position.y = 0.55;
        const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.5, 1.7), this.mat.glass);
        cabin.position.set(0, 1.08, 0.1);
        const roof = new THREE.Mesh(new THREE.BoxGeometry(1.32, 0.06, 1.5), paint);
        roof.position.set(0, 1.35, 0.1);
        g.add(body, cabin, roof);
        for (const x of [-0.7, 0.7]) for (const z of [-1.1, 1.1]) {
            const w = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.2, 12), this.mat.tire);
            w.rotation.z = Math.PI / 2;
            w.position.set(x, 0.28, z);
            g.add(w);
        }
        // фары смотрят на крыса (машина едет навстречу)
        for (const x of [-0.5, 0.5]) {
            const hl = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.14, 0.04), this.mat.headlight);
            hl.position.set(x, 0.62, 1.71);
            g.add(hl);
        }
        g.userData = { type: "car", halfZ: 1.75, oncoming: 6 };
        return g;
    }

    // ---- монеты ------------------------------------------------------------------------------

    makeCoin(boost = false) {
        const m = boost ? [this.mat.boostEdge, this.mat.boost, this.mat.boost] : [this.mat.coinEdge, this.mat.coin, this.mat.coin];
        const coin = new THREE.Mesh(this.geo.coin, m);
        coin.rotation.x = Math.PI / 2;
        if (boost) coin.scale.setScalar(1.3);
        coin.userData = { boost };
        return coin;
    }

    addCoin(lane, z, y = 0.7, boost = false) {
        const c = this.makeCoin(boost);
        c.position.set(this.lanes[lane], y, z);
        c.userData.baseY = y;
        this.scene.add(c);
        this.coins.push(c);
    }

    addObstacle(kind, lane, z) {
        const o = kind === "dumpster" ? this.makeDumpster() : kind === "barrier" ? this.makeBarrier() : this.makeCar();
        o.position.set(this.lanes[lane], 0, z);
        o.userData.lane = lane;
        this.scene.add(o);
        this.obstacles.push(o);
        return o;
    }

    // Ряд препятствий: всегда остаётся хотя бы одна проходимая полоса.
    spawnRow(z, difficulty) {
        const free = Math.floor(Math.random() * 3);
        const blocked = [0, 1, 2].filter((l) => l !== free && Math.random() < 0.35 + difficulty * 0.45);
        if (!blocked.length) blocked.push((free + 1 + Math.floor(Math.random() * 2)) % 3);

        for (const lane of blocked) {
            const r = Math.random();
            const kind = r < 0.45 ? "dumpster" : r < 0.75 ? "barrier" : "car";
            this.addObstacle(kind, lane, z);
            if (kind === "dumpster" && Math.random() < 0.5) {
                // дуга монет над баком — награда за прыжок
                for (let i = -2; i <= 2; i++) this.addCoin(lane, z + i * 1.1, 1.9 - Math.abs(i) * 0.3);
            }
        }

        // дорожка монет по свободной полосе
        if (Math.random() < 0.75) {
            const n = 4 + Math.floor(Math.random() * 4);
            const boostAt = Math.random() < 0.12 ? Math.floor(n / 2) : -1;
            for (let i = 0; i < n; i++) this.addCoin(free, z + 4 + i * 1.6, 0.7, i === boostAt);
        }
    }

    clear() {
        for (const o of this.obstacles) this.scene.remove(o);
        for (const c of this.coins) this.scene.remove(c);
        this.obstacles = [];
        this.coins = [];
    }

    removeCoin(i) {
        this.scene.remove(this.coins[i]);
        this.coins.splice(i, 1);
    }

    // ---- кадр --------------------------------------------------------------------------------

    update(dt, move, t) {
        // дорога и тротуары «едут» через сдвиг текстуры
        this.roadTex.offset.y += move / (STREET_LEN / 6);
        this.walkTex.offset.y += move / (STREET_LEN / 40);

        for (const o of this.scenery) {
            o.position.z += move;
            if (o.position.z > BEHIND_Z) o.position.z -= o.userData.loop;
        }
        for (const l of this.lights) {
            l.position.z += move;
            if (l.position.z > DESPAWN_Z) l.position.z -= l.userData.loop;
        }

        for (let i = this.obstacles.length - 1; i >= 0; i--) {
            const o = this.obstacles[i];
            o.position.z += move + (o.userData.oncoming || 0) * dt;
            if (o.position.z > DESPAWN_Z) {
                this.scene.remove(o);
                this.obstacles.splice(i, 1);
            }
        }
        for (let i = this.coins.length - 1; i >= 0; i--) {
            const c = this.coins[i];
            c.position.z += move;
            c.rotation.z = t * 3;
            c.position.y = c.userData.baseY + Math.sin(t * 4 + c.position.z) * 0.06;
            if (c.position.z > DESPAWN_Z) this.removeCoin(i);
        }

        for (const d of this.drops) {
            if (!d.visible) continue;
            const v = d.userData.v;
            v.y -= 14 * dt;
            d.position.x += v.x * dt;
            d.position.y += v.y * dt;
            d.position.z += v.z * dt + move;
            if (d.position.y < 0) d.visible = false;
        }

        // дождь
        const pos = this.rain.geometry.attributes.position.array;
        for (let i = 0; i < this.rainSpeed.length; i++) {
            const k = i * 6;
            const dy = this.rainSpeed[i] * dt;
            pos[k + 1] -= dy; pos[k + 4] -= dy;
            pos[k + 2] += move; pos[k + 5] += move;
            if (pos[k + 1] < 0 || pos[k + 2] > 8) {
                const x = rnd(-9, 9), y = rnd(10, 14), z = rnd(-40, 4);
                pos.set([x, y, z, x + 0.03, y - 0.45, z + 0.12], k);
            }
        }
        this.rain.geometry.attributes.position.needsUpdate = true;
    }
}

export { SPAWN_Z };
