import type { Group } from 'three';
import { Fbx, Gltf, type GltfProps, useFBX, useGLTF } from '../src/index.js';

const gltf = useGLTF('/model.glb');
const gltfs = useGLTF(['/a.glb', '/b.glb']);
const scene = gltf.scene;
const node = gltf.nodes.Model;
const firstScene = gltfs[0].scene;
const fbx: Group = useFBX('/model.fbx');

const gltfProps: GltfProps = {
	src: '/model.glb',
	useDraco: '/draco/',
	useMeshOpt: false,
	deep: true,
};
const gltfCall: Parameters<typeof Gltf>[0] = { ...gltfProps, ref: { current: null } };
const fbxCall: Parameters<typeof Fbx>[0] = {
	path: '/model.fbx',
	castShadow: true,
	ref: { current: null },
};

useGLTF.preload('/model.glb', false, false);
useGLTF.clear('/model.glb');
useGLTF.setDecoderPath('/draco/');
useFBX.preload('/model.fbx');
useFBX.clear('/model.fbx');
void [scene, node, firstScene, fbx, gltfCall, fbxCall];

// @ts-expect-error Gltf requires a string source.
const invalidGltf: GltfProps = { src: 42 };
// @ts-expect-error Fbx requires a string path.
const invalidFbx: Parameters<typeof Fbx>[0] = { path: false };
void [invalidGltf, invalidFbx];
