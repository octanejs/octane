import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, flushEffects } from '../../octane/tests/_helpers';
import { flushSync } from '../../octane/src/index.js';
import {
	FieldErrorChildrenFixture,
	FieldErrorFixture,
	FieldFixture,
	SidebarFixture,
	SidebarMenuButtonAsChildFixture,
	SidebarMenuButtonTooltipCollapsedFixture,
	SidebarMenuButtonTooltipFixture,
	SidebarMobileFixture,
	SidebarNoneFixture,
	SidebarVariantFixture,
	UseSidebarOutsideFixture,
} from './_fixtures/composites-app.tsrx';

// Overlay parts portal into document.body, so those queries go through `document`.
const $ = (sel: string): HTMLElement | null => document.querySelector(sel);

function slot(container: Element, name: string): HTMLElement {
	const el = container.querySelector(`[data-slot="${name}"]`);
	expect(el, `missing [data-slot="${name}"]`).not.toBeNull();
	return el as HTMLElement;
}

// Drain passive effects + let macrotask-deferred setup run, a few rounds —
// the pattern from packages/radix/tests (see overlays.test.ts).
async function settle(): Promise<void> {
	for (let i = 0; i < 3; i++) {
		flushEffects();
		flushSync(() => {});
		await new Promise((res) => setTimeout(res, 5));
	}
}

function pressShortcut(init: KeyboardEventInit): void {
	flushSync(() => {
		window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', bubbles: true, ...init }));
	});
}

