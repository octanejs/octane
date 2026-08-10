import {
	type MotionComponent,
	type TargetAndTransition,
	type Transition,
	domMax,
} from '@octanejs/motion';
import * as m from '@octanejs/motion/react-m';

declare function expectType<T>(value: T): void;

type IsAny<T> = 0 extends 1 & T ? true : false;
type Assert<T extends true> = T;

type DivIsTyped = Assert<IsAny<typeof m.div> extends false ? true : false>;
type SpanIsTyped = Assert<IsAny<typeof m.span> extends false ? true : false>;

expectType<MotionComponent>(m.div);
expectType<MotionComponent>(m.span);
expectType<boolean>(domMax.animation);
expectType<boolean>(domMax.layout);

const transition = {
	duration: 0.18,
	ease: [0.22, 1, 0.36, 1],
} as const satisfies Transition;

const target = {
	opacity: 1,
	x: 0,
	transition,
} as const satisfies TargetAndTransition;

expectType<Transition>(transition);
expectType<TargetAndTransition>(target);

export type { DivIsTyped, SpanIsTyped };
