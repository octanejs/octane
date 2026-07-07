/**
 * Guard for octane's de-opt missing-key warning: a multi-block MDX document's
 * root is a VALUE-position fragment — compiled to `positionalChildren([...])` —
 * whose interleaved `"\n"` text items can never carry keys. React's jsx runtime
 * treats fragment children as STATIC and never key-warns them; octane must not
 * either. (Own file on purpose: the runtime warns ONCE per module, so this must
 * be the first mount in its worker to prove anything.)
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@octanejs/testing-library';
// @ts-expect-error — .mdx modules are produced by the vite plugin; no ambient types in tests.
import BasicDoc from './_fixtures/basic.mdx';

afterEach(cleanup);

describe('markdown key warnings', () => {
	it('mounts a multi-block document without the missing-key warning', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		try {
			const { container } = render(BasicDoc);
			// Sanity: the document really is a multi-item root array (blocks + "\n").
			expect(container.querySelectorAll('h1, p, ul, ol, blockquote, pre').length).toBeGreaterThan(
				3,
			);
			const keyWarnings = warn.mock.calls.filter((args) => /key/i.test(String(args[0])));
			expect(keyWarnings).toEqual([]);
		} finally {
			warn.mockRestore();
		}
	});
});
