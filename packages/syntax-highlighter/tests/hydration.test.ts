import { describe, expect, it, vi } from 'vitest';
import { flushSync, hydrateRoot } from 'octane';
import { renderToString } from 'octane/server';
import SyntaxHighlighter from '../src/index.js';

describe('react-syntax-highlighter hydration', () => {
	// @parity-case conformance:hydration-adoption
	it('adopts highlighted nodes and selected code before supporting a live update', () => {
		const initialProps = {
			language: 'javascript',
			children: 'const answer = 42;',
			useInlineStyles: false,
			'data-testid': 'syntax',
		};
		const serverHtml = renderToString(SyntaxHighlighter, initialProps).html;
		const container = document.createElement('div');
		container.innerHTML = serverHtml;
		document.body.appendChild(container);

		const pre = container.querySelector('pre');
		const code = container.querySelector('code');
		const keyword = container.querySelector('.hljs-keyword');
		const selectedNode = keyword?.firstChild;
		if (!selectedNode) throw new Error('server output omitted the selected token');
		const selection = getSelection();
		const range = document.createRange();
		range.selectNodeContents(selectedNode);
		selection?.removeAllRanges();
		selection?.addRange(range);

		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const root = hydrateRoot(container, SyntaxHighlighter, initialProps);
		flushSync(() => {});

		expect(error).not.toHaveBeenCalled();
		expect(container.innerHTML).toBe(serverHtml);
		expect(container.querySelector('pre')).toBe(pre);
		expect(container.querySelector('code')).toBe(code);
		expect(container.querySelector('.hljs-keyword')).toBe(keyword);
		expect(selection?.toString()).toBe('const');
		expect(selection?.anchorNode).toBe(selectedNode);

		root.render(SyntaxHighlighter, {
			...initialProps,
			language: 'json',
			children: '{"answer":43}',
		});
		flushSync(() => {});
		expect(container.querySelector('code')?.textContent).toBe('{"answer":43}');
		expect(container.querySelector('.hljs-attr')?.textContent).toBe('"answer"');

		root.unmount();
		error.mockRestore();
		selection?.removeAllRanges();
		container.remove();
	});
});
