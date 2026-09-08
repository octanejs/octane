import { describe, expect, it, vi } from 'vitest';
import { createElement, flushSync } from 'octane';
import { flushEffects, mount } from '../../../octane/tests/_helpers';
import { Tabs } from '../../src/tabs';

// Cases ported from the pinned upstream suite at
// `.base-ui/packages/react/src/tabs/**/*.test.tsx` (v1.6.0). Each `it` cites the upstream file and
// case name it comes from, and asserts octane's observable outcome rather than React internals.
//
// SCOPE, stated because silence would read as a parity claim: upstream ships 84 cases across five
// files (76 in TabsRoot, 5 in TabsList, 1 in TabsTab, 2 in TabsPanel). The cases below are the
// subset that pins the contracts a consumer can observe — aria wiring, tab order, the automatic
// selection policy, keyboard navigation and panel transitions. The remainder are not ported yet;
// most of the untouched TabsRoot cases exercise `Tabs.Indicator`, which this port does not include.
//
// jsdom cannot see layout, so the `activationDirection` cases that read tab geometry via
// getBoundingClientRect are out of scope here and belong in a real-browser suite.

async function settle(): Promise<void> {
	for (let i = 0; i < 5; i += 1) {
		flushEffects();
		flushSync(() => {});
		await new Promise((resolve) => setTimeout(resolve, 0));
	}
}

function tabs(root: Element): HTMLElement[] {
	return [...root.querySelectorAll<HTMLElement>('[role="tab"]')];
}

function panels(root: Element): HTMLElement[] {
	return [...root.querySelectorAll<HTMLElement>('[role="tabpanel"]')];
}

function basicTabs(
	rootProps: Record<string, unknown> = {},
	tabProps: Record<string, unknown>[] = [],
) {
	return () =>
		createElement(
			Tabs.Root,
			rootProps,
			createElement(
				Tabs.List,
				{ key: 'list' },
				createElement(Tabs.Tab, { key: 't0', value: 0, ...(tabProps[0] ?? {}) }, 'Tab 0'),
				createElement(Tabs.Tab, { key: 't1', value: 1, ...(tabProps[1] ?? {}) }, 'Tab 1'),
				createElement(Tabs.Tab, { key: 't2', value: 2, ...(tabProps[2] ?? {}) }, 'Tab 2'),
			),
			createElement(Tabs.Panel, { key: 'p0', value: 0, keepMounted: true }, 'Panel 0'),
			createElement(Tabs.Panel, { key: 'p1', value: 1, keepMounted: true }, 'Panel 1'),
			createElement(Tabs.Panel, { key: 'p2', value: 2, keepMounted: true }, 'Panel 2'),
		);
}

