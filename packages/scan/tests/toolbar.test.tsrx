// The scan toolbar contract: a live render counter, the pause/resume toggle
// driving the master enabled switch, the animation-speed cycle, and
// showToolbar attach/detach — all in the shadow-rooted plain-DOM toolbar the
// profiler cannot see (it must never appear in scan's own report).
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRoot, useState, type ComponentBody } from 'octane';
import { profiler } from 'octane/profiling';
import { getOptions, getReport, resetReport, scan, setOptions } from '../src/index.ts';
import { installToolbar, teardownToolbar } from '../src/toolbar.ts';

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
	teardownToolbar();
	installToolbar();
});

afterEach(() => {
	teardownToolbar();
	setOptions({ enabled: false, showToolbar: true, animationSpeed: 'fast' });
});

describe('scan toolbar', () => {
	it('shows a live render counter that the toolbar itself never inflates', async () => {
		scan();
		expect(toolbar()).toBeTruthy();
		expect(shadowQuery('.count')!.textContent).toBe('0 renders');

		const mounted = mount(App);
		await settle();
		expect(shadowQuery('.count')!.textContent).toBe('1 renders');
		mounted.click('#inc');
		await settle();
		expect(shadowQuery('.count')!.textContent).toBe('2 renders');
		// The toolbar is plain DOM the profiler cannot see: nothing scan-owned
		// may ever appear in the report it displays.
		expect(getReport().map((entry) => entry.component)).toEqual(['App']);

		mounted.unmount();
	});

	it('pauses and resumes scanning from the toggle button', async () => {
		scan();
		const mounted = mount(App);
		await settle();
		expect(shadowQuery('[data-action="toggle"]')!.textContent).toBe('pause');

		shadowQuery('[data-action="toggle"]')!.click();
		expect(getOptions().enabled).toBe(false);
		expect(shadowQuery('[data-action="toggle"]')!.textContent).toBe('resume');
		mounted.click('#inc');
		await settle();
		expect(shadowQuery('.count')!.textContent).toBe('1 renders');

		shadowQuery('[data-action="toggle"]')!.click();
		expect(getOptions().enabled).toBe(true);
		mounted.click('#inc');
		await settle();
		expect(shadowQuery('.count')!.textContent).toBe('2 renders');

		mounted.unmount();
	});

	it('cycles the animation speed through fast, slow, and off', () => {
		scan();
		const speed = shadowQuery('[data-action="speed"]')!;
		expect(speed.textContent).toBe('fast');
		speed.click();
		expect(getOptions().animationSpeed).toBe('slow');
		speed.click();
		expect(getOptions().animationSpeed).toBe('off');
		speed.click();
		expect(getOptions().animationSpeed).toBe('fast');
		expect(speed.textContent).toBe('fast');
	});

	it('detaches on showToolbar: false and re-attaches with the counter intact', async () => {
		scan();
		const mounted = mount(App);
		await settle();
		expect(shadowQuery('.count')!.textContent).toBe('1 renders');

		setOptions({ showToolbar: false });
		expect(toolbar()).toBeNull();
		// Still counting while hidden…
		mounted.click('#inc');
		await settle();

		setOptions({ showToolbar: true });
		expect(shadowQuery('.count')!.textContent).toBe('2 renders');

		mounted.unmount();
	});
});
