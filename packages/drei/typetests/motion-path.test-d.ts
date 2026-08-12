import {
	MotionPathControls,
	useMotion,
	type MotionPathProps,
	type MotionPathRef,
} from '@octanejs/drei';
import type { Curve, Vector3 } from 'three';

const props: MotionPathProps = {
	curves: [] as Curve<Vector3>[],
	offset: 0.5,
	loop: false,
	smooth: 20,
};
const ref = {} as MotionPathRef;
void props;
void ref.motion.current;
void MotionPathControls;
void useMotion;

// @ts-expect-error offset is numeric
const invalid: MotionPathProps = { offset: 'middle' };
void invalid;
