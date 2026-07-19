// The extension seam: a custom plugin, composed onto a session built from the
// Octane source, receives the normalized event and commit streams — the same
// contract the built-in overlay/toolbar/inspector consume. This is what makes
// the subsystem multi-engine and open to future tooling (flamegraph, heatmap,
// analytics, AI debugger) without touching the core.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRoot, useState, type ComponentBody } from 'octane';
import { profiler } from 'octane/profiling';
import { createSession } from '../src/session.ts';
import { OctaneInspectionSource } from '../src/sources/octane.ts';
import { definePlugin } from '../src/plugin.ts';

function App() @{
	const [count, setCount] = useState(0);
	<button id="inc" onClick={() => setCount(count + 1)}>
		{'count: ' + count}
	</button>
}

function mount<P>(body: ComponentBody<P>, props?: P) {
	const container = document.createElement('div');
	document.body.appendChild(container);
	const root = createRoot(container);
	root.render(body, props);
	return {
		container,
		click(selector: string) {
			container.querySelector(selector)!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		},
		unmount() {
			root.unmount();
			container.remove();
		},
	};
}

async function settle() {
	await Promise.resolve();
	await Promise.resolve();
}

beforeEach(() => profiler.clear());
afterEach(() => profiler.clear());

describe('plugin system', () => {
	it('delivers normalized events and commits to a custom plugin, and tears down', async () => {
		const session = createSession(new OctaneInspectionSource());
		const seen: string[] = [];
		const commitSizes: number[] = [];
		let engine = '';

		const teardown = session.use(
			definePlugin({
				name: 'test-collector',
				setup(context) {
					engine = context.engine;
					const detachEvent = context.onEvent((event) => seen.push(event.component.name));
					const detachCommit = context.onCommit((commit) => commitSizes.push(commit.events.length));
					return () => {
						detachEvent();
						detachCommit();
					};
				},
			}),
		);

		// The plugin sees the engine identity without knowing anything Octane.
		expect(engine).toBe('octane');

		session.setOptions({ enabled: true });
		const mounted = mount(App);
		await settle();
		mounted.click('#inc');
		await settle();

		expect(seen).toContain('App');
		expect(commitSizes.length).toBeGreaterThan(0);

		// After teardown the plugin stops receiving events.
		teardown();
		const before = seen.length;
		mounted.click('#inc');
		await settle();
		expect(seen.length).toBe(before);

		mounted.unmount();
	});
});
