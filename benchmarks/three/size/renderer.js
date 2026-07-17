export function createSizeRenderer(canvas) {
	const listeners = { sessionstart: new Set(), sessionend: new Set() };
	return {
		domElement: canvas,
		outputColorSpace: 'srgb',
		toneMapping: 0,
		shadowMap: { enabled: false, type: 1 },
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

export function publishSizeChecksum(scene, catalogueSize = null) {
	globalThis.__threeSizeChecksum = {
		childCount: scene.children.length,
		first: scene.children[0]?.name ?? null,
		type: scene.children[0]?.type ?? null,
		catalogueSize,
	};
}

export async function waitForR3FScene(scene) {
	const deadline = performance.now() + 5_000;
	while (performance.now() < deadline) {
		const child = scene.children[0];
		if (scene.children.length === 1 && child?.name === 'size-mesh' && child.type === 'Mesh') {
			return;
		}
		await new Promise((resolve) => setTimeout(resolve, 0));
	}
	throw new Error('R3F did not commit the expected public size-benchmark scene within 5 seconds.');
}
