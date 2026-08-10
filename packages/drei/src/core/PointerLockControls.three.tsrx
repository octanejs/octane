/** @jsxImportSource @octanejs/three/intrinsics */
import { type RootState, type ThreeElement, type ThreeRef, useThree } from '@octanejs/three';
import { useEffect, useMemo } from '@octanejs/three/renderer';
import type * as THREE from 'three';
import { PointerLockControls as PointerLockControlsImpl } from 'three-stdlib';

export type PointerLockControlsProps =
	Omit<ThreeElement<typeof PointerLockControlsImpl>, 'ref' | 'args'> & {
		domElement?: HTMLElement;
		selector?: string;
		enabled?: boolean;
		camera?: THREE.Camera;
		onChange?: (event?: THREE.Event) => void;
		onLock?: (event?: THREE.Event) => void;
		onUnlock?: (event?: THREE.Event) => void;
		makeDefault?: boolean;
	};

export function PointerLockControls({
	domElement,
	selector,
	onChange,
	onLock,
	onUnlock,
	enabled = true,
	makeDefault,
	camera,
	ref,
	...props
}: PointerLockControlsProps & { ref?: ThreeRef<PointerLockControlsImpl> }) @{
	const state = useThree();
	const explicitCamera = camera || state.camera;
	const explicitElement = (domElement || state.events.connected ||
		state.gl.domElement) as HTMLElement;
	const controls = useMemo(() => new PointerLockControlsImpl(explicitCamera as any), [
		explicitCamera,
	]);
	useEffect(() => {
		if (!enabled) return;
		controls.connect(explicitElement);
		const oldCompute = state.get().events.compute;
		state.setEvents({
			compute(_event: unknown, rootState: RootState) {
				const offsetX = rootState.size.width / 2;
				const offsetY = rootState.size.height / 2;
				rootState.pointer.set(
					(offsetX / rootState.size.width) * 2 - 1,
					-(offsetY / rootState.size.height) * 2 + 1,
				);
				rootState.raycaster.setFromCamera(rootState.pointer, rootState.camera);
			},
		});
		return () => {
			controls.disconnect();
			state.setEvents({ compute: oldCompute });
		};
	}, [enabled, controls]);
	useEffect(() => {
		const change = (event: any) => {
			state.invalidate();
			onChange?.(event);
		};
		controls.addEventListener('change', change);
		if (onLock) controls.addEventListener('lock', onLock as any);
		if (onUnlock) controls.addEventListener('unlock', onUnlock as any);
		const handler = () => controls.lock();
		const elements =
			selector ? Array.from(document.querySelectorAll(selector)) : [document];
		for (const element of elements) element?.addEventListener('click', handler);
		return () => {
			controls.removeEventListener('change', change);
			if (onLock) controls.removeEventListener('lock', onLock as any);
			if (onUnlock) controls.removeEventListener('unlock', onUnlock as any);
			for (const element of elements) element?.removeEventListener('click', handler);
		};
	}, [onChange, onLock, onUnlock, selector, controls, state.invalidate]);
	useEffect(() => {
		if (!makeDefault) return;
		const old = state.get().controls;
		state.set({ controls } as any);
		return () => state.set({ controls: old } as any);
	}, [makeDefault, controls]);
	<primitive ref={ref as any} object={controls} {...props as any} />
}
