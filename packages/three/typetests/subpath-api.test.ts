import * as publicApi from '@octanejs/three';
import * as coreApi from '@octanejs/three/core';
import * as rendererApi from '@octanejs/three/renderer';
import config, {
	renderers,
	threeRenderer,
	threeRendererBoundaries,
	threeRendererRegistry,
	threeRendererRules,
	threeRenderers,
	THREE_RENDERER_ID,
} from '@octanejs/three/config';
import testing, {
	create,
	createThreeTestRenderer,
	fireEvent,
	type CreateThreeTestRendererOptions,
	type FireEvent,
	type MockEventData,
	type MockSyntheticEvent,
	type TestingRenderer,
	type ThreeTestRenderer,
} from '@octanejs/three/testing';
import type { JSX as IntrinsicJSX } from '@octanejs/three/intrinsics';
import type { JSX as RuntimeJSX } from '@octanejs/three/intrinsics/jsx-runtime';
import * as THREE from 'three';

type IntrinsicMesh = IntrinsicJSX.IntrinsicElements['mesh'];
type RuntimeMesh = RuntimeJSX.IntrinsicElements['mesh'];
type RootMesh = publicApi.ThreeElements['mesh'];

const rootCreate: typeof publicApi.createRoot = coreApi.createRoot;
const rootState: publicApi.RootState | undefined = undefined;
const coreState: coreApi.RootState | undefined = rootState;
const rendererCreate: typeof rendererApi.createUniversalRoot = rendererApi.createUniversalRoot;
const configuredRenderer = threeRendererRegistry[THREE_RENDERER_ID];
const configAliases: readonly [typeof threeRenderers, typeof threeRenderers] = [config, renderers];
const testingAliases: readonly [typeof createThreeTestRenderer, typeof createThreeTestRenderer] = [
	create,
	testing.create,
];
const typedFireEvent: FireEvent = fireEvent;
const intrinsicMesh: IntrinsicMesh = { position: [1, 2, 3] };
const runtimeMesh: RuntimeMesh = intrinsicMesh;
const rootMesh: RootMesh = runtimeMesh;
const intrinsicMeshAgain: IntrinsicMesh = rootMesh;
// A keyed `@for` row places its key on the row's root, which may be a component.
const rowAttributes: IntrinsicJSX.IntrinsicAttributes = { key: 'row' };
// Composing an authored ref with a spread that carries none leaves an absent
// entry in the ref array; attachment skips it.
const composedRef: publicApi.ThreeRef<THREE.Group> = [
	undefined,
	null,
	(group: THREE.Group | null) => void group,
	{ current: null },
];
// @ts-expect-error A ref array entry is still a ref.
const invalidComposedRef: publicApi.ThreeRef<THREE.Group> = ['group'];
const constructedCameraOptions: CreateThreeTestRendererOptions = {
	camera: new THREE.PerspectiveCamera(),
};
const declarativeCameraOptions: CreateThreeTestRendererOptions = {
	camera: { position: [1, 2, 3] },
};

void rootCreate;
void coreState;
void rendererCreate;
void configuredRenderer;
void configAliases;
void testingAliases;
void typedFireEvent;
void threeRenderer;
void threeRendererBoundaries;
void threeRendererRules;
void intrinsicMeshAgain;
void rowAttributes;
void composedRef;
void invalidComposedRef;
void constructedCameraOptions;
void declarativeCameraOptions;
void (undefined as unknown as MockEventData);
void (undefined as unknown as MockSyntheticEvent);
void (undefined as unknown as TestingRenderer);
void (undefined as unknown as ThreeTestRenderer);
