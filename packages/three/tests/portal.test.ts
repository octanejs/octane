import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import {
	createPortal,
	createRoot,
	events as createPointerEvents,
	getRootState,
	type DomEvent,
	type Renderer,
	type RootState,
	type RootStore,
	type ThreeEvent,
	type ThreeRoot,
} from '@octanejs/three';
import { createThreeTestRenderer, type ThreeTestRenderer } from '@octanejs/three/testing';
import {
	ManagedTargetPortalScene,
	NestedPortalScene,
	PortalCycleScene,
	PortalEventLayersScene,
	PortalOwnershipScene,
	PortalScene,
} from './_fixtures/portal.three.tsrx';

interface LayoutObservation {
	readonly store: RootStore;
	readonly state: RootState;
	readonly theme: string;
	readonly cameraAspect: number;
}

interface PortalProps {
	readonly show: boolean;
	readonly target: THREE.Object3D;
	readonly theme: string;
	readonly portalState?: Parameters<typeof createPortal>[2];
	readonly parentRef: (value: THREE.Group | null) => void;
	readonly meshRef: (value: THREE.Mesh | null) => void;
	readonly geometryRef: (value: THREE.BoxGeometry | null) => void;
	readonly logicalTargetRef?: (value: THREE.Group | null) => void;
	readonly onLayout: (value: LayoutObservation) => void;
	readonly onFrame: (state: RootState, delta: number) => void;
	readonly attach?: (parent: THREE.Object3D, self: THREE.Group) => void | (() => void);
	readonly onUpdate?: (self: THREE.Group) => void;
	readonly onParentPointerDown?: (event: ThreeEvent<PointerEvent>) => void;
	readonly onMeshPointerDown?: (event: ThreeEvent<PointerEvent>) => void;
	readonly onTargetPointerDown?: (event: ThreeEvent<PointerEvent>) => void;
}

const mountedTestRoots: ThreeTestRenderer[] = [];
const mountedRoots: ThreeRoot<HTMLCanvasElement>[] = [];

function refs() {
	let parent: THREE.Group | null = null;
	let mesh: THREE.Mesh | null = null;
	let geometry: THREE.BoxGeometry | null = null;
	return {
		get parent() {
			return parent;
		},
		get mesh() {
			return mesh;
		},
		get geometry() {
			return geometry;
		},
		parentRef: (value: THREE.Group | null) => (parent = value),
		meshRef: (value: THREE.Mesh | null) => (mesh = value),
		geometryRef: (value: THREE.BoxGeometry | null) => (geometry = value),
	};
}

function baseProps(target: THREE.Object3D, targetRefs = refs()): PortalProps {
	return {
		show: true,
		target,
		theme: 'violet',
		parentRef: targetRefs.parentRef,
		meshRef: targetRefs.meshRef,
		geometryRef: targetRefs.geometryRef,
		onLayout() {},
		onFrame() {},
	};
}

async function flushUniversalUpdates(): Promise<void> {
	await Promise.resolve();
	await Promise.resolve();
}

function createRenderer(canvas: HTMLCanvasElement): Renderer {
	return {
		domElement: canvas,
		render() {},
		setPixelRatio() {},
		setSize() {},
		renderLists: { dispose() {} },
		dispose() {},
		forceContextLoss() {},
	};
}

function dispatchPointer(target: HTMLElement, type: string, x: number, y: number): DomEvent {
	const event = new MouseEvent(type, {
		bubbles: true,
		clientX: x,
		clientY: y,
		button: 0,
	}) as DomEvent;
	Object.defineProperties(event, {
		offsetX: { configurable: true, enumerable: true, value: x },
		offsetY: { configurable: true, enumerable: true, value: y },
		pointerId: { configurable: true, enumerable: true, value: 1 },
	});
	target.dispatchEvent(event);
	return event;
}

afterEach(() => {
	for (const root of mountedTestRoots.splice(0)) root.unmount();
	for (const root of mountedRoots.splice(0)) root.unmount();
	vi.restoreAllMocks();
	vi.useRealTimers();
});

