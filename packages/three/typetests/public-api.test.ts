import type { UniversalComponent } from 'octane/universal';
import type * as THREE from 'three';
import {
	act,
	createEvents,
	createPortal,
	createRoot,
	events,
	flushSync,
	OctaneThree,
	ReactThreeFiber,
	unmountComponentAtNode,
	useFrame,
	useStore,
	useThree,
	type Act,
	type Args,
	type AttachFnType,
	type AttachType,
	type Camera,
	type CameraProps,
	type CanvasProps,
	type Catalogue,
	type Color,
	type ComputeFunction,
	type ConstructorRepresentation,
	type Disposable,
	type DOMRegionProps,
	type DOMRegionTarget,
	type DomEvent,
	type Dpr,
	type ElementProps,
	type Euler,
	type EventHandlers,
	type EventManager,
	type EventProps,
	type Events,
	type FilterFunction,
	type Frameloop,
	type GlobalEffectType,
	type GlobalRenderCallback,
	type GLProps,
	type Instance,
	type InstanceProps,
	type Intersection,
	type IntersectionEvent,
	type InjectState,
	type Layers,
	type MathProps,
	type MathRepresentation,
	type MathType,
	type MathTypes,
	type Matrix3,
	type Matrix4,
	type ObjectMap,
	type Performance,
	type PointerCaptureTarget,
	type PrimitiveProps,
	type Quaternion,
	type RaycastableRepresentation,
	type ReactProps,
	type ReconcilerRoot,
	type RenderCallback,
	type Renderer,
	type RenderProps,
	type RootState,
	type RootStore,
	type Size,
	type Subscription,
	type ThreeElement,
	type ThreeElements,
	type ThreeEvent,
	type ThreeRoot,
	type ThreeToJSXElements,
	type Vector2,
	type Vector3,
	type Vector4,
	type VectorRepresentation,
	type Viewport,
	type XRManager,
} from '@octanejs/three';
import {
	createThreeTestRenderer,
	fireEvent,
	type ThreeTestRenderer,
} from '@octanejs/three/testing';

declare const canvas: HTMLCanvasElement;
declare const offscreenCanvas: OffscreenCanvas;
declare const renderer: Renderer;
declare const Scene: UniversalComponent<{ name: string }>;
declare const portalTarget: THREE.Group;

const portalState: InjectState = {
	events: {
		enabled: true,
		priority: 2,
		compute(event, state, previous) {
			state.pointer.set(event.offsetX, event.offsetY);
			void previous;
		},
	},
	size: { width: 320, height: 180, top: 0, left: 0 },
};
const portal = createPortal(null, portalTarget, portalState);
void portal;
// @ts-expect-error Portal targets must be Three Object3D instances.
createPortal(null, {});
// @ts-expect-error Portal event overrides expose the narrowed event layer surface.
const invalidPortalState: InjectState = { events: { enabled: 'yes' } };
void invalidPortalState;

const root: ThreeRoot<HTMLCanvasElement> = createRoot(canvas);
const reconcilerRoot: ReconcilerRoot<HTMLCanvasElement> = root;
const canonicalNamespaceElements: OctaneThree.ThreeElements['mesh'] = {};
const namespaceElements: ReactThreeFiber.ThreeElements['mesh'] = {};
const canonicalNamespaceValue: object = OctaneThree;
const namespaceValue: object = ReactThreeFiber;
const typedAct: Act = act;
const acted: Promise<number> = typedAct(async () => 42);
const flushed: number = flushSync(() => 42);
const configured: Promise<ThreeRoot<HTMLCanvasElement>> = root.configure({
	gl: renderer,
	size: { width: 640, height: 360 },
	dpr: [1, 2],
	frameloop: 'demand',
});
const asyncConfigured: Promise<ThreeRoot<HTMLCanvasElement>> = root.configure({
	gl: async (defaults) => {
		const configuredCanvas: HTMLCanvasElement = defaults.canvas;
		void configuredCanvas;
		return renderer;
	},
});
root.render(Scene, { name: 'typed-scene' });
unmountComponentAtNode(canvas, (unmountedCanvas) => {
	const typedCanvas: HTMLCanvasElement = unmountedCanvas;
	void typedCanvas;
});

