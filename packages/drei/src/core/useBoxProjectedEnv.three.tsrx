import { applyProps, type Vector3 as Vector3Prop } from '@octanejs/three';
import { useLayoutEffect, useMemo, useRef, useState } from '@octanejs/three/renderer';
import * as THREE from 'three';
import { slotDefault } from './compiler-slot.js';

const worldposReplace = /* glsl */ `
#if defined( USE_ENVMAP ) || defined( DISTANCE ) || defined ( USE_SHADOWMAP )
  vec4 worldPosition = modelMatrix * vec4( transformed, 1.0 );
  #ifdef BOX_PROJECTED_ENV_MAP
    vWorldPosition = worldPosition.xyz;
  #endif
#endif
`;

const boxProjectDefinitions = /* glsl */ `
#ifdef BOX_PROJECTED_ENV_MAP
  uniform vec3 envMapSize;
  uniform vec3 envMapPosition;
  varying vec3 vWorldPosition;
    
  vec3 parallaxCorrectNormal( vec3 v, vec3 cubeSize, vec3 cubePos ) {
    vec3 nDir = normalize( v );
    vec3 rbmax = ( .5 * cubeSize + cubePos - vWorldPosition ) / nDir;
    vec3 rbmin = ( -.5 * cubeSize + cubePos - vWorldPosition ) / nDir;
    vec3 rbminmax;
    rbminmax.x = ( nDir.x > 0. ) ? rbmax.x : rbmin.x;
    rbminmax.y = ( nDir.y > 0. ) ? rbmax.y : rbmin.y;
    rbminmax.z = ( nDir.z > 0. ) ? rbmax.z : rbmin.z;
    float correction = min( min( rbminmax.x, rbminmax.y ), rbminmax.z );
    vec3 boxIntersection = vWorldPosition + nDir * correction;    
    return boxIntersection - cubePos;
  }
#endif
`;

const getIBLIrradiancePatch = /* glsl */ `
#ifdef BOX_PROJECTED_ENV_MAP
  worldNormal = parallaxCorrectNormal( worldNormal, envMapSize, envMapPosition );
#endif
`;

const getIBLRadiancePatch = /* glsl */ `
#ifdef BOX_PROJECTED_ENV_MAP
  reflectVec = parallaxCorrectNormal( reflectVec, envMapSize, envMapPosition );
#endif
`;

interface MaterialShader {
	vertexShader: string;
	fragmentShader: string;
	defines: Record<string, string | number | boolean> | undefined;
	uniforms: Record<string, THREE.IUniform>;
}

function boxProjectedEnvMap(
	shader: MaterialShader,
	envMapPosition: THREE.Vector3,
	envMapSize: THREE.Vector3,
) {
	shader.defines!.BOX_PROJECTED_ENV_MAP = true;
	shader.uniforms.envMapPosition = { value: envMapPosition };
	shader.uniforms.envMapSize = { value: envMapSize };
	shader.vertexShader = `
  varying vec3 vWorldPosition;
  ${shader.vertexShader.replace(
		'#include <worldpos_vertex>',
		worldposReplace,
	)}`;
	shader.fragmentShader = `
    ${boxProjectDefinitions}
    ${shader.fragmentShader.replace(
		'#include <envmap_physical_pars_fragment>',
		THREE.ShaderChunk.envmap_physical_pars_fragment,
	).replace(
		'vec3 worldNormal = inverseTransformDirection( normal, viewMatrix );',
		`vec3 worldNormal = inverseTransformDirection( normal, viewMatrix );
         ${getIBLIrradiancePatch}
         `,
	).replace(
		'reflectVec = inverseTransformDirection( reflectVec, viewMatrix );',
		`reflectVec = inverseTransformDirection( reflectVec, viewMatrix );
         ${getIBLRadiancePatch}
        `,
	)}`;
}

export function useBoxProjectedEnv(
	position: Vector3Prop = new THREE.Vector3(),
	size: Vector3Prop = new THREE.Vector3(),
) {
	position = slotDefault(position, new THREE.Vector3());
	size = slotDefault(size, new THREE.Vector3());
	const [config] = useState(() => ({ position: new THREE.Vector3(), size: new THREE.Vector3() }));
	applyProps(config as any, { position, size });
	const ref = useRef<THREE.Material | null>(null);
	const spread = useMemo(
		() => ({
			ref,
			onBeforeCompile: (shader: MaterialShader) => boxProjectedEnvMap(
				shader,
				config.position,
				config.size,
			),
			customProgramCacheKey: () =>
				JSON.stringify(config.position.toArray()) + JSON.stringify(config.size.toArray()),
		}),
		[...config.position.toArray(), ...config.size.toArray()],
	);
	useLayoutEffect(() => {
		if (ref.current) ref.current.needsUpdate = true;
	}, [config]);
	return spread;
}
