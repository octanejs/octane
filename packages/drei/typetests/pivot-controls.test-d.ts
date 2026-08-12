import { PivotControls, type PivotControlsProps } from '../src/index.js';
import { Matrix4 } from 'three';

const props: PivotControlsProps = {
	enabled: true,
	matrix: new Matrix4(),
	autoTransform: false,
	activeAxes: [true, false, true],
	translationLimits: [[-1, 1], undefined, [0, 2]],
	rotationLimits: [undefined, [-Math.PI, Math.PI], undefined],
	scaleLimits: [[0.5, 2], undefined, undefined],
	annotations: true,
	onDrag(local, deltaLocal, world, deltaWorld) {
		void [local, deltaLocal, world, deltaWorld];
	},
};

void PivotControls;
void props;
