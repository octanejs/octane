import type * as MotionTypes from '@octanejs/motion';
import { domMax } from '@octanejs/motion';
import * as m from '@octanejs/motion/react-m';

declare function expectType<T>(value: T): void;

type IsAny<T> = 0 extends 1 & T ? true : false;
type Assert<T extends true> = T;

type DivIsTyped = Assert<IsAny<typeof m.div> extends false ? true : false>;
type SpanIsTyped = Assert<IsAny<typeof m.span> extends false ? true : false>;

expectType<MotionTypes.MotionComponent>(m.div);
expectType<MotionTypes.MotionComponent>(m.span);
expectType<boolean>(domMax.animation);
expectType<boolean>(domMax.layout);

const transition = {
	duration: 0.18,
	ease: [0.22, 1, 0.36, 1],
} as const satisfies MotionTypes.Transition;

const target = {
	opacity: 1,
	x: 0,
	transition,
} as const satisfies MotionTypes.TargetAndTransition;

expectType<MotionTypes.Transition>(transition);
expectType<MotionTypes.TargetAndTransition>(target);

export type { DivIsTyped, SpanIsTyped };
