import {
	CameraControls,
	type CameraControls as CameraControlsInstance,
	CameraControlsImpl,
	type CameraControlsProps,
} from '../src/index.js';

const props: CameraControlsProps = { minDistance: 2, makeDefault: true, onControl: () => {} };
const instance: CameraControlsInstance | null = null;
CameraControls;
CameraControlsImpl;
props;
instance;

// @ts-expect-error makeDefault is boolean
const invalidDefault: CameraControlsProps = { makeDefault: 'yes' };
// @ts-expect-error minDistance is numeric
const invalidDistance: CameraControlsProps = { minDistance: 'near' };
