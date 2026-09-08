import { ImageRenderable, RootRenderable, TextRenderable, type BoxRenderable } from '@opentui/core';
import { createTestRenderer, type TestRendererSetup } from '@opentui/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { universalComponent, type UniversalHostBatch } from 'octane/universal';
import { act, createOctaneSlotRegistry, createRoot, type Root } from '@octanejs/opentui';
import { createOpenTUIContainer, createOpenTUIDriver } from '@octanejs/opentui/renderer';
import { testRender } from '@octanejs/opentui/test-utils';
import {
	BrokenApp,
	CounterApp,
	PluginStatus,
	PortalApp,
	SelectApp,
	SlotApp,
	type StatusSlots,
} from './_fixtures/apps.opentui.tsrx';

interface MountedApp {
	setup: TestRendererSetup;
	root: Root;
}

const mounted: MountedApp[] = [];

const PNG_1X1 = Uint8Array.from(
	Buffer.from(
		'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4AWP4z8DwHwAFAAH/e+m+7wAAAABJRU5ErkJggg==',
		'base64',
	),
);

async function createApp(width = 40, height = 8): Promise<MountedApp> {
	const setup = await createTestRenderer({ width, height, useThread: false });
	const app = { setup, root: createRoot(setup.renderer) };
	mounted.push(app);
	return app;
}

afterEach(() => {
	for (const { root, setup } of mounted.splice(0)) {
		root.unmount();
		setup.renderer.destroy();
	}
});

