import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { act, mount } from '../../octane/tests/_helpers';
import {
	DynamicBreadcrumbsHarness,
	DynamicTabsHarness,
	ForceMountTabsHarness,
	StaticBreadcrumbsHarness,
	StaticTabsHarness,
} from './_fixtures/rac-tabs-breadcrumbs.tsx';

// @octanejs/aria Phase 5 — RAC Tabs and Breadcrumbs over the Phase-4 collection
// engine. Structural collection updates land one microtask after commit (the
// Document's MutationObserver), so mounts and item mutations flush with
// `await act(() => {})` before asserting.

// jsdom lacks CSS.escape (pulled in transitively by the interaction utilities).
if (typeof (globalThis as any).CSS === 'undefined') {
	(globalThis as any).CSS = {
		escape(value: string): string {
			return String(value).replace(/[^-\w]/g, (c) => '\\' + c);
		},
	};
}

// jsdom lacks Element#getAnimations; the enter/exit animation hooks treat an empty
// animation list as "no animation" and complete immediately.
beforeAll(() => {
	(Element.prototype as any).getAnimations = () => [];
});
afterAll(() => {
	delete (Element.prototype as any).getAnimations;
});

function pointerEvent(type: string, init: PointerEventInit = {}): PointerEvent {
	return new PointerEvent(type, {
		bubbles: true,
		cancelable: true,
		button: 0,
		pointerId: 1,
		pointerType: 'mouse',
		width: 20,
		height: 20,
		pressure: 0.5,
		detail: 1,
		...init,
	});
}

async function press(el: Element): Promise<void> {
	await act(() => {
		el.dispatchEvent(pointerEvent('pointerdown', { clientX: 5, clientY: 5 }));
	});
	await act(() => {
		el.dispatchEvent(pointerEvent('pointerup', { clientX: 5, clientY: 5 }));
		el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
	});
}

function keydown(el: Element, key: string, init: KeyboardEventInit = {}): void {
	el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }));
}

type Mounted = ReturnType<typeof mount>;

function tabs(r: Mounted): HTMLElement[] {
	return [...r.container.querySelectorAll('[role="tab"]')] as HTMLElement[];
}

function panel(r: Mounted): HTMLElement | null {
	return r.container.querySelector('[role="tabpanel"]');
}

