// @vitest-environment jsdom
import { cleanup, render, waitFor } from '@octanejs/testing-library';
import {
	cleanup as cleanupReact,
	render as renderReact,
	waitFor as waitForReact,
} from '@testing-library/react';
import type { Root } from 'hast';
import { createElement } from 'octane';
import { createElement as createReactElement } from 'react';
import { MarkdownHooks as ReactMarkdownHooks } from 'react-markdown';
import rehypeStarryNight from 'rehype-starry-night';
import type { Plugin } from 'unified';
import { afterEach, describe, expect, it } from 'vitest';
import { MarkdownHooks } from '../../src/index';
import type { HooksOptions } from '../../src/types';
import { HooksErrorBoundary } from './fixtures.tsrx';

afterEach(() => {
	cleanup();
	cleanupReact();
});

function deferred() {
	let resolve!: () => void;
	let reject!: (error: Error) => void;
	const promise = new Promise<void>((yes, no) => {
		resolve = yes;
		reject = no;
	});
	return { promise, resolve, reject };
}

function controlledPlugin(runs: Array<ReturnType<typeof deferred>>, label: string): Plugin<[]> {
	return () => async (tree: Root) => {
		const run = deferred();
		runs.push(run);
		await run.promise;
		tree.children.push({ type: 'text', value: label });
	};
}

function fallback(label = 'loading') {
	return createElement('span', { 'data-testid': 'fallback', children: label });
}

describe('MarkdownHooks lifecycle', () => {
	it('matches the pinned no-fallback initial empty DOM and resolved paragraph', async () => {
		const runs: Array<ReturnType<typeof deferred>> = [];
		const view = render(MarkdownHooks, {
			props: { children: 'a', rehypePlugins: [controlledPlugin(runs, '')] },
		});
		expect(view.container.innerHTML).toBe('');
		runs[0].resolve();
		await waitFor(() =>
			expect(view.container.innerHTML.replace(/<!--.*?-->/g, '')).toBe('<p>a</p>'),
		);
	});
	it('matches exact async MarkdownHooks starry-night JavaScript highlighted HTML', async () => {
		const runs: Array<ReturnType<typeof deferred>> = [];
		const view = render(MarkdownHooks, {
			props: {
				children: '```js\nconsole.log(3.14)',
				rehypePlugins: [controlledPlugin(runs, ''), rehypeStarryNight],
			},
		});
		expect(view.container.innerHTML).toBe('');
		runs[0].resolve();
		const expected =
			'<pre><code class="language-js"><span class="pl-en">console</span>.<span class="pl-c1">log</span>(<span class="pl-c1">3.14</span>)\n</code></pre>';
		await waitFor(() => expect(view.container.innerHTML.replace(/<!--.*?-->/g, '')).toBe(expected));
	});
	it('matches pristine fallback and async resolution', async () => {
		const octaneRuns: Array<ReturnType<typeof deferred>> = [];
		const reactRuns: Array<ReturnType<typeof deferred>> = [];
		const octane = render(MarkdownHooks, {
			props: {
				children: '# parity',
				fallback: fallback(),
				rehypePlugins: [controlledPlugin(octaneRuns, ':done')],
			},
		});
		const react = renderReact(
			createReactElement(ReactMarkdownHooks, {
				children: '# parity',
				fallback: createReactElement('span', null, 'loading'),
				rehypePlugins: [controlledPlugin(reactRuns, ':done')],
			}),
		);
		expect(octane.container.textContent).toBe(react.container.textContent);
		octaneRuns[0].resolve();
		reactRuns[0].resolve();
		await waitFor(() => expect(octane.container.textContent).toBe('parity:done'));
		await waitForReact(() => expect(react.container.textContent).toBe('parity:done'));
		expect(octane.container.textContent).toBe(react.container.textContent);
	});

	it('rerenders a to b, resolves both async runs, and commits only b', async () => {
		const runs: Array<ReturnType<typeof deferred>> = [];
		const plugin = controlledPlugin(runs, '');
		const view = render(MarkdownHooks, { props: { children: 'a', rehypePlugins: [plugin] } });
		expect(view.container.innerHTML).toBe('');
		view.rerender(MarkdownHooks, { props: { children: 'b', rehypePlugins: [plugin] } });
		expect(runs).toHaveLength(2);
		runs[0].resolve();
		await Promise.resolve();
		expect(view.container.textContent).not.toBe('a');
		runs[1].resolve();
		await waitFor(() => expect(view.container.textContent).toBe('b'));
		expect(view.container.textContent).toBe('b');
	});

	it('surfaces async errors through rendering', async () => {
		const failure = () => async () => {
			await Promise.resolve();
			throw new Error('hooks-plugin-failure');
		};
		const options: HooksOptions = {
			children: 'x',
			fallback: fallback(),
			rehypePlugins: [failure],
		};
		const view = render(HooksErrorBoundary, { props: { options } });
		await waitFor(() =>
			expect(view.getByTestId('hooks-error').textContent).toBe('hooks-plugin-failure'),
		);
	});
});
