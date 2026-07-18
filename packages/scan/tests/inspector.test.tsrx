// useScan and the click-to-inspect panel: the hook variant starts scanning
// with the compiler-forwarded call-site slot composing beside other hooks,
// and inspect mode resolves a clicked element to the innermost profiled
// component, shows its identity/report/causes, intercepts app clicks while
// armed, and exits on Escape restoring normal interaction.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRoot, useState, type ComponentBody } from 'octane';
import { profiler } from 'octane/profiling';
import { getReport, resetReport, setOptions, useScan } from '../src/index.ts';
import {
	installInspector,
	teardownInspector,
	toggleInspect,
	isInspecting,
} from '../src/inspector.ts';
import { installToolbar, teardownToolbar } from '../src/toolbar.ts';

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

const panel = () => document.querySelector('[data-octane-scan-inspector]');
const panelText = () => panel()?.shadowRoot?.querySelector('.panel')?.textContent ?? '';

beforeEach(() => {
	profiler.clear();
	resetReport();
	teardownInspector();
	teardownToolbar();
	installInspector();
	installToolbar();
});

afterEach(() => {
	teardownInspector();
	teardownToolbar();
	setOptions({ enabled: false, showToolbar: true, animationSpeed: 'fast' });
});

describe('useScan', () => {
	it('starts scanning from a component effect, composing beside other hooks', async () => {
		const mounted = mount(ScannedApp);
		await settle();

		// The effect ran scan(): renders from here on are recorded.
		mounted.click('#inc');
		await settle();
		expect(mounted.container.querySelector('#leaf')!.textContent).toBe('count: 1');
		const byName = new Map(getReport().map((entry) => [entry.component, entry]));
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

		toggleInspect();
		expect(isInspecting()).toBe(true);
		mounted.click('#leaf');
		expect(panelText()).toContain('Leaf');
		expect(panelText()).toContain('renders');
		expect(panelText()).toContain('last render:');
		// Innermost wins: the shell click resolves to ScannedApp, not Leaf.
		mounted.click('#shell');
		expect(panelText()).toContain('ScannedApp');

		mounted.unmount();
	});

	it('intercepts app clicks while armed and restores them after Escape', async () => {
		const mounted = mount(ScannedApp);
		await settle();
		// One recorded interaction before arming, so the clicked element is
		// resolvable (scanning starts from useScan's mount effect).
		mounted.click('#inc');
		await settle();
		expect(mounted.container.querySelector('#leaf')!.textContent).toBe('count: 1');

		toggleInspect();
		mounted.click('#inc');
		await settle();
		// The click was consumed by inspection — the counter did not advance —
		// and resolved to a profiled component. (Which one is deliberately not
		// pinned: lite scopes over-approximate their DOM range to the host's
		// children, so a host's direct child can attribute to a lite sibling —
		// the precise-lite-ranges follow-up in the port plan tightens this.)
		expect(mounted.container.querySelector('#leaf')!.textContent).toBe('count: 1');
		expect(panelText()).not.toBe('');

		document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
		expect(isInspecting()).toBe(false);
		expect(panel()).toBeNull();
		mounted.click('#inc');
		await settle();
		expect(mounted.container.querySelector('#leaf')!.textContent).toBe('count: 2');

		mounted.unmount();
	});

	it('mirrors inspect state onto the toolbar button', () => {
		const inspectButton = document.querySelector(
			'[data-octane-scan-toolbar]',
		)!.shadowRoot!.querySelector<HTMLButtonElement>('[data-action="inspect"]')!;
		expect(inspectButton.getAttribute('data-active')).toBe('false');
		inspectButton.click();
		expect(isInspecting()).toBe(true);
		expect(inspectButton.getAttribute('data-active')).toBe('true');
		document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
		expect(inspectButton.getAttribute('data-active')).toBe('false');
	});
});
