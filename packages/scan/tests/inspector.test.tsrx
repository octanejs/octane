// The inspector plugin + selection service: useScan starts scanning from an
// effect; arming inspect resolves a clicked element to the innermost profiled
// component, shows its identity/report, intercepts app clicks while armed, and
// exits on Escape. The toolbar's inspect button mirrors the selection state.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRoot, useState, type ComponentBody } from 'octane';
import { profiler } from 'octane/profiling';
import { getSession, resetReport, setOptions, useScan } from '../src/index.ts';

function Leaf(props) @{
	<span id="leaf">
		{'count: ' + props.count}
	</span>
}

function ScannedApp() @{
	useScan({ log: false });
	const [count, setCount] = useState(0);
	<div id="shell">
		<button id="inc" onClick={() => setCount(count + 1)}>increment</button>
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

const selection = () => getSession().selection;
const panel = () => document.querySelector('[data-octane-scan-inspector]');
const panelText = () => panel()?.shadowRoot?.querySelector('.panel')?.textContent ?? '';

beforeEach(() => {
	profiler.clear();
	resetReport();
	selection().setActive(false);
	setOptions({ enabled: false, showToolbar: true });
});

afterEach(() => {
	selection().setActive(false);
	setOptions({ enabled: false, showToolbar: true });
});

describe('useScan', () => {
	it('starts scanning from a component effect, composing beside other hooks', async () => {
		const mounted = mount(ScannedApp);
		await settle();
		mounted.click('#inc');
		await settle();
		expect(mounted.container.querySelector('#leaf')!.textContent).toBe('count: 1');
		const byName = new Map(getSession().report.all().map((entry) => [entry.component, entry]));
		expect(byName.get('ScannedApp')!.renders).toBeGreaterThanOrEqual(1);
		expect(byName.get('Leaf')!.renders).toBeGreaterThanOrEqual(1);
		mounted.unmount();
	});
});

describe('inspector', () => {
	it('resolves a click to the innermost component and shows its evidence', async () => {
		const mounted = mount(ScannedApp);
		await settle();
		mounted.click('#inc');
		await settle();

		selection().setActive(true);
		expect(selection().get().mode).toBe('hovering');
		mounted.click('#leaf');
		expect(selection().get().mode).toBe('locked');
		expect(panelText()).toContain('Leaf');
		expect(panelText()).toContain('renders');
		// The panel reports the profiler's schedule causes for the render.
		expect(panelText()).toContain('last render:');
		// Innermost wins: the shell click resolves to ScannedApp, not Leaf.
		mounted.click('#shell');
		expect(panelText()).toContain('ScannedApp');

		mounted.unmount();
	});

	it('intercepts app clicks while armed and restores them after Escape', async () => {
		const mounted = mount(ScannedApp);
		await settle();
		mounted.click('#inc');
		await settle();
		expect(mounted.container.querySelector('#leaf')!.textContent).toBe('count: 1');

		selection().setActive(true);
		mounted.click('#inc');
		await settle();
		// The click was consumed by inspection — the counter did not advance.
		expect(mounted.container.querySelector('#leaf')!.textContent).toBe('count: 1');
		expect(selection().get().mode).toBe('locked');

		document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
		expect(selection().get().mode).toBe('off');
		expect(panel()).toBeNull();
		mounted.click('#inc');
		await settle();
		expect(mounted.container.querySelector('#leaf')!.textContent).toBe('count: 2');

		mounted.unmount();
	});

	it('mirrors inspect state onto the toolbar button', () => {
		setOptions({ enabled: true });
		const inspectButton = document.querySelector(
			'[data-octane-scan-toolbar]',
		)!.shadowRoot!.querySelector<HTMLButtonElement>('[data-action="inspect"]')!;
		expect(inspectButton.getAttribute('data-active')).toBe('false');
		inspectButton.click();
		expect(selection().get().mode).toBe('hovering');
		expect(inspectButton.getAttribute('data-active')).toBe('true');
		document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
		expect(inspectButton.getAttribute('data-active')).toBe('false');
	});
});
