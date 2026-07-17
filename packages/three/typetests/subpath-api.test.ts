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
void (undefined as unknown as CreateThreeTestRendererOptions);
void (undefined as unknown as MockEventData);
void (undefined as unknown as MockSyntheticEvent);
void (undefined as unknown as TestingRenderer);
void (undefined as unknown as ThreeTestRenderer);
