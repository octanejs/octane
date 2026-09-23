import { afterEach, beforeEach, vi } from 'vitest';

// jsdom provides no resize observation; layout and measurement are covered in Chromium.
beforeEach(() => {
	if (typeof ResizeObserver === 'undefined') {
		vi.stubGlobal(
			'ResizeObserver',
			class {
				observe(): void {}
				unobserve(): void {}
				disconnect(): void {}
			},
		);
	}
});

afterEach(() => {
	vi.unstubAllGlobals();
});
