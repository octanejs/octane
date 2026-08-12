/** @jsxImportSource @octanejs/three/intrinsics */
import { type ThreeElement, type ThreeRef, useThree } from '@octanejs/three';
import {
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
} from '@octanejs/three/renderer';
import type { OctaneNode } from 'octane';
import * as THREE from 'three';
import { TransformControls as TransformControlsImpl } from 'three-stdlib';

type ControlsProto = { enabled: boolean };

export type TransformControlsProps = Omit<
	ThreeElement<typeof TransformControlsImpl>,
	'ref' | 'args'
> &
	Omit<ThreeElement<typeof THREE.Group>, 'ref'> & {
		object?: THREE.Object3D | { current: THREE.Object3D | null };
		enabled?: boolean;
		axis?: string | null;
		domElement?: HTMLElement;
		mode?: 'translate' | 'rotate' | 'scale';
		translationSnap?: number | null;
		rotationSnap?: number | null;
		scaleSnap?: number | null;
		space?: 'world' | 'local';
		size?: number;
		showX?: boolean;
		showY?: boolean;
		showZ?: boolean;
		children?: OctaneNode;
		camera?: THREE.Camera;
		onChange?: (event?: THREE.Event) => void;
		onMouseDown?: (event?: THREE.Event) => void;
		onMouseUp?: (event?: THREE.Event) => void;
		onObjectChange?: (event?: THREE.Event) => void;
		makeDefault?: boolean;
		ref?: ThreeRef<TransformControlsImpl>;
	};

export function TransformControls({
	children,
	domElement,
	onChange,
	onMouseDown,
	onMouseUp,
	onObjectChange,
	object,
	makeDefault,
	camera,
	enabled,
	axis,
	mode,
	translationSnap,
	rotationSnap,
	scaleSnap,
	space,
	size,
	showX,
	showY,
	showZ,
	ref,
	...props
}: TransformControlsProps) @{
	const defaultControls = useThree((state) => state.controls) as ControlsProto | undefined;
	const gl = useThree((state) => state.gl);
	const events = useThree((state) => state.events);
	const defaultCamera = useThree((state) => state.camera);
	const invalidate = useThree((state) => state.invalidate);
	const get = useThree((state) => state.get);
	const set = useThree((state) => state.set);
	const explicitCamera = camera || defaultCamera;
	const explicitDomElement = (domElement || events.connected || gl.domElement) as HTMLElement;
	const controls = useMemo(
		() => new TransformControlsImpl(explicitCamera as any, explicitDomElement),
		[explicitCamera, explicitDomElement],
	);
	const group = useRef<THREE.Group | null>(null);

	useLayoutEffect(() => {
		if (object) {
			controls.attach(object instanceof THREE.Object3D ? (object as any) : (object.current as any));
		} else if (group.current instanceof THREE.Object3D) {
			controls.attach(group.current as any);
		}
		return () => void controls.detach();
	}, [object, children, controls]);

	useEffect(() => {
		if (defaultControls) {
			const callback = (event: { value: boolean }) => (defaultControls.enabled = !event.value);
			(controls as any).addEventListener('dragging-changed', callback);
			return () => (controls as any).removeEventListener('dragging-changed', callback);
		}
	}, [controls, defaultControls]);

	const onChangeRef = useRef(onChange);
	const onMouseDownRef = useRef(onMouseDown);
	const onMouseUpRef = useRef(onMouseUp);
	const onObjectChangeRef = useRef(onObjectChange);
	useLayoutEffect(() => void (onChangeRef.current = onChange), [onChange]);
	useLayoutEffect(() => void (onMouseDownRef.current = onMouseDown), [onMouseDown]);
	useLayoutEffect(() => void (onMouseUpRef.current = onMouseUp), [onMouseUp]);
	useLayoutEffect(() => void (onObjectChangeRef.current = onObjectChange), [onObjectChange]);

	useEffect(() => {
		const change = (event: THREE.Event) => {
			invalidate();
			onChangeRef.current?.(event);
		};
		const mouseDown = (event: THREE.Event) => onMouseDownRef.current?.(event);
		const mouseUp = (event: THREE.Event) => onMouseUpRef.current?.(event);
		const objectChange = (event: THREE.Event) => onObjectChangeRef.current?.(event);
		(controls as any).addEventListener('change', change);
		(controls as any).addEventListener('mouseDown', mouseDown);
		(controls as any).addEventListener('mouseUp', mouseUp);
		(controls as any).addEventListener('objectChange', objectChange);
		return () => {
			(controls as any).removeEventListener('change', change);
			(controls as any).removeEventListener('mouseDown', mouseDown);
			(controls as any).removeEventListener('mouseUp', mouseUp);
			(controls as any).removeEventListener('objectChange', objectChange);
		};
	}, [invalidate, controls]);

	useEffect(() => {
		if (makeDefault) {
			const old = get().controls;
			set({ controls });
			return () => set({ controls: old });
		}
	}, [makeDefault, controls]);

	<>
		<primitive
			ref={ref as any}
			object={controls}
			enabled={enabled}
			mode={mode}
			translationSnap={translationSnap}
			rotationSnap={rotationSnap}
			scaleSnap={scaleSnap}
			space={space}
			size={size}
			showX={showX}
			showY={showY}
			showZ={showZ}
		/>
		<group ref={group} {...props as any}>
			{children}
		</group>
	</>
}