describe('Three portals', () => {
	it('redirects physical children while preserving context and a local state enclave', async () => {
		const target = new THREE.Group();
		target.name = 'borrowed-target';
		const existing = new THREE.Group();
		existing.name = 'unmanaged-child';
		target.add(existing);
		const targetRefs = refs();
		const layouts: LayoutObservation[] = [];
		const frames: Array<{ state: RootState; delta: number }> = [];
		const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
		camera.userData.self = camera.userData;
		const updateProjectionMatrix = vi.spyOn(camera, 'updateProjectionMatrix');
		const root = await createThreeTestRenderer(
			PortalScene,
			{
				...baseProps(target, targetRefs),
				portalState: {
					camera,
					size: { width: 320, height: 160, top: 3, left: 4 },
					events: { priority: 7 },
				},
				onLayout: (value: LayoutObservation) => layouts.push(value),
				onFrame: (state: RootState, delta: number) => frames.push({ state, delta }),
			},
			{ width: 80, height: 40 },
		);
		mountedTestRoots.push(root);

		const observation = layouts.at(-1)!;
		expect(root.scene.children.map((child) => child.name)).toEqual(['ordinary-root-child']);
		expect(target.children.map((child) => child.name)).toEqual([
			'unmanaged-child',
			'portal-parent',
		]);
		expect(targetRefs.parent?.parent).toBe(target);
		expect(observation.theme).toBe('violet');
		expect(observation.store).not.toBe(root.store);
		expect(observation.state).toBe(observation.store.getState());
		expect(observation.state.scene).toBe(target);
		expect(observation.state.previousRoot).toBe(root.store);
		expect(observation.state.camera).toBe(camera);
		expect(observation.state.raycaster).not.toBe(root.store.getState().raycaster);
		expect(observation.state.pointer).not.toBe(root.store.getState().pointer);
		expect(observation.state.internal).toBe(root.store.getState().internal);
		expect(observation.state.events.priority).toBe(7);
		expect(observation.state.size).toEqual({ width: 320, height: 160, top: 3, left: 4 });
		expect(observation.state.viewport.aspect).toBe(2);
		expect(observation.cameraAspect).toBe(2);
		expect(updateProjectionMatrix).toHaveBeenCalledOnce();
		expect(getRootState(targetRefs.mesh!)).toBe(observation.state);

		root.advanceFrames(1, 0.25);
		expect(frames).toEqual([{ state: observation.store.getState(), delta: 0.25 }]);

		const rogueScene = new THREE.Group();
		observation.store.setState({ scene: rogueScene as THREE.Scene });
		expect(observation.store.getState().scene).toBe(rogueScene);
		root.store.getState().setSize(100, 50, 6, 8);
		await flushUniversalUpdates();
		expect(observation.store.getState().scene).toBe(target);
		expect(observation.store.getState().size).toEqual({
			width: 320,
			height: 160,
			top: 3,
			left: 4,
		});
		expect(root.store.getState().size).toEqual({ width: 100, height: 50, top: 6, left: 8 });
	});

	it('applies accepted injected-state updates to the existing portal enclave immediately', async () => {
		const target = new THREE.Group();
		const targetRefs = refs();
		const layouts: LayoutObservation[] = [];
		const onLayout = (value: LayoutObservation) => layouts.push(value);
		const onFrame = () => {};
		const firstCamera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
		firstCamera.position.z = 4;
		const firstControls = new THREE.EventDispatcher();
		const firstCompute = (_event: DomEvent, _state: RootState) => {};
		const root = await createThreeTestRenderer(PortalScene, {
			...baseProps(target, targetRefs),
			portalState: {
				camera: firstCamera,
				controls: firstControls,
				flat: false,
				size: { width: 240, height: 120, top: 1, left: 2 },
				events: { enabled: true, priority: 8, compute: firstCompute },
			},
			onLayout,
			onFrame,
		});
		mountedTestRoots.push(root);

		const enclave = layouts.at(-1)!.store;
		const portalMesh = targetRefs.mesh!;
		const firstProjection = firstCamera.projectionMatrix.clone();
		const nextCamera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
		nextCamera.position.z = 9;
		const nextProjection = nextCamera.projectionMatrix.clone();
		const nextControls = new THREE.EventDispatcher();
		const nextCompute = (_event: DomEvent, _state: RootState) => {};

		root.update(PortalScene, {
			...baseProps(target, targetRefs),
			portalState: {
				camera: nextCamera,
				controls: nextControls,
				flat: true,
				size: { width: 360, height: 120, top: 5, left: 6 },
				events: { enabled: false, priority: 0, compute: nextCompute },
			},
			onLayout,
			onFrame,
		});

		const state = enclave.getState();
		const committedLayout = layouts.at(-1)!;
		expect(targetRefs.mesh).toBe(portalMesh);
		expect(getRootState(portalMesh)).toBe(state);
		expect(committedLayout.store).toBe(enclave);
		expect(committedLayout.state).toBe(state);
		expect(committedLayout.cameraAspect).toBe(3);
		expect(state.scene).toBe(target);
		expect(state.camera).toBe(nextCamera);
		expect(state.controls).toBe(nextControls);
		expect(state.flat).toBe(true);
		expect(state.events.enabled).toBe(false);
		expect(state.events.priority).toBe(0);
		expect(state.events.compute).toBe(nextCompute);
		expect(state.size).toEqual({ width: 360, height: 120, top: 5, left: 6 });
		expect(state.viewport.aspect).toBe(3);
		expect(state.viewport.distance).toBeCloseTo(9);
		expect(state.viewport.height).toBeCloseTo(2 * Math.tan(Math.PI / 6) * 9);
		expect(state.viewport.width).toBeCloseTo(state.viewport.height * 3);
		expect(nextCamera.aspect).toBe(3);
		expect(nextCamera.projectionMatrix.equals(nextProjection)).toBe(false);
		expect(firstCamera.aspect).toBe(2);
		expect(firstCamera.projectionMatrix.equals(firstProjection)).toBe(true);

		const parentState = root.store.getState();
		root.update(PortalScene, {
			...baseProps(target, targetRefs),
			portalState: { events: { priority: 4 } },
			onLayout,
			onFrame,
		});

		const fallbackState = enclave.getState();
		const fallbackLayout = layouts.at(-1)!;
		expect(targetRefs.mesh).toBe(portalMesh);
		expect(fallbackLayout.store).toBe(enclave);
		expect(fallbackLayout.state).toBe(fallbackState);
		expect(fallbackLayout.cameraAspect).toBe(
			(parentState.camera as THREE.PerspectiveCamera).aspect,
		);
		expect(fallbackState.scene).toBe(target);
		expect(fallbackState.camera).toBe(parentState.camera);
		expect(fallbackState.controls).toBe(parentState.controls);
		expect(fallbackState.flat).toBe(parentState.flat);
		expect(fallbackState.size).toEqual(parentState.size);
		expect(fallbackState.viewport).toMatchObject({
			width: parentState.viewport.width,
			height: parentState.viewport.height,
			aspect: parentState.viewport.aspect,
			distance: parentState.viewport.distance,
		});
		expect(fallbackState.events.enabled).toBe(parentState.events.enabled);
		expect(fallbackState.events.priority).toBe(4);
		expect(fallbackState.events.compute).toBe(parentState.events.compute);
	});

	it('routes portal handlers through the outer event scope and tears down only owned children', async () => {
		vi.useFakeTimers();
		const target = new THREE.Group();
		const existing = new THREE.Group();
		target.add(existing);
		const targetRefs = refs();
		const log: Array<{ handler: string; camera: THREE.Camera }> = [];
		const root = await createThreeTestRenderer(PortalScene, {
			...baseProps(target, targetRefs),
			onMeshPointerDown: (event: ThreeEvent<PointerEvent>) =>
				log.push({ handler: 'mesh', camera: event.camera }),
			onParentPointerDown: (event: ThreeEvent<PointerEvent>) =>
				log.push({ handler: 'parent', camera: event.camera }),
		});
		mountedTestRoots.push(root);
		const geometry = targetRefs.geometry!;
		const mesh = targetRefs.mesh!;
		const dispose = vi.spyOn(geometry, 'dispose');

		await root.fireEvent(mesh, 'pointerDown');
		expect(log).toEqual([{ handler: 'mesh', camera: getRootState(mesh)!.camera }]);

		root.update(PortalScene, { ...baseProps(target, targetRefs), show: false });
		expect(target.children).toEqual([existing]);
		expect(targetRefs.parent).toBeNull();
		expect(targetRefs.mesh).toBeNull();
		expect(getRootState(mesh)).toBeUndefined();
		root.scene.updateMatrixWorld(true);
		root.advanceFrames(1);
		expect(log).toHaveLength(1);
		vi.runAllTimers();
		expect(dispose).toHaveBeenCalledOnce();
		expect(target.children).toEqual([existing]);
	});

	it('retargets a stable function-attached host without ref churn', async () => {
		const firstTarget = new THREE.Group();
		firstTarget.name = 'first-target';
		const secondTarget = new THREE.Group();
		secondTarget.name = 'second-target';
		const targetRefs = refs();
		const layouts: LayoutObservation[] = [];
		const lifecycle: string[] = [];
		const parentRef = (value: THREE.Group | null) => {
			lifecycle.push(value === null ? 'ref:null' : `ref:${value.name}`);
			targetRefs.parentRef(value);
		};
		const attach = (parent: THREE.Object3D, self: THREE.Group) => {
			lifecycle.push(`attach:${parent.name}`);
			parent.add(self);
			return () => {
				lifecycle.push(`cleanup:${parent.name}`);
				parent.remove(self);
			};
		};
		const onUpdate = (self: THREE.Group) =>
			lifecycle.push(`update:${self.parent?.name ?? 'detached'}`);
		const root = await createThreeTestRenderer(PortalScene, {
			...baseProps(firstTarget, targetRefs),
			parentRef,
			attach,
			onUpdate,
			onLayout: (value: LayoutObservation) => layouts.push(value),
		});
		mountedTestRoots.push(root);
		const parent = targetRefs.parent;
		const mesh = targetRefs.mesh;
		const firstStore = layouts.at(-1)!.store;

		root.update(PortalScene, {
			...baseProps(firstTarget, targetRefs),
			theme: 'amber',
			parentRef,
			attach,
			onUpdate,
			onLayout: (value: LayoutObservation) => layouts.push(value),
		});
		expect(targetRefs.parent).toBe(parent);
		expect(targetRefs.mesh).toBe(mesh);
		expect(layouts.at(-1)).toMatchObject({ store: firstStore, theme: 'amber' });

		lifecycle.length = 0;
		root.update(PortalScene, {
			...baseProps(secondTarget, targetRefs),
			theme: 'amber',
			parentRef,
			attach,
			onUpdate,
			onLayout: (value: LayoutObservation) => layouts.push(value),
		});
		expect(firstTarget.children).toEqual([]);
		expect(secondTarget.children).toEqual([parent]);
		expect(targetRefs.parent).toBe(parent);
		expect(targetRefs.mesh).toBe(mesh);
		expect(layouts.at(-1)!.store).not.toBe(firstStore);
		expect(layouts.at(-1)!.state.scene).toBe(secondTarget);
		expect(lifecycle).toEqual([
			'cleanup:first-target',
			'attach:second-target',
			'update:second-target',
		]);
	});

	it('keeps a portal enclave bound to a reconstructed managed target', async () => {
		const firstTarget = new THREE.Group();
		firstTarget.name = 'first-managed-target';
		const secondTarget = new THREE.Group();
		secondTarget.name = 'second-managed-target';
		let managedTarget: THREE.Group | null = null;
		let portalStore: RootStore | null = null;
		let portalChild: THREE.Group | null = null;
		const targetRef = (value: THREE.Group | null) => (managedTarget = value);
		const portalRef = (value: THREE.Group | null) => (portalChild = value);
		const onStore = (store: RootStore) => (portalStore = store);
		const root = await createThreeTestRenderer(ManagedTargetPortalScene, {
			managedObject: firstTarget,
			portalTarget: null,
			targetRef,
			portalRef,
			onStore,
		});
		mountedTestRoots.push(root);
		expect(managedTarget).toBe(firstTarget);

		root.update(ManagedTargetPortalScene, {
			managedObject: firstTarget,
			portalTarget: firstTarget,
			targetRef,
			portalRef,
			onStore,
		});
		const enclave = portalStore!;
		expect(portalChild?.parent).toBe(firstTarget);
		expect(enclave.getState().scene).toBe(firstTarget);

		// A ref-held target is necessarily one render behind a host reconstruction.
		root.update(ManagedTargetPortalScene, {
			managedObject: secondTarget,
			portalTarget: firstTarget,
			targetRef,
			portalRef,
			onStore,
		});
		expect(managedTarget).toBe(secondTarget);
		expect(portalChild?.parent).toBe(secondTarget);
		expect(enclave.getState().scene).toBe(secondTarget);

		root.store.getState().setSize(140, 70);
		await flushUniversalUpdates();
		expect(enclave.getState().scene).toBe(secondTarget);

		const concurrent = await createThreeTestRenderer(PortalScene, baseProps(firstTarget));
		mountedTestRoots.push(concurrent);
		expect(firstTarget.children.map((child) => child.name)).toEqual(['portal-parent']);

		root.update(ManagedTargetPortalScene, {
			managedObject: secondTarget,
			portalTarget: firstTarget,
			targetRef,
			portalRef,
			onStore,
		});
		expect(portalChild?.parent).toBe(secondTarget);
		expect(enclave.getState().scene).toBe(secondTarget);

		concurrent.unmount();
		const concurrentIndex = mountedTestRoots.indexOf(concurrent);
		if (concurrentIndex !== -1) mountedTestRoots.splice(concurrentIndex, 1);
		root.unmount();
		const rootIndex = mountedTestRoots.indexOf(root);
		if (rootIndex !== -1) mountedTestRoots.splice(rootIndex, 1);
		const reuse = await createThreeTestRenderer(PortalScene, baseProps(firstTarget));
		mountedTestRoots.push(reuse);
		expect(firstTarget.children.map((child) => child.name)).toEqual(['portal-parent']);
	});

	it('rejects a final portal placement cycle before mutating either target', async () => {
		const first = new THREE.Group();
		const second = new THREE.Group();
		const outcome = await createThreeTestRenderer(PortalCycleScene, { first, second }).then(
			(root) => ({ error: null, root }),
			(error: unknown) => ({ error, root: null }),
		);
		const mutated = first.parent !== null || second.parent !== null;
		outcome.root?.unmount();

		expect(outcome.error).toBeInstanceOf(Error);
		expect(String(outcome.error)).toMatch(/cycle/i);
		expect(mutated).toBe(false);
	});

	it('builds nested state ancestry without placing inner hosts in the outer target', async () => {
		const outerTarget = new THREE.Group();
		const innerTarget = new THREE.Group();
		const targetRefs = refs();
		const outerLayouts: LayoutObservation[] = [];
		const innerLayouts: LayoutObservation[] = [];
		const frames: RootState[] = [];
		const root = await createThreeTestRenderer(NestedPortalScene, {
			outerTarget,
			innerTarget,
			outerState: { events: { priority: 2 } },
			innerState: { events: { priority: 5 } },
			theme: 'nested-violet',
			parentRef: targetRefs.parentRef,
			meshRef: targetRefs.meshRef,
			geometryRef: targetRefs.geometryRef,
			onOuterLayout: (value: LayoutObservation) => outerLayouts.push(value),
			onInnerLayout: (value: LayoutObservation) => innerLayouts.push(value),
			onFrame: (state: RootState) => frames.push(state),
		});
		mountedTestRoots.push(root);

		const outer = outerLayouts.at(-1)!;
		const inner = innerLayouts.at(-1)!;
		expect(outerTarget.children.map((child) => child.name)).toEqual(['outer-portal-child']);
		expect(innerTarget.children.map((child) => child.name)).toEqual(['portal-parent']);
		expect(outer).toMatchObject({ theme: 'nested-violet' });
		expect(inner).toMatchObject({ theme: 'nested-violet' });
		expect(outer.state.scene).toBe(outerTarget);
		expect(outer.state.previousRoot).toBe(root.store);
		expect(inner.state.scene).toBe(innerTarget);
		expect(inner.state.previousRoot).toBe(outer.store);
		expect(inner.state.internal).toBe(root.store.getState().internal);
		expect(inner.state.events.priority).toBe(5);

		root.advanceFrames(1);
		expect(frames).toEqual([inner.store.getState()]);
	});

	it('raycasts portal layers from the root manager and bubbles through physical target ancestry', async () => {
		const canvas = document.createElement('canvas');
		canvas.width = 100;
		canvas.height = 100;
		const root = createRoot(canvas);
		mountedRoots.push(root);
		await root.configure({
			gl: createRenderer(canvas),
			size: { width: 100, height: 100, top: 0, left: 0 },
			dpr: 1,
			frameloop: 'never',
			events: createPointerEvents,
		});

		let managedTarget: THREE.Group | null = null;
		const targetRefs = refs();
		const log: Array<{
			handler: string;
			object: string;
			eventObject: string;
			state: RootState;
		}> = [];
		const record = (handler: string) => (event: ThreeEvent<PointerEvent>) => {
			log.push({
				handler,
				object: event.object.name,
				eventObject: event.eventObject.name,
				state: getRootState(event.object)!,
			});
		};
		root.render(PortalScene, {
			...baseProps(new THREE.Group(), targetRefs),
			show: false,
			logicalTargetRef: (value: THREE.Group | null) => (managedTarget = value),
			onTargetPointerDown: record('target'),
		});
		const portalCamera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
		portalCamera.position.z = 5;
		portalCamera.updateProjectionMatrix();
		root.render(PortalScene, {
			...baseProps(managedTarget!, targetRefs),
			logicalTargetRef: (value: THREE.Group | null) => (managedTarget = value),
			portalState: { camera: portalCamera, events: { priority: 4 } },
			onMeshPointerDown: record('mesh'),
			onParentPointerDown: record('portal-parent'),
			onTargetPointerDown: record('target'),
		});
		root.store.getState().scene.updateMatrixWorld(true);
		portalCamera.updateMatrixWorld(true);
		dispatchPointer(canvas, 'pointerdown', 50, 50);

		expect(log.map(({ handler, object, eventObject }) => [handler, object, eventObject])).toEqual([
			['mesh', 'portal-mesh', 'portal-mesh'],
			['portal-parent', 'portal-mesh', 'portal-parent'],
			['target', 'portal-mesh', 'ordinary-root-child'],
		]);
		expect(log[0].state.camera).toBe(portalCamera);
		expect(log[0].state.previousRoot).toBe(root.store);
	});

	it('orders overlapping portal event layers by priority and honors local compute and enabled state', async () => {
		const canvas = document.createElement('canvas');
		canvas.width = 100;
		canvas.height = 100;
		const root = createRoot(canvas);
		mountedRoots.push(root);
		await root.configure({
			gl: createRenderer(canvas),
			size: { width: 100, height: 100, top: 0, left: 0 },
			dpr: 1,
			frameloop: 'never',
			events: createPointerEvents,
		});

		const lowTarget = new THREE.Group();
		const highTarget = new THREE.Group();
		const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
		camera.position.z = 5;
		camera.updateProjectionMatrix();
		camera.updateMatrixWorld(true);
		let lowMesh: THREE.Mesh | null = null;
		let highMesh: THREE.Mesh | null = null;
		const log: string[] = [];
		const computations: Array<{
			name: string;
			state: RootState;
			previous: RootState | undefined;
		}> = [];
		const createCompute =
			(name: string) => (event: DomEvent, state: RootState, previous?: RootState) => {
				computations.push({ name, state, previous });
				state.pointer.set(
					(event.offsetX / state.size.width) * 2 - 1,
					-(event.offsetY / state.size.height) * 2 + 1,
				);
				state.raycaster.setFromCamera(state.pointer, state.camera);
			};
		const initialCompute = createCompute('initial');
		const lowRef = (value: THREE.Mesh | null) => (lowMesh = value);
		const highRef = (value: THREE.Mesh | null) => (highMesh = value);
		const onLowPointerDown = () => log.push('low');
		const onHighPointerDown = () => log.push('high');
		root.render(PortalEventLayersScene, {
			lowTarget,
			highTarget,
			lowState: { camera, events: { priority: 1 } },
			highState: { camera, events: { enabled: true, priority: 10, compute: initialCompute } },
			lowRef,
			highRef,
			onLowPointerDown,
			onHighPointerDown,
		});
		lowTarget.updateMatrixWorld(true);
		highTarget.updateMatrixWorld(true);

		dispatchPointer(canvas, 'pointerdown', 50, 50);
		expect(log).toEqual(['high', 'low']);
		expect(computations).toHaveLength(1);
		expect(computations[0].name).toBe('initial');
		expect(computations[0].state).toBe(getRootState(highMesh!));
		expect(computations[0].previous).toBe(root.store.getState());

		log.length = 0;
		const updatedCompute = createCompute('updated');
		root.render(PortalEventLayersScene, {
			lowTarget,
			highTarget,
			lowState: { camera, events: { priority: 1 } },
			highState: { camera, events: { enabled: true, priority: 0, compute: updatedCompute } },
			lowRef,
			highRef,
			onLowPointerDown,
			onHighPointerDown,
		});
		expect(getRootState(highMesh!)!.events.enabled).toBe(true);
		expect(getRootState(highMesh!)!.events.priority).toBe(0);
		expect(getRootState(highMesh!)!.events.compute).toBe(updatedCompute);
		dispatchPointer(canvas, 'pointerdown', 50, 50);
		expect(log).toEqual(['low', 'high']);
		expect(computations.map(({ name }) => name)).toEqual(['initial', 'updated']);

		log.length = 0;
		const disabledCompute = createCompute('disabled');
		root.render(PortalEventLayersScene, {
			lowTarget,
			highTarget,
			lowState: { camera, events: { priority: 1 } },
			highState: { camera, events: { enabled: false, priority: 20, compute: disabledCompute } },
			lowRef,
			highRef,
			onLowPointerDown,
			onHighPointerDown,
		});
		expect(getRootState(highMesh!)!.events.enabled).toBe(false);
		expect(getRootState(highMesh!)!.events.priority).toBe(20);
		expect(getRootState(highMesh!)!.events.compute).toBe(disabledCompute);
		dispatchPointer(canvas, 'pointerdown', 50, 50);
		expect(log).toEqual(['low']);
		expect(computations.map(({ name }) => name)).toEqual(['initial', 'updated']);
		expect(getRootState(lowMesh!)!.previousRoot).toBe(root.store);

		log.length = 0;
		getRootState(highMesh!)!.setEvents({ enabled: true });
		expect(getRootState(highMesh!)!.events.enabled).toBe(true);
		dispatchPointer(canvas, 'pointerdown', 50, 50);
		expect(log).toEqual(['high', 'low']);
		expect(computations.map(({ name }) => name)).toEqual(['initial', 'updated', 'disabled']);
	});

	it('routes child errors to the authored boundary and cleans up portal-owned effects', async () => {
		const target = new THREE.Group();
		const effects: string[] = [];
		let fallback: THREE.Group | null = null;
		const onEffect = (phase: string) => effects.push(phase);
		const fallbackRef = (value: THREE.Group | null) => (fallback = value);
		const root = await createThreeTestRenderer(PortalOwnershipScene, {
			target,
			fail: false,
			onEffect,
			fallbackRef,
		});
		mountedTestRoots.push(root);

		expect(target.children.map((child) => child.name)).toEqual(['portal-owned-child']);
		expect(root.scene.children).toEqual([]);
		expect(effects).toEqual(['mount']);

		root.update(PortalOwnershipScene, {
			target,
			fail: true,
			onEffect,
			fallbackRef,
		});
		expect(target.children).toEqual([]);
		expect(root.scene.children.map((child) => child.name)).toEqual(['caught:portal-owned-boom']);
		expect(fallback?.name).toBe('caught:portal-owned-boom');
		expect(effects).toEqual(['mount', 'cleanup']);
	});

	it('does not publish injected state from a rejected portal transaction', async () => {
		const foreignTarget = new THREE.Group();
		const owner = await createThreeTestRenderer(PortalScene, baseProps(foreignTarget));
		mountedTestRoots.push(owner);

		const lowTarget = new THREE.Group();
		const highTarget = new THREE.Group();
		let lowMesh: THREE.Mesh | null = null;
		let highMesh: THREE.Mesh | null = null;
		const lowRef = (value: THREE.Mesh | null) => (lowMesh = value);
		const highRef = (value: THREE.Mesh | null) => (highMesh = value);
		const onLowPointerDown = () => {};
		const onHighPointerDown = () => {};
		const acceptedCamera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
		acceptedCamera.position.z = 5;
		const acceptedControls = new THREE.EventDispatcher();
		const acceptedCompute = (_event: DomEvent, _state: RootState) => {};
		const acceptedState = {
			camera: acceptedCamera,
			controls: acceptedControls,
			flat: false,
			size: { width: 200, height: 100, top: 1, left: 2 },
			events: { enabled: true, priority: 6, compute: acceptedCompute },
		};
		const root = await createThreeTestRenderer(PortalEventLayersScene, {
			lowTarget,
			highTarget,
			lowState: acceptedState,
			highState: { camera: acceptedCamera, events: { priority: 1 } },
			lowRef,
			highRef,
			onLowPointerDown,
			onHighPointerDown,
		});
		mountedTestRoots.push(root);

		const acceptedLowMesh = lowMesh!;
		const acceptedHighMesh = highMesh!;
		const rejectedCamera = new THREE.PerspectiveCamera(70, 1, 0.1, 100);
		rejectedCamera.position.z = 11;
		const rejectedProjection = rejectedCamera.projectionMatrix.clone();
		const rejectedControls = new THREE.EventDispatcher();
		const rejectedCompute = (_event: DomEvent, _state: RootState) => {};
		const rejectedState = {
			camera: rejectedCamera,
			controls: rejectedControls,
			flat: true,
			size: { width: 400, height: 100, top: 7, left: 8 },
			events: { enabled: false, priority: 0, compute: rejectedCompute },
		};

		expect(() =>
			root.update(PortalEventLayersScene, {
				lowTarget,
				highTarget: foreignTarget,
				lowState: rejectedState,
				highState: { camera: acceptedCamera, events: { priority: 1 } },
				lowRef,
				highRef,
				onLowPointerDown,
				onHighPointerDown,
			}),
		).toThrow(/leased by another root/);

		const assertAcceptedState = () => {
			const state = getRootState(acceptedLowMesh)!;
			expect(state.camera).toBe(acceptedCamera);
			expect(state.controls).toBe(acceptedControls);
			expect(state.flat).toBe(false);
			expect(state.size).toEqual({ width: 200, height: 100, top: 1, left: 2 });
			expect(state.events.enabled).toBe(true);
			expect(state.events.priority).toBe(6);
			expect(state.events.compute).toBe(acceptedCompute);
		};
		assertAcceptedState();
		expect(lowTarget.children).toEqual([acceptedLowMesh]);
		expect(highTarget.children).toEqual([acceptedHighMesh]);
		expect(rejectedCamera.aspect).toBe(1);
		expect(rejectedCamera.projectionMatrix.equals(rejectedProjection)).toBe(true);

		// A rejected render must not leave a staged injection visible to the
		// accepted layer when its parent store next mirrors state.
		root.store.getState().setSize(640, 320, 9, 10);
		assertAcceptedState();
		expect(rejectedCamera.aspect).toBe(1);
		expect(rejectedCamera.projectionMatrix.equals(rejectedProjection)).toBe(true);
	});

	it('rejects invalid and cross-root targets without mutating either scene', async () => {
		const firstRefs = refs();
		const firstTarget = new THREE.Group();
		const first = await createThreeTestRenderer(PortalScene, {
			...baseProps(firstTarget, firstRefs),
		});
		mountedTestRoots.push(first);
		const managedTarget = firstRefs.parent!;
		const unmanagedDescendant = new THREE.Group();
		managedTarget.add(unmanagedDescendant);

		const secondExternal = new THREE.Group();
		const second = await createThreeTestRenderer(PortalScene, {
			...baseProps(secondExternal),
		});
		mountedTestRoots.push(second);
		const beforeFirst = [...firstTarget.children];
		const beforeSecond = [...second.scene.children];
		const rejectedCamera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
		const rejectedCameraParent = new THREE.Group();
		rejectedCameraParent.position.set(4, 5, 6);
		rejectedCamera.position.set(1, 2, 3);
		rejectedCameraParent.add(rejectedCamera);
		const parentMatrix = rejectedCameraParent.matrix.clone();
		const parentMatrixWorld = rejectedCameraParent.matrixWorld.clone();
		const cameraMatrix = rejectedCamera.matrix.clone();
		const cameraMatrixWorld = rejectedCamera.matrixWorld.clone();
		const cameraMatrixWorldInverse = rejectedCamera.matrixWorldInverse.clone();
		const updateProjectionMatrix = vi.spyOn(rejectedCamera, 'updateProjectionMatrix');

		expect(() =>
			second.update(PortalScene, {
				...baseProps(managedTarget),
				portalState: {
					camera: rejectedCamera,
					size: { width: 400, height: 100, top: 0, left: 0 },
				},
			}),
		).toThrow(/owned by another root/);
		expect(rejectedCamera.aspect).toBe(1);
		expect(updateProjectionMatrix).not.toHaveBeenCalled();
		expect(rejectedCameraParent.matrix.equals(parentMatrix)).toBe(true);
		expect(rejectedCameraParent.matrixWorld.equals(parentMatrixWorld)).toBe(true);
		expect(rejectedCamera.matrix.equals(cameraMatrix)).toBe(true);
		expect(rejectedCamera.matrixWorld.equals(cameraMatrixWorld)).toBe(true);
		expect(rejectedCamera.matrixWorldInverse.equals(cameraMatrixWorldInverse)).toBe(true);

		expect(() =>
			second.update(PortalScene, {
				...baseProps(managedTarget),
			}),
		).toThrow(/owned by another root/);
		expect(firstTarget.children).toEqual(beforeFirst);
		expect(second.scene.children).toEqual(beforeSecond);
		expect(() =>
			second.update(PortalScene, {
				...baseProps(unmanagedDescendant),
			}),
		).toThrow(/another root/);
		expect(unmanagedDescendant.children).toEqual([]);
		expect(() =>
			second.update(PortalScene, {
				...baseProps(firstTarget),
			}),
		).toThrow(/leased by another root/);

		first.unmount();
		second.update(PortalScene, {
			...baseProps(firstTarget),
		});
		expect(firstTarget.children.map((child) => child.name)).toEqual(['portal-parent']);

		expect(() =>
			second.update(PortalScene, {
				...baseProps({} as THREE.Object3D),
			}),
		).toThrow(/must be a Three Object3D/);
		expect(firstTarget.children.map((child) => child.name)).toEqual(['portal-parent']);
	});
});
