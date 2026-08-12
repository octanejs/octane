import { type ThreeRef, useFrame, useThree } from '@octanejs/three';
import {
	useEffect,
	useImperativeHandle,
	useMemo,
	useRef,
	useState,
} from '@octanejs/three/renderer';
import { Euler, Vector3 } from 'three';
import { SimplexNoise } from 'three-stdlib';

function assignRef<T>(ref: ThreeRef<T> | undefined, value: T | null): void {
	if (Array.isArray(ref)) for (const item of ref) assignRef(item, value);
	else if (typeof ref === 'function') ref(value);
	else if (ref && 'current' in ref) ref.current = value;
}

export interface ShakeController {
	getIntensity: () => number;
	setIntensity: (value: number) => void;
}

type ControlsProto = {
	update(): void;
	target: Vector3;
	addEventListener(event: string, callback: (event: any) => void): void;
	removeEventListener(event: string, callback: (event: any) => void): void;
};

export interface CameraShakeProps {
	intensity?: number;
	decay?: boolean;
	decayRate?: number;
	maxYaw?: number;
	maxPitch?: number;
	maxRoll?: number;
	yawFrequency?: number;
	pitchFrequency?: number;
	rollFrequency?: number;
}

export function CameraShake({
	intensity = 1,
	decay,
	decayRate = 0.65,
	maxYaw = 0.1,
	maxPitch = 0.1,
	maxRoll = 0.1,
	yawFrequency = 0.1,
	pitchFrequency = 0.1,
	rollFrequency = 0.1,
	ref,
}: CameraShakeProps & { ref?: ThreeRef<ShakeController | undefined> }) @{
	const camera = useThree((state) => state.camera);
	const defaultControls = useThree((state) => state.controls) as unknown as ControlsProto;
	const intensityRef = useRef(intensity);
	const initialRotation = useRef<Euler>(camera.rotation.clone());
	const [yawNoise] = useState(() => new SimplexNoise());
	const [pitchNoise] = useState(() => new SimplexNoise());
	const [rollNoise] = useState(() => new SimplexNoise());
	const imperativeRef = useMemo(
		() => (value: ShakeController | null | undefined) => assignRef(ref, value ?? null),
		[ref],
	);
	const constrainIntensity = () => {
		if (intensityRef.current < 0 || intensityRef.current > 1) intensityRef.current =
			intensityRef.current < 0 ? 0 : 1;
	};
	useImperativeHandle(
		imperativeRef,
		() => ({
			getIntensity: () => intensityRef.current,
			setIntensity: (value: number) => {
				intensityRef.current = value;
				constrainIntensity();
			},
		}),
		[],
	);
	useEffect(() => {
		if (defaultControls) {
			const callback = () => void (initialRotation.current = camera.rotation.clone());
			defaultControls.addEventListener('change', callback);
			callback();
			return () => void defaultControls.removeEventListener('change', callback);
		}
	}, [camera, defaultControls]);
	useFrame((state, delta) => {
		const shake = Math.pow(intensityRef.current, 2);
		const yaw = maxYaw * shake * yawNoise.noise(state.clock.elapsedTime * yawFrequency, 1);
		const pitch = maxPitch * shake * pitchNoise.noise(state.clock.elapsedTime * pitchFrequency, 1);
		const roll = maxRoll * shake * rollNoise.noise(state.clock.elapsedTime * rollFrequency, 1);
		camera.rotation.set(
			initialRotation.current.x + pitch,
			initialRotation.current.y + yaw,
			initialRotation.current.z + roll,
		);
		if (decay && intensityRef.current > 0) {
			intensityRef.current -= decayRate * delta;
			constrainIntensity();
		}
	});
	null;
}
