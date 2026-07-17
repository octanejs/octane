import * as THREE from 'three';

export const MESH_COUNT = 1000;
export const FRAME_COUNT = 1000;
export const EVENT_COUNT = 40;
export const FRAME_REPS = 20;
export const EVENT_REPS = 20;

export const baseItems = Object.freeze(
	Array.from({ length: MESH_COUNT }, (_, index) =>
		Object.freeze({ id: index, name: `mesh-${index}`, x: index % 100 }),
	),
);
export const updatedItems = Object.freeze(
	baseItems.map((item) => Object.freeze({ ...item, x: item.x + 1 })),
);
export const reorderedItems = Object.freeze([...updatedItems].reverse());
export const frameItems = Object.freeze(
	Array.from({ length: FRAME_COUNT }, (_, index) => Object.freeze({ id: index })),
);
export const eventItems = Object.freeze(
	Array.from({ length: EVENT_COUNT }, (_, index) =>
		Object.freeze({ id: index, name: `event-${index}`, z: -index * 0.01 }),
	),
);

let disposals = 0;

export class DisposableObject extends THREE.Object3D {
	constructor(id, version) {
		super();
		this.name = `disposable-${id}`;
		this.userData.version = version;
	}

	dispose() {
		disposals++;
	}
}

export function disposalCount() {
	return disposals;
}

export function resetDisposals() {
	disposals = 0;
}

export async function drainScheduledWork() {
	let previous = disposals;
	let stable = 0;
	for (let turn = 0; turn < 100 && stable < 3; turn++) {
		await new Promise((resolve) => setTimeout(resolve, 0));
		if (disposals === previous) stable++;
		else stable = 0;
		previous = disposals;
	}
}

export async function waitForDisposals(expected) {
	for (let turn = 0; turn < 500; turn++) {
		if (disposals === expected) return;
		await new Promise((resolve) => setTimeout(resolve, 0));
	}
	throw new Error(`disposal checksum ${disposals}, expected ${expected}`);
}

export function createRenderer(canvas) {
	const listeners = { sessionstart: new Set(), sessionend: new Set() };
	return {
		domElement: canvas,
		outputColorSpace: THREE.SRGBColorSpace,
		toneMapping: THREE.NoToneMapping,
		shadowMap: { enabled: false, type: THREE.PCFShadowMap },
		render(scene, camera) {
			scene.updateMatrixWorld(true);
			camera.updateMatrixWorld(true);
		},
		setPixelRatio() {},
		setSize() {},
		dispose() {},
		forceContextLoss() {},
		renderLists: { dispose() {} },
		xr: {
			enabled: false,
			isPresenting: false,
			addEventListener(type, listener) {
				listeners[type]?.add(listener);
			},
			removeEventListener(type, listener) {
				listeners[type]?.delete(listener);
			},
			setAnimationLoop() {},
		},
	};
}

export function captureIdentities(scene) {
	return new Map(scene.children.map((child) => [child.name, child]));
}

export function snapshotScene(scene, identities, extras = {}) {
	let positionSum = 0;
	let versionSum = 0;
	let retained = 0;
	for (const child of scene.children) {
		positionSum += child.position.x;
		versionSum += child.userData.version ?? 0;
		if (identities?.get(child.name) === child) retained++;
	}
	return {
		childCount: scene.children.length,
		first: scene.children[0]?.name ?? null,
		last: scene.children.at(-1)?.name ?? null,
		positionSum,
		versionSum,
		retained,
		disposals,
		...extras,
	};
}
