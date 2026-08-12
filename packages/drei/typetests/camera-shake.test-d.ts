import { CameraShake, type CameraShakeProps, type ShakeController } from '../src/index.js';

const props: CameraShakeProps = { intensity: 0.5, decay: true, maxYaw: 0.2 };
const controller: ShakeController = {
	getIntensity: () => 1,
	setIntensity: (value) => value.valueOf(),
};
CameraShake;
props;
controller.setIntensity(controller.getIntensity());

// @ts-expect-error intensity is numeric
const invalidIntensity: CameraShakeProps = { intensity: 'high' };
// @ts-expect-error decay is boolean
const invalidDecay: CameraShakeProps = { decay: 1 };
