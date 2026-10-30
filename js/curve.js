import * as THREE from "./vendor/three.module.js";

// Мир-шар, как в Subway Surfers: при отрисовке всё дальше CURVE.near опускается по квадрату расстояния.
// Координаты игры те же: столкновения, полосы и тени считаются по плоской улице. Длинные плоскости (дорога, тротуары)
// должны быть разбиты на сегменты: гнутся только вершины.
export const CURVE = { strength: 0.0024, side: 0.0011, sideLen: 150, near: 6 };
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

// На все материалы сразу. Проход теней не гнём: тени считаются в плоском мире
THREE.Material.prototype.onBeforeCompile = function (shader) {
    if (this.isMeshDepthMaterial || this.isMeshDistanceMaterial || this.isRawShaderMaterial) return;
    curveShader(shader);
};
