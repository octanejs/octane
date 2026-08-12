/** @jsxImportSource @octanejs/three/intrinsics */
import { createPortal, type ComputeFunction, type ThreeElements, type ThreeRef, useFrame, useThree } from '@octanejs/three';
import { useCallback, useImperativeHandle, useState } from '@octanejs/three/renderer';
import type { OctaneNode } from 'octane';
import * as THREE from 'three';
import { useFBO } from './Fbo.three.tsrx';

export type RenderTextureProps = Omit<ThreeElements['texture'], 'ref' | 'args'> & {
	width?: number;
	height?: number;
	samples?: number;
	stencilBuffer?: boolean;
	depthBuffer?: boolean;
	generateMipmaps?: boolean;
	renderPriority?: number;
	eventPriority?: number;
	frames?: number;
	compute?: ComputeFunction;
	children: OctaneNode;
};

type RenderTextureComponentProps = Omit<RenderTextureProps, 'children'> & { children?: OctaneNode };

function Container({ frames, renderPriority, children, fbo }: {
	frames: number;
	renderPriority: number;
	children?: OctaneNode;
	fbo: THREE.WebGLRenderTarget;
}) @{
	let count = 0;
	useFrame((state) => {
		if (frames !== Infinity && count >= frames) return;
		const gl = state.gl as any;
		const oldAutoClear = gl.autoClear;
		const oldXrEnabled = gl.xr.enabled;
		const oldRenderTarget = gl.getRenderTarget();
		const oldIsPresenting = gl.xr.isPresenting;
		gl.autoClear = true;
		gl.xr.enabled = false;
		gl.xr.isPresenting = false;
		gl.setRenderTarget(fbo);
		gl.render(state.scene, state.camera);
		gl.setRenderTarget(oldRenderTarget);
		gl.autoClear = oldAutoClear;
		gl.xr.enabled = oldXrEnabled;
		gl.xr.isPresenting = oldIsPresenting;
		count++;
	}, renderPriority);
	<>{children}</>
}

export function RenderTexture({
	children,
	compute,
	width,
	height,
	samples = 8,
	renderPriority = 0,
	eventPriority = 0,
	frames = Infinity,
	stencilBuffer = false,
	depthBuffer = true,
	generateMipmaps = false,
	ref,
	...props
}: RenderTextureComponentProps & { ref?: ThreeRef<THREE.Texture> }) @{
	const { size, viewport } = useThree();
	const fbo = useFBO((width || size.width) * viewport.dpr, (height || size.height) * viewport.dpr, {
		samples,
		stencilBuffer,
		depthBuffer,
		generateMipmaps,
	});
	const [virtualScene] = useState(() => new THREE.Scene());
	const primitiveProps = props as any;
	const uvCompute = useCallback<ComputeFunction>((event, state, previous) => {
		let parent = (fbo.texture as any)?.__r3f?.parent?.object ?? (fbo.texture as any)?.__octane?.parent?.object;
		while (parent && !(parent instanceof THREE.Object3D)) {
			parent = parent.__r3f?.parent?.object ?? parent.__octane?.parent?.object;
		}
		if (!parent || !previous) return false as any;
		if (!previous.raycaster.camera) previous.events.compute?.(event, previous, previous.previousRoot?.getState());
		const [intersection] = previous.raycaster.intersectObject(parent);
		if (!intersection?.uv) return false as any;
		state.raycaster.setFromCamera(
			state.pointer.set(intersection.uv.x * 2 - 1, intersection.uv.y * 2 - 1),
			state.camera,
		);
	}, []);
	useImperativeHandle((ref ?? null) as any, () => fbo.texture, [fbo]);
	<>
		{createPortal(
			<Container renderPriority={renderPriority} frames={frames} fbo={fbo}>
				{children}
				<group onPointerOver={() => null} />
			</Container>,
			virtualScene,
			{ events: { compute: compute ?? uvCompute, priority: eventPriority } },
		)}
		<primitive object={fbo.texture} {...primitiveProps} />
	</>
}
