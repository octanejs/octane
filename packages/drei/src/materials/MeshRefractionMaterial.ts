import * as THREE from 'three';
import { MeshBVHUniformStruct, shaderIntersectFunction, shaderStructs } from 'three-mesh-bvh';
import { shaderMaterial } from '../core/shaderMaterial.js';

export const MeshRefractionMaterialImpl = shaderMaterial(
	{
		envMap: null,
		bounces: 3,
		ior: 2.4,
		correctMips: true,
		aberrationStrength: 0.01,
		fresnel: 0,
		bvh: new MeshBVHUniformStruct(),
		color: new THREE.Color('white'),
		opacity: 1,
		resolution: new THREE.Vector2(),
		viewMatrixInverse: new THREE.Matrix4(),
		projectionMatrixInverse: new THREE.Matrix4(),
	},
	`uniform mat4 viewMatrixInverse;
varying vec3 vWorldPosition;
varying vec3 vNormal;
varying mat4 vModelMatrixInverse;
#include <color_pars_vertex>
void main() {
  #include <color_vertex>
  vec4 transformedNormal = vec4(normal, 0.0);
  vec4 transformedPosition = vec4(position, 1.0);
  #ifdef USE_INSTANCING
    transformedNormal = instanceMatrix * transformedNormal;
    transformedPosition = instanceMatrix * transformedPosition;
    vModelMatrixInverse = inverse(modelMatrix * instanceMatrix);
  #else
    vModelMatrixInverse = inverse(modelMatrix);
  #endif
  vWorldPosition = (modelMatrix * transformedPosition).xyz;
  vNormal = normalize((viewMatrixInverse * vec4(normalMatrix * transformedNormal.xyz, 0.0)).xyz);
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * transformedPosition;
}`,
	`#define ENVMAP_TYPE_CUBE_UV
precision highp isampler2D;
precision highp usampler2D;
varying vec3 vWorldPosition;
varying vec3 vNormal;
varying mat4 vModelMatrixInverse;
#include <color_pars_fragment>
#ifdef ENVMAP_TYPE_CUBEM
  uniform samplerCube envMap;
#else
  uniform sampler2D envMap;
#endif
uniform float bounces;
${shaderStructs}
${shaderIntersectFunction}
uniform BVH bvh;
uniform float ior;
uniform bool correctMips;
uniform vec2 resolution;
uniform float fresnel;
uniform mat4 modelMatrix;
uniform mat4 projectionMatrixInverse;
uniform mat4 viewMatrixInverse;
uniform float aberrationStrength;
uniform vec3 color;
uniform float opacity;
float fresnelFunc(vec3 viewDirection, vec3 worldNormal) {
  return pow(1.0 + dot(viewDirection, worldNormal), 10.0);
}
vec3 totalInternalReflection(vec3 ro, vec3 rd, vec3 normal, float ior, mat4 modelMatrixInverse) {
  vec3 rayOrigin = ro;
  vec3 rayDirection = refract(rd, normal, 1.0 / ior);
  rayOrigin = vWorldPosition + rayDirection * 0.001;
  rayOrigin = (modelMatrixInverse * vec4(rayOrigin, 1.0)).xyz;
  rayDirection = normalize((modelMatrixInverse * vec4(rayDirection, 0.0)).xyz);
  for(float i = 0.0; i < bounces; i++) {
    uvec4 faceIndices = uvec4(0u);
    vec3 faceNormal = vec3(0.0, 0.0, 1.0);
    vec3 barycoord = vec3(0.0);
    float side = 1.0;
    float dist = 0.0;
    bvhIntersectFirstHit(bvh, rayOrigin, rayDirection, faceIndices, faceNormal, barycoord, side, dist);
    vec3 hitPos = rayOrigin + rayDirection * max(dist - 0.001, 0.0);
    vec3 tempDir = refract(rayDirection, faceNormal, ior);
    if (length(tempDir) != 0.0) { rayDirection = tempDir; break; }
    rayDirection = reflect(rayDirection, faceNormal);
    rayOrigin = hitPos + rayDirection * 0.01;
  }
  return normalize((modelMatrix * vec4(rayDirection, 0.0)).xyz);
}
#include <common>
#include <cube_uv_reflection_fragment>
#ifdef ENVMAP_TYPE_CUBEM
vec4 textureGradient(samplerCube envMap, vec3 rayDirection, vec3 directionCamPerfect) {
  return textureGrad(envMap, rayDirection, dFdx(correctMips ? directionCamPerfect : rayDirection), dFdy(correctMips ? directionCamPerfect : rayDirection));
}
#else
vec4 textureGradient(sampler2D envMap, vec3 rayDirection, vec3 directionCamPerfect) {
  vec2 uvv = equirectUv(rayDirection);
  vec2 smoothUv = equirectUv(directionCamPerfect);
  return textureGrad(envMap, uvv, dFdx(correctMips ? smoothUv : uvv), dFdy(correctMips ? smoothUv : uvv));
}
#endif
void main() {
  vec2 uv = gl_FragCoord.xy / resolution;
  vec3 directionCamPerfect = (projectionMatrixInverse * vec4(uv * 2.0 - 1.0, 0.0, 1.0)).xyz;
  directionCamPerfect = normalize((viewMatrixInverse * vec4(directionCamPerfect, 0.0)).xyz);
  vec3 normal = vNormal;
  vec3 rayOrigin = cameraPosition;
  vec3 rayDirection = normalize(vWorldPosition - cameraPosition);
  vec4 diffuseColor = vec4(color, opacity);
  #include <color_fragment>
  #ifdef CHROMATIC_ABERRATIONS
    vec3 rayDirectionG = totalInternalReflection(rayOrigin, rayDirection, normal, max(ior, 1.0), vModelMatrixInverse);
    #ifdef FAST_CHROMA
      vec3 rayDirectionR = normalize(rayDirectionG + vec3(aberrationStrength / 2.0));
      vec3 rayDirectionB = normalize(rayDirectionG - vec3(aberrationStrength / 2.0));
    #else
      vec3 rayDirectionR = totalInternalReflection(rayOrigin, rayDirection, normal, max(ior * (1.0 - aberrationStrength), 1.0), vModelMatrixInverse);
      vec3 rayDirectionB = totalInternalReflection(rayOrigin, rayDirection, normal, max(ior * (1.0 + aberrationStrength), 1.0), vModelMatrixInverse);
    #endif
    diffuseColor.rgb *= vec3(textureGradient(envMap, rayDirectionR, directionCamPerfect).r, textureGradient(envMap, rayDirectionG, directionCamPerfect).g, textureGradient(envMap, rayDirectionB, directionCamPerfect).b);
  #else
    rayDirection = totalInternalReflection(rayOrigin, rayDirection, normal, max(ior, 1.0), vModelMatrixInverse);
    diffuseColor.rgb *= textureGradient(envMap, rayDirection, directionCamPerfect).rgb;
  #endif
  float nFresnel = fresnelFunc(normalize(vWorldPosition - cameraPosition), normal) * fresnel;
  gl_FragColor = vec4(mix(diffuseColor.rgb, vec3(1.0), nFresnel), diffuseColor.a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`,
);
