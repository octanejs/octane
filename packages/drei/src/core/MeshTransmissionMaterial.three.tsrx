/** @jsxImportSource @octanejs/three/intrinsics */
import { extend, type ThreeElements, type ThreeRef, useFrame, useInstanceHandle } from '@octanejs/three';
import { useImperativeHandle, useRef, useState } from '@octanejs/three/renderer';
import * as THREE from 'three';
import { MeshTransmissionMaterialImpl } from '../materials/MeshTransmissionMaterial.js';
import { useFBO } from './Fbo.three.tsrx';
import { DiscardMaterialImpl } from './simple-materials.three.tsrx';

type MeshTransmissionMaterialType = Omit<ThreeElements['meshPhysicalMaterial'], 'args' | 'roughness' | 'thickness' | 'transmission'> & {
	transmission?: number; thickness?: number; roughness?: number; chromaticAberration?: number; anisotropy?: number;
	anisotropicBlur?: number; distortion?: number; distortionScale?: number; temporalDistortion?: number;
	buffer?: THREE.Texture; time?: number; args?: [samples: number, transmissionSampler: boolean];
};

export type MeshTransmissionMaterialProps = Omit<MeshTransmissionMaterialType, 'ref' | 'args'> & {
	transmissionSampler?: boolean; backside?: boolean; backsideThickness?: number; backsideEnvMapIntensity?: number;
	resolution?: number; backsideResolution?: number; samples?: number; background?: THREE.Texture | THREE.Color;
};

type MaterialInstance = MeshTransmissionMaterialImpl & {
	time: number; buffer: THREE.Texture; _transmission: number; anisotropicBlur: number; chromaticAberration: number;
	distortion: number; distortionScale: number; temporalDistortion: number;
};
const MeshTransmissionMaterialNode = extend(MeshTransmissionMaterialImpl);

export function MeshTransmissionMaterial({
	buffer, transmissionSampler = false, backside = false, side = THREE.FrontSide, transmission = 1, thickness = 0,
	backsideThickness = 0, backsideEnvMapIntensity = 1, samples = 10, resolution, backsideResolution, background,
	anisotropy, anisotropicBlur, ref: forwardedRef, ...props
}: MeshTransmissionMaterialProps & { ref?: ThreeRef<MaterialInstance> }) @{
	const ref = useRef<MaterialInstance | null>(null);
	const instance = useInstanceHandle(ref);
	const [discardMaterial] = useState(() => new DiscardMaterialImpl());
	const fboBack = useFBO(backsideResolution || resolution);
	const fboMain = useFBO(resolution);
	useFrame((state) => {
		ref.current!.time = state.clock.elapsedTime;
		if (ref.current!.buffer !== fboMain.texture || transmissionSampler) return;
		const parent = instance.current?.parent?.object as THREE.Mesh<THREE.BufferGeometry, MaterialInstance | THREE.ShaderMaterial> | undefined;
		if (!parent) return;
		const oldTone = state.gl.toneMapping;
		const oldBackground = state.scene.background;
		const oldEnvMapIntensity = ref.current!.envMapIntensity;
		state.gl.toneMapping = THREE.NoToneMapping;
		if (background) state.scene.background = background;
		parent.material = discardMaterial;
		if (backside) {
			state.gl.setRenderTarget(fboBack); state.gl.render(state.scene, state.camera);
			parent.material = ref.current!; ref.current!.buffer = fboBack.texture; ref.current!.thickness = backsideThickness;
			ref.current!.side = THREE.BackSide; ref.current!.envMapIntensity = backsideEnvMapIntensity;
		}
		state.gl.setRenderTarget(fboMain); state.gl.render(state.scene, state.camera);
		parent.material = ref.current!; ref.current!.thickness = thickness; ref.current!.side = side;
		ref.current!.buffer = fboMain.texture; ref.current!.envMapIntensity = oldEnvMapIntensity;
		state.scene.background = oldBackground; state.gl.setRenderTarget(null); state.gl.toneMapping = oldTone;
	});
	useImperativeHandle((forwardedRef ?? null) as any, () => ref.current!, [samples, transmissionSampler]);
	<MeshTransmissionMaterialNode
		attach="material"
		key={`${samples}:${transmissionSampler}`}
		args={[samples, transmissionSampler]}
		ref={ref}
		{...(props as any)}
		buffer={(buffer || fboMain.texture) as any}
		_transmission={transmission}
		anisotropicBlur={anisotropicBlur ?? anisotropy}
		transmission={transmissionSampler ? transmission : 0}
		thickness={thickness}
		side={side}
	/>
}
