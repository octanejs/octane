export { extend } from './catalogue.js';
export { applyProps } from './driver.js';
export {
	buildGraph,
	getRootState,
	useFrame,
	useGraph,
	useInstanceHandle,
	useStore,
	useThree,
} from './hooks.js';
export { useLoader } from './loader.js';
export { createPortal } from './portal.js';
export { dispose } from './props.js';
export type { Disposable } from './props.js';
export {
	addAfterEffect,
	addEffect,
	addTail,
	advance,
	flushGlobalEffects,
	invalidate,
} from './loop.js';
export { createRoot, unmountComponentAtNode } from './root.js';
export { RootStoreContext as context, calculateDpr } from './store.js';
export { createEvents } from './events.js';
export type {
	Args,
	Attach,
	AttachFnType,
	AttachType,
	Catalogue,
	Color,
	ConstructorRepresentation,
	ElementProps,
	Euler,
	EventProps,
	InstanceProps,
	Layers,
	MathRepresentation,
	MathProps,
	MathType,
	MathTypes,
	Matrix3,
	Matrix4,
	PrimitiveProps,
	Quaternion,
	RaycastableRepresentation,
	ReactProps,
	ThreeElement,
	ThreeElements,
	ThreeInstanceProps,
	ThreeKey,
	ThreeRef,
	ThreeToElements,
	ThreeToJSXElements,
	Vector2,
	Vector3,
	Vector4,
	VectorRepresentation,
} from './catalogue.js';
export type {
	ComputeFunction,
	DomEvent,
	EventHandlers,
	EventManager,
	Events,
	FilterFunction,
	Intersection,
	IntersectionEvent,
	PointerCaptureTarget,
	ThreeEvent,
} from './events.js';
export type { Instance } from './driver.js';
export type { ObjectMap, RefObject } from './hooks.js';
export type { Extensions, LoaderResult } from './loader.js';
export type { InjectState } from './portal.js';
export type { GlobalEffectType, GlobalRenderCallback } from './loop.js';
export type {
	CameraProps,
	CanvasLike,
	DefaultGLProps,
	GLProps,
	ThreeRoot as ReconcilerRoot,
	RenderProps,
	ThreeRoot,
} from './root.js';
export type {
	Camera,
	Dpr,
	Frameloop,
	InternalState,
	Performance,
	RenderCallback,
	Renderer,
	RootState,
	RootStore,
	Size,
	Subscription,
	Viewport,
	XRManager,
} from './store.js';
