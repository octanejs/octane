// @octanejs/scan programmatic core: render detection, aggregation, and the
// react-scan API surface (scan/setOptions/getOptions/getReport/onRender) over
// octane's profile-build inspection channel. This project compiles with
// `profile: true` — the same build a scanned app uses.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, useState, type ComponentBody } from 'octane';
import { profiler } from 'octane/profiling';
import { getOptions, getReport, onRender, resetReport, scan, setOptions } from '../src/index.ts';

function Leaf(props) @{
	<span>
		{props.count as string}
	</span>
}

function App() @{
	const [count, setCount] = useState(0);
	<div>
		<button onClick={() => setCount(count + 1)}>increment</button>
		<Leaf count={count} />
	</div>
}

function mount<P>(body: ComponentBody<P>, props?: P) {
	const container = document.createElement('div');
	document.body.appendChild(container);
	const root = createRoot(container);
	root.render(body, props);
	return {
		container,
		click(selector: string) {
			const target = container.querySelector(selector);
			expect(target, selector).toBeTruthy();
			target!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		},
		unmount() {
			root.unmount();
			container.remove();
		},
	};
}

/** Drain the flush + the derived commit-finish microtask. */
async function settle() {
	await Promise.resolve();
	await Promise.resolve();
}

beforeEach(() => {
	profiler.clear();
	resetReport();
});

afterEach(() => {
	// Detach from the profiler and clear callback options; the next test's
	// scan() re-enables.
	setOptions({
		enabled: false,
		log: false,
		onCommitStart: undefined,
		onCommitFinish: undefined,
		onRender: undefined,
	});
});

describe('scan core', () => {
	it('aggregates per-component render counts and timings into the report', async () => {
		scan();
		const mounted = mount(App);
		await settle();
		mounted.click('button');
		await settle();

		const byName = new Map(getReport().map((entry) => [entry.component, entry]));
		expect(byName.get('App')).toMatchObject({ renders: 2 });
		expect(byName.get('Leaf')).toMatchObject({ renders: 2 });
		for (const entry of byName.values()) {
			expect(entry.totalTime).toBeGreaterThanOrEqual(entry.totalSelfTime);
			expect(entry.file).toContain('scan.test.tsrx');
		}

		mounted.unmount();
	});

	it('notifies onRender for one component with resolvable DOM nodes', async () => {
		const seen: Array<{ component: string; phase: string; nodes: Element[] }> = [];
		scan();
		const detachListener = onRender(
			Leaf,
			(info) => seen.push({
				component: info.component.name,
				phase: info.phase,
				nodes: info.domNodes(),
			}),
		);
		const mounted = mount(App);
		await settle();
		mounted.click('button');
		await settle();

		expect(seen.map((entry) => `${entry.component}:${entry.phase}`)).toEqual([
			'Leaf:mount',
			'Leaf:update',
		]);
		const leafSpan = mounted.container.querySelector('span')!;
		for (const entry of seen) {
			expect(
				entry.nodes.some((element) => element === leafSpan || element.contains(leafSpan)),
			).toBe(true);
		}

		detachListener();
		mounted.click('button');
		await settle();
		expect(seen).toHaveLength(2);

		mounted.unmount();
	});

	it('fires commit callbacks and stops observing when disabled', async () => {
		let commits = 0;
		scan({ onCommitFinish: () => commits++ });
		const mounted = mount(App);
		await settle();
		expect(commits).toBe(1);

		setOptions({ enabled: false });
		mounted.click('button');
		await settle();
		expect(commits).toBe(1);
		const disabledRenders = getReport().find((entry) => entry.component === 'App')!.renders;

		setOptions({ enabled: true });
		mounted.click('button');
		await settle();
		expect(commits).toBe(2);
		expect(getReport().find((entry) => entry.component === 'App')!.renders).toBe(
			disabledRenders + 1,
		);

		mounted.unmount();
	});

	it('logs per-commit render groups when log is enabled', async () => {
		const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
		try {
			scan({ log: true });
			const mounted = mount(App);
			await settle();

			const lines = logSpy.mock.calls.map((call) => String(call[0]));
			expect(lines).toContain('[octane-scan] App ×1');
			expect(lines).toContain('[octane-scan] Leaf ×1');

			mounted.unmount();
		} finally {
			logSpy.mockRestore();
		}
	});

	it('reflects merged options through getOptions', () => {
		scan({ animationSpeed: 'slow' });
		expect(getOptions()).toMatchObject({ enabled: true, animationSpeed: 'slow' });
		setOptions({ log: true });
		expect(getOptions()).toMatchObject({ animationSpeed: 'slow', log: true });
	});
});
