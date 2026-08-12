import { afterEach, describe, expect, it, vi } from 'vitest';
import { drainPassiveEffects, flushSync } from 'octane';
import { mount } from '../../../octane/tests/_helpers';
import { SpringRafFixture } from '../_fixtures/spring-raf.tsrx';

let view: ReturnType<typeof mount> | undefined;

afterEach(function cleanup() {
	view?.unmount();
	view = undefined;
	vi.restoreAllMocks();
});

describe('@octanejs/visx react-spring RAF interpolator', function springRafSuite() {
	// OCTANE DIVERGENCE[visx-react-spring-raf-interpolation][adapted:visx-react-spring-raf]:
	// Numeric RAF interpolation replaces react-spring spring-physics timing.
	// @parity-case adapted:visx-react-spring-raf
	it('interpolates numeric spring targets on a fixed 250ms RAF timeline', function observesRafInterpolation() {
		const frames: FrameRequestCallback[] = [];
		let now = 1_000;
		vi.spyOn(performance, 'now').mockImplementation(function readNow() {
			return now;
		});
		vi.spyOn(window, 'requestAnimationFrame').mockImplementation(function queueFrame(callback) {
			frames.push(callback);
			return frames.length;
		});
		vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(function noopCancel() {});

		function drive(timestamp: number) {
			flushSync(function runFrames() {
				now = timestamp;
				const pending = frames.splice(0, frames.length);
				for (const frame of pending) {
					frame(timestamp);
				}
			});
		}

		view = mount(SpringRafFixture, { value: 0 });
		drive(now);
		drainPassiveEffects();
		expect(view.find('#spring-value').textContent).toBe('0');
		frames.length = 0;

		flushSync(function updateTarget() {
			view!.update(SpringRafFixture, { value: 100 });
		});
		drainPassiveEffects();
		expect(frames.length).toBeGreaterThan(0);

		drive(1_125);
		expect(view.find('#spring-value').textContent).toBe('50');

		drive(1_250);
		expect(view.find('#spring-value').textContent).toBe('100');
	});
});