describe('@octanejs/base-ui — Tabs (ported upstream cases)', () => {
	// Per tabs/root/TabsRoot.test.tsx: 'sets the aria-controls attribute on tabs to the
	// corresponding tab panel id' and 'sets the aria-labelledby attribute on tab panels to the
	// corresponding tab id'.
	it('wires aria-controls and aria-labelledby between each tab and its panel', async () => {
		const m = mount(basicTabs({ defaultValue: 0 }) as never);
		await settle();
		try {
			const [tab] = tabs(m.container);
			const [panel] = panels(m.container);
			expect(tab.getAttribute('aria-controls')).toBe(panel.id);
			expect(panel.getAttribute('aria-labelledby')).toBe(tab.id);
			expect(tab.id).toBeTruthy();
			expect(panel.id).toBeTruthy();
		} finally {
			m.unmount();
		}
	});

	// Per tabs/root/TabsRoot.test.tsx: 'puts the selected child in tab order'.
	it('puts only the selected tab in tab order', async () => {
		const m = mount(basicTabs({ defaultValue: 1 }) as never);
		await settle();
		try {
			expect(tabs(m.container).map((t) => t.getAttribute('tabindex'))).toEqual(['-1', '0', '-1']);
		} finally {
			m.unmount();
		}
	});

	// Per tabs/list/TabsList.test.tsx: 'sets the aria-selected attribute on the active tab'.
	it('marks only the active tab aria-selected', async () => {
		const m = mount(basicTabs({ defaultValue: 1 }) as never);
		await settle();
		try {
			expect(tabs(m.container).map((t) => t.getAttribute('aria-selected'))).toEqual([
				'false',
				'true',
				'false',
			]);
		} finally {
			m.unmount();
		}
	});

	// Per tabs/root/TabsRoot.test.tsx: 'should select the second tab when the first one is disabled'.
	it('falls back to the first enabled tab when the implicit selection is disabled', async () => {
		const m = mount(basicTabs({}, [{ disabled: true }]) as never);
		await settle();
		try {
			const [disabledTab, enabledTab] = tabs(m.container);
			expect(disabledTab.getAttribute('aria-selected')).toBe('false');
			expect(enabledTab.getAttribute('aria-selected')).toBe('true');
			const [disabledPanel, enabledPanel] = panels(m.container);
			expect(disabledPanel.hasAttribute('hidden')).toBe(true);
			expect(enabledPanel.hasAttribute('hidden')).toBe(false);
			expect(enabledPanel.textContent).toContain('Panel 1');
		} finally {
			m.unmount();
		}
	});

	// Per tabs/root/TabsRoot.test.tsx: 'should select the third tab when first two tabs are
	// disabled'.
	it('skips past every disabled tab when falling back', async () => {
		const m = mount(basicTabs({}, [{ disabled: true }, { disabled: true }]) as never);
		await settle();
		try {
			expect(tabs(m.container).map((t) => t.getAttribute('aria-selected'))).toEqual([
				'false',
				'false',
				'true',
			]);
		} finally {
			m.unmount();
		}
	});

	// Per tabs/root/TabsRoot.test.tsx: 'should still honor explicit defaultValue even if it points
	// to a disabled tab'. This is the case that distinguishes an explicit default from the implicit
	// one above — the fallback must NOT fire here.
	it('honors an explicit defaultValue that points at a disabled tab', async () => {
		const m = mount(basicTabs({ defaultValue: 0 }, [{ disabled: true }]) as never);
		await settle();
		try {
			expect(tabs(m.container).map((t) => t.getAttribute('aria-selected'))).toEqual([
				'true',
				'false',
				'false',
			]);
		} finally {
			m.unmount();
		}
	});

	// Per tabs/root/TabsRoot.test.tsx: 'should support values of different types'.
	it('supports non-numeric values', async () => {
		const m = mount((() =>
			createElement(
				Tabs.Root,
				{ defaultValue: 'b' },
				createElement(
					Tabs.List,
					{ key: 'list' },
					createElement(Tabs.Tab, { key: 'a', value: 'a' }, 'A'),
					createElement(Tabs.Tab, { key: 'b', value: 'b' }, 'B'),
				),
				createElement(Tabs.Panel, { key: 'pa', value: 'a' }, 'Panel A'),
				createElement(Tabs.Panel, { key: 'pb', value: 'b' }, 'Panel B'),
			)) as never);
		await settle();
		try {
			expect(tabs(m.container).map((t) => t.getAttribute('aria-selected'))).toEqual([
				'false',
				'true',
			]);
			expect(m.container.textContent).toContain('Panel B');
			expect(m.container.textContent).not.toContain('Panel A');
		} finally {
			m.unmount();
		}
	});

	it('selects a tab on click and moves the panel with it', async () => {
		const m = mount(basicTabs({ defaultValue: 0 }) as never);
		await settle();
		try {
			tabs(m.container)[1].click();
			await settle();
			expect(tabs(m.container).map((t) => t.getAttribute('aria-selected'))).toEqual([
				'false',
				'true',
				'false',
			]);
			expect(panels(m.container)[1].hasAttribute('hidden')).toBe(false);
			expect(panels(m.container)[0].hasAttribute('hidden')).toBe(true);
		} finally {
			m.unmount();
		}
	});

	// A controlled root keeps exactly the value it is given — the automatic fallback above is an
	// uncontrolled-only policy, and this is what separates the two paths.
	it('leaves a controlled root on a disabled selection instead of falling back', async () => {
		const m = mount(basicTabs({ value: 0 }, [{ disabled: true }]) as never);
		await settle();
		try {
			expect(tabs(m.container).map((t) => t.getAttribute('aria-selected'))).toEqual([
				'true',
				'false',
				'false',
			]);
		} finally {
			m.unmount();
		}
	});

	it('reports an automatic initial selection through onValueChange', async () => {
		// Uncontrolled roots with no explicit default treat the first resolution as an automatic
		// change and notify once, with a reason.
		const seen: Array<[unknown, string]> = [];
		const m = mount((() =>
			createElement(
				Tabs.Root,
				{
					onValueChange: (value: unknown, details: { reason: string }) =>
						seen.push([value, details.reason]),
				},
				createElement(
					Tabs.List,
					{ key: 'list' },
					createElement(Tabs.Tab, { key: 't0', value: 0, disabled: true }, 'Tab 0'),
					createElement(Tabs.Tab, { key: 't1', value: 1 }, 'Tab 1'),
				),
			)) as never);
		await settle();
		try {
			expect(seen).toHaveLength(1);
			expect(seen[0][0]).toBe(1);
			expect(seen[0][1]).toBe('initial');
		} finally {
			m.unmount();
		}
	});

	it('gives the list a tablist role and marks vertical orientation for assistive tech', async () => {
		const m = mount(basicTabs({ defaultValue: 0, orientation: 'vertical' }) as never);
		await settle();
		try {
			const list = m.container.querySelector('[role="tablist"]')!;
			expect(list.getAttribute('aria-orientation')).toBe('vertical');
			expect(m.container.firstElementChild!.getAttribute('data-orientation')).toBe('vertical');
		} finally {
			m.unmount();
		}
	});

	// Not upstream's spelling, but the attribute contract this pin publishes, recorded because the
	// consuming shadcn layer has to target it: v1.6.0 emits `data-orientation="horizontal"`, not the
	// bare `data-horizontal` newer releases use.
	it('publishes orientation as data-orientation at this pin', async () => {
		const m = mount(basicTabs({ defaultValue: 0 }) as never);
		await settle();
		try {
			const root = m.container.firstElementChild!;
			expect(root.getAttribute('data-orientation')).toBe('horizontal');
			expect(root.hasAttribute('data-horizontal')).toBe(false);
		} finally {
			m.unmount();
		}
	});

	it('hides unselected panels and keeps them out of tab order', async () => {
		const m = mount(basicTabs({ defaultValue: 1 }) as never);
		await settle();
		try {
			const [first, second] = panels(m.container);
			expect(first.hasAttribute('hidden')).toBe(true);
			expect(first.getAttribute('tabindex')).toBe('-1');
			expect(second.hasAttribute('hidden')).toBe(false);
			expect(second.getAttribute('tabindex')).toBe('0');
		} finally {
			m.unmount();
		}
	});

	it('unmounts a hidden panel unless keepMounted is set', async () => {
		const m = mount((() =>
			createElement(
				Tabs.Root,
				{ defaultValue: 0 },
				createElement(
					Tabs.List,
					{ key: 'list' },
					createElement(Tabs.Tab, { key: 't0', value: 0 }, 'Tab 0'),
					createElement(Tabs.Tab, { key: 't1', value: 1 }, 'Tab 1'),
				),
				createElement(Tabs.Panel, { key: 'p0', value: 0 }, 'Panel 0'),
				createElement(Tabs.Panel, { key: 'p1', value: 1 }, 'Panel 1'),
			)) as never);
		await settle();
		try {
			expect(panels(m.container)).toHaveLength(1);
			expect(m.container.textContent).toContain('Panel 0');
			expect(m.container.textContent).not.toContain('Panel 1');
		} finally {
			m.unmount();
		}
	});

	it('throws a clear error when a part is used outside Tabs.Root', () => {
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		try {
			expect(() => {
				const m = mount((() => createElement(Tabs.List, {})) as never);
				m.unmount();
			}).toThrow(/TabsRootContext is missing/);
		} finally {
			spy.mockRestore();
		}
	});
});
