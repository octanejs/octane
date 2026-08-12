import type { Link, Root } from 'mdast';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { visit } from 'unist-util-visit';
import { describe, expect, it, vi } from 'vitest';
import { createCjkPlugin } from '@octanejs/streamdown/cjk';
import { createCodePlugin } from '@octanejs/streamdown/code';
import { createMathPlugin } from '@octanejs/streamdown/math';
import { createMermaidPlugin } from '@octanejs/streamdown/mermaid';

describe('@octanejs/streamdown plugin entry points', () => {
	it('preserves Shiki themes, aliases, async delivery, and token caching', async () => {
		const plugin = createCodePlugin();
		expect(plugin.getThemes()).toEqual(['github-light', 'github-dark']);
		expect(plugin.supportsLanguage('javascript')).toBe(true);
		expect(plugin.supportsLanguage('js')).toBe(true);
		expect(plugin.supportsLanguage('not-a-real-language')).toBe(false);
		expect(plugin.getSupportedLanguages()).toContain('typescript');

		const options = {
			code: 'const octaneStreamdownPluginParity = 2500;',
			language: 'javascript' as const,
			themes: plugin.getThemes(),
		};
		const callback = vi.fn();

		expect(plugin.highlight(options, callback)).toBeNull();
		await vi.waitFor(() => expect(callback).toHaveBeenCalledOnce(), { timeout: 10_000 });

		const delivered = callback.mock.calls[0]?.[0];
		expect(delivered).toHaveProperty('tokens');
		expect(delivered).toHaveProperty('bg');
		expect(delivered).toHaveProperty('fg');
		expect(plugin.highlight(options)).toBe(delivered);
	});

	it('passes math options to the official remark and rehype plugins', () => {
		const plugin = createMathPlugin({
			errorColor: '#ff0000',
			singleDollarTextMath: true,
		});

		expect(plugin.remarkPlugin).toEqual([expect.any(Function), { singleDollarTextMath: true }]);
		expect(plugin.rehypePlugin).toEqual([expect.any(Function), { errorColor: '#ff0000' }]);
		expect(plugin.getStyles?.()).toBe('katex/dist/katex.min.css');
	});

	it('runs the CJK post-GFM boundary transform in the documented order', async () => {
		const plugin = createCjkPlugin();
		expect(plugin.remarkPluginsBefore).toHaveLength(1);
		expect(plugin.remarkPluginsAfter).toHaveLength(2);
		expect(plugin.remarkPlugins).toEqual([
			...plugin.remarkPluginsBefore,
			...plugin.remarkPluginsAfter,
		]);

		const processor = unified().use(remarkParse).use(remarkGfm).use(plugin.remarkPluginsAfter[0]);
		const tree = (await processor.run(processor.parse('请访问 https://example.com。谢谢'))) as Root;
		const links: Link[] = [];
		visit(tree, 'link', (node) => {
			links.push(node);
		});

		expect(links).toHaveLength(1);
		expect(links[0]?.url).toBe('https://example.com');
	});

	it('initializes Mermaid and renders a real SVG document', async () => {
		Object.defineProperty(SVGElement.prototype, 'getBBox', {
			configurable: true,
			value: () => ({ height: 50, width: 100, x: 0, y: 0 }),
		});
		Object.defineProperty(SVGElement.prototype, 'getComputedTextLength', {
			configurable: true,
			value: () => 100,
		});

		const plugin = createMermaidPlugin({
			config: { securityLevel: 'strict', theme: 'forest' },
		});
		const instance = plugin.getMermaid({ fontFamily: 'monospace' });
		const result = await instance.render(
			'octane-streamdown-mermaid',
			'graph TD\nA[Octane] --> B[Streamdown]',
		);

		expect(result.svg).toContain('<svg');
		expect(result.svg).toContain('Octane');
		expect(result.svg).toContain('Streamdown');
	});
});
