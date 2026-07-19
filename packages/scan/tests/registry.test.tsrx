// The ComponentRegistry's defining property: it resolves a component that
// mounted BEFORE the live feed connected — the hydrated-page case. No scan() is
// called here, so the pipeline feed is never connected; resolution must succeed
// purely by seeding from the source's event buffer (which the eager
// source.start() at import has been filling).
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRoot, type ComponentBody } from 'octane';
import { profiler } from 'octane/profiling';
import { getSession } from '../src/index.ts';

function Inner() @{
	<span id="inner">leaf</span>
}

function Widget() @{
	<section id="widget">
		<Inner />
	</section>
}

function mount<P>(body: ComponentBody<P>, props?: P) {
	const container = document.createElement('div');
	document.body.appendChild(container);
	const root = createRoot(container);
	root.render(body, props);
	return {
		container,
		unmount() {
			root.unmount();
			container.remove();
		},
	};
}

const registry = () => getSession().registry;

beforeEach(() => {
	profiler.clear();
	registry().clear();
});

afterEach(() => {
	registry().clear();
	profiler.clear();
});

describe('element→component registry', () => {
	it('resolves a component that mounted before the feed connected', () => {
		// The profiler is active from import, so this mount is buffered even though
		// scan() was never called and the pipeline feed is not connected.
		const mounted = mount(Widget);
		const inner = mounted.container.querySelector('#inner')!;
		const instance = registry().resolveByDom(inner);
		expect(instance).not.toBeNull();
		// Innermost owner of #inner (lite Inner over-approximates to its host).
		expect(['Widget', 'Inner']).toContain(instance!.component.name);
		mounted.unmount();
	});

	it('returns null outside any component and after clear', () => {
		const mounted = mount(Widget);
		expect(registry().resolveByDom(document.body)).toBeNull();

		registry().clear();
		profiler.clear();
		expect(registry().resolveByDom(mounted.container.querySelector('#inner')!)).toBeNull();

		mounted.unmount();
	});
});
