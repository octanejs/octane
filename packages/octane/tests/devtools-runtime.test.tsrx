import { describe, expect, it, afterEach } from 'vitest';
import { useState } from 'octane';
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
});
