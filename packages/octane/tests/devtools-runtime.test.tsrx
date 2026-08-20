import { describe, expect, it, afterEach } from 'vitest';
import { createRoot, useState } from 'octane';
import { act, mount } from './_helpers';
import type { OctaneDevtoolsHook } from '../src/devtools-hook';

function Leaf(props) @{
	<span>{props.count as string}</span>
}

function CounterApp() @{
	const [count, setCount] = useState(0);
	<div>
		<button onClick={() => setCount(count + 1)}>inc</button>
		<Leaf count={count} />
	</div>
}

function hook(): OctaneDevtoolsHook {
	const h = (globalThis as any).__OCTANE_DEVTOOLS__ as OctaneDevtoolsHook | undefined;
	if (!h) throw new Error('devtools hook not installed');
	return h;
}

describe('runtime devtools instrumentation (profile build)', () => {
	afterEach(() => {
		// leave the global installed; each mount registers/unregisters its own root
	});

	it('registers a mounted root and exposes it as a named tree', () => {
		const { unmount } = mount(<CounterApp />);
		const roots = hook().getTree();
		const app = roots.find((r) => r.name === 'CounterApp');
		expect(app).toBeDefined();
		expect(app!.kind).toBe('root');
		unmount();
		expect(hook().getTree().some((r) => r.name === 'CounterApp')).toBe(false);
	});

	it('fires flush subscribers once per scheduler flush', () => {
		let flushes = 0;
		const off = hook().subscribe(() => {
			flushes++;
		});
		const { container, unmount } = mount(<CounterApp />);
		const before = flushes;
		act(() => {
			(container.querySelector('button') as HTMLButtonElement).click();
		});
		expect(flushes).toBeGreaterThan(before);
		off();
		unmount();
	});

	it(
		'notifies subscribers when an effect-free first render reaches its deferred commit',
		async () => {
			await Promise.resolve();
			const container = document.createElement('div');
			document.body.appendChild(container);
			const root = createRoot(container);
			let off = () => {};
			try {
				root.render(CounterApp);
				const observedTrees: string[][] = [];
				off = hook().subscribe(() => {
					observedTrees.push(hook().getTree().map((entry) => entry.name));
				});
				expect(container.querySelector('span')?.textContent).toBe('0');
				expect(observedTrees).toEqual([]);

				await Promise.resolve();

				expect(observedTrees.some((names) => names.includes('CounterApp'))).toBe(true);
			} finally {
				off();
				root.unmount();
				container.remove();
			}
		},
	);

	it(
		'notifies subscribers when a synchronous click reaches its already-queued commit',
		async () => {
			const rendered = mount(<CounterApp />);
			let off = () => {};
			try {
				await Promise.resolve();
				const button = rendered.find('button') as HTMLButtonElement;
				button.click();
				expect(rendered.find('span').textContent).toBe('1');

				const observedTrees: string[][] = [];
				off = hook().subscribe(() => {
					observedTrees.push(hook().getTree().map((entry) => entry.name));
				});
				expect(observedTrees).toEqual([]);
				await Promise.resolve();

				expect(observedTrees.some((names) => names.includes('CounterApp'))).toBe(true);
				expect(rendered.find('span').textContent).toBe('1');
			} finally {
				off();
				rendered.unmount();
			}
		},
	);
});