const offscreenRoot: ThreeRoot<OffscreenCanvas> = createRoot(offscreenCanvas);
const configuredOffscreen: Promise<ThreeRoot<OffscreenCanvas>> = offscreenRoot.configure({
	gl: async (defaults) => {
		const configuredCanvas: OffscreenCanvas = defaults.canvas;
		void configuredCanvas;
		return renderer;
	},
});
unmountComponentAtNode(offscreenCanvas, (unmountedCanvas) => {
	const typedCanvas: OffscreenCanvas = unmountedCanvas;
	void typedCanvas;
});

const domRegionTarget: DOMRegionTarget = { current: document.body };
const domRegionProps: DOMRegionProps = { target: domRegionTarget };

const canvasProps: CanvasProps = {
	gl: () => renderer,
	dpr: 1,
	frameloop: 'never',
	shadows: 'soft',
	style: { width: '100%', height: 320 },
	eventSource: document.body,
	eventPrefix: 'client',
};

const eventManager: EventManager<HTMLElement> = events(root.store);
const coreEvents = createEvents(root.store);
const dynamicCoreEventName: string = 'onPointerMove';
const coreEventHandler: EventListener = coreEvents.handlePointer(dynamicCoreEventName);
const compute: ComputeFunction = (event, state) => {
	const source: DomEvent = event;
	state.pointer.set(source.offsetX, source.offsetY);
};
const filter: FilterFunction = (items, state) => {
	const rootState: RootState = state;
	void rootState;
	return items;
};
const eventHandlers: EventHandlers = {
	onPointerMove(event) {
		const intersectionEvent: IntersectionEvent<PointerEvent> = event;
		intersectionEvent.stopPropagation();
	},
};
const nativeEvents: Events = eventManager.handlers!;
declare const intersection: Intersection;
const captureTarget: PointerCaptureTarget = {
	intersection,
	target: document.body,
};
const meshProps: ThreeElements['mesh'] = {
	onPointerDown(event: ThreeEvent<PointerEvent>) {
		event.stopPropagation();
		event.target.setPointerCapture(event.pointerId);
	},
};
const geometryProps: ThreeElements['boxGeometry'] = {
	args: [1, 1, 1],
	// @ts-expect-error Non-raycastable intrinsic resources do not accept event handlers.
	onPointerDown() {},
};

class CustomRaycastable implements RaycastableRepresentation {
	raycast(_raycaster: THREE.Raycaster, _intersections: THREE.Intersection[]): void {}
}

class Resource {
	readonly label = 'resource';
}

const customEventProps: EventProps<CustomRaycastable> = {
	onPointerDown(event) {
		event.stopPropagation();
	},
};
const customElementProps: ThreeElement<typeof CustomRaycastable> = {
	onPointerMove(event) {
		event.stopPropagation();
	},
};
const primitiveProps: PrimitiveProps<CustomRaycastable> = {
	object: new CustomRaycastable(),
	onPointerUp(event) {
		event.stopPropagation();
	},
};
const resourceElementProps: ThreeElement<typeof Resource> = {
	// @ts-expect-error Non-raycastable custom resources do not accept event handlers.
	onPointerDown() {},
};

function HookTypes(): void {
	const scene = useThree((state) => state.scene);
	const selectedWidth: number = useStore((state) => state.size.width);
	const wholeState: RootState = useThree();
	useFrame((state, delta, frame) => {
		const current: RootState = state;
		const seconds: number = delta;
		void current;
		void seconds;
		void frame;
	});
	void scene;
	void selectedWidth;
	void wholeState;
}

const testRenderer: Promise<ThreeTestRenderer> = createThreeTestRenderer(Scene, {
	name: 'test-scene',
});
declare const mesh: THREE.Mesh;
const fired: Promise<unknown> = fireEvent(mesh, 'pointerDown', { pointerId: 1 });

// @ts-expect-error Frameloop accepts only the three supported scheduling modes.
root.configure({ gl: renderer, frameloop: 'sometimes' });

// @ts-expect-error A DPR range requires numeric lower and upper bounds.
root.configure({ gl: renderer, dpr: ['low', 'high'] });

void configured;
void reconcilerRoot;
void canonicalNamespaceElements;
void canonicalNamespaceValue;
void namespaceElements;
void namespaceValue;
void asyncConfigured;
void acted;
void flushed;
void configuredOffscreen;
void domRegionProps;
void canvasProps;
void coreEvents;
void coreEventHandler;
void compute;
void filter;
void eventHandlers;
void nativeEvents;
void captureTarget;
void eventManager;
void customEventProps;
void customElementProps;
void primitiveProps;
void resourceElementProps;
void geometryProps;
void meshProps;
void HookTypes;
void testRenderer;
void fired;
