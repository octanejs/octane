import { describe, expect, it } from 'vitest';
import { renderToString } from 'octane/server';
import SyntaxHighlighter, { LightAsync, Prism } from '../../src/index.js';

describe('react-syntax-highlighter server rendering', () => {
	// @parity-case ssr:sync-variants
	it('renders synchronous Highlight.js and Prism variants without DOM globals', () => {
		const highlighted = renderToString(SyntaxHighlighter, {
			language: 'javascript',
			children: 'const answer = 42;',
			useInlineStyles: false,
		}).html;
		const prism = renderToString(Prism, {
			language: 'javascript',
			children: 'const answer = 42;',
			useInlineStyles: false,
		}).html;

		expect(highlighted).toContain('class="hljs-keyword"');
		expect(prism).toContain('class="token keyword"');
		expect(highlighted.replace(/<[^>]+>/g, '')).toBe('const answer = 42;');
		expect(prism.replace(/<[^>]+>/g, '')).toBe('const answer = 42;');
	});

	// @parity-case ssr:async-fallback
	it('renders the deterministic plain fallback for async variants', () => {
		const { html } = renderToString(LightAsync, {
			language: 'javascript',
			children: 'const pending = true;',
		});
		expect(html).toContain('<pre');
		expect(html).toContain('<code');
		expect(html).toContain('const pending = true;');
		expect(html).not.toContain('hljs-keyword');
	});
});
