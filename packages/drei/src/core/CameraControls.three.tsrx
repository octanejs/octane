/** @jsxImportSource @octanejs/three/intrinsics */
import { type ThreeElement, type ThreeRef, useFrame, useThree } from '@octanejs/three';
import { useEffect, useMemo } from '@octanejs/three/renderer';
import CameraControlsImpl from 'camera-controls';
import {
	Box3,
	MathUtils,
	Matrix4,
	OrthographicCamera,
	PerspectiveCamera,
	Quaternion,
	Raycaster,
	Sphere,
	Spherical,
	Vector2,
	Vector3,
	Vector4,
} from 'three';

type CameraControlsEvent = { type: string };

export type CameraControlsProps = Omit<
	ThreeElement<typeof CameraControlsImpl>,
	'ref' | 'args' | 'addEventListener' | 'removeEventListener' | 'dispatchEvent'
> & {
	impl?: typeof CameraControlsImpl;
	camera?: PerspectiveCamera | OrthographicCamera;
	domElement?: HTMLElement;
	makeDefault?: boolean;
	onControlStart?: (event?: { type: 'controlstart' }) => void;
	onControl?: (event?: { type: 'control' }) => void;
	onControlEnd?: (event?: { type: 'controlend' }) => void;
	onTransitionStart?: (event?: { type: 'transitionstart' }) => void;
	onUpdate?: (event?: { type: 'update' }) => void;
	onWake?: (event?: { type: 'wake' }) => void;
	onRest?: (event?: { type: 'rest' }) => void;
	onSleep?: (event?: { type: 'sleep' }) => void;
	onStart?: (event?: { type: 'controlstart' }) => void;
	onEnd?: (event?: { type: 'controlend' }) => void;
	onChange?: (event?: CameraControlsEvent) => void;
	events?: boolean;
	regress?: boolean;
	ref?: ThreeRef<CameraControlsImpl>;
};

export function CameraControls({
	impl: SubclassImpl,
	camera,
	domElement,
	makeDefault,
	onControlStart,
	onControl,
	onControlEnd,
	onTransitionStart,
	onUpdate,
	onWake,
	onRest,
	onSleep,
	onStart,
	onEnd,
	onChange,
	regress,
	ref,
	...restProps
}: CameraControlsProps) @{
	const Impl = SubclassImpl ?? CameraControlsImpl;
	useMemo(() => {
		Impl.install({
			THREE: {
				Box3,
				MathUtils: { clamp: MathUtils.clamp },
				Matrix4,
				Quaternion,
				Raycaster,
				Sphere,
				Spherical,
				Vector2,
				Vector3,
				Vector4,
			} as any,
		});
	}, [Impl]);

	const defaultCamera = useThree((state) => state.camera);
	const gl = useThree((state) => state.gl);
	const invalidate = useThree((state) => state.invalidate);
	const rendererEvents = useThree((state) => state.events);
	const setEvents = useThree((state) => state.setEvents);
	const set = useThree((state) => state.set);
	const get = useThree((state) => state.get);
	const performance = useThree((state) => state.performance);
	const explicitCamera = camera || defaultCamera;
	const explicitDomElement = (domElement || rendererEvents.connected || gl.domElement) as HTMLElement;
	const controls = useMemo(() => new Impl(explicitCamera as any), [Impl, explicitCamera]);

	useFrame((_state, delta) => {
		controls.update(delta);
	}, -1);

	useEffect(() => {
		controls.connect(explicitDomElement);
		return () => void controls.disconnect();
	}, [explicitDomElement, controls]);

	useEffect(() => {
		function invalidateAndRegress(): void {
			invalidate();
			if (regress) performance.regress();
		}
		const controlStart = (event: { type: 'controlstart' }) => {
			invalidateAndRegress();
			onControlStart?.(event);
			onStart?.(event);
		};
		const control = (event: { type: 'control' }) => {
			invalidateAndRegress();
			onControl?.(event);
			onChange?.(event);
		};
		const controlEnd = (event: { type: 'controlend' }) => {
			onControlEnd?.(event);
			onEnd?.(event);
		};
		const transitionStart = (event: { type: 'transitionstart' }) => {
			invalidateAndRegress();
			onTransitionStart?.(event);
			onChange?.(event);
		};
		const update = (event: { type: 'update' }) => {
			invalidateAndRegress();
			onUpdate?.(event);
			onChange?.(event);
		};
		const wake = (event: { type: 'wake' }) => {
			invalidateAndRegress();
			onWake?.(event);
			onChange?.(event);
		};
		const rest = (event: { type: 'rest' }) => onRest?.(event);
		const sleep = (event: { type: 'sleep' }) => onSleep?.(event);
		const listeners = { controlstart: controlStart, control, controlend: controlEnd, transitionstart: transitionStart, update, wake, rest, sleep };
		for (const [type, listener] of Object.entries(listeners)) {
			controls.addEventListener(type as any, listener as any);
		}
		return () => {
			for (const [type, listener] of Object.entries(listeners)) {
				controls.removeEventListener(type as any, listener as any);
			}
		};
	}, [
		controls,
		invalidate,
		setEvents,
		regress,
		performance,
		onControlStart,
		onControl,
		onControlEnd,
		onTransitionStart,
		onUpdate,
		onWake,
		onRest,
		onSleep,
		onChange,
		onStart,
		onEnd,
	]);

	useEffect(() => {
		if (makeDefault) {
			const old = get().controls;
			set({ controls: controls as any });
			return () => set({ controls: old });
		}
	}, [makeDefault, controls]);

	<primitive ref={ref as any} object={controls} {...restProps as any} />
}

export type CameraControls = CameraControlsImpl;
export { CameraControlsImpl };
