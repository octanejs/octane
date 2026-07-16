import * as THREE from 'three';
import { useLoader, type Extensions, type LoaderResult } from '@octanejs/three';

interface ModelAsset {
	readonly scene: THREE.Group;
	readonly source: string;
}

class ModelLoader extends THREE.Loader<ModelAsset, string> {}

declare const modelLoader: ModelLoader;
declare const loadedModel: LoaderResult<typeof ModelLoader>;

const configuredConstructor: Extensions<typeof ModelLoader> = (loader) => {
	const concreteLoader: ModelLoader = loader;
	concreteLoader.setPath('/models/');
};

const configuredInstance: Extensions<ModelLoader> = (loader) => {
	const sameLoader: ModelLoader = loader;
	sameLoader.setCrossOrigin('anonymous');
};

const typedScene: THREE.Group = loadedModel.scene;
const typedSource: string = loadedModel.source;
const typedNodes: Record<string, THREE.Object3D> = loadedModel.nodes;
const typedMeshes: Record<string, THREE.Mesh> = loadedModel.meshes;
const typedMaterials: Record<string, THREE.Material> = loadedModel.materials;

function mutateGraphMap(map: LoaderResult<typeof ModelLoader>): void {
	map.nodes = {};
	map.materials = {};
	map.meshes = {};
}

function LoaderHookTypes(): void {
	const texture: THREE.Texture = useLoader(THREE.TextureLoader, '/albedo.png');
	const cubeTextures: THREE.CubeTexture[] = useLoader(THREE.CubeTextureLoader, [
		['/px.png', '/nx.png', '/py.png', '/ny.png', '/pz.png', '/nz.png'],
	]);
	const scalar: ModelAsset & {
		readonly nodes: Record<string, THREE.Object3D>;
		readonly meshes: Record<string, THREE.Mesh>;
		readonly materials: Record<string, THREE.Material>;
	} = useLoader(ModelLoader, '/hero.glb', configuredConstructor);
	const array: Array<LoaderResult<typeof ModelLoader>> = useLoader(ModelLoader, [
		'/hero.glb',
		'/world.glb',
	]);
	const instanceResult: LoaderResult<ModelLoader> = useLoader(
		modelLoader,
		'/hero.glb',
		configuredInstance,
		(event) => {
			const loadedBytes: number = event.loaded;
			void loadedBytes;
		},
	);

	useLoader.preload(ModelLoader, '/hero.glb', configuredConstructor);
	useLoader.preload(modelLoader, ['/hero.glb', '/world.glb'], configuredInstance);
	useLoader.clear(ModelLoader, '/hero.glb');
	useLoader.clear(modelLoader, ['/hero.glb', '/world.glb']);

	// @ts-expect-error Loader inputs are string assets, not numeric resource IDs.
	useLoader(ModelLoader, 42);

	void scalar;
	void array;
	void instanceResult;
	void texture;
	void cubeTextures;
}

void configuredConstructor;
void configuredInstance;
void typedScene;
void typedSource;
void typedNodes;
void typedMeshes;
void typedMaterials;
void mutateGraphMap;
void LoaderHookTypes;
