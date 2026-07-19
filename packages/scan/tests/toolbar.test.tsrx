// The toolbar plugin's contract, driven entirely through the public API + the
// default session: an inspect toggle, the "Outline Re-renders" power switch
// bound to the enabled option, and a live FPS meter — plain shadow-DOM the
// profiler cannot see. showToolbar attaches/detaches the whole widget.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRoot, useState, type ComponentBody } from 'octane';
import { profiler } from 'octane/profiling';
import { getOptions, getReport, getSession, resetReport, scan, setOptions } from '../src/index.ts';

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

const toolbar = () => document.querySelector('[data-octane-scan-toolbar]');
const shadowQuery = (selector: string) => toolbar()?.shadowRoot?.querySelector<HTMLElement>(
	selector,
) ?? null;

beforeEach(() => {
	profiler.clear();
	resetReport();
	getSession().selection.setActive(false);
	setOptions({ enabled: false, showToolbar: true, animationSpeed: 'fast' });
});

afterEach(() => {
	getSession().selection.setActive(false);
	setOptions({ enabled: false, showToolbar: true });
});

describe('scan toolbar', () => {
	it('renders the inspect toggle, power switch, and FPS meter', () => {
		scan();
		expect(toolbar()).toBeTruthy();
		expect(shadowQuery('[data-action="inspect"]')).toBeTruthy();
		expect(shadowQuery('[data-action="toggle"]')).toBeTruthy();
		expect(shadowQuery('.fps-label')!.textContent).toBe('FPS');
	});

	it('drives the master enabled option from the power switch, and never scans itself', async () => {
		scan();
		const mounted = mount(App);
		await settle();
		// The toolbar is plain DOM the profiler cannot see.
		expect(getReport().map((entry) => entry.component)).toEqual(['App']);

		const toggle = shadowQuery('[data-action="toggle"]')!;
		expect(toggle.getAttribute('data-checked')).toBe('true');

		toggle.click();
		expect(getOptions().enabled).toBe(false);
		expect(toggle.getAttribute('data-checked')).toBe('false');
		mounted.click('#inc');
		await settle();
		const pausedRenders = getReport().find((entry) => entry.component === 'App')!.renders;

		toggle.click();
		expect(getOptions().enabled).toBe(true);
		expect(toggle.getAttribute('data-checked')).toBe('true');
		mounted.click('#inc');
		await settle();
		expect(getReport().find((entry) => entry.component === 'App')!.renders).toBe(pausedRenders + 1);

		mounted.unmount();
	});

	it('detaches on showToolbar: false and re-attaches on showToolbar: true', () => {
		scan();
		expect(toolbar()).toBeTruthy();
		setOptions({ showToolbar: false });
		expect(toolbar()).toBeNull();
		setOptions({ showToolbar: true });
		expect(toolbar()).toBeTruthy();
		expect(shadowQuery('[data-action="toggle"]')!.getAttribute('data-checked')).toBe('true');
	});
});
