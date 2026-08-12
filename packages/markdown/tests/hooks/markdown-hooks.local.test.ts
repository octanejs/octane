// @vitest-environment jsdom
import { cleanup, render, waitFor } from '@octanejs/testing-library';
import type { Root } from 'hast';
import { createElement } from 'octane';
import type { Plugin } from 'unified';
import { afterEach, describe, expect, it } from 'vitest';
import { MarkdownHooks } from '../../src/index';
import type { HooksOptions } from '../../src/types';
import { HooksErrorBoundary } from './fixtures.tsrx';

afterEach(() => {
	cleanup();
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
	it('renders fallback then commits resolved async output', async () => {
		const runs: Array<ReturnType<typeof deferred>> = [];
		const view = render(MarkdownHooks, {
			props: {
				children: '# ready',
				fallback: fallback(),
				rehypePlugins: [controlledPlugin(runs, ':done')],
			},
		});
		expect(view.getByTestId('fallback').textContent).toBe('loading');
		expect(runs).toHaveLength(1);
		runs[0].resolve();
		await waitFor(() => expect(view.container.textContent).toBe('ready:done'));
	});

	it('cancels stale work and only commits the latest input', async () => {
		const runs: Array<ReturnType<typeof deferred>> = [];
		const plugin = controlledPlugin(runs, ':settled');
		const view = render(MarkdownHooks, {
			props: { children: '# old', fallback: fallback(), rehypePlugins: [plugin] },
		});
		view.rerender(MarkdownHooks, {
			props: { children: '# new', fallback: fallback(), rehypePlugins: [plugin] },
		});
		expect(runs).toHaveLength(2);
		runs[1].resolve();
		await waitFor(() => expect(view.container.textContent).toBe('new:settled'));
		runs[0].resolve();
		await Promise.resolve();
		await Promise.resolve();
		expect(view.container.textContent).toBe('new:settled');
	});

	it('reruns for each pinned effect dependency identity', () => {
		const runs: Array<ReturnType<typeof deferred>> = [];
		const pluginA = controlledPlugin(runs, 'a');
		const pluginB = controlledPlugin(runs, 'b');
		const view = render(MarkdownHooks, {
			props: { children: 'x', rehypePlugins: [pluginA] },
		});
		expect(runs).toHaveLength(1);
		view.rerender(MarkdownHooks, {
			props: { children: 'x', rehypePlugins: [pluginB] },
		});
		expect(runs).toHaveLength(2);
		view.rerender(MarkdownHooks, {
			props: {
				children: 'x',
				rehypePlugins: [pluginB],
				remarkRehypeOptions: { clobberPrefix: 'changed-' },
			},
		});
		expect(runs).toHaveLength(3);
	});

	it('recovers on a clean remount after an errored run', async () => {
		const failure = () => async () => {
			throw new Error('recoverable');
		};
		const options: HooksOptions = {
			children: 'before',
			fallback: fallback(),
			rehypePlugins: [failure],
		};
		const view = render(HooksErrorBoundary, { props: { options } });
		await waitFor(() => expect(view.getByTestId('hooks-error')).toBeTruthy());
		view.unmount();
		const recovered = render(MarkdownHooks, {
			props: { children: '# recovered', rehypePlugins: [] },
		});
		await waitFor(() => expect(recovered.container.textContent).toBe('recovered'));
	});

	it('prevents pending work from committing after unmount', async () => {
		const runs: Array<ReturnType<typeof deferred>> = [];
		const view = render(MarkdownHooks, {
			props: {
				children: '# obsolete',
				fallback: fallback(),
				rehypePlugins: [controlledPlugin(runs, ':late')],
			},
		});
		view.unmount();
		runs[0].resolve();
		await Promise.resolve();
		await Promise.resolve();
		expect(view.container.textContent).toBe('');
	});
});