describe('@octanejs/aria/components — Tabs', () => {
	it('renders tablist/tab/tabpanel roles with the first tab selected by default', async () => {
		const r = mount(StaticTabsHarness, {});
		await act(() => {});

		const root = r.container.querySelector('.react-aria-Tabs') as HTMLElement;
		expect(root).toBeTruthy();
		expect(root.getAttribute('data-orientation')).toBe('horizontal');

		const tablist = r.container.querySelector('[role="tablist"]') as HTMLElement;
		expect(tablist).toBeTruthy();
		expect(tablist.className).toBe('react-aria-TabList');
		expect(tablist.getAttribute('aria-orientation')).toBe('horizontal');
		expect(tablist.getAttribute('aria-label')).toBe('History of Ancient Rome');

		const [t1, t2, t3] = tabs(r);
		expect(tabs(r).length).toBe(3);
		expect(t1.className).toBe('react-aria-Tab');
		expect(t1.textContent).toBe('Founding');
		// RAC establishes default selection: the first tab is selected.
		expect(t1.getAttribute('aria-selected')).toBe('true');
		expect(t1.getAttribute('data-selected')).toBe('true');
		expect(t2.getAttribute('aria-selected')).toBe('false');
		expect(t2.hasAttribute('data-selected')).toBe(false);
		expect(t3.getAttribute('aria-selected')).toBe('false');
		// Roving tabindex: the selected tab is the single tab stop.
		expect(t1.tabIndex).toBe(0);
		expect(t2.tabIndex).toBe(-1);

		// Only the selected panel is mounted; it is labelled by the selected tab.
		const p = panel(r)!;
		expect(p.className).toBe('react-aria-TabPanel');
		expect(p.textContent).toBe('Founding panel');
		expect(r.container.querySelectorAll('[role="tabpanel"]').length).toBe(1);
		expect(p.getAttribute('aria-labelledby')).toBe(t1.id);
		expect(t1.getAttribute('aria-controls')).toBe(p.id);
		// No tabbable children: the panel itself is focusable.
		expect(p.tabIndex).toBe(0);
		r.unmount();
	});

	it('clicking a tab moves data-selected and switches the visible panel', async () => {
		const log: any[] = [];
		const r = mount(StaticTabsHarness, { onSelectionChange: (key: any) => log.push(key) });
		await act(() => {});

		// Establishing the default selection on mount reports it (as upstream does
		// when no defaultSelectedKey is provided — upstream asserts LastCalledWith).
		expect(log).toEqual(['founding']);

		const [t1, t2] = tabs(r);
		await press(t2);
		await act(() => {});

		expect(log[log.length - 1]).toBe('monarchy');
		expect(log).toEqual(['founding', 'monarchy']);
		expect(t2.getAttribute('data-selected')).toBe('true');
		expect(t2.getAttribute('aria-selected')).toBe('true');
		expect(t1.hasAttribute('data-selected')).toBe(false);
		expect(t1.getAttribute('aria-selected')).toBe('false');
		expect(panel(r)!.textContent).toBe('Monarchy panel');
		expect(r.container.querySelectorAll('[role="tabpanel"]').length).toBe(1);
		r.unmount();
	});

	it('ArrowRight moves focus AND selection (automatic keyboard activation)', async () => {
		const r = mount(StaticTabsHarness, {});
		await act(() => {});

		const [t1, t2] = tabs(r);
		await act(() => t1.focus());
		expect(document.activeElement).toBe(t1);

		await act(() => keydown(document.activeElement!, 'ArrowRight'));
		expect(document.activeElement).toBe(t2);
		expect(t2.getAttribute('data-selected')).toBe('true');
		expect(t1.hasAttribute('data-selected')).toBe(false);
		expect(panel(r)!.textContent).toBe('Monarchy panel');

		await act(() => keydown(document.activeElement!, 'ArrowLeft'));
		expect(document.activeElement).toBe(t1);
		expect(t1.getAttribute('data-selected')).toBe('true');
		expect(panel(r)!.textContent).toBe('Founding panel');
		r.unmount();
	});

	it('renders dynamic items through the render function and follows item additions', async () => {
		const r = mount(DynamicTabsHarness, {});
		await act(() => {});

		expect(tabs(r).map((t) => t.textContent)).toEqual(['Alpha', 'Beta', 'Gamma']);
		expect(tabs(r)[0].getAttribute('data-selected')).toBe('true');
		expect(panel(r)!.textContent).toBe('Alpha panel');

		await act(() => {
			(r.container.querySelector('[data-action="add"]') as HTMLElement).click();
		});
		// Structural collection updates land one microtask after commit.
		await act(() => {});

		expect(tabs(r).map((t) => t.textContent)).toEqual(['Alpha', 'Beta', 'Gamma', 'Delta']);
		await press(tabs(r)[3]);
		await act(() => {});
		expect(tabs(r)[3].getAttribute('data-selected')).toBe('true');
		expect(panel(r)!.textContent).toBe('Delta panel');
		r.unmount();
	});

	it('shouldForceMount keeps unselected panels mounted but inert', async () => {
		const r = mount(ForceMountTabsHarness, {});
		await act(() => {});

		// The unselected forced-mount panel is rendered but inert; per upstream, the
		// tabpanel role/labelling props apply only to the SELECTED panel, so query by
		// the default className (as upstream's own shouldForceMount test does).
		const panels = () => [...r.container.querySelectorAll('.react-aria-TabPanel')] as HTMLElement[];
		expect(panels().length).toBe(2);
		expect(panels()[0].textContent).toContain('One panel');
		expect(panels()[0].hasAttribute('inert')).toBe(false);
		expect(panels()[0].hasAttribute('data-inert')).toBe(false);
		expect(panels()[0].getAttribute('role')).toBe('tabpanel');
		expect(panels()[1].textContent).toContain('Two panel');
		expect(panels()[1].hasAttribute('inert')).toBe(true);
		expect(panels()[1].getAttribute('data-inert')).toBe('true');

		await press(tabs(r)[1]);
		await act(() => {});
		expect(panels()[0].hasAttribute('inert')).toBe(true);
		expect(panels()[0].getAttribute('data-inert')).toBe('true');
		expect(panels()[1].hasAttribute('inert')).toBe(false);
		expect(panels()[1].getAttribute('role')).toBe('tabpanel');
		r.unmount();
	});
});

