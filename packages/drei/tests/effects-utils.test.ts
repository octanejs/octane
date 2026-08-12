import { isWebGL2Available as reactIsWebGL2Available } from '@react-three/drei/core/Effects.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isWebGL2Available } from '../src/index.js';

afterEach(() => vi.restoreAllMocks());

describe('isWebGL2Available', () => {
	it('matches support detection when the constructor and context exist', () => {
		const context = {} as WebGL2RenderingContext;
		vi.stubGlobal('WebGL2RenderingContext', function WebGL2RenderingContext() {});
		vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context);
		expect(isWebGL2Available()).toBe(reactIsWebGL2Available());
		expect(isWebGL2Available()).toBe(true);
	});

	it('matches unavailable contexts and exception fallback', () => {
		vi.stubGlobal('WebGL2RenderingContext', function WebGL2RenderingContext() {});
		vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
		expect(isWebGL2Available()).toBe(reactIsWebGL2Available());
		expect(isWebGL2Available()).toBe(false);

		vi.spyOn(document, 'createElement').mockImplementation(() => {
			throw new Error('document unavailable');
		});
		expect(isWebGL2Available()).toBe(reactIsWebGL2Available());
		expect(isWebGL2Available()).toBe(false);
	});
});
