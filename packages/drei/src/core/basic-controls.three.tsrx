/** @jsxImportSource @octanejs/three/intrinsics */
import {
	type RootState,
	type ThreeElement,
	type ThreeRef,
	useFrame,
	useThree,
} from '@octanejs/three';
import { useEffect, useMemo, useState } from '@octanejs/three/renderer';
import type * as THREE from 'three';
import {
	ArcballControls as ArcballControlsImpl,
	DeviceOrientationControls as DeviceOrientationControlsImpl,
	FirstPersonControls as FirstPersonControlsImpl,
	FlyControls as FlyControlsImpl,
	MapControls as MapControlsImpl,
	OrbitControls as OrbitControlsImpl,
	TrackballControls as TrackballControlsImpl,
} from 'three-stdlib';

type ControlCallbacks = {
	onChange?: (event?: THREE.Event) => void;
	onStart?: (event?: THREE.Event) => void;
	onEnd?: (event?: THREE.Event) => void;
};

type SharedControlProps =
	ControlCallbacks & {
		camera?: THREE.Camera;
		domElement?: HTMLElement;
		makeDefault?: boolean;
		regress?: boolean;
	};

function controlElement(state: RootState, domElement?: HTMLElement): HTMLElement {
	return (domElement || state.events.connected || state.gl.domElement) as HTMLElement;
}

function installDefaultControl(
	makeDefault: boolean | undefined,
	controls: unknown,
	get: () => any,
	set: (value: any) => void,
) {
	if (!makeDefault) return;
	const old = get().controls;
	set({ controls });
	return () => set({ controls: old });
}

export type OrbitControlsChangeEvent =
	Parameters<Parameters<OrbitControlsImpl['addEventListener']>[1]>[0];
export type OrbitControlsProps =
	Omit<ThreeElement<typeof OrbitControlsImpl>, 'ref' | 'args'> & SharedControlProps & {
		enableDamping?: boolean;
		keyEvents?: boolean | HTMLElement;
		target?: THREE.Vector3 | [number, number, number];
	};

export function OrbitControls({
	makeDefault,
	camera,
	regress,
	domElement,
	enableDamping = true,
	keyEvents = false,
	onChange,
	onStart,
	onEnd,
	ref,
	...rest
}: OrbitControlsProps & { ref?: ThreeRef<OrbitControlsImpl> }) @{
	const state = useThree();
	const explicitCamera = camera || state.camera;
	const explicitElement = controlElement(state, domElement);
	const controls = useMemo(() => new OrbitControlsImpl(explicitCamera as any), [explicitCamera]);
	useFrame(() => {
		if (controls.enabled) controls.update();
	}, -1);
	useEffect(() => {
		if (keyEvents) controls.connect(keyEvents === true ? explicitElement : keyEvents);
		controls.connect(explicitElement);
		return () => void controls.dispose();
	}, [keyEvents, explicitElement, regress, controls, state.invalidate]);
	useEffect(() => {
		const change = (event: any) => {
			state.invalidate();
			if (regress) state.performance.regress();
			onChange?.(event);
		};
		const start = (event: any) => onStart?.(event);
		const end = (event: any) => onEnd?.(event);
		controls.addEventListener('change', change);
		controls.addEventListener('start', start);
		controls.addEventListener('end', end);
		return () => {
			controls.removeEventListener('start', start);
			controls.removeEventListener('end', end);
			controls.removeEventListener('change', change);
		};
	}, [onChange, onStart, onEnd, controls, state.invalidate, state.setEvents]);
	useEffect(() => installDefaultControl(makeDefault, controls, state.get, state.set), [
		makeDefault,
		controls,
	]);
	<primitive ref={ref as any} object={controls} enableDamping={enableDamping} {...rest as any} />
}

export type MapControlsProps =
	Omit<ThreeElement<typeof MapControlsImpl>, 'ref' | 'args'> & SharedControlProps & {
		target?: THREE.Vector3 | [number, number, number];
	};

