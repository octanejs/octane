import { describe, expect, it, vi } from 'vitest';
import { createContext } from 'octane';
import { createContext as createServerContext } from 'octane/server';
import { createContext as createNativeContext } from 'octane/universal/native';

describe('context public API', () => {
	for (const [renderer, factory] of [
		['client', createContext],
		['server', createServerContext],
		['native', createNativeContext],
	] as const) {
		it(`${renderer} exposes the context itself without a legacy Provider property`, () => {
			const context = factory('default');
			expect(typeof context).toBe('function');
			expect(context.defaultValue).toBe('default');
			expect('Provider' in context).toBe(false);
		});
	}

	it('provides a context created by another loaded runtime copy', async () => {
		const context = createNativeContext('default');
		vi.resetModules();
		const runtime = await import('../src/universal-native.js');
		const container = runtime.createObjectContainer('context-copy');
		const root = runtime.createUniversalRoot(container, runtime.createObjectDriver('context-copy'));
		const plan = runtime.universalPlan('context-copy', {
			kind: 'host',
			type: 'label',
			bindings: [['value', 0]],
		});
		const Reader = runtime.defineUniversalComponent('context-copy', () =>
			runtime.universalValue(plan, [runtime.useContext(context)]),
		);
		const App = runtime.defineUniversalComponent('context-copy', (props: { value: string }) =>
			runtime.universalComponent(
				'context-copy',
				context as unknown as import('../src/universal-core.js').UniversalComponent,
				{
					value: props.value,
					children: () => runtime.universalComponent('context-copy', Reader),
				},
			),
		);
		try {
			root.render(App, { value: 'dark' });
			expect(container.children[0].props.value).toBe('dark');
			root.render(App, { value: 'light' });
			expect(container.children[0].props.value).toBe('light');
		} finally {
			root.unmount();
		}
		expect(container.children).toEqual([]);
	});
});
