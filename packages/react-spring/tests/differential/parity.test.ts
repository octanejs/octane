/**
 * Differential parity: the same numeric spring settle path runs through
 * @octanejs/react-spring and the published @react-spring/web 10.1.2 oracle.
 */
import { SpringValue as OctaneSpringValue } from '@octanejs/react-spring';
import { SpringValue as ReactSpringValue } from '@react-spring/web';
import { raf } from '@react-spring/rafz';
import { afterEach, describe, expect, it } from 'vitest';

afterEach(function restoreFrameLoop() {
	raf.frameLoop = 'always';
});

function advanceUntilIdle(limit = 240): void {
	const now = raf.now;
	let time = now();
	raf.now = function advanceNow() {
		time += 16.667;
		return time;
	};
	try {
		for (let frame = 0; frame < limit; frame += 1) raf.advance();
	} finally {
		raf.now = now;
	}
}

async function settleSpring(
	SpringValue: typeof OctaneSpringValue,
	from: number,
	to: number,
): Promise<number> {
	raf.frameLoop = 'demand';
	const spring = new SpringValue(from);
	const done = spring.start({ to, config: { tension: 170, friction: 26 } });
	advanceUntilIdle();
	await done;
	return spring.get();
}

describe('differential: @octanejs/react-spring vs @react-spring/web', function differentialSuite() {
	// @parity-case differential:spring-value-settle
	it('SpringValue: settles an identical numeric goal to the same final value', async function springValueSettle() {
		const octane = await settleSpring(OctaneSpringValue, 0, 100);
		const upstream = await settleSpring(ReactSpringValue as typeof OctaneSpringValue, 0, 100);
		expect(octane).toBe(upstream);
		expect(octane).toBe(100);
	});
});
