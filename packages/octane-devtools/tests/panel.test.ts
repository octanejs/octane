/**
 * The panel's user-facing contract: it mounts in an isolated shadow root,
 * inspects a real instrumented app through the public bridge, never appears
 * in the tree it inspects, and exports agent prompts carrying the selected
 * component's live evidence.
 */
import { describe, expect, it, vi } from 'vitest';
import { flushSync } from 'octane';
import type { OctaneDevtools } from 'octane/devtools';
import {
	mountDevtoolsPanel,
	registerDevtoolsPanelPlugin,
	type DevtoolsPanelPluginProps,
} from '@octanejs/devtools';
import { getPanelSourcePrefix } from '@octanejs/devtools/panel/mount';
import { flushEffects, mount } from './_helpers';
import { App } from './_fixtures/inspect-app.tsrx';

async function settle(): Promise<void> {
	// The mount handshake resolves the bridge on a microtask; a macrotask hop
	// lets the panel's root render, and the effect drain runs the panel's
	// subscription/initial-refresh effects (`openByDefault` refreshes there).
	await new Promise((resolve) => setTimeout(resolve, 0));
	flushEffects();
	flushSync(() => {});
}

function shadow(): ShadowRoot {
	const host = document.querySelector('[data-octane-devtools-panel]');
	if (host === null || host.shadowRoot === null) throw new Error('panel host not mounted');
	return host.shadowRoot;
}

function click(target: Element | undefined | null): void {
	if (target == null) throw new Error('expected an element to click');
	flushSync(() => {
		target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
	});
}

function byText(root: ParentNode, selector: string, text: string): Element | undefined {
	return Array.from(root.querySelectorAll(selector)).find(
		(element) => element.textContent !== null && element.textContent.includes(text),
	);
}

function pointer(target: EventTarget, type: string, clientX: number, clientY: number): void {
	// jsdom builds without PointerEvent still deliver pointer-typed events
	// through the MouseEvent constructor (the type string is what matters).
	const Ctor: typeof MouseEvent = typeof PointerEvent !== 'undefined' ? PointerEvent : MouseEvent;
	flushSync(() => {
		target.dispatchEvent(new Ctor(type, { bubbles: true, cancelable: true, clientX, clientY }));
	});
}