describe('@octanejs/shadcn — Sidebar', () => {
	beforeEach(() => {
		// Sidebar's media-query effect runs during settle; jsdom has no matchMedia.
		vi.stubGlobal(
			'matchMedia',
			vi.fn((media: string) => ({
				matches: false,
				media,
				onchange: null,
				addListener: () => {},
				removeListener: () => {},
				addEventListener: () => {},
				removeEventListener: () => {},
				dispatchEvent: () => false,
			})),
		);
	});

	afterEach(async () => {
		try {
			await settle();
		} finally {
			vi.unstubAllGlobals();
		}
	});

	it('provider defaults + the full desktop slot/data contract', async () => {
		const { container, unmount } = mount(SidebarFixture);
		await settle();

		const wrapper = slot(container, 'sidebar-wrapper');
		expect(wrapper.className).toContain('group/sidebar-wrapper');
		expect(wrapper.style.getPropertyValue('--sidebar-width')).toBe('16rem');
		expect(wrapper.style.getPropertyValue('--sidebar-width-icon')).toBe('3rem');

		const sidebar = slot(container, 'sidebar');
		expect(sidebar.getAttribute('data-state')).toBe('expanded');
		expect(sidebar.getAttribute('data-collapsible')).toBe('');
		expect(sidebar.getAttribute('data-variant')).toBe('sidebar');
		expect(sidebar.getAttribute('data-side')).toBe('left');

		const gap = slot(container, 'sidebar-gap');
		expect(gap.className).toContain('relative');
		const sidebarContainer = slot(container, 'sidebar-container');
		expect(sidebarContainer.getAttribute('data-side')).toBe('left');
		const inner = slot(container, 'sidebar-inner');
		expect(inner.getAttribute('data-sidebar')).toBe('sidebar');
		expect(inner.className).toContain('bg-sidebar');

		// Structural parts, each with its data-sidebar name and cn- class.
		expect(slot(container, 'sidebar-header').getAttribute('data-sidebar')).toBe('header');
		expect(slot(container, 'sidebar-footer').getAttribute('data-sidebar')).toBe('footer');
		expect(slot(container, 'sidebar-content').className).toContain('flex');
		expect(slot(container, 'sidebar-group').className).toContain('relative');
		expect(slot(container, 'sidebar-group-label').textContent).toBe('Platform');
		const groupAction = slot(container, 'sidebar-group-action');
		expect(groupAction.tagName).toBe('BUTTON');
		expect(slot(container, 'sidebar-group-content').className).toContain('text-sm');
		expect(slot(container, 'sidebar-menu').tagName).toBe('UL');
		expect(slot(container, 'sidebar-menu-item').tagName).toBe('LI');
		expect(slot(container, 'sidebar-menu-badge').textContent).toBe('3');
		expect(slot(container, 'sidebar-menu-sub').tagName).toBe('UL');
		expect(slot(container, 'sidebar-menu-sub-item').tagName).toBe('LI');

		// SidebarInput keeps the Input contract underneath its own slot name.
		const input = slot(container, 'sidebar-input') as HTMLInputElement;
		expect(input.tagName).toBe('INPUT');
		expect(input.getAttribute('data-sidebar')).toBe('input');
		expect(input.className).toContain('bg-background');
		expect(input.className).toContain('border-input');

		// SidebarSeparator keeps the Separator host with its own slot name.
		const separator = slot(container, 'sidebar-separator');
		expect(separator.getAttribute('data-sidebar')).toBe('separator');
		expect(separator.className).toContain('bg-sidebar-border');

		// Menu button: variant/size classes and the active/size data attrs.
		const menuButton = container.querySelector('[data-testid="menu-button"]') as HTMLElement;
		expect(menuButton.tagName).toBe('BUTTON');
		expect(menuButton.getAttribute('data-slot')).toBe('sidebar-menu-button');
		expect(menuButton.getAttribute('data-size')).toBe('default');
		expect(menuButton.getAttribute('data-active')).toBe('true');
		expect(menuButton.className).toContain('peer/menu-button');
		expect(menuButton.className).toContain('peer/menu-button');
		expect(menuButton.className).toContain('peer/menu-button');

		const menuAction = container.querySelector('[data-testid="menu-action"]') as HTMLElement;
		expect(menuAction.getAttribute('data-slot')).toBe('sidebar-menu-action');
		expect(menuAction.className).toContain('md:opacity-0'); // showOnHover branch

		const subButton = container.querySelector('[data-testid="menu-sub-button"]') as HTMLElement;
		expect(subButton.tagName).toBe('A');
		expect(subButton.getAttribute('data-size')).toBe('md');
		expect(subButton.getAttribute('data-active')).toBe('false');

		// Skeleton: optional icon part plus the width custom property on the text part.
		const skeleton = slot(container, 'sidebar-menu-skeleton');
		expect(skeleton.querySelector('[data-sidebar="menu-skeleton-icon"]')).not.toBeNull();
		const text = skeleton.querySelector('[data-sidebar="menu-skeleton-text"]') as HTMLElement;
		expect(text.style.getPropertyValue('--skeleton-width')).toMatch(/^\d+%$/);

		// Rail + trigger.
		const rail = slot(container, 'sidebar-rail');
		expect(rail.getAttribute('aria-label')).toBe('Toggle Sidebar');
		expect(rail.getAttribute('title')).toBe('Toggle Sidebar');
		const trigger = container.querySelector('[data-testid="sidebar-trigger"]') as HTMLElement;
		expect(trigger.getAttribute('data-slot')).toBe('sidebar-trigger');
		expect(trigger.getAttribute('data-sidebar')).toBe('trigger');
		expect(trigger.className).toContain('hover:bg-muted');
		expect(trigger.className).toContain('group/button');
		expect(trigger.querySelector('svg')).not.toBeNull();
		expect(trigger.querySelector('.sr-only')!.textContent).toBe('Toggle Sidebar');
		expect(slot(container, 'sidebar-inset').tagName).toBe('MAIN');
		unmount();
	});

	it('SidebarTrigger toggles data-state and writes the state cookie', async () => {
		const r = mount(SidebarFixture);
		await settle();
		expect(slot(r.container, 'sidebar').getAttribute('data-state')).toBe('expanded');

		r.click('[data-testid="sidebar-trigger"]');
		await settle();
		const sidebar = slot(r.container, 'sidebar');
		expect(sidebar.getAttribute('data-state')).toBe('collapsed');
		expect(sidebar.getAttribute('data-collapsible')).toBe('offcanvas');
		expect(document.cookie).toContain('sidebar_state=false');

		r.click('[data-testid="sidebar-trigger"]');
		await settle();
		expect(slot(r.container, 'sidebar').getAttribute('data-state')).toBe('expanded');
		expect(document.cookie).toContain('sidebar_state=true');
		r.unmount();
	});

	it('Cmd+B and Ctrl+B toggle the sidebar', async () => {
		const r = mount(SidebarFixture);
		await settle();
		expect(slot(r.container, 'sidebar').getAttribute('data-state')).toBe('expanded');

		pressShortcut({ metaKey: true });
		await settle();
		expect(slot(r.container, 'sidebar').getAttribute('data-state')).toBe('collapsed');

		pressShortcut({ ctrlKey: true });
		await settle();
		expect(slot(r.container, 'sidebar').getAttribute('data-state')).toBe('expanded');

		// A bare "b" does nothing.
		pressShortcut({});
		await settle();
		expect(slot(r.container, 'sidebar').getAttribute('data-state')).toBe('expanded');
		r.unmount();
	});

	it('defaultOpen=false + side/variant/collapsible drive the collapsed contract', async () => {
		const { container, unmount } = mount(SidebarVariantFixture);
		await settle();
		const sidebar = slot(container, 'sidebar');
		expect(sidebar.getAttribute('data-state')).toBe('collapsed');
		expect(sidebar.getAttribute('data-collapsible')).toBe('icon');
		expect(sidebar.getAttribute('data-variant')).toBe('floating');
		expect(sidebar.getAttribute('data-side')).toBe('right');
		// Floating variant switches the gap/container width classes.
		expect(slot(container, 'sidebar-gap').className).toContain(
			'group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+(--spacing(4)))]',
		);
		expect(slot(container, 'sidebar-container').className).toContain('p-2');
		unmount();
	});

	it('collapsible="none" renders the static container without state attrs', async () => {
		const { container, unmount } = mount(SidebarNoneFixture);
		await settle();
		const sidebar = slot(container, 'sidebar');
		expect(sidebar.getAttribute('data-state')).toBeNull();
		expect(sidebar.className).toContain('w-(--sidebar-width)');
		expect(container.querySelector('[data-slot="sidebar-container"]')).toBeNull();
		expect(sidebar.textContent).toContain('static content');
		unmount();
	});

	it('useSidebar outside a provider throws the upstream error', () => {
		expect(() => mount(UseSidebarOutsideFixture)).toThrowError(
			'useSidebar must be used within a SidebarProvider.',
		);
	});

	it('SidebarMenuButton asChild + isActive + size keeps the contract on the anchor host', async () => {
		const { container, unmount } = mount(SidebarMenuButtonAsChildFixture);
		await settle();
		const host = container.querySelector('[data-testid="aschild-button"]') as HTMLElement;
		expect(host.tagName).toBe('A');
		expect(host.getAttribute('href')).toBe('#home');
		expect(host.getAttribute('data-slot')).toBe('sidebar-menu-button');
		expect(host.getAttribute('data-sidebar')).toBe('menu-button');
		expect(host.getAttribute('data-size')).toBe('lg');
		expect(host.getAttribute('data-active')).toBe('true');
		expect(host.className).toContain('peer/menu-button');
		expect(host.textContent).toBe('Home');
		unmount();
	});

	it('SidebarMenuButton tooltip: hidden while expanded, shown when collapsed', async () => {
		const r = mount(SidebarMenuButtonTooltipFixture);
		await settle();
		const button = r.container.querySelector('[data-testid="tooltip-button"]') as HTMLElement;
		expect(button.getAttribute('data-slot')).toBe('sidebar-menu-button');
		// The tooltip trigger contract lands on the button via Slot.
		expect(button.getAttribute('data-state')).toBe('closed');

		flushSync(() => button.focus());
		await settle();
		let content = $('[data-slot="tooltip-content"]');
		expect(content).not.toBeNull();
		// Expanded state: upstream hides the tooltip (hidden = state !== "collapsed").
		expect(content!.hasAttribute('hidden')).toBe(true);
		r.unmount();
		await settle();

		const rc = mount(SidebarMenuButtonTooltipCollapsedFixture);
		await settle();
		const collapsedButton = rc.container.querySelector(
			'[data-testid="tooltip-button"]',
		) as HTMLElement;
		flushSync(() => collapsedButton.focus());
		await settle();
		content = $('[data-slot="tooltip-content"]');
		expect(content).not.toBeNull();
		expect(content!.hasAttribute('hidden')).toBe(false);
		expect(content!.textContent).toContain('Hover hint');
		rc.unmount();
	});

	it('mobile: renders the Sheet branch and SidebarTrigger toggles it', async () => {
		const originalInnerWidth = window.innerWidth;
		const mediaQuery = {
			matches: true,
			media: '(max-width: 767px)',
			onchange: null,
			addListener: () => {},
			removeListener: () => {},
			addEventListener: () => {},
			removeEventListener: () => {},
			dispatchEvent: () => false,
		};
		vi.stubGlobal(
			'matchMedia',
			vi.fn(() => mediaQuery),
		);
		Object.defineProperty(window, 'innerWidth', {
			value: 500,
			configurable: true,
			writable: true,
		});
		try {
			const r = mount(SidebarMobileFixture);
			await settle();
			// The isMobile effect swaps the desktop branch out; the sheet is closed.
			expect(r.container.querySelector('[data-slot="sidebar-container"]')).toBeNull();
			expect($('[data-slot="sidebar"]')).toBeNull();

			r.click('[data-testid="sidebar-trigger"]');
			await settle();

			const content = $('[data-slot="sidebar"]')!;
			expect(content).not.toBeNull();
			expect(document.body.contains(content)).toBe(true);
			expect(r.container.contains(content)).toBe(false);
			expect(content.getAttribute('data-mobile')).toBe('true');
			expect(content.getAttribute('data-sidebar')).toBe('sidebar');
			expect(content.getAttribute('data-side')).toBe('left');
			expect(content.className).toContain('bg-sidebar');
			expect(content.style.getPropertyValue('--sidebar-width')).toBe('18rem');
			// The sr-only sheet header labels the mobile sidebar.
			expect($('[data-slot="sheet-title"]')!.textContent).toBe('Sidebar');
			expect($('[data-slot="sheet-description"]')!.textContent).toBe(
				'Displays the mobile sidebar.',
			);
			expect(content.textContent).toContain('Mobile content');

			r.click('[data-testid="sidebar-trigger"]');
			await settle();
			expect($('[data-slot="sidebar"]')).toBeNull();
			r.unmount();
		} finally {
			vi.unstubAllGlobals();
			Object.defineProperty(window, 'innerWidth', {
				value: originalInnerWidth,
				configurable: true,
				writable: true,
			});
		}
	});
});

