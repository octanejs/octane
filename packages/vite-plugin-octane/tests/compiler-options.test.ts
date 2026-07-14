import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	octaneCompiler: vi.fn(),
}));

vi.mock('octane/compiler/vite', () => ({
	octane: mocks.octaneCompiler,
}));

import { octane } from '../src/index.js';

describe('octane() compiler options', () => {
	beforeEach(() => {
		mocks.octaneCompiler.mockReset().mockReturnValue({ name: 'mock-octane-compiler' });
	});

	it('forwards the public compiler switches without dropping profile or parallelUse', () => {
		const options = {
			hmr: false,
			profile: true,
			parallelUse: false,
			exclude: ['/generated/'],
		};
		const [compiler] = octane(options);

		expect(mocks.octaneCompiler).toHaveBeenCalledOnce();
		expect(mocks.octaneCompiler).toHaveBeenCalledWith(options);
		expect(compiler).toEqual({ name: 'mock-octane-compiler' });
	});
});
