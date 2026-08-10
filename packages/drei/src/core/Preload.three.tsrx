import { useThree } from '@octanejs/three';
import { useLayoutEffect } from '@octanejs/three/renderer';
import {
	Camera,
	CubeCamera,
	Object3D,
	Scene,
	type WebGLRenderer,
	WebGLCubeRenderTarget,
} from 'three';

export type PreloadProps = {
	all?: boolean;
	scene?: Object3D;
	camera?: Camera;
};

export function Preload({ all, scene, camera }: PreloadProps) @{
	const renderer = useThree(({ gl }) => gl);
	const defaultCamera = useThree(({ camera: value }) => value);
	const defaultScene = useThree(({ scene: value }) => value);
	useLayoutEffect(() => {
		const invisible: Object3D[] = [];
		if (all) {
			(scene || defaultScene).traverse((object) => {
				if (object.visible === false) {
					invisible.push(object);
					object.visible = true;
				}
			});
		}
		renderer.compile(scene || defaultScene, camera || defaultCamera);
		const target = new WebGLCubeRenderTarget(128);
		const cubeCamera = new CubeCamera(0.01, 100000, target);
		cubeCamera.update(renderer as unknown as WebGLRenderer, (scene || defaultScene) as Scene);
		target.dispose();
		invisible.forEach((object) => (object.visible = false));
	}, []);
	null;
}