export function MapControls({
	domElement,
	camera,
	makeDefault,
	onChange,
	onStart,
	onEnd,
	ref,
	enableDamping = true,
	...rest
}: MapControlsProps & { ref?: ThreeRef<MapControlsImpl> }) @{
	const state = useThree();
	const explicitCamera = camera || state.camera;
	const explicitElement = controlElement(state, domElement);
	const controls = useMemo(() => new MapControlsImpl(explicitCamera as any), [explicitCamera]);
	useEffect(() => {
		controls.connect(explicitElement);
		const change = (event: any) => {
			state.invalidate();
			onChange?.(event);
		};
		controls.addEventListener('change', change);
		if (onStart) controls.addEventListener('start', onStart as any);
		if (onEnd) controls.addEventListener('end', onEnd as any);
		return () => {
			controls.dispose();
			controls.removeEventListener('change', change);
			if (onStart) controls.removeEventListener('start', onStart as any);
			if (onEnd) controls.removeEventListener('end', onEnd as any);
		};
	}, [onChange, onStart, onEnd, controls, state.invalidate, explicitElement]);
	useEffect(() => installDefaultControl(makeDefault, controls, state.get, state.set), [
		makeDefault,
		controls,
	]);
	useFrame(() => controls.update(), -1);
	<primitive ref={ref as any} object={controls} enableDamping={enableDamping} {...rest as any} />
}

export type TrackballControlsProps =
	Omit<ThreeElement<typeof TrackballControlsImpl>, 'ref' | 'args'> & SharedControlProps & {
		target?: THREE.Vector3 | [number, number, number];
	};

export function TrackballControls({
	makeDefault,
	camera,
	domElement,
	regress,
	onChange,
	onStart,
	onEnd,
	ref,
	...rest
}: TrackballControlsProps & { ref?: ThreeRef<TrackballControlsImpl> }) @{
	const state = useThree();
	const explicitCamera = camera || state.camera;
	const explicitElement = controlElement(state, domElement);
	const controls = useMemo(() => new TrackballControlsImpl(explicitCamera as any), [
		explicitCamera,
	]);
	useFrame(() => {
		if (controls.enabled) controls.update();
	}, -1);
	useEffect(() => {
		controls.connect(explicitElement);
		return () => void controls.dispose();
	}, [explicitElement, regress, controls, state.invalidate]);
	useEffect(() => {
		const change = (event: any) => {
			state.invalidate();
			if (regress) state.performance.regress();
			onChange?.(event);
		};
		controls.addEventListener('change', change);
		if (onStart) controls.addEventListener('start', onStart as any);
		if (onEnd) controls.addEventListener('end', onEnd as any);
		return () => {
			if (onStart) controls.removeEventListener('start', onStart as any);
			if (onEnd) controls.removeEventListener('end', onEnd as any);
			controls.removeEventListener('change', change);
		};
	}, [onChange, onStart, onEnd, controls, state.invalidate]);
	useEffect(() => controls.handleResize(), [state.viewport]);
	useEffect(() => installDefaultControl(makeDefault, controls, state.get, state.set), [
		makeDefault,
		controls,
	]);
	<primitive ref={ref as any} object={controls} {...rest as any} />
}

export type ArcballControlsProps =
	Omit<ThreeElement<typeof ArcballControlsImpl>, 'ref' | 'args'> & SharedControlProps & {
		target?: THREE.Vector3 | [number, number, number];
	};

export function ArcballControls({
	camera,
	makeDefault,
	regress,
	domElement,
	onChange,
	onStart,
	onEnd,
	ref,
	...rest
}: ArcballControlsProps & { ref?: ThreeRef<ArcballControlsImpl> }) @{
	const state = useThree();
	const explicitCamera = camera || state.camera;
	const explicitElement = controlElement(state, domElement);
	const controls = useMemo(() => new ArcballControlsImpl(explicitCamera as any), [explicitCamera]);
	useFrame(() => {
		if (controls.enabled) controls.update();
	}, -1);
	useEffect(() => {
		controls.connect(explicitElement);
		return () => void controls.dispose();
	}, [explicitElement, regress, controls, state.invalidate]);
	useEffect(() => {
		const change = (event: any) => {
			state.invalidate();
			if (regress) state.performance.regress();
			onChange?.(event);
		};
		controls.addEventListener('change', change);
		if (onStart) controls.addEventListener('start', onStart as any);
		if (onEnd) controls.addEventListener('end', onEnd as any);
		return () => {
			controls.removeEventListener('change', change);
			if (onStart) controls.removeEventListener('start', onStart as any);
			if (onEnd) controls.removeEventListener('end', onEnd as any);
		};
	}, [onChange, onStart, onEnd]);
	useEffect(() => installDefaultControl(makeDefault, controls, state.get, state.set), [
		makeDefault,
		controls,
	]);
	<primitive ref={ref as any} object={controls} {...rest as any} />
}

