import { act as reactAct } from 'react';
import { drainPassiveEffects, flushSync as octaneFlushSync } from 'octane';
import { describe, expect, it, vi } from 'vitest';
import { mountDifferential } from '../../../octane/tests/differential/_rig.js';
import { resolve } from 'node:path';

interface FakeCore {
	plugins: any[];
	config: any;
	mount: ReturnType<typeof vi.fn>;
	unmount: ReturnType<typeof vi.fn>;
	setConfig: ReturnType<typeof vi.fn>;
}
const { instances } = vi.hoisted(function hoisted() {
	return { instances: [] as FakeCore[] };
});

vi.mock('@tanstack/devtools', function mockDevtools() {
	class TanStackDevtoolsCore {
		plugins: any[];
		config: any;
		mount = vi.fn();
		unmount = vi.fn();
		setConfig = vi.fn(function setConfig(this: FakeCore, next: any) {
			if (next.plugins) this.plugins = next.plugins;
		});
		constructor(init: any) {
			this.plugins = init.plugins;
			this.config = init.config;
			instances.push(this as unknown as FakeCore);
		}
	}
	return {
		TanStackDevtoolsCore,
		PLUGIN_CONTAINER_ID: 'plugin',
		PLUGIN_TITLE_CONTAINER_ID: 'title',
	};
});

const fixture = resolve(__dirname, '../_fixtures/devtools-diff.tsrx');
const cache = resolve(__dirname, '.react-cache');

function coreFor(container: HTMLElement): FakeCore {
	const core = instances.find(function findCore(entry) {
		return container.contains(entry.mount.mock.calls[0]?.[0]);
	});
	if (!core) throw new Error('missing core for differential container');
	return core;
}

describe('differential: @octanejs/tanstack-devtools vs @tanstack/react-devtools', function differentialSuite() {
	// @parity-case differential:tanstack-devtools-portal-lifecycle
	it('matches mount, plugin, title, trigger, config, and teardown behavior', async function portalLifecycle() {
		instances.length = 0;
		const differential = await mountDifferential(fixture, 'DevtoolsParity', undefined, cache);
		await differential.step('mount', function mountStep() {});
		const octaneCore = coreFor(differential.octane.container);
		const reactCore = coreFor(differential.react.container);
		expect(octaneCore.setConfig).toHaveBeenCalledTimes(1);
		expect(reactCore.setConfig).toHaveBeenCalledTimes(1);

		function makeTargets(container: HTMLElement) {
			const panel = document.createElement('div');
			panel.id = 'parity-plugin';
			container.appendChild(panel);
			const title = document.createElement('div');
			title.id = 'parity-title';
			container.appendChild(title);
			const trigger = document.createElement('div');
			container.appendChild(trigger);
			return { panel, title, trigger };
		}
		const octaneTargets = makeTargets(differential.octane.container);
		const reactTargets = makeTargets(differential.react.container);
		octaneFlushSync(function renderOctane() {
			octaneCore.plugins[0].render(octaneTargets.panel, { theme: 'dark', devtoolsOpen: true });
			octaneCore.plugins[0].name(octaneTargets.title, { theme: 'dark', devtoolsOpen: true });
			octaneCore.config.customTrigger(octaneTargets.trigger, { theme: 'dark' });
		});
		await reactAct(async function renderReact() {
			reactCore.plugins[0].render(reactTargets.panel, { theme: 'dark', devtoolsOpen: true });
			reactCore.plugins[0].name(reactTargets.title, { theme: 'dark', devtoolsOpen: true });
			reactCore.config.customTrigger(reactTargets.trigger, { theme: 'dark' });
		});
		await differential.step('core callbacks portal equivalent content', function assertStep() {});
		expect(octaneTargets.panel.textContent).toBe('theme:dark');
		expect(octaneTargets.title.textContent).toBe('Plugin title');
		expect(octaneTargets.trigger.textContent).toBe('Open tools');
		differential.unmount();
		drainPassiveEffects();
		expect(octaneCore.unmount).toHaveBeenCalledTimes(1);
		expect(reactCore.unmount).toHaveBeenCalledTimes(1);
	});
});
