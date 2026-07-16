import { afterEach, describe, expect, it } from 'vitest';
import { StrictMode, act, createElement as h, useState, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { drainPassiveEffects, flushSync as octaneFlushSync } from 'octane';
import { OctaneWrapper, wrapOctane } from '../src/index.js';
import { Counter, Effectful, Panel } from './_fixtures/components.tsrx';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const mounted: Array<{ root: Root; container: HTMLElement }> = [];

afterEach(async () => {
	while (mounted.length > 0) {
		const { root, container } = mounted.pop()!;
		await act(async () => root.unmount());
		container.remove();
	}
});

async function mount(node: ReactNode): Promise<HTMLElement> {
	const container = document.createElement('div');
	document.body.appendChild(container);
	const root = createRoot(container);
	await act(async () => root.render(node));
	drainPassiveEffects();
	mounted.push({ root, container });
	return container;
}

/** Click a node rendered by Octane (flushes Octane work synchronously). */
function octaneClick(container: HTMLElement, selector: string): void {
	octaneFlushSync(() => (container.querySelector(selector) as HTMLElement).click());
	drainPassiveEffects();
}

/** Click a node owned by React (flushes React work, then Octane passives). */
async function reactClick(container: HTMLElement, selector: string): Promise<void> {
	await act(async () => (container.querySelector(selector) as HTMLElement).click());
	drainPassiveEffects();
}

describe('OctaneWrapper: Octane components inside a real React tree', () => {
	it('mounts a compiled Octane component and its interactivity works', async () => {
		const container = await mount(
			h(OctaneWrapper, { component: Counter, props: { label: 'hello', start: 3 } }),
		);
		expect(container.querySelector('.counter .label')?.textContent).toBe('hello');
		expect(container.querySelector('.counter .inc')?.textContent).toBe('Count: 3');
		octaneClick(container, '.inc');
		expect(container.querySelector('.counter .inc')?.textContent).toBe('Count: 4');
	});

	it('React prop updates flow into Octane while Octane-local state survives', async () => {
		function Harness() {
			const [label, setLabel] = useState('first');
			return h(
				'div',
				null,
				h('button', { className: 'relabel', onClick: () => setLabel('second') }),
				h(OctaneWrapper, { component: Counter, props: { label, start: 0 } }),
			);
		}
		const container = await mount(h(Harness));
		octaneClick(container, '.inc');
		expect(container.querySelector('.inc')?.textContent).toBe('Count: 1');

		await reactClick(container, '.relabel');
		// The label re-rendered through the same-body fast path...
		expect(container.querySelector('.label')?.textContent).toBe('second');
		// ...and Octane's useState survived the React commit.
		expect(container.querySelector('.inc')?.textContent).toBe('Count: 1');
	});

	it('bridges React children into the Octane children hole, with live React state', async () => {
		function Harness() {
			const [n, setN] = useState(0);
			return h(
				OctaneWrapper,
				{ component: Panel, props: { title: 'Settings' } },
				h('button', { className: 'react-child', onClick: () => setN(n + 1) }, `react:${n}`),
			);
		}
		const container = await mount(h(Harness));
		expect(container.querySelector('.panel .title')?.textContent).toBe('Settings');
		// The React child landed INSIDE the Octane-rendered body.
		const child = container.querySelector('.panel .body .react-child');
		expect(child?.textContent).toBe('react:0');

		// React events keep working inside Octane-rendered DOM.
		await reactClick(container, '.react-child');
		expect(container.querySelector('.react-child')?.textContent).toBe('react:1');
	});

	it('removes the bridged children when React children go away', async () => {
		function Harness() {
			const [shown, setShown] = useState(true);
			return h(
				'div',
				null,
				h('button', { className: 'toggle', onClick: () => setShown(false) }),
				h(
					OctaneWrapper,
					{ component: Panel, props: { title: 'T' } },
					shown ? h('em', { className: 'react-child' }, 'x') : null,
				),
			);
		}
		const container = await mount(h(Harness));
		expect(container.querySelector('.panel .body .react-child')).not.toBeNull();
		await reactClick(container, '.toggle');
		expect(container.querySelector('.panel .body .react-child')).toBeNull();
	});

	it('nests bi-directionally: React → Octane → React children → Octane again', async () => {
		const container = await mount(
			h(
				OctaneWrapper,
				{ component: Panel, props: { title: 'outer' } },
				h(
					'div',
					{ className: 'react-layer' },
					h(OctaneWrapper, { component: Counter, props: { label: 'inner', start: 7 } }),
				),
			),
		);
		const inner = container.querySelector('.panel .body .react-layer .counter');
		expect(inner).not.toBeNull();
		expect(inner?.querySelector('.label')?.textContent).toBe('inner');
		octaneClick(container, '.inc');
		expect(inner?.querySelector('.inc')?.textContent).toBe('Count: 8');
	});

	it('unmounting from React runs Octane effect cleanups and clears the container', async () => {
		const log: string[] = [];
		const container = document.createElement('div');
		document.body.appendChild(container);
		const root = createRoot(container);
		await act(async () =>
			root.render(
				h(OctaneWrapper, { component: Effectful, props: { onLog: (e: string) => log.push(e) } }),
			),
		);
		drainPassiveEffects();
		expect(log).toEqual(['mount']);
		expect(container.querySelector('.effectful')).not.toBeNull();

		await act(async () => root.unmount());
		expect(log).toEqual(['mount', 'cleanup']);
		expect(container.innerHTML).toBe('');
		container.remove();
	});

	it('survives StrictMode double mount/unmount of effects', async () => {
		const container = await mount(
			h(
				StrictMode,
				null,
				h(OctaneWrapper, { component: Counter, props: { label: 'strict', start: 1 } }),
			),
		);
		expect(container.querySelector('.counter .label')?.textContent).toBe('strict');
		octaneClick(container, '.inc');
		expect(container.querySelector('.inc')?.textContent).toBe('Count: 2');
	});

	it('wrapOctane produces a first-class React component with pass-through props', async () => {
		// The default name derives from the compiled function (dev-mode HMR may
		// rename it), so only the explicit option is asserted exactly.
		expect(wrapOctane(Counter).displayName).toMatch(/^Octane\(/);
		const ReactCounter = wrapOctane(Counter, {
			className: 'octane-host',
			displayName: 'ReactCounter',
		});
		expect(ReactCounter.displayName).toBe('ReactCounter');
		const container = await mount(h(ReactCounter, { label: 'wrapped', start: 10 }));
		expect(container.querySelector('.octane-host .label')?.textContent).toBe('wrapped');
		octaneClick(container, '.inc');
		expect(container.querySelector('.inc')?.textContent).toBe('Count: 11');
	});

	it('wrapOctane bridges children like the explicit wrapper', async () => {
		const ReactPanel = wrapOctane(Panel);
		const container = await mount(
			h(ReactPanel, { title: 'wrapped panel' }, h('i', { className: 'react-child' }, 'inside')),
		);
		expect(container.querySelector('.panel .body .react-child')?.textContent).toBe('inside');
	});
});
