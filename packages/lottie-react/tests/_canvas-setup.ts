import { vi } from 'vitest';

// lottie-web initializes a transparent pixel even when the tests use its SVG renderer.
vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
	fillRect() {},
} as unknown as CanvasRenderingContext2D);
