/**
 * Frontmatter — remark-frontmatter parses the YAML block out of the document
 * and remark-mdx-frontmatter exports it (`export const frontmatter = {…}`) and
 * makes it available to inline expressions.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@octanejs/testing-library';
// @ts-expect-error — .mdx modules are produced by the vite plugin; no ambient types in tests.
import FrontmatterDoc, { frontmatter } from './_fixtures/frontmatter.mdx';

afterEach(cleanup);

describe('frontmatter', () => {
	it('exports the parsed frontmatter object', () => {
		expect(frontmatter).toEqual({ title: 'Doc Title', tags: ['octane', 'mdx'] });
	});

	it('does not render the frontmatter block, and its values reach expressions', () => {
		const { container } = render(FrontmatterDoc);
		expect(container.querySelector('h1')?.textContent).toBe('Doc Title');
		expect(container.textContent).toContain('Tagged 2 ways.');
		// The YAML block itself must not leak into the output.
		expect(container.textContent).not.toContain('title:');
	});
});
