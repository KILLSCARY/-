import * as THREE from "./vendor/three.module.js";

// Мир-шар, как в Subway Surfers: при отрисовке всё дальше CURVE.near опускается по квадрату расстояния.
// Координаты игры те же: столкновения, полосы и тени считаются по плоской улице. Длинные плоскости (дорога, тротуары)
// должны быть разбиты на сегменты: гнутся только вершины.
export const CURVE = { strength: 0.0024, side: 0.0011, sideLen: 150, near: 6, fade: 2.2 }; // fade — за сколько секунд мир скругляется и выпрямляется
export const curveUniform = { value: 0 };
export const curveSide = { value: 0 }; // поворот улицы влево-вправо, как в Subway Surfers: меняется по ходу забега

const HEAD = `uniform float curveU, curveS;
void curveBend(inout vec4 mv) { float d = max(0.0, -mv.z - ${CURVE.near.toFixed(1)}); d *= d; mv.y -= curveU * d; mv.x += curveS * d; }
`;
const PROJECT = `vec4 mvPosition = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
    mvPosition = instanceMatrix * mvPosition;
#endif
mvPosition = modelViewMatrix * mvPosition;
curveBend(mvPosition);
gl_Position = projectionMatrix * mvPosition;`;

// У материала со своим onBeforeCompile вызывать вручную. Своим шейдерам: curveBend(mv)
export function curveShader(shader) {
    shader.uniforms.curveU = curveUniform;
    shader.uniforms.curveS = curveSide;
    const v = shader.vertexShader;
    shader.vertexShader = HEAD + (v.includes("#include <project_vertex>") ? v.replace("#include <project_vertex>", PROJECT)
        : v.replace("gl_Position = projectionMatrix * mvPosition;", "curveBend(mvPosition);\n\tgl_Position = projectionMatrix * mvPosition;")); // спрайты
}

// Мультяшный вид прямо в шейдере материала, поэтому работает и на телефоне, где нет постобработки:
// свет ступенями, слабые блики, сочный цвет и тёмная кромка по контуру (без лишних проходов и геометрии)
export const TOON = { bands: 2.2, min: 0.45, spec: 0.35, sat: 1.25, rim: 0.55 };
// персонажи (модели со скелетом): свой цвет шкуры и одежды не перекрашиваем и не затемняем — только лёгкая кромка, тёплый свет приглушён
const TOON_SKIN = { min: 0.8, sat: 1.0, rim: 0.2, neutral: 0.55 };
// Телефон: простой рассеянный свет вместо полного расчёта бликов на каждый источник (GGX): в мульте блики и так слабые,
// а чип считает их на каждом пикселе. ?fulllight в адресе — полный расчёт, для сравнения
const CHEAP_LIGHT = /Android|iPhone|iPad|iPod/i.test(globalThis.navigator?.userAgent || "") && !/[?&]fulllight/.test(globalThis.location?.search || "");
const CHEAP_DIRECT = `
void RE_Direct_Toon(const in IncidentLight directLight, const in GeometricContext geometry, const in PhysicalMaterial material, inout ReflectedLight reflectedLight) {
    reflectedLight.directDiffuse += saturate(dot(geometry.normal, directLight.direction)) * directLight.color * BRDF_Lambert(material.diffuseColor);
}
#undef RE_Direct
#define RE_Direct RE_Direct_Toon
`;

// В фрагментном шейдере USE_SKINNING не определён, поэтому признак персонажа передаём из вершинного
function toonShader(shader) {
    if (!shader.fragmentShader.includes("#include <lights_fragment_end>")) return;
    const n = (v) => v.toFixed(2);
    if (CHEAP_LIGHT && shader.fragmentShader.includes("#include <lights_physical_pars_fragment>"))
        shader.fragmentShader = shader.fragmentShader.replace("#include <lights_physical_pars_fragment>", "#include <lights_physical_pars_fragment>\n" + CHEAP_DIRECT);
    shader.vertexShader = "varying float vToonSkin;\n" + shader.vertexShader.replace("#include <begin_vertex>", `#include <begin_vertex>
    #ifdef USE_SKINNING
    vToonSkin = 1.0;
    #else
    vToonSkin = 0.0;
    #endif`);
    shader.fragmentShader = "varying float vToonSkin;\n" + shader.fragmentShader.replace("#include <lights_fragment_end>", `#include <lights_fragment_end>
    {
        vec3 w = vec3(0.3, 0.59, 0.11);
        float a = max(dot(diffuseColor.rgb, w), 0.02);
        float L = dot(reflectedLight.directDiffuse + reflectedLight.indirectDiffuse, w) / a * 3.14159;
        float x = L * ${n(TOON.bands)}, f = fract(x), q = (floor(x) + smoothstep(0.42, 0.58, f)) / ${n(TOON.bands)};
        float k = clamp(q, mix(${n(TOON.min)}, ${n(TOON_SKIN.min)}, vToonSkin), ${n(TOON.bands)}) / max(L, 0.001);
        k = mix(1.0, k, smoothstep(0.02, 0.15, L));
        reflectedLight.directDiffuse *= k;
        reflectedLight.indirectDiffuse *= k;
        reflectedLight.directSpecular *= ${n(TOON.spec)};
        // персонаж: убираем часть цвета заката, кожа и шерсть остаются своего цвета
        float lg = dot(reflectedLight.directDiffuse + reflectedLight.indirectDiffuse, w) / a;
        float toNeutral = vToonSkin * ${n(TOON_SKIN.neutral)};
        reflectedLight.directDiffuse = mix(reflectedLight.directDiffuse, diffuseColor.rgb * lg * 0.6, toNeutral);
        reflectedLight.indirectDiffuse = mix(reflectedLight.indirectDiffuse, diffuseColor.rgb * lg * 0.4, toNeutral);
    }`).replace("#include <opaque_fragment>", TOON_END).replace("#include <output_fragment>", TOON_END);
}
const TOON_END = `{
        float g = dot(outgoingLight, vec3(0.3, 0.59, 0.11));
        float e = abs(dot(normalize(normal), normalize(vViewPosition)));
        outgoingLight = mix(vec3(g), outgoingLight, mix(${TOON.sat.toFixed(2)}, ${TOON_SKIN.sat.toFixed(2)}, vToonSkin));
        outgoingLight *= 1.0 - mix(${TOON.rim.toFixed(2)}, ${TOON_SKIN.rim.toFixed(2)}, vToonSkin) * (1.0 - smoothstep(0.1, 0.32, e));
    }
    #include <output_fragment>`;

// На все материалы сразу. Проход теней не гнём: тени считаются в плоском мире
THREE.Material.prototype.onBeforeCompile = function (shader) {
    if (this.isMeshDepthMaterial || this.isMeshDistanceMaterial || this.isRawShaderMaterial) return;
    curveShader(shader);
    toonShader(shader);
};