describe('devtools panel', () => {
	it('mounts in a shadow root, shows the live tree, and stays out of it', async () => {
		const app = mount(App);
		const panel = mountDevtoolsPanel();
		expect(panel).not.toBeNull();
		try {
			await settle();
			const trigger = shadow().querySelector('.trigger');
			expect(trigger).not.toBeNull();

			click(trigger);
			expect(byText(shadow(), '.tree-row', 'App')).toBeDefined();
			expect(byText(shadow(), '.tree-row', 'Counter')).toBeDefined();
			expect(byText(shadow(), '.tree-row', '@for')).toBeDefined();

			// Self-exclusion: the panel is itself an Octane app, but the bridge
			// tree must only contain the application under inspection.
			const labels: string[] = [];
			const collect = (
				nodes: ReturnType<NonNullable<typeof globalThis.__OCTANE_DEVTOOLS__>['getTree']>,
			): void => {
				for (const node of nodes) {
					labels.push(node.label);
					collect(node.children);
				}
			};
			collect(globalThis.__OCTANE_DEVTOOLS__!.getTree());
			expect(labels).toContain('App');
			expect(labels.join(' ')).not.toContain('Panel');
		} finally {
			panel!.unmount();
			app.unmount();
		}
		expect(document.querySelector('[data-octane-devtools-panel]')).toBeNull();
	});

	it('recovers when the bridge attaches after the initial wait instead of parking dead', async () => {
		// A slow cold load can install the bridge after the panel's initial
		// wait gives up. The panel must keep listening and attach late — not
		// leak a dead host that only a reload can revive.
		const app = mount(App);
		const bridge = globalThis.__OCTANE_DEVTOOLS__!;
		expect(bridge).toBeDefined();
		globalThis.__OCTANE_DEVTOOLS__ = undefined;
		const info = vi.spyOn(console, 'info').mockImplementation(() => {});
		vi.useFakeTimers();
		const panel = mountDevtoolsPanel();
		expect(panel).not.toBeNull();
		try {
			// The initial wait expires: one hint, no UI, host still present.
			await vi.advanceTimersByTimeAsync(5100);
			expect(info).toHaveBeenCalledTimes(1);
			expect(shadow().querySelector('.trigger')).toBeNull();

			// The bridge appears late; the next relaxed poll tick mounts the UI.
			globalThis.__OCTANE_DEVTOOLS__ = bridge;
			await vi.advanceTimersByTimeAsync(1100);
			vi.useRealTimers();
			await settle();
			expect(shadow().querySelector('.trigger')).not.toBeNull();
		} finally {
			vi.useRealTimers();
			globalThis.__OCTANE_DEVTOOLS__ = bridge;
			info.mockRestore();
			panel!.unmount();
			app.unmount();
		}
		expect(document.querySelector('[data-octane-devtools-panel]')).toBeNull();
	});

	it('inspects a selected component and copies an agent prompt with its evidence', async () => {
		const writeText = vi.fn(async () => {});
		Object.defineProperty(navigator, 'clipboard', {
			value: { writeText },
			configurable: true,
		});
		const app = mount(App);
		const panel = mountDevtoolsPanel({ openByDefault: true });
		try {
			await settle();
			click(byText(shadow(), '.tree-row', 'Counter'));

			const inspector = shadow().querySelector('.inspector');
			expect(inspector).not.toBeNull();
			expect(inspector!.textContent).toContain('Counter');
			expect(inspector!.textContent).toContain('useState');
			expect(inspector!.textContent).toContain('inspect-app.tsrx');

			click(byText(shadow(), 'button', 'Copy agent prompt'));
			await settle();
			expect(writeText).toHaveBeenCalledTimes(1);
			const prompt = writeText.mock.calls[0][0] as string;
			expect(prompt).toContain('Counter');
			expect(prompt).toContain('inspect-app.tsrx');
			expect(prompt).toContain('useState');
			expect(prompt).toContain('Octane framework notes');

			// useDebugValue records surface in the inspector and the prompt.
			expect(inspector!.textContent).toContain('count is 0');
			expect(inspector!.textContent).toContain('useCounter');
			expect(prompt).toContain('useDebugValue');
			expect(prompt).toContain('count is 0');
		} finally {
			panel!.unmount();
			app.unmount();
		}
	});

	it('renders registered plugin tabs with access to the live bridge', async () => {
		const app = mount(App);
		const panel = mountDevtoolsPanel({ openByDefault: true });
		const unregister = registerDevtoolsPanelPlugin({
			id: 'test-tool',
			label: 'My Tool',
			component: (props: DevtoolsPanelPluginProps) =>
				'plugin sees ' + props.hook.getTree().length + ' root(s)',
		});
		try {
			await settle();
			// Plugins registered before or after mount both appear (the registry
			// is observable); this one landed between mount and the handshake.
			const pluginTab = byText(shadow(), '.tab-plugin', 'My Tool');
			expect(pluginTab).toBeDefined();

			click(pluginTab);
			const body = shadow().querySelector('.dock-body');
			expect(body!.textContent).toContain('plugin sees 1 root(s)');

			flushSync(() => unregister());
			expect(byText(shadow(), '.tab-plugin', 'My Tool')).toBeUndefined();
			expect(body!.textContent).toContain('no longer registered');
		} finally {
			unregister();
			panel!.unmount();
			app.unmount();
		}
	});

	it('drag repositions and persists the trigger without opening the dock; a click still opens it', async () => {
		localStorage.removeItem('octane-devtools:trigger');
		const app = mount(App);
		const panel = mountDevtoolsPanel();
		try {
			await settle();
			const trigger = shadow().querySelector('.trigger') as HTMLElement;
			expect(trigger).not.toBeNull();
			expect(shadow().querySelector('.dock')).toBeNull();

			// Drag: pointerdown on the trigger, > 4px of movement, release.
			pointer(trigger, 'pointerdown', 300, 300);
			pointer(window, 'pointermove', 320, 260);
			pointer(window, 'pointermove', 340, 200);
			pointer(window, 'pointerup', 340, 200);
			// A macrotask closes the drag's click-suppression window.
			await settle();

			// The trigger moved to a snapped fixed position…
			expect(trigger.style.left).toMatch(/px$/);
			expect(trigger.style.top).toMatch(/px$/);
			// …the position persisted…
			const stored = JSON.parse(localStorage.getItem('octane-devtools:trigger') ?? 'null') as {
				x: number;
				y: number;
			} | null;
			expect(stored).not.toBeNull();
			expect(typeof stored!.x).toBe('number');
			expect(typeof stored!.y).toBe('number');
			// …and the drag did NOT toggle the dock open.
			expect(shadow().querySelector('.dock')).toBeNull();

			// A plain click (no drag) still opens the dock.
			click(trigger);
			expect(shadow().querySelector('.dock')).not.toBeNull();
		} finally {
			panel!.unmount();
			app.unmount();
			localStorage.removeItem('octane-devtools:trigger');
		}
	});

	it('element picker reveals the hovered row and click-selects it without closing the dock', async () => {
		// The picker coalesces hovers through requestAnimationFrame; a
		// synchronous stub keeps the pipeline deterministic under jsdom.
		vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback): number => {
			callback(0);
			return 0;
		});
		const app = mount(App);
		const panel = mountDevtoolsPanel({ openByDefault: true });
		try {
			await settle();
			const pickerButton = shadow().querySelector('.picker-btn');
			expect(pickerButton).not.toBeNull();

			click(pickerButton);
			await settle(); // the [picking] effect installs the window listeners
			expect(pickerButton!.classList.contains('active')).toBe(true);

			// Hovering the app's counter button reveals and marks its row —
			// without changing the committed selection.
			const increment = document.querySelector('.inc');
			expect(increment).not.toBeNull();
			pointer(increment!, 'pointermove', 40, 40);
			const hovered = byText(shadow(), '.tree-row.picker-hover', 'Counter');
			expect(hovered).toBeDefined();
			expect(shadow().querySelector('.tree-row.selected')).toBeNull();

			// Clicking the page element selects that node and exits picker mode.
			click(increment);
			await settle();
			expect(byText(shadow(), '.tree-row.selected', 'Counter')).toBeDefined();
			expect(shadow().querySelector('.picker-btn')!.classList.contains('active')).toBe(false);
			expect(shadow().querySelector('.tree-row.picker-hover')).toBeNull();
			// The dock stayed open, and the inspector shows the picked component.
			expect(shadow().querySelector('.dock')).not.toBeNull();
			expect(shadow().querySelector('.inspector')!.textContent).toContain('Counter');
		} finally {
			vi.unstubAllGlobals();
			panel!.unmount();
			app.unmount();
		}
	});

	it('is a bottom drawer only: no placement controls, legacy dock records tolerated', async () => {
		// A record from the removed sidebar capability: unknown fields must be
		// ignored, the bottom height and pin flag honored.
		localStorage.setItem(
			'octane-devtools:dock',
			JSON.stringify({ mode: 'left', pinned: true, sizes: { bottom: 333, left: 500 } }),
		);
		const app = mount(App);
		const panel = mountDevtoolsPanel({ openByDefault: true });
		try {
			await settle();
			const dock = shadow().querySelector('.dock') as HTMLElement;
			expect(dock).not.toBeNull();
			expect(dock.style.height).toBe('333px');

			// No dock-placement UI anywhere: not in the dock bar…
			expect(shadow().querySelector('.dock-bar .mode-btn')).toBeNull();
			expect(shadow().querySelector('.mode-btn')).toBeNull();
			// …and none in Settings either.
			click(byText(shadow(), '.tab', 'Settings'));
			const settings = shadow().querySelector('.settings');
			expect(settings).not.toBeNull();
			expect(settings!.textContent).not.toContain('Dock position');
			// The pin control remains, as a monochrome SVG icon (no emoji).
			const pin = shadow().querySelector('.pin-btn');
			expect(pin).not.toBeNull();
			expect(pin!.querySelector('svg')).not.toBeNull();
			expect(pin!.textContent).not.toContain('📌');
		} finally {
			panel!.unmount();
			app.unmount();
			localStorage.removeItem('octane-devtools:dock');
		}
	});

	it('derives a layout-independent self-exclusion prefix from the panel source', () => {
		const hookFor = (file: string | null): OctaneDevtools =>
			({
				getComponentSource: () => (file === null ? null : { file, line: 1, column: 0 }),
			}) as unknown as OctaneDevtools;

		// Monorepo layout.
		expect(
			getPanelSourcePrefix(hookFor('/repo/packages/octane-devtools/src/panel/panel.tsrx')),
		).toBe('/repo/packages/octane-devtools');
		// Installed/bundled layout — no 'octane-devtools' substring required.
		expect(
			getPanelSourcePrefix(
				hookFor('/app/node_modules/.vite/deps/%40octanejs%2Fdevtools/src/panel/panel.tsrx'),
			),
		).toBe('/app/node_modules/.vite/deps/%40octanejs%2Fdevtools');
		// No registration → null, so callers fall back to the substring check.
		expect(getPanelSourcePrefix(hookFor(null))).toBeNull();
		expect(getPanelSourcePrefix(hookFor('panel.tsrx'))).toBeNull();
	});
});
