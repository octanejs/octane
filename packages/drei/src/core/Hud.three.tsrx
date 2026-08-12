/** @jsxImportSource @octanejs/three/intrinsics */
import { createPortal, useFrame, useThree } from '@octanejs/three';
import { useState } from '@octanejs/three/renderer';
import type { OctaneNode } from 'octane';
import * as THREE from 'three';

type RenderHudProps = {
	defaultScene: THREE.Scene;
	defaultCamera: THREE.Camera;
	renderPriority?: number;
};

function RenderHud({ defaultScene, defaultCamera, renderPriority = 1 }: RenderHudProps) @{
	const { gl, scene, camera } = useThree();
	let oldClear: boolean;
	useFrame(() => {
		oldClear = gl.autoClear;
		if (renderPriority === 1) {
			gl.autoClear = true;
			gl.render(defaultScene, defaultCamera);
		}
		gl.autoClear = false;
		gl.clearDepth();
		gl.render(scene, camera);
		gl.autoClear = oldClear;
	}, renderPriority);
	<group onPointerOver={() => null} />
}

export type HudProps = {
	children: OctaneNode;
	renderPriority?: number;
};

export function Hud({ children, renderPriority = 1 }: { children?: OctaneNode; renderPriority?: number }) @{
	const { scene: defaultScene, camera: defaultCamera } = useThree();
	const [hudScene] = useState(() => new THREE.Scene());
	<>
		{createPortal(
			<>
				{children}
				<RenderHud
					defaultScene={defaultScene}
					defaultCamera={defaultCamera}
					renderPriority={renderPriority}
				/>
			</>,
			hudScene,
			{ events: { priority: renderPriority + 1 } },
		)}
	</>
}
