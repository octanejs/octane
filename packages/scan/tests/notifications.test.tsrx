// The interaction-inspector widget contract via the default session: a click is
// recorded as a named interaction with a processing-time badge; the toolbar bell
// opens the panel; the History lists it; and the Ranked / Prompts tabs break it
// down by the components that rendered. All local — no backend.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRoot, useState, type ComponentBody } from 'octane';
import { profiler } from 'octane/profiling';
import { getSession, resetReport, scan, setOptions } from '../src/index.ts';

function Leaf(props) @{
	<span id="leaf">
		{'count: ' + props.count}
	</span>
}

function App() @{
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

function afterInteraction() {
	return new Promise((resolve) => setTimeout(resolve, 80));
}

const toolbar = () => document.querySelector('[data-octane-scan-toolbar]');
const shadowQuery = (selector: string) => toolbar()?.shadowRoot?.querySelector<HTMLElement>(
	selector,
) ?? null;
const shadowAll = (selector: string) => Array.from(
	toolbar()?.shadowRoot?.querySelectorAll<HTMLElement>(selector) ?? [],
);
const interactions = () => getSession().interactions;

beforeEach(() => {
	profiler.clear();
	resetReport();
	getSession().selection.setActive(false);
	interactions().clear();
	setOptions({ enabled: false, showToolbar: true });
});

afterEach(() => {
	getSession().selection.setActive(false);
	interactions().clear();
	setOptions({ enabled: false, showToolbar: true });
});

describe('interaction inspector', () => {
	it('records a click as an interaction with its render aggregation', async () => {
		scan();
		const mounted = mount(App);
		try {
			await settle();
			mounted.click('#inc');
			await settle();
			await afterInteraction();

			const all = interactions().all();
			expect(all).toHaveLength(1);
			expect(all[0].type).toBe('click');
			// Lite (hookless) scopes over-approximate their DOM range, so a click on
			// a host's direct child can attribute to a lite sibling.
			expect(['App', 'Leaf']).toContain(all[0].componentName);
			expect(all[0].renders.map((entry) => entry.name)).toContain('App');
		} finally {
			mounted.unmount();
		}
	});

	it('opens the panel from the bell and lists the interaction in History', async () => {
		scan();
		const mounted = mount(App);
		try {
			await settle();
			mounted.click('#inc');
			await settle();
			await afterInteraction();
			const name = interactions().all()[0].componentName;

			expect(shadowQuery('.widget')!.classList.contains('open')).toBe(false);
			shadowQuery('[data-action="notifications"]')!.click();
			expect(shadowQuery('.widget')!.classList.contains('open')).toBe(true);

			const rows = shadowAll('.history-row');
			expect(rows).toHaveLength(1);
			expect(rows[0].querySelector('.history-name')!.textContent).toBe(name);
			expect(rows[0].querySelector('.history-time')!.textContent).toContain('ms');
			expect(shadowQuery('.panel-header')!.textContent).toContain('Clicked');
		} finally {
			mounted.unmount();
		}
	});

	it('ranks the components that rendered and offers Fix/Explanation/Data prompts', async () => {
		scan();
		const mounted = mount(App);
		try {
			await settle();
			mounted.click('#inc');
			await settle();
			await afterInteraction();

			shadowQuery('[data-action="notifications"]')!.click();
			expect(shadowQuery('[data-tab="ranked"]')!.getAttribute('data-active')).toBe('true');
			const names = shadowAll('.rank-name').map((element) => element.textContent ?? '');
			expect(names.some((name) => name.includes('App'))).toBe(true);

			shadowQuery('[data-tab="prompts"]')!.click();
			expect(shadowQuery('[data-prompt-tab="fix"]')!.getAttribute('data-active')).toBe('true');
			const fixText = (shadowQuery('.prompt-text') as HTMLTextAreaElement).value;
			expect(fixText).toContain('performance improvement');
			shadowQuery('[data-prompt-tab="data"]')!.click();
			const dataText = (shadowQuery('.prompt-text') as HTMLTextAreaElement).value;
			expect(dataText).not.toBe(fixText);
			expect(dataText).toContain('High level');
		} finally {
			mounted.unmount();
		}
	});

	it('clears History from the clear button', async () => {
		scan();
		const mounted = mount(App);
		try {
			await settle();
			mounted.click('#inc');
			await settle();
			await afterInteraction();

			shadowQuery('[data-action="notifications"]')!.click();
			expect(shadowAll('.history-row')).toHaveLength(1);
			shadowQuery('.history-head button')!.click();
			expect(interactions().all()).toHaveLength(0);
			expect(shadowQuery('.history-empty')!.textContent).toBe('No Events');
		} finally {
			mounted.unmount();
		}
	});
});