export type FlyControlsProps =
	Omit<ThreeElement<typeof FlyControlsImpl>, 'ref' | 'args'> & {
		onChange?: (event?: THREE.Event) => void;
		domElement?: HTMLElement;
		makeDefault?: boolean;
	};

export function FlyControls({
	domElement,
	onChange,
	makeDefault,
	ref,
	...rest
}: FlyControlsProps & { ref?: ThreeRef<FlyControlsImpl> }) @{
	const state = useThree();
	const explicitElement = controlElement(state, domElement);
	const controls = useMemo(() => new FlyControlsImpl(state.camera as any), [state.camera]);
	useEffect(() => {
		controls.connect(explicitElement);
		return () => void controls.dispose();
	}, [explicitElement, controls, state.invalidate]);
	useEffect(() => {
		const change = (event: any) => {
			state.invalidate();
			onChange?.(event);
		};
		controls.addEventListener?.('change', change);
		return () => controls.removeEventListener?.('change', change);
	}, [onChange, state.invalidate]);
	useEffect(() => installDefaultControl(makeDefault, controls, state.get, state.set), [
		makeDefault,
		controls,
	]);
	useFrame((_, delta) => controls.update(delta));
	<primitive ref={ref as any} object={controls} {...rest as any} />
}

export type FirstPersonControlsProps =
	Omit<ThreeElement<typeof FirstPersonControlsImpl>, 'ref' | 'args'> & {
		domElement?: HTMLElement;
		makeDefault?: boolean;
	};

export function FirstPersonControls({
	domElement,
	makeDefault,
	ref,
	...props
}: FirstPersonControlsProps & { ref?: ThreeRef<FirstPersonControlsImpl> }) @{
	const state = useThree();
	const explicitElement = controlElement(state, domElement);
	const [controls] = useState(
		() => new FirstPersonControlsImpl(state.camera as any, explicitElement),
	);
	useEffect(() => installDefaultControl(makeDefault, controls, state.get, state.set), [
		makeDefault,
		controls,
	]);
	useFrame((_, delta) => controls.update(delta), -1);
	<primitive ref={ref as any} object={controls} {...props as any} />
}

export type DeviceOrientationControlsProps =
	Omit<ThreeElement<typeof DeviceOrientationControlsImpl>, 'ref' | 'args'> & {
		camera?: THREE.Camera;
		onChange?: (event?: THREE.Event) => void;
		makeDefault?: boolean;
	};

export function DeviceOrientationControls({
	camera,
	onChange,
	makeDefault,
	ref,
	...rest
}: DeviceOrientationControlsProps & { ref?: ThreeRef<DeviceOrientationControlsImpl> }) @{
	const state = useThree();
	const explicitCamera = camera || state.camera;
	const controls = useMemo(() => new DeviceOrientationControlsImpl(explicitCamera as any), [
		explicitCamera,
	]);
	useEffect(() => {
		const change = (event: any) => {
			state.invalidate();
			onChange?.(event);
		};
		controls.addEventListener?.('change', change);
		return () => controls.removeEventListener?.('change', change);
	}, [onChange, controls, state.invalidate]);
	useFrame(() => controls.update(), -1);
	useEffect(() => {
		controls.connect();
		return () => controls.dispose();
	}, [controls]);
	useEffect(() => installDefaultControl(makeDefault, controls, state.get, state.set), [
		makeDefault,
		controls,
	]);
	<primitive ref={ref as any} object={controls} {...rest as any} />
}