describe('@octanejs/aria/components — Breadcrumbs', () => {
	it('renders an ol/li structure of links with the last crumb current', async () => {
		const r = mount(StaticBreadcrumbsHarness, {});
		await act(() => {});

		const ol = r.container.querySelector('ol') as HTMLOListElement;
		expect(ol).toBeTruthy();
		expect(ol.className).toBe('react-aria-Breadcrumbs');
		// useBreadcrumbs supplies the localized default label.
		expect(ol.getAttribute('aria-label')).toBe('Breadcrumbs');

		const items = [...ol.querySelectorAll('li')];
		expect(items.length).toBe(3);
		expect(items.map((li) => li.className)).toEqual([
			'react-aria-Breadcrumb',
			'react-aria-Breadcrumb',
			'react-aria-Breadcrumb',
		]);

		// Crumbs with an href render real anchors.
		const links = items.map((li) => li.querySelector('.react-aria-Link')!);
		expect(links[0].tagName).toBe('A');
		expect(links[0].getAttribute('href')).toBe('/');
		expect(links[1].tagName).toBe('A');

		// The last crumb is the current page: aria-current on the link, data-current
		// on the li, and the link is disabled (renders a span even with no href).
		expect(links[2].getAttribute('aria-current')).toBe('page');
		expect(links[2].tagName).toBe('SPAN');
		expect(links[2].getAttribute('data-disabled')).toBe('true');
		expect(items[2].getAttribute('data-current')).toBe('true');
		expect(items[2].getAttribute('data-disabled')).toBe('true');
		expect(links[0].hasAttribute('aria-current')).toBe(false);
		expect(items[0].hasAttribute('data-current')).toBe(false);
		expect(items[0].hasAttribute('data-disabled')).toBe(false);
		r.unmount();
	});

	it('renders dynamic items and moves aria-current when the trail shrinks', async () => {
		const r = mount(DynamicBreadcrumbsHarness, {});
		await act(() => {});

		const texts = () => [...r.container.querySelectorAll('li')].map((li) => li.textContent);
		expect(texts()).toEqual(['Home', 'Trendy', 'March 2022 Assets']);
		const current = () => r.container.querySelector('[aria-current="page"]');
		expect(current()!.textContent).toBe('March 2022 Assets');

		await act(() => {
			(r.container.querySelector('[data-action="pop"]') as HTMLElement).click();
		});
		// Structural collection updates land one microtask after commit.
		await act(() => {});

		expect(texts()).toEqual(['Home', 'Trendy']);
		expect(current()!.textContent).toBe('Trendy');
		r.unmount();
	});

	it('pressing a non-current crumb link fires onAction with its key', async () => {
		const log: any[] = [];
		const r = mount(DynamicBreadcrumbsHarness, { onAction: (key: any) => log.push(key) });
		await act(() => {});

		const links = [...r.container.querySelectorAll('.react-aria-Link')];
		expect(links[1].textContent).toBe('Trendy');
		await press(links[1]);
		expect(log).toEqual([2]);

		// The current crumb's link is disabled: pressing it does not fire onAction.
		await press(links[2]);
		expect(log).toEqual([2]);
		r.unmount();
	});
});
