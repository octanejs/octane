/**
 * Compile-and-mount tests for the markdown surface: the `.mdx` fixtures are
 * transformed by `octaneMdx()` (vitest.config.js) through the full pipeline —
 * @mdx-js/mdx (JSX source) → octane/compiler — and mounted with
 * @octanejs/testing-library like any other octane component.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@octanejs/testing-library';
// @ts-expect-error — .mdx modules are produced by the vite plugin; no ambient types in tests.
import BasicDoc from './_fixtures/basic.mdx';
// @ts-expect-error — see above.
import GfmDoc from './_fixtures/gfm.mdx';
// @ts-expect-error — .md rides the same pipeline in plain-markdown format.
import PlainDoc from './_fixtures/plain.md';

afterEach(cleanup);

describe('markdown rendering', () => {
	it('renders headings, emphasis, lists, quotes and code blocks', () => {
		const { container } = render(BasicDoc);
		expect(container.querySelector('h1')?.textContent).toBe('Hello, MDX');
		expect(container.querySelector('em')?.textContent).toBe('emphasis');
		expect(container.querySelector('strong')?.textContent).toBe('strong');
		expect(container.querySelector('code')?.textContent).toBe('inline code');
		expect(container.querySelectorAll('ul > li')).toHaveLength(2);
		expect(container.querySelectorAll('ol > li')).toHaveLength(2);
		expect(container.querySelector('blockquote')?.textContent).toContain('quoted');
		const codeBlock = container.querySelector('pre > code');
		expect(codeBlock?.className).toContain('language-js');
		expect(codeBlock?.textContent).toBe('const x = 1;\n');
	});

	it('renders GFM tables, strikethrough, task lists and autolinks (remark-gfm)', () => {
		const { container } = render(GfmDoc);
		const headers = [...container.querySelectorAll('table thead th')];
		expect(headers.map((th) => th.textContent)).toEqual(['Name', 'Value']);
		// Column alignment survives the pipeline (MDX emits style={{textAlign}}).
		expect((headers[0] as HTMLElement).style.textAlign).toBe('left');
		expect((headers[1] as HTMLElement).style.textAlign).toBe('right');
		expect(container.querySelectorAll('table tbody tr')).toHaveLength(2);
		expect(container.querySelector('del')?.textContent).toBe('gone');
		const boxes = [...container.querySelectorAll('input[type="checkbox"]')];
		expect(boxes).toHaveLength(2);
		expect(container.querySelector('a')?.getAttribute('href')).toBe('http://www.example.com');
	});

	it('renders plain .md in markdown format — JSX/expression syntax stays literal text', () => {
		const { container } = render(PlainDoc);
		expect(container.querySelector('h1')?.textContent).toBe('Plain markdown');
		expect(container.querySelector('em')?.textContent).toBe('markdown');
		expect(container.textContent).toContain('<Counter/>');
		expect(container.textContent).toContain('{expressions}');
	});
});