describe('@octanejs/shadcn — Field', () => {
	it('Field role/orientation and the set/legend/group/content/title/description contract', () => {
		const { container, unmount } = mount(FieldFixture);

		expect(slot(container, 'field-set').tagName).toBe('FIELDSET');
		const legend = slot(container, 'field-legend');
		expect(legend.tagName).toBe('LEGEND');
		expect(legend.getAttribute('data-variant')).toBe('label');
		expect(slot(container, 'field-group').className).toContain('flex');

		const vertical = container.querySelector('[data-testid="field-vertical"]') as HTMLElement;
		expect(vertical.getAttribute('role')).toBe('group');
		expect(vertical.getAttribute('data-slot')).toBe('field');
		expect(vertical.getAttribute('data-orientation')).toBe('vertical');
		expect(vertical.className).toContain('flex-col');

		const horizontal = container.querySelector('[data-testid="field-horizontal"]') as HTMLElement;
		expect(horizontal.getAttribute('data-orientation')).toBe('horizontal');
		expect(horizontal.className).toContain('flex-row');

		expect(slot(container, 'field-content').className).toContain('flex');
		// FieldTitle intentionally shares upstream's data-slot="field-label".
		const titles = container.querySelectorAll('[data-slot="field-label"]');
		// Upstream FieldTitle deliberately reuses data-slot="field-label"; its own
		// `items-center` utility is what distinguishes it from FieldLabel.
		const title = Array.from(titles).find((el) => !el.className.includes('group/field-label'));
		expect(title).not.toBeUndefined();
		expect(title!.textContent).toBe('Notifications');
		expect(slot(container, 'field-description').className).toContain('text-sm');
		unmount();
	});

	it('FieldLabel wires htmlFor through the Label port', () => {
		const { container, unmount } = mount(FieldFixture);
		const label = container.querySelector('label[data-slot="field-label"]') as HTMLLabelElement;
		expect(label).not.toBeNull();
		expect(label.getAttribute('for')).toBe('display-name');
		expect(label.className).toContain('flex');
		expect(label.className).toContain('font-medium'); // the composed Label contract
		unmount();
	});

	it('FieldSeparator renders with and without content', () => {
		const { container, unmount } = mount(FieldFixture);
		const plain = container.querySelector('[data-testid="separator-plain"]') as HTMLElement;
		expect(plain.getAttribute('data-slot')).toBe('field-separator');
		expect(plain.getAttribute('data-content')).toBe('false');
		expect(plain.querySelector('[data-slot="separator"]')).not.toBeNull();
		expect(plain.querySelector('[data-slot="field-separator-content"]')).toBeNull();

		const withContent = container.querySelector('[data-testid="separator-content"]') as HTMLElement;
		expect(withContent.getAttribute('data-content')).toBe('true');
		const contentSpan = withContent.querySelector(
			'[data-slot="field-separator-content"]',
		) as HTMLElement;
		expect(contentSpan).not.toBeNull();
		expect(contentSpan.textContent).toBe('or');
		expect(contentSpan.className).toContain('bg-background');
		unmount();
	});

	it('FieldError renders a single error message as plain text', () => {
		const { container, unmount } = mount(FieldErrorFixture, {
			errors: [{ message: 'Required' }],
		});
		const error = slot(container, 'field-error');
		expect(error.getAttribute('role')).toBe('alert');
		expect(error.className).toContain('text-sm');
		expect(error.textContent).toBe('Required');
		expect(error.querySelector('ul')).toBeNull();
		unmount();
	});

	it('FieldError renders a deduplicated list for multiple errors', () => {
		const { container, unmount } = mount(FieldErrorFixture, {
			errors: [{ message: 'Too short' }, { message: 'Too short' }, { message: 'No digits' }],
		});
		const error = slot(container, 'field-error');
		const list = error.querySelector('ul')!;
		expect(list).not.toBeNull();
		expect(list.className).toContain('list-disc');
		const items = list.querySelectorAll('li');
		expect(items.length).toBe(2);
		expect(items[0].textContent).toBe('Too short');
		expect(items[1].textContent).toBe('No digits');
		unmount();
	});

	it('FieldError duplicate-only errors collapse to a single plain message', () => {
		const { container, unmount } = mount(FieldErrorFixture, {
			errors: [{ message: 'Same' }, { message: 'Same' }],
		});
		const error = slot(container, 'field-error');
		expect(error.querySelector('ul')).toBeNull();
		expect(error.textContent).toBe('Same');
		unmount();
	});

	it('FieldError children win over errors; no content renders nothing', () => {
		const withChildren = mount(FieldErrorChildrenFixture);
		const error = slot(withChildren.container, 'field-error');
		expect(error.textContent).toContain('Custom error copy');
		expect(error.textContent).not.toContain('ignored');
		withChildren.unmount();

		const empty = mount(FieldErrorFixture, {});
		expect(empty.container.querySelector('[data-slot="field-error"]')).toBeNull();
		expect(empty.container.textContent).toBe('');
		empty.unmount();
	});
});
