import {
	CubeCamera,
	OrthographicCamera,
	PerspectiveCamera,
	useCubeCamera,
	type CubeCameraOptions,
	type CubeCameraProps,
	type OrthographicCameraProps,
	type PerspectiveCameraProps,
} from '../src/index.js';
import { Fog, Texture } from 'three';

const options: CubeCameraOptions = { resolution: 128, near: 0.01, far: 200, fog: new Fog(0) };
const cube: CubeCameraProps = { ...options, frames: 2, children: (texture) => texture.name };
const perspective: PerspectiveCameraProps = {
	makeDefault: true,
	manual: false,
	frames: 1,
	envMap: new Texture(),
	children: (texture: Texture) => texture.name,
};
const orthographic: OrthographicCameraProps = { left: -2, right: 2, manual: true };
const hook = useCubeCamera(options);
CubeCamera;
OrthographicCamera;
PerspectiveCamera;
cube;
perspective;
orthographic;
hook.camera;
hook.fbo;
hook.update();

// @ts-expect-error resolution is measured in pixels
const invalidCube: CubeCameraOptions = { resolution: 'large' };
// @ts-expect-error frames is numeric
const invalidPerspective: PerspectiveCameraProps = { frames: 'once' };
