import * as React from 'react';
import {
	act as reactThreeAct,
	createRoot as createReactThreeRoot,
	extend as extendReactThree,
	useThree as reactUseThree,
	type RootState as ReactRootState,
} from '@react-three/fiber';
import {
	Select as ReactSelect,
	useSelect as reactUseSelect,
} from '@react-three/drei/web/Select.js';
import { create as createOctaneThree } from '@octanejs/three/testing';
import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { SelectScene } from './_fixtures/select.three.tsrx';

beforeAll(() => {
	(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
	extendReactThree(THREE as unknown as Record<string, new (...args: any[]) => any>);
});

function renderer(canvas: HTMLCanvasElement): THREE.WebGLRenderer {
	return {
		domElement: canvas,
		outputColorSpace: THREE.SRGBColorSpace,
		toneMapping: THREE.NoToneMapping,
		render() {},
		setPixelRatio() {},
		setSize() {},
		renderLists: { dispose() {} },
		forceContextLoss() {},
		dispose() {},
	} as unknown as THREE.WebGLRenderer;
}

type ReactEventObject = THREE.Object3D & {
	__r3f?: { handlers: Record<string, (event: Record<string, unknown>) => void> };
};

async function reactSelect(options: {
	multiple: boolean;
	box?: boolean;
	filter?: (objects: THREE.Object3D[]) => THREE.Object3D[];
}) {
	const canvas = document.createElement('canvas');
	const parent = document.createElement('div');
	parent.append(canvas);
	const root = createReactThreeRoot(canvas);
	const camera = new THREE.PerspectiveCamera(75, 1280 / 800, 0.1, 1000);
	camera.position.z = 5;
	const selections: string[][] = [];
	const changes: string[][] = [];
	const pointerUps: string[][] = [];
	let getState!: () => ReactRootState;
	function StateCapture() {
		getState = reactUseThree((state) => state.get);
		return null;
	}
	function Capture() {
		selections.push(reactUseSelect().map((object) => object.name));
		return null;
	}
	await root.configure({ gl: renderer(canvas), camera, frameloop: 'never' });
	await reactThreeAct(async () =>
		root.render(
			React.createElement(
				ReactSelect,
				{
					multiple: options.multiple,
					box: options.box,
					filter: options.filter,
					onChange: (objects: THREE.Object3D[]) =>
						changes.push(objects.map((object) => object.name)),
					onChangePointerUp: (objects: THREE.Object3D[]) =>
						pointerUps.push(objects.map((object) => object.name)),
				},
				React.createElement('mesh', { name: 'first' }),
				React.createElement('mesh', { name: 'second' }),
				React.createElement(Capture),
				React.createElement(StateCapture),
			),
		),
	);
	return { root, getState, canvas, parent, selections, changes, pointerUps };
}

function namedChildren(scene: THREE.Scene) {
	const first = scene.getObjectByName('first')!;
	const second = scene.getObjectByName('second')!;
	const group = first.parent as ReactEventObject;
	return { first, second, group };
}

function reactFire(
	group: ReactEventObject,
	name: string,
	object: THREE.Object3D,
	shiftKey = false,
) {
	group.__r3f!.handlers[name]({ object, shiftKey, stopPropagation() {} });
}

describe('Select', () => {
	it('matches single selection, toggle, filter, and context updates', async () => {
		const filter = (objects: THREE.Object3D[]) =>
			objects.filter((object) => object.name !== 'second');
		const react = await reactSelect({ multiple: false, filter });
		const octaneSelections: string[][] = [];
		const octaneChanges: string[][] = [];
		const octanePointerUps: string[][] = [];
		const octane = await createOctaneThree(SelectScene, {
			multiple: false,
			box: false,
			filter,
			onSelection: (selection: string[]) => octaneSelections.push(selection),
			onChange: (objects: THREE.Object3D[]) =>
				octaneChanges.push(objects.map((object) => object.name)),
			onChangePointerUp: (objects: THREE.Object3D[]) =>
				octanePointerUps.push(objects.map((object) => object.name)),
		});
		const reactObjects = namedChildren(react.getState().scene);
		const octaneObjects = namedChildren(octane.scene);

		await reactThreeAct(async () => reactFire(reactObjects.group, 'onClick', reactObjects.first));
		await octane.fireEvent(octaneObjects.group, 'click', {
			object: octaneObjects.first,
			shiftKey: false,
		});
		expect(octaneSelections).toEqual(react.selections);
		expect(octanePointerUps).toEqual(react.pointerUps);

		await reactThreeAct(async () => reactFire(reactObjects.group, 'onClick', reactObjects.first));
		await octane.fireEvent(octaneObjects.group, 'click', {
			object: octaneObjects.first,
			shiftKey: false,
		});
		await reactThreeAct(async () => reactFire(reactObjects.group, 'onClick', reactObjects.second));
		await octane.fireEvent(octaneObjects.group, 'click', {
			object: octaneObjects.second,
			shiftKey: false,
		});
		expect(octaneSelections).toEqual(react.selections);
		expect(octanePointerUps).toEqual(react.pointerUps);
		expect(octaneChanges).toEqual(react.changes);

		octane.unmount();
		await reactThreeAct(async () => react.root.unmount());
	});

	it('matches shift multi-selection and missed-pointer clearing', async () => {
		const react = await reactSelect({ multiple: true });
		const octaneSelections: string[][] = [];
		const octanePointerUps: string[][] = [];
		const octane = await createOctaneThree(SelectScene, {
			multiple: true,
			box: false,
			filter: undefined,
			onSelection: (selection: string[]) => octaneSelections.push(selection),
			onChange: undefined,
			onChangePointerUp: (objects: THREE.Object3D[]) =>
				octanePointerUps.push(objects.map((object) => object.name)),
		});
		const reactObjects = namedChildren(react.getState().scene);
		const octaneObjects = namedChildren(octane.scene);

		await reactThreeAct(async () => reactFire(reactObjects.group, 'onClick', reactObjects.first));
		await octane.fireEvent(octaneObjects.group, 'click', {
			object: octaneObjects.first,
			shiftKey: false,
		});
		await reactThreeAct(async () =>
			reactFire(reactObjects.group, 'onClick', reactObjects.second, true),
		);
		await octane.fireEvent(octaneObjects.group, 'click', {
			object: octaneObjects.second,
			shiftKey: true,
		});
		await reactThreeAct(async () =>
			reactFire(reactObjects.group, 'onClick', reactObjects.first, true),
		);
		await octane.fireEvent(octaneObjects.group, 'click', {
			object: octaneObjects.first,
			shiftKey: true,
		});
		await reactThreeAct(async () => reactObjects.group.__r3f!.handlers.onPointerMissed({}));
		await octane.fireEvent(octaneObjects.group, 'pointerMissed');

		expect(octaneSelections).toEqual(react.selections);
		expect(octanePointerUps).toEqual(react.pointerUps);

		octane.unmount();
		await reactThreeAct(async () => react.root.unmount());
	});

	it('matches box-selection event gating, overlay geometry, callbacks, and cleanup', async () => {
		const react = await reactSelect({ multiple: true, box: true });
		const octaneChanges: string[][] = [];
		const octanePointerUps: string[][] = [];
		const octaneCamera = new THREE.PerspectiveCamera(75, 1280 / 800, 0.1, 1000);
		octaneCamera.position.z = 5;
		const octane = await createOctaneThree(
			SelectScene,
			{
				multiple: true,
				box: true,
				filter: undefined,
				onSelection: () => {},
				onChange: (objects: THREE.Object3D[]) =>
					octaneChanges.push(objects.map((object) => object.name)),
				onChangePointerUp: (objects: THREE.Object3D[]) =>
					octanePointerUps.push(objects.map((object) => object.name)),
			},
			{ width: 1280, height: 800, camera: octaneCamera },
		);
		const octaneParent = document.createElement('div');
		octaneParent.append(octane.canvas as HTMLCanvasElement);

		await reactThreeAct(async () =>
			document.dispatchEvent(
				new PointerEvent('pointerdown', {
					shiftKey: true,
					clientX: 0,
					clientY: 0,
				}),
			),
		);
		await Promise.resolve();
		expect(octane.store.getState().events.enabled).toBe(react.getState().events.enabled);
		expect(octane.store.getState().events.enabled).toBe(false);
		const reactOverlay = react.parent.querySelector('div') as HTMLDivElement;
		const octaneOverlay = octaneParent.querySelector('div') as HTMLDivElement;
		expect(octaneOverlay.style.cssText).toBe(reactOverlay.style.cssText);

		await reactThreeAct(async () =>
			document.dispatchEvent(new PointerEvent('pointermove', { clientX: 1280, clientY: 800 })),
		);
		expect(octaneOverlay.style.left).toBe(reactOverlay.style.left);
		expect(octaneOverlay.style.top).toBe(reactOverlay.style.top);
		expect(octaneOverlay.style.width).toBe(reactOverlay.style.width);
		expect(octaneOverlay.style.height).toBe(reactOverlay.style.height);

		await reactThreeAct(async () => document.dispatchEvent(new PointerEvent('pointerup')));
		await Promise.resolve();
		expect(octane.store.getState().events.enabled).toBe(react.getState().events.enabled);
		expect(octane.store.getState().events.enabled).toBe(true);
		expect(octaneParent.querySelector('div')).toBeNull();
		expect(react.parent.querySelector('div')).toBeNull();
		expect(octaneChanges).toEqual(react.changes);
		expect(octanePointerUps).toEqual(react.pointerUps);

		octane.unmount();
		await reactThreeAct(async () => react.root.unmount());
	});
});
