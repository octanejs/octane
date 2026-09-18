import { describe, expect, test } from 'vitest';
import { act, createRoot } from 'octane';
import { createEffect, createSignal, runOnce, scoped, Show } from '../src/reactive.js';
import { FrozenGlow } from '../src/components/frozen-glow.tsrx';

describe('reactive bridge', () => {
	test('useProp subscribes a component to an accessor prop', async () => {
		const [visible, setVisible] = createSignal(false);
		const container = document.createElement('div');
		document.body.appendChild(container);
		const root = createRoot(container);
		root.render(FrozenGlow, { visible });
		await act(async () => {});
		const div = container.querySelector('div')!;
		expect(div.style.opacity).toBe('0');
		await act(async () => {
			setVisible(true);
		});
		expect(div.style.opacity).toBe('1');
		root.unmount();
		container.remove();
	});

	test('Show toggles children from an accessor', async () => {
		const [open, setOpen] = createSignal(false);
		const container = document.createElement('div');
		document.body.appendChild(container);
		const root = createRoot(container);
		root.render(Show, { when: open, children: 'shown' });
		await act(async () => {});
		expect(container.textContent).toBe('');
		await act(async () => {
			setOpen(true);
		});
		expect(container.textContent).toBe('shown');
		root.unmount();
		container.remove();
	});

	test('scoped keeps shim state across rerenders; runOnce skips inner slots', async () => {
		// Mirrors the port's factory pattern: a runOnce-wrapped factory with
		// internal signals followed by more shim calls in the same body. If
		// runOnce failed to skip the factory's consumed slot range, `own` would
		// alias the factory's inner signal on the second render.
		const factory = () => {
			const [inner, setInner] = createSignal(0);
			return { inner, setInner };
		};
		const seen: number[] = [];
		const Test = scoped<{ tick: number }>((props) => {
			const f = runOnce(factory);
			const [own, setOwn] = createSignal(0);
			createEffect(() => {
				seen.push(props.tick * 1000 + f.inner() * 100 + own());
			});
			if (props.tick === 1) {
				f.setInner(5);
				setOwn(2);
			}
			return null;
		});
		const container = document.createElement('div');
		document.body.appendChild(container);
		const root = createRoot(container);
		root.render(Test, { tick: 0 });
		await act(async () => {});
		expect(seen).toEqual([0]);
		await act(async () => {
			root.render(Test, { tick: 1 });
		});
		// Prop change re-fires the persisted effect (1000); the two signal writes
		// then re-fire it once each (1500, then 1502). `own` reading 2 — not 5 —
		// proves it did not alias the factory's inner signal.
		expect(seen[seen.length - 1]).toBe(1502);
		const runsBeforeUnmount = seen.length;
		root.unmount();
		container.remove();
		expect(seen.length).toBe(runsBeforeUnmount);
	});
});
