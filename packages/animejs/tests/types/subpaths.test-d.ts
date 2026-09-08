type Equal<A, B> =
	(<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Assert<T extends true> = T;
type Subpath0 = Assert<
	Equal<typeof import('@octanejs/animejs/timer'), typeof import('animejs/timer')>
>;
type Subpath1 = Assert<
	Equal<typeof import('@octanejs/animejs/animation'), typeof import('animejs/animation')>
>;
type Subpath2 = Assert<
	Equal<typeof import('@octanejs/animejs/timeline'), typeof import('animejs/timeline')>
>;
type Subpath3 = Assert<
	Equal<typeof import('@octanejs/animejs/animatable'), typeof import('animejs/animatable')>
>;
type Subpath4 = Assert<
	Equal<typeof import('@octanejs/animejs/draggable'), typeof import('animejs/draggable')>
>;
type Subpath5 = Assert<
	Equal<typeof import('@octanejs/animejs/scope'), typeof import('animejs/scope')>
>;
type Subpath6 = Assert<
	Equal<typeof import('@octanejs/animejs/engine'), typeof import('animejs/engine')>
>;
type Subpath7 = Assert<
	Equal<typeof import('@octanejs/animejs/events'), typeof import('animejs/events')>
>;
type Subpath8 = Assert<
	Equal<typeof import('@octanejs/animejs/layout'), typeof import('animejs/layout')>
>;
type Subpath9 = Assert<
	Equal<typeof import('@octanejs/animejs/easings'), typeof import('animejs/easings')>
>;
type Subpath10 = Assert<
	Equal<typeof import('@octanejs/animejs/easings/eases'), typeof import('animejs/easings/eases')>
>;
type Subpath11 = Assert<
	Equal<typeof import('@octanejs/animejs/easings/linear'), typeof import('animejs/easings/linear')>
>;
type Subpath12 = Assert<
	Equal<typeof import('@octanejs/animejs/easings/steps'), typeof import('animejs/easings/steps')>
>;
type Subpath13 = Assert<
	Equal<
		typeof import('@octanejs/animejs/easings/irregular'),
		typeof import('animejs/easings/irregular')
	>
>;
type Subpath14 = Assert<
	Equal<
		typeof import('@octanejs/animejs/easings/cubic-bezier'),
		typeof import('animejs/easings/cubic-bezier')
	>
>;
type Subpath15 = Assert<
	Equal<typeof import('@octanejs/animejs/easings/spring'), typeof import('animejs/easings/spring')>
>;
type Subpath16 = Assert<
	Equal<typeof import('@octanejs/animejs/utils'), typeof import('animejs/utils')>
>;
type Subpath17 = Assert<
	Equal<typeof import('@octanejs/animejs/svg'), typeof import('animejs/svg')>
>;
type Subpath18 = Assert<
	Equal<typeof import('@octanejs/animejs/text'), typeof import('animejs/text')>
>;
type Subpath19 = Assert<
	Equal<typeof import('@octanejs/animejs/waapi'), typeof import('animejs/waapi')>
>;
type Subpath20 = Assert<
	Equal<typeof import('@octanejs/animejs/adapters'), typeof import('animejs/adapters')>
>;

import { animate } from '@octanejs/animejs/animation';
import { createTimeline } from '@octanejs/animejs/timeline';

const target = document.createElement('div');
animate(target, { duration: 100 }).pause();
createTimeline()
	.add(target, { opacity: [0, 1] })
	.pause();
// @ts-expect-error timeline seek requires a numeric time
createTimeline().seek('invalid');
