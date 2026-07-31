import type { BundledLanguage } from 'shiki';
import { describe, expect, it, vi } from 'vitest';
import { createRoot, drainPassiveEffects, flushSync } from 'octane';
import { Streamdown, type CodeHighlighterPlugin, type HighlightResult } from '@octanejs/streamdown';

const FIRST_CODE = 'const first = 1;';
const SECOND_CODE = 'const second = 2;\nconst third = 3;';

const markdown = (code: string): string => `\`\`\`typescript\n${code}\n\`\`\``;

const highlightResult = (content: string): HighlightResult => ({
	bg: 'transparent',
	fg: 'inherit',
	tokens: [[{ content, offset: 0 }]],
});

describe('@octanejs/streamdown asynchronous highlighting', () => {
	it('does not project a stale callback over newer streamed source', async () => {
		const callbacks = new Map<string, (result: HighlightResult) => void>();
		const codePlugin: CodeHighlighterPlugin = {
			name: 'shiki',
			type: 'code-highlighter',
			getSupportedLanguages: () => ['typescript'],
			getThemes: () => ['github-light', 'github-dark'],
			supportsLanguage: (language: BundledLanguage) => language === 'typescript',
			highlight: ({ code }, callback) => {
				if (callback) callbacks.set(code, callback);
				return null;
			},
		};
		const plugins = { code: codePlugin };
		const container = document.createElement('div');
		document.body.appendChild(container);
		const root = createRoot(container);
		const render = (code: string) => {
			root.render(Streamdown, {
				children: markdown(code),
				controls: false,
				lineNumbers: false,
				mode: 'static',
				plugins,
			});
			flushSync(() => {});
			drainPassiveEffects();
		};

		try {
			render(FIRST_CODE);
			await vi.waitFor(() => {
				flushSync(() => {});
				drainPassiveEffects();
				expect(callbacks.has(FIRST_CODE)).toBe(true);
			});
			const firstCallback = callbacks.get(FIRST_CODE);
			expect(firstCallback).toBeDefined();

			render(SECOND_CODE);
			await vi.waitFor(() => {
				flushSync(() => {});
				drainPassiveEffects();
				expect(callbacks.has(SECOND_CODE)).toBe(true);
			});
			const secondCallback = callbacks.get(SECOND_CODE);
			expect(secondCallback).toBeDefined();

			flushSync(() => secondCallback?.(highlightResult('FRESH')));
			expect(container.querySelector('code')?.textContent).toBe('FRESH');

			flushSync(() => firstCallback?.(highlightResult('STALE')));
			expect(container.querySelector('code')?.textContent).toBe('FRESH');
			expect(container.textContent).not.toContain('STALE');
		} finally {
			root.unmount();
			container.remove();
		}
	});
});
