import * as THREE from "./vendor/three.module.js";

// Мир-шар, как в Subway Surfers: при отрисовке всё дальше CURVE.near опускается по квадрату расстояния.
// Координаты игры те же: столкновения, полосы и тени считаются по плоской улице. Длинные плоскости (дорога, тротуары)
// должны быть разбиты на сегменты: гнутся только вершины.
export const CURVE = { strength: 0.0011, near: 8 };
export const curveUniform = { value: 0 };

const HEAD = `uniform float curveU;
float curveDrop(float z) { float d = max(0.0, -z - ${CURVE.near.toFixed(1)}); return curveU * d * d; }
`;
const PROJECT = `vec4 mvPosition = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
    mvPosition = instanceMatrix * mvPosition;
#endif
mvPosition = modelViewMatrix * mvPosition;
mvPosition.y -= curveDrop(mvPosition.z);
gl_Position = projectionMatrix * mvPosition;`;

// У материала со своим onBeforeCompile вызывать вручную. Своим шейдерам: mv.y -= curveDrop(mv.z)
export function curveShader(shader) {
    shader.uniforms.curveU = curveUniform;
    shader.vertexShader = HEAD + shader.vertexShader
        .replace("#include <project_vertex>", PROJECT)
        .replace("gl_Position = projectionMatrix * mvPosition;", "mvPosition.y -= curveDrop(mvPosition.z);\n\tgl_Position = projectionMatrix * mvPosition;"); // спрайты
}

// На все материалы сразу. Проход теней не гнём: тени считаются в плоском мире
THREE.Material.prototype.onBeforeCompile = function (shader) {
    if (this.isMeshDepthMaterial || this.isMeshDistanceMaterial || this.isRawShaderMaterial) return;
    curveShader(shader);
};
