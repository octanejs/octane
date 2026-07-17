import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@octanejs/testing-library';
import { createElement } from 'octane';

// The real @tanstack/devtools core lazily imports a DOM-heavy Solid UI module on
// mount. We replace it with a lightweight fake that records constructor args and
// mount/unmount/setConfig calls, so these tests exercise the OCTANE binding's own
// logic — plugin/title/trigger mapping and the portal flow — deterministically and
// without the Solid renderer.
const { instances } = vi.hoisted(() => ({ instances: [] as Array<FakeCore> }));

interface FakeCore {
	config: any;
	plugins: any;
	eventBusConfig: any;
	mount: ReturnType<typeof vi.fn>;
	unmount: ReturnType<typeof vi.fn>;
	setConfig: ReturnType<typeof vi.fn>;
}

vi.mock('@tanstack/devtools', () => {
	class TanStackDevtoolsCore {
		config: any;
		plugins: any;
		eventBusConfig: any;
		mount = vi.fn();
		unmount = vi.fn();
		setConfig = vi.fn((c: any) => {
			if (c.plugins) this.plugins = c.plugins;
		});
		constructor(init: any) {
			this.config = init.config;
			this.plugins = init.plugins;
			this.eventBusConfig = init.eventBusConfig;
			instances.push(this as unknown as FakeCore);
		}
	}
	return {
		TanStackDevtoolsCore,
		PLUGIN_CONTAINER_ID: 'plugin',
		PLUGIN_TITLE_CONTAINER_ID: 'plugin-title',
	};
});

const { TanStackDevtools } = await import('@octanejs/tanstack-devtools');

// A DOM node the fake core "hands back" to a render/name callback, mirroring the
// container the real core creates (identified by an id attribute already in the doc).
function makeContainer(id: string): HTMLElement {
	const el = document.createElement('div');
	el.setAttribute('id', id);
	document.body.appendChild(el);
	return el;
}

beforeEach(() => {
	instances.length = 0;
	document.body.querySelectorAll('[data-container]').forEach((n) => n.remove());
});

describe('@octanejs/tanstack-devtools', () => {
	it('mounts the core into its anchor element and cleans up on unmount', () => {
		const { container, unmount } = render(createElement(TanStackDevtools, { plugins: [] }));

		const anchor = container.querySelector('div');
		expect(anchor).toBeTruthy();
		expect(anchor?.getAttribute('style')).toContain('position');

		expect(instances).toHaveLength(1);
		expect(instances[0].mount).toHaveBeenCalledTimes(1);
		expect(instances[0].mount).toHaveBeenCalledWith(anchor);

		unmount();
		expect(instances[0].unmount).toHaveBeenCalledTimes(1);
	});

	it('passes mapped plugins to the core and keeps id / defaultOpen', () => {
		render(
			createElement(TanStackDevtools, {
				plugins: [{ id: 'my-plugin', name: 'My Plugin', defaultOpen: true, render: () => null }],
			}),
		);

		const mapped = instances[0].plugins;
		expect(mapped).toHaveLength(1);
		expect(mapped[0].id).toBe('my-plugin');
		expect(mapped[0].defaultOpen).toBe(true);
		// A string name is passed through verbatim; render is wrapped into a core callback.
		expect(mapped[0].name).toBe('My Plugin');
		expect(typeof mapped[0].render).toBe('function');
	});

	it('portals an element-form plugin render into the container the core provides', () => {
		render(
			createElement(TanStackDevtools, {
				plugins: [
					{
						id: 'panel',
						name: 'Panel',
						render: createElement('span', { children: 'from-element' }),
					},
				],
			}),
		);

		const el = makeContainer('panel');
		el.setAttribute('data-container', '');
		act(() => {
			instances[0].plugins[0].render(el, { theme: 'dark', devtoolsOpen: true });
		});

		expect(el.textContent).toContain('from-element');
	});

	it('calls a function-form plugin render with (el, props) and portals its result', () => {
		render(
			createElement(TanStackDevtools, {
				plugins: [
					{
						id: 'fn-panel',
						name: 'Fn Panel',
						render: (el: HTMLElement, props: { theme: string }) =>
							createElement('span', { children: `theme:${props.theme}` }),
					},
				],
			}),
		);

		const el = makeContainer('fn-panel');
		el.setAttribute('data-container', '');
		act(() => {
			instances[0].plugins[0].render(el, { theme: 'light', devtoolsOpen: true });
		});

		expect(el.textContent).toContain('theme:light');
	});

	it('portals an element-form plugin name into the title container', () => {
		render(
			createElement(TanStackDevtools, {
				plugins: [
					{
						id: 'titled',
						name: createElement('h1', { children: 'Title Node' }),
						render: () => null,
					},
				],
			}),
		);

		// A non-string name is wrapped into a core name callback.
		expect(typeof instances[0].plugins[0].name).toBe('function');

		const el = makeContainer('titled');
		el.setAttribute('data-container', '');
		act(() => {
			instances[0].plugins[0].name(el, { theme: 'dark', devtoolsOpen: false });
		});

		expect(el.textContent).toContain('Title Node');
	});

	it('portals a custom trigger into the trigger container', () => {
		render(
			createElement(TanStackDevtools, {
				config: { customTrigger: createElement('button', { children: 'launch' }) },
			}),
		);

		const trigger = instances[0].config.customTrigger;
		expect(typeof trigger).toBe('function');

		const el = document.createElement('div');
		el.setAttribute('data-container', '');
		document.body.appendChild(el);
		act(() => {
			trigger(el, { theme: 'dark' });
		});

		expect(el.textContent).toContain('launch');
	});

	it('re-syncs plugins on change via setConfig', () => {
		const pluginA = { id: 'a', name: 'A', render: () => null };
		const pluginB = { id: 'b', name: 'B', render: () => null };

		const { rerender } = render(createElement(TanStackDevtools, { plugins: [pluginA] }));

		// setConfig runs once on mount with the initial plugins.
		expect(instances[0].setConfig).toHaveBeenCalledTimes(1);
		expect(instances[0].setConfig.mock.calls[0][0].plugins).toHaveLength(1);

		act(() => {
			rerender(createElement(TanStackDevtools, { plugins: [pluginA, pluginB] }));
		});

		const lastCall = instances[0].setConfig.mock.calls.at(-1)!;
		expect(lastCall[0].plugins).toHaveLength(2);
		expect(lastCall[0].plugins.map((p: any) => p.id)).toEqual(['a', 'b']);
	});

	it('forwards eventBusConfig to the core', () => {
		const eventBusConfig = { debug: true } as any;
		render(createElement(TanStackDevtools, { plugins: [], eventBusConfig }));
		expect(instances[0].eventBusConfig).toBe(eventBusConfig);
	});
});
