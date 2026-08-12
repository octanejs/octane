/** @jsxImportSource @octanejs/three/intrinsics */
import { createPortal, type ComputeFunction, type ThreeElements, type ThreeRef, useFrame, useThree } from '@octanejs/three';
import { useEffect, useImperativeHandle, useMemo, useRef, useState, type RefObject } from '@octanejs/three/renderer';
import type { OctaneNode } from 'octane';
import * as THREE from 'three';

export type RenderCubeTextureProps = Omit<ThreeElements['texture'], 'ref' | 'args' | 'rotation'> & {
	stencilBuffer?: boolean;
	depthBuffer?: boolean;
	generateMipmaps?: boolean;
	renderPriority?: number;
	eventPriority?: number;
	frames?: number;
	compute?: ComputeFunction;
	flip?: boolean;
	resolution?: number;
	children: OctaneNode;
	near?: number;
	far?: number;
	position?: ThreeElements['cubeCamera']['position'];
	rotation?: ThreeElements['cubeCamera']['rotation'];
	scale?: ThreeElements['cubeCamera']['scale'];
	quaternion?: ThreeElements['cubeCamera']['quaternion'];
	matrix?: ThreeElements['cubeCamera']['matrix'];
	matrixAutoUpdate?: boolean;
};

type RenderCubeTextureComponentProps = Omit<RenderCubeTextureProps, 'children'> & { children?: OctaneNode };

export type RenderCubeTextureApi = {
	scene: THREE.Scene;
	fbo: THREE.WebGLCubeRenderTarget;
	camera: THREE.CubeCamera;
};

function CubeContainer({ frames, renderPriority, children, camera }: {
	frames: number;
	renderPriority: number;
	children?: OctaneNode;
	camera: RefObject<THREE.CubeCamera>;
}) @{
	let count = 0;
	useFrame((state) => {
		if (frames === Infinity || count < frames) {
			camera.current?.update(state.gl as any, state.scene);
			count++;
		}
	}, renderPriority);
	<>{children}</>
}

export function RenderCubeTexture({
	children,
	compute,
	renderPriority = -1,
	eventPriority = 0,
	frames = Infinity,
	stencilBuffer = false,
	depthBuffer = true,
	generateMipmaps = false,
	resolution = 896,
	near = 0.1,
	far = 1000,
	flip = false,
	position,
	rotation,
	scale,
	quaternion,
	matrix,
	matrixAutoUpdate,
	ref,
	...props
}: RenderCubeTextureComponentProps & { ref?: ThreeRef<RenderCubeTextureApi> }) @{
	const { size, viewport } = useThree();
	const camera = useRef<THREE.CubeCamera | null>(null);
	const fbo = useMemo(() => {
		const target = new THREE.WebGLCubeRenderTarget(
			Math.max((resolution || size.width) * viewport.dpr, (resolution || size.height) * viewport.dpr),
			{ stencilBuffer, depthBuffer, generateMipmaps },
		);
		target.texture.isRenderTargetTexture = !flip;
		target.texture.flipY = true;
		target.texture.type = THREE.HalfFloatType;
		return target;
	}, [resolution, flip]);
	useEffect(() => () => fbo.dispose(), [fbo]);
	const [virtualScene] = useState(() => new THREE.Scene());
	const primitiveProps = props as any;
	useImperativeHandle((ref ?? null) as any, () => ({ scene: virtualScene, fbo, camera: camera.current! }), [fbo]);
	<>
		{createPortal(
			<CubeContainer renderPriority={renderPriority} frames={frames} camera={camera as RefObject<THREE.CubeCamera>}>
				{children}
				<group onPointerOver={() => null} />
			</CubeContainer>,
			virtualScene,
			{ events: { compute, priority: eventPriority } },
		)}
		<primitive object={fbo.texture} {...primitiveProps} />
		<cubeCamera
			ref={camera}
			args={[near, far, fbo]}
			position={position}
			rotation={rotation}
			scale={scale}
			quaternion={quaternion}
			matrix={matrix}
			matrixAutoUpdate={matrixAutoUpdate}
		/>
	</>
}