describe('@octanejs/opentui root and hooks', () => {
	it('loads a deferred image source after recreating its physical host', async () => {
		const setup = await createTestRenderer({ width: 10, height: 6, useThread: false });
		const container = createOpenTUIContainer(setup.renderer, {
			eventScope(_priority, run) {
				return run();
			},
		});
		const driver = createOpenTUIDriver();
		const context = {
			invokeLocalCallback() {
				throw new Error('Unexpected local callback.');
			},
		};
		const prepare = (version: number, commands: UniversalHostBatch['commands']) =>
			driver.prepareBatch(container, { renderer: container.renderer, version, commands }, context);

		try {
			prepare(1, [
				{ op: 'create', id: 1, type: 'image', props: { source: PNG_1X1 } },
				{ op: 'insert', parent: null, id: 1, before: null },
			]).apply();
			const original = driver.getPublicInstance(container, 1) as ImageRenderable;
			await original.loadPromise;

			prepare(2, [{ op: 'recreate', id: 1, type: 'image', props: { source: PNG_1X1 } }]).apply();
			const replacement = driver.getPublicInstance(container, 1) as ImageRenderable;

			expect(replacement).not.toBe(original);
			expect(replacement.source).toBe(PNG_1X1);
			await replacement.loadPromise;
			expect(replacement.image?.width).toBe(1);

			prepare(3, [
				{ op: 'remove', parent: null, id: 1 },
				{ op: 'destroy', id: 1 },
			]).apply();
		} finally {
			setup.renderer.destroy();
		}
	});

	it('renders live terminal output and preserves host identity across hook and prop updates', async () => {
		const { root, setup } = await createApp();
		const onKey = vi.fn();
		let box: BoxRenderable | null = null;
		const rootRef = (value: BoxRenderable | null) => {
			box = value;
		};

		await act(() => root.render(CounterApp, { label: 'Count', onKey, rootRef }));
		await setup.renderOnce();
		expect(setup.captureCharFrame()).toContain('Count: 0');
		expect(setup.captureCharFrame()).toContain('Size: 40x8');
		const retained = box;

		await act(() => setup.mockInput.pressEnter());
		await setup.renderOnce();
		expect(setup.captureCharFrame()).toContain('Count: 1');
		expect(onKey).toHaveBeenCalledWith(1);
		expect(box).toBe(retained);

		await act(() => root.render(CounterApp, { label: 'Total', onKey, rootRef }));
		await setup.renderOnce();
		expect(setup.captureCharFrame()).toContain('Total: 1');
		expect(box).toBe(retained);

		await act(() => setup.resize(52, 9));
		await setup.renderOnce();
		expect(setup.captureCharFrame()).toContain('Size: 52x9');
	});

	it('keeps OpenTUI select callbacks multi-argument and removes hook subscriptions on unmount', async () => {
		const { root, setup } = await createApp();
		const onChange = vi.fn();
		const onSelect = vi.fn();
		const options = [
			{ name: 'One', description: 'first', value: 'one' },
			{ name: 'Two', description: 'second', value: 'two' },
		];

		await act(() => root.render(SelectApp, { options, onChange, onSelect }));
		await act(() => setup.mockInput.pressArrow('down'));
		expect(onChange).toHaveBeenLastCalledWith(1, 'two');
		await act(() => setup.mockInput.pressEnter());
		expect(onSelect).toHaveBeenLastCalledWith(1, 'two');

		root.unmount();
		await act(() => setup.mockInput.pressArrow('up'));
		expect(onChange).toHaveBeenCalledTimes(1);
	});

	it('places same-renderer portals into a borrowed OpenTUI root and tears them down', async () => {
		const { root, setup } = await createApp();
		const target = new RootRenderable(setup.renderer.root.ctx);

		await act(() => root.render(PortalApp, { target }));
		const portalText = target.getChildren()[0];
		expect(portalText).toBeInstanceOf(TextRenderable);
		expect(portalText?.id).toBe('portal-text');

		root.unmount();
		expect(target.getChildren()).toEqual([]);
		target.destroyRecursively();
	});

	it('renders uncaught component errors into the terminal fallback', async () => {
		const { root, setup } = await createApp();
		await act(() => root.render(BrokenApp));
		await setup.renderOnce();
		expect(setup.captureCharFrame()).toContain('terminal exploded');
	});

	it('updates OpenTUI slot output when plugins register', async () => {
		const { root, setup } = await createApp();
		const registry = createOctaneSlotRegistry<StatusSlots>(setup.renderer, {});
		await act(() => root.render(SlotApp, { registry }));
		await setup.renderOnce();
		expect(setup.captureCharFrame()).toContain('fallback:sam');
		const fallback = setup.renderer.root.findDescendantById('fallback-status-text');

		let unregisterStatusPlugin!: () => void;
		await act(() => {
			unregisterStatusPlugin = registry.register({
				id: 'status-plugin',
				slots: {
					statusbar(_context, props) {
						return universalComponent('opentui', PluginStatus, {
							id: 'status-plugin-text',
							label: `plugin:${props.user}`,
						});
					},
				},
			});
		});
		await setup.renderOnce();
		const frame = setup.captureCharFrame();
		expect(frame).toContain('fallback:sam');
		expect(frame).toContain('plugin:sam');
		expect(setup.renderer.root.findDescendantById('fallback-status-text')).toBe(fallback);
		const retained = setup.renderer.root.findDescendantById('status-plugin-text');

		let unregisterSecondStatusPlugin!: () => void;
		await act(() => {
			unregisterSecondStatusPlugin = registry.register({
				id: 'second-status-plugin',
				slots: {
					statusbar() {
						return universalComponent('opentui', PluginStatus, {
							id: 'second-status-plugin-text',
							label: 'second',
						});
					},
				},
			});
		});
		expect(setup.renderer.root.findDescendantById('status-plugin-text')).toBe(retained);
		expect(setup.renderer.root.findDescendantById('fallback-status-text')).toBe(fallback);

		await act(() => registry.updateOrder('second-status-plugin', -1));
		expect(setup.renderer.root.findDescendantById('status-plugin-text')).toBe(retained);
		expect(setup.renderer.root.findDescendantById('fallback-status-text')).toBe(fallback);

		await act(() => {
			unregisterStatusPlugin();
			unregisterSecondStatusPlugin();
		});
		expect(setup.renderer.root.findDescendantById('fallback-status-text')).toBe(fallback);
	});

	it('provides a component-plus-props test renderer helper', async () => {
		const setup = await testRender(
			CounterApp,
			{ label: 'Test', onKey: vi.fn(), rootRef: vi.fn() },
			{ width: 24, height: 5, useThread: false },
		);
		try {
			await setup.renderOnce();
			expect(setup.captureCharFrame()).toContain('Test: 0');
		} finally {
			setup.renderer.destroy();
		}
	});

	it('reports slot render failures and keeps fallback content', async () => {
		const { root, setup } = await createApp();
		const onPluginError = vi.fn();
		const registry = createOctaneSlotRegistry<StatusSlots>(setup.renderer, {}, { onPluginError });
		const unregister = registry.register({
			id: 'broken-plugin',
			slots: {
				statusbar() {
					return universalComponent('opentui', BrokenApp, {});
				},
			},
		});

		await act(() => root.render(SlotApp, { registry, mode: 'replace' }));
		await setup.renderOnce();
		expect(setup.captureCharFrame()).toContain('fallback:sam');
		expect(onPluginError).toHaveBeenCalledWith(
			expect.objectContaining({
				pluginId: 'broken-plugin',
				phase: 'render',
				source: 'octane',
			}),
		);

		await act(() => registry.updateOrder('broken-plugin', 1));
		await setup.renderOnce();
		expect(onPluginError).toHaveBeenCalledTimes(2);

		await act(() => {
			unregister();
			registry.register({
				id: 'broken-plugin',
				slots: {
					statusbar() {
						return universalComponent('opentui', PluginStatus, {
							id: 'recovered-plugin-text',
							label: 'plugin recovered',
						});
					},
				},
			});
		});
		await setup.renderOnce();
		expect(setup.captureCharFrame()).toContain('plugin recovered');
	});

	it('coordinates cleanup when the OpenTUI renderer is destroyed first', async () => {
		const { root, setup } = await createApp();
		await act(() => root.render(CounterApp, { label: 'Live', onKey: vi.fn(), rootRef: vi.fn() }));
		setup.renderer.destroy();
		expect(() =>
			root.render(CounterApp, { label: 'Late', onKey: vi.fn(), rootRef: vi.fn() }),
		).toThrow('Cannot render into an unmounted root');
	});
});
