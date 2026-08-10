import { Center, type CenterProps, type OnCenterCallbackProps } from '../src/index.js';
import { Group } from 'three';

const props: CenterProps = {
	top: true,
	left: true,
	front: true,
	disableZ: false,
	precise: true,
	object: new Group(),
	onCentered: (value: OnCenterCallbackProps) => value.boundingSphere.radius,
};
Center;
props;

// @ts-expect-error axis disable flags are boolean
const invalid: CenterProps = { disableX: 'yes' };
