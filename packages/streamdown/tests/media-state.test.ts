import { describe, expect, it, vi } from 'vitest';
import { createElement, drainPassiveEffects, flushSync } from 'octane';
import { Streamdown, type DiagramPlugin, type StreamdownProps } from '@octanejs/streamdown';
import { mount } from '../../octane/tests/_helpers';
import { Mermaid } from '../src/lib/mermaid/index.tsrx';
import { PluginContext } from '../src/lib/plugin-context.tsrx';

interface Deferred<T> {
	promise: Promise<T>;
	resolve(value: T): void;
}

function deferred<T>(): Deferred<T> {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((complete) => {
		resolve = complete;
	});
	return { promise, resolve };
}

function StreamdownHarness(props: StreamdownProps) {
	return createElement(Streamdown, props);
}

function MermaidHarness({ chart, plugin }: { chart: string; plugin: DiagramPlugin }) {
	return createElement(PluginContext.Provider, {
		value: { mermaid: plugin },
		children: createElement(Mermaid, {
			chart,
			fullscreen: true,
			showControls: false,
		}),
	});
}

async function flushAsyncWork(): Promise<void> {
	await Promise.resolve();
	flushSync(() => {});
	drainPassiveEffects();
}

describe('@octanejs/streamdown media state', () => {
	it('ignores an older Mermaid render that settles after the current chart', async () => {
		const renders = new Map<string, Deferred<{ svg: string }>>();
		const plugin: DiagramPlugin = {
			getMermaid: () => ({
				initialize: () => {},
				render: (_id, source) => {
					const render = deferred<{ svg: string }>();
					renders.set(source, render);
					return render.promise;
				},
			}),
			language: 'mermaid',
			name: 'mermaid',
			type: 'diagram',
		};
		const mounted = mount(MermaidHarness, { chart: 'OLD', plugin });

		try {
			await vi.waitFor(() => {
				flushSync(() => {});
				drainPassiveEffects();
				expect(renders.has('OLD')).toBe(true);
			});

			mounted.update(MermaidHarness, { chart: 'NEW', plugin });
			await vi.waitFor(() => {
				flushSync(() => {});
				drainPassiveEffects();
				expect(renders.has('NEW')).toBe(true);
			});

			renders.get('NEW')?.resolve({ svg: '<svg data-chart="new" />' });
			await flushAsyncWork();
			expect(mounted.find('[role="img"]').innerHTML).toContain('data-chart="new"');

			renders.get('OLD')?.resolve({ svg: '<svg data-chart="old" />' });
			await flushAsyncWork();
			expect(mounted.find('[role="img"]').innerHTML).toContain('data-chart="new"');
			expect(mounted.container.innerHTML).not.toContain('data-chart="old"');
		} finally {
			mounted.unmount();
		}
	});

	it('resets image state when Markdown replaces the source at the same position', () => {
		const props = {
			controls: false,
			mode: 'static' as const,
		};
		const mounted = mount(StreamdownHarness, {
			...props,
			children: '![diagram](/one.png)',
		});

		try {
			const firstImage = mounted.find('[data-streamdown="image"]');
			expect(firstImage.getAttribute('src')).toBe('/one.png');

			flushSync(() => {
				firstImage.dispatchEvent(new Event('error'));
			});
			expect(mounted.container.querySelector('[data-streamdown="image-fallback"]')).not.toBeNull();

			mounted.update(StreamdownHarness, {
				...props,
				children: '![diagram](/two.png)',
			});
			drainPassiveEffects();
			flushSync(() => {});

			expect(mounted.find('[data-streamdown="image"]').getAttribute('src')).toBe('/two.png');
			expect(mounted.container.querySelector('[data-streamdown="image-fallback"]')).toBeNull();
		} finally {
			mounted.unmount();
		}
	});
});
