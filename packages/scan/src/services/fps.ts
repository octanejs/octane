// FpsMeter — the browser's paint cadence as a number. One responsibility: run a
// single frame-count loop and expose the last full second's frame count plus a
// severity color. Engine-agnostic (it observes the browser, not any renderer),
// so it lives beside the other services rather than in an adapter. Lazily
// started on first read so importing under SSR stays inert.
export interface FpsMeter {
	value(): number;
	color(value: number): string;
}

export function createFpsMeter(): FpsMeter {
	let fps = 0;
	let lastTime = 0;
	let frameCount = 0;
	let started = false;

	function tick(now: number): void {
		frameCount++;
		if (now - lastTime >= 1000) {
			fps = frameCount;
			frameCount = 0;
			lastTime = now;
		}
		requestAnimationFrame(tick);
	}

	return {
		value() {
			if (!started) {
				if (typeof requestAnimationFrame === 'undefined') return 0;
				started = true;
				fps = 60;
				lastTime = typeof performance !== 'undefined' ? performance.now() : 0;
				requestAnimationFrame(tick);
			}
			return fps;
		},
		// react-scan's thresholds: red <30, amber <50, brand purple otherwise.
		color(value) {
			if (value < 30) return '#ef4444';
			if (value < 50) return '#f59e0b';
			return 'rgb(214, 132, 245)';
		},
	};
}
