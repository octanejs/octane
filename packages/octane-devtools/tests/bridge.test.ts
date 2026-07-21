/**
 * Behavioral contract of the devtools bridge, exercised the way a consumer
 * (the panel, the MCP snapshot endpoint) uses it: through the public
 * `globalThis.__OCTANE_DEVTOOLS__` hook installed by a devtools-enabled
 * compile (`octane({ devtools: true })` — this vitest project's plugin).
 */
import { describe, expect, it } from 'vitest';
import { createRoot, flushSync } from 'octane';
import type { DevtoolsEvent, DevtoolsTreeNode, OctaneDevtools } from 'octane/devtools';
import { flushEffects, mount } from './_helpers';
import { App, Counter, formatCalls, Gated } from './_fixtures/inspect-app.tsrx';

function hook(): OctaneDevtools {
	const installed = globalThis.__OCTANE_DEVTOOLS__;
	if (installed === undefined) throw new Error('devtools bridge not installed');
	return installed;
}

function findNode(nodes: DevtoolsTreeNode[], label: string): DevtoolsTreeNode | null {
	for (const node of nodes) {
		if (node.label === label) return node;
		const found = findNode(node.children, label);
		if (found !== null) return found;
	}
	return null;
}

describe('devtools bridge', () => {
	it('installs an attached global hook in a devtools-enabled build', () => {
		expect(hook().isAttached()).toBe(true);
		expect(hook().version).toBe(1);
	});

	it('exposes the live component tree with names, sources, and list keys', () => {
		const app = mount(App);
		try {
			const roots = hook().getTree();
			const root = findNode(roots, 'App');
			expect(root).not.toBeNull();
			expect(root!.type).toBe('root');
			expect(root!.source?.file).toContain('inspect-app.tsrx');
			expect(root!.source?.line).toBeGreaterThan(0);
			expect(root!.hookCount).toBeGreaterThan(0);

			const counter = findNode(root!.children, 'Counter');
			expect(counter).not.toBeNull();
			expect(counter!.type).toBe('component');
			expect(counter!.source?.file).toContain('inspect-app.tsrx');

			const list = findNode(root!.children, '@for');
			expect(list).not.toBeNull();
			expect(list!.type).toBe('control-flow');
			expect(list!.children.map((item) => item.key)).toEqual(['alpha', 'beta']);
			expect(list!.children.every((item) => item.type === 'list-item')).toBe(true);
		} finally {
			app.unmount();
		}
	});

	it('inspects live props and hook state, and sees updates after events', () => {
		const app = mount(App);
		try {
			const counter = findNode(hook().getTree(), 'Counter')!;
			let detail = hook().inspect(counter.id);
			expect(detail).not.toBeNull();
			expect(detail!.label).toBe('Counter');
			expect((detail!.props as { step: number }).step).toBe(2);

			const state = detail!.hooks.find((entry) => entry.kind === 'useState');
			expect(state).toBeDefined();
			expect(state!.value).toBe(0);
			expect(state!.source?.file).toContain('inspect-app.tsrx');

			flushEffects();
			detail = hook().inspect(counter.id);
			const effect = detail!.hooks.find((entry) => entry.kind === 'useEffect');
			expect(effect).toBeDefined();
			expect(effect!.hasCleanup).toBe(true);
			expect(effect!.deps).toEqual([]);

			// Hooks report in first-render call order.
			expect(detail!.hooks.map((entry) => entry.order)).toEqual([0, 1]);

			app.click('.inc');
			detail = hook().inspect(counter.id);
			expect(detail!.hooks.find((entry) => entry.kind === 'useState')!.value).toBe(2);
			expect(app.html()).toContain('count: 2');
		} finally {
			app.unmount();
		}
	});

	it('records useDebugValue per custom hook and formats lazily at inspect time', () => {
		formatCalls.count = 0;
		const app = mount(App);
		try {
			// React contract: the format function never runs during render.
			expect(formatCalls.count).toBe(0);

			const counter = findNode(hook().getTree(), 'Counter')!;
			let detail = hook().inspect(counter.id)!;
			expect(detail.debugValues).toHaveLength(1);
			expect(detail.debugValues[0].value).toBe('count is 0');
			expect(detail.debugValues[0].owner).toBe('useCounter');
			expect(detail.debugValues[0].source?.file).toContain('inspect-app.tsrx');
			expect(formatCalls.count).toBe(1);

			app.click('.inc');
			expect(formatCalls.count).toBe(1);
			detail = hook().inspect(counter.id)!;
			expect(detail.debugValues[0].value).toBe('count is 2');
		} finally {
			app.unmount();
		}
	});

	it('drops useDebugValue records when the recording call stops executing', () => {
		const app = mount(Gated);
		try {
			const gated = findNode(hook().getTree(), 'Gated')!;
			expect(hook().inspect(gated.id)!.debugValues).toHaveLength(1);
			app.click('.gate');
			expect(hook().inspect(gated.id)!.debugValues).toHaveLength(0);
		} finally {
			app.unmount();
		}
	});

	it('resolves compiler source metadata for a component function', () => {
		const source = hook().getComponentSource(Counter as unknown as Function);
		expect(source).not.toBeNull();
		expect(source!.file).toContain('inspect-app.tsrx');
		expect(source!.line).toBeGreaterThan(0);
		expect(hook().getComponentSource((() => {}) as Function)).toBeNull();
	});

	it('suppresses commit events caused only by internal (panel-owned) roots', () => {
		const container = document.createElement('div');
		document.body.appendChild(container);
		hook().markContainerInternal(container);
		const root = createRoot(container);
		const events: DevtoolsEvent[] = [];
		const unsubscribe = hook().subscribe((event) => events.push(event));
		try {
			flushSync(() => root.render(App, undefined));
			flushSync(() => (container.querySelector('.inc') as HTMLElement).click());
			expect(events.some((event) => event.kind === 'commit')).toBe(false);

			// The same interaction on a public root still commits — with the
			// root attributed on the event.
			const app = mount(App);
			events.length = 0;
			app.click('.inc');
			const commit = events.find((event) => event.kind === 'commit');
			expect(commit).toBeDefined();
			expect(commit!.kind === 'commit' && commit!.roots?.length).toBeGreaterThan(0);
			app.unmount();
		} finally {
			unsubscribe();
			root.unmount();
			container.remove();
		}
	});

	it('resolves the DOM nodes a component currently manages', () => {
		const app = mount(App);
		try {
			const counter = findNode(hook().getTree(), 'Counter')!;
			const nodes = hook().getDomNodes(counter.id);
			expect(nodes.length).toBeGreaterThan(0);
			const button = nodes.find(
				(node) => node instanceof Element && node.classList.contains('inc'),
			);
			expect(button).toBeDefined();
		} finally {
			app.unmount();
		}
	});

	it('reverse-maps DOM nodes to the deepest owning tree node (element picker)', () => {
		const app = mount(App);
		try {
			const roots = hook().getTree();
			const counter = findNode(roots, 'Counter')!;
			const button = app.find('.inc');
			expect(hook().findByDomNode(button)).toBe(counter.id);
			// Text children resolve to the same owning component.
			expect(hook().findByDomNode(button.firstChild!)).toBe(counter.id);

			// Keyed list items map to their own item node, not the list container.
			const list = findNode(roots, '@for')!;
			const firstItem = app.findAll('li')[0];
			expect(hook().findByDomNode(firstItem)).toBe(list.children[0].id);

			// Nodes no live root owns resolve to null.
			expect(hook().findByDomNode(document.body)).toBeNull();

			// A commit invalidates the reverse lookup: DOM added by the update
			// resolves to its own fresh tree node.
			app.click('.add');
			const items = app.findAll('li');
			const listAfter = findNode(hook().getTree(), '@for')!;
			expect(hook().findByDomNode(items[items.length - 1])).toBe(
				listAfter.children[listAfter.children.length - 1].id,
			);
		} finally {
			app.unmount();
		}
	});

	it('preserves node identity for unchanged subtrees across commits (change-detection contract)', () => {
		const app = mount(App);
		try {
			const before = hook().getTree();
			const rootBefore = findNode(before, 'App')!;
			const counterBefore = findNode(before, 'Counter')!;

			app.click('.add');

			// The changed path (list → root) is rebuilt into fresh node objects…
			const after = hook().getTree();
			expect(findNode(after, '@for')!.children.map((item) => item.key)).toEqual([
				'alpha',
				'beta',
				'gamma',
			]);
			expect(findNode(after, 'App')).not.toBe(rootBefore);
			// …while an untouched sibling subtree keeps its exact node object, so
			// consumers (the panel's refresh and row memoization) detect change by
			// reference comparison instead of deep-comparing trees.
			expect(findNode(after, 'Counter')).toBe(counterBefore);
		} finally {
			app.unmount();
		}
	});

	it('shares instance identity with the profiler so event rows resolve here', () => {
		const profiler = hook().getProfiler();
		expect(profiler).toBeDefined();
		profiler!.clear();
		const app = mount(App);
		try {
			app.click('.inc');
			const counter = findNode(hook().getTree(), 'Counter')!;
			const events = profiler!.getEvents().filter((event) => event.component === 'Counter');
			expect(events.length).toBeGreaterThan(0);
			// Every profiler row for this instance carries the tree node's id…
			expect(new Set(events.map((event) => event.instanceId))).toEqual(new Set([counter.id]));
			// …so a row's instanceId resolves through the bridge directly.
			const detail = hook().inspect(events[0].instanceId);
			expect(detail?.label).toBe('Counter');
			expect(hook().getDomNodes(events[0].instanceId).length).toBeGreaterThan(0);
			// The profiler's own pull-based DOM resolution answers for the same id.
			expect(profiler!.domNodes(events[0].instanceId).length).toBeGreaterThan(0);
		} finally {
			app.unmount();
		}
	});

	it('reflects structural updates in getTree() across commits', () => {
		const app = mount(App);
		try {
			const before = findNode(hook().getTree(), '@for')!;
			expect(before.children.map((item) => item.key)).toEqual(['alpha', 'beta']);

			app.click('.add');

			const after = findNode(hook().getTree(), '@for')!;
			expect(after.children.map((item) => item.key)).toEqual(['alpha', 'beta', 'gamma']);
		} finally {
			app.unmount();
		}
	});

	it('notifies subscribers on commits and prunes unmounted roots', () => {
		const events: DevtoolsEvent[] = [];
		const unsubscribe = hook().subscribe((event) => events.push(event));
		const app = mount(App);
		try {
			expect(events.some((event) => event.kind === 'root-added')).toBe(true);
			events.length = 0;
			app.click('.inc');
			expect(events.some((event) => event.kind === 'commit')).toBe(true);
		} finally {
			app.unmount();
			unsubscribe();
		}
		expect(events.some((event) => event.kind === 'root-removed')).toBe(true);
		expect(findNode(hook().getTree(), 'App')).toBeNull();
	});

	it('stale ids resolve to null instead of throwing', () => {
		const app = mount(App);
		const counter = findNode(hook().getTree(), 'Counter')!;
		app.unmount();
		expect(hook().inspect(counter.id)).toBeNull();
		expect(hook().getDomNodes(counter.id)).toEqual([]);
	});

	it('excludes roots mounted in containers marked internal (the panel itself)', () => {
		const container = document.createElement('div');
		document.body.appendChild(container);
		hook().markContainerInternal(container);
		const root = createRoot(container);
		try {
			root.render(App, undefined);
			expect(findNode(hook().getTree(), 'App')).toBeNull();
		} finally {
			root.unmount();
			container.remove();
		}
	});

	it('records per-effect timing only when effect telemetry is explicitly enabled', () => {
		expect(hook().isEffectTelemetryEnabled()).toBe(false);
		const before = mount(App);
		flushEffects();
		expect(
			hook()
				.getEvents()
				.some((event) => event.kind === 'effect'),
		).toBe(false);
		before.unmount();

		hook().setEffectTelemetry(true);
		try {
			const app = mount(App);
			flushEffects();
			const effects = hook()
				.getEvents()
				.filter((event) => event.kind === 'effect');
			expect(effects.length).toBeGreaterThan(0);
			const effect = effects[effects.length - 1];
			expect(effect.kind === 'effect' && effect.phase).toBe('passive');
			expect(effect.kind === 'effect' && effect.component).toBe('Counter');
			expect(effect.kind === 'effect' && effect.duration).toBeGreaterThanOrEqual(0);
			app.unmount();
		} finally {
			hook().setEffectTelemetry(false);
		}
	});

	it('stops buffering events while recording is off, but keeps notifying', () => {
		hook().clearEvents();
		hook().setRecording(false);
		const notified: DevtoolsEvent[] = [];
		const unsubscribe = hook().subscribe((event) => notified.push(event));
		try {
			const app = mount(App);
			app.unmount();
			expect(hook().getEvents()).toEqual([]);
			expect(notified.length).toBeGreaterThan(0);
		} finally {
			hook().setRecording(true);
			unsubscribe();
		}
	});
});
