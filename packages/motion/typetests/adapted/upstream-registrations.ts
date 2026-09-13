// Paired compile-time contracts for the five registrations in the pinned
// events/types.test.tsx and motion/types.test.tsx runtime suites. Runtime
// observations remain in the unmodified oracle; these groups check their types.
import * as Motion from '@octanejs/motion';
import type { Assert, Equal } from '../../../../scripts/react-port/type-assertions.js';

declare function assertUpstreamRegistration(id: string, assertion: () => void): void;

function relativeTo(elementOrId: string | HTMLElement | null) {
	return (point: Motion.Point): Motion.Point | undefined => {
		const element =
			typeof elementOrId === 'string' ? document.getElementById(elementOrId) : elementOrId;
		if (!element) return undefined;
		const bounds = element.getBoundingClientRect();
		return {
			x: point.x - bounds.left - window.scrollX,
			y: point.y - bounds.top - window.scrollY,
		};
	};
}

// events/__tests__/types.test.tsx: should return nothing if no element is available.
assertUpstreamRegistration('react-case-v1:fc5e11e0c85a5fcb9423', () => {
	const result = relativeTo(null)({ x: 1, y: 1 });
	type PointShape = Assert<Equal<Motion.Point, { x: number; y: number }>>;
	type MissingElementResult = Assert<Equal<typeof result, Motion.Point | undefined>>;
	// @ts-expect-error A point coordinate must remain numeric.
	const invalid: Motion.Point = { x: '1', y: 1 };
	void invalid;
});

// events/__tests__/types.test.tsx: should use provided element.
assertUpstreamRegistration('react-case-v1:851a189f86e7bcfe3b45', () => {
	const result = relativeTo(document.createElement('div'))({ x: 12, y: 12 });
	type PointShape = Assert<Equal<Motion.Point, { x: number; y: number }>>;
	type ElementResult = Assert<Equal<typeof result, Motion.Point | undefined>>;
});

// events/__tests__/types.test.tsx: should use the element for a provided ID.
assertUpstreamRegistration('react-case-v1:360bb7641a562fafda9a', () => {
	const result = relativeTo('test')({ x: 12, y: 12 });
	type PointShape = Assert<Equal<Motion.Point, { x: number; y: number }>>;
	type IdResult = Assert<Equal<typeof result, Motion.Point | undefined>>;
});

// motion/__tests__/types.test.tsx: accepts MotionValues at both host entrypoints.
assertUpstreamRegistration('react-case-v1:deac27a39daeb110a1cc', () => {
	const x = Motion.useMotionValue(0);
	const transition: Motion.ValueTransition = { duration: 1, ease: 'easeInOut' };
	type Value = Assert<Equal<typeof x, Motion.MotionValue<number>>>;
	type Duration = Assert<Equal<Motion.ValueTransition['duration'], number | undefined>>;
	void transition;
});

// motion/__tests__/types.test.tsx: accepts expected target and transition values.
assertUpstreamRegistration('react-case-v1:1d37b168eaa5af0110d1', () => {
	const target: Motion.TargetAndTransition = {
		x: 100,
		translateX: 100,
		originX: 0.5,
		backgroundColor: 'red',
		pathOffset: 0.5,
		transition: { originX: {}, x: {}, translateX: {}, backgroundColor: {}, pathOffset: {} },
	};
	type Duration = Assert<Equal<Motion.ValueTransition['duration'], number | undefined>>;
	void target;
});
