import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	compile: vi.fn(),
}));

vi.mock('octane/compiler', () => ({
	compile: mocks.compile,
}));

import { compileMdxSync } from '../src/compile.js';

describe('MDX compiler options', () => {
	beforeEach(() => {
		mocks.compile
			.mockReset()
			.mockReturnValue({ code: 'export default function MDXContent() {}', map: null });
	});

	it('forwards the production auto-memoization opt-out', () => {
		compileMdxSync('# hi\n', '/docs/doc.mdx', { autoMemo: false });

		expect(mocks.compile).toHaveBeenCalledWith(
			expect.any(String),
			'/docs/doc.mdx',
			expect.objectContaining({ mode: 'client', autoMemo: false }),
		);
	});
});
