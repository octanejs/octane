import { describe, expect, it } from 'vitest';
import { mount } from '../../octane/tests/_helpers';
import {
	AlertFixture,
	BreadcrumbFixture,
	ButtonAsChildFixture,
	ButtonFixture,
	CardFixture,
	EmptyFixture,
	InputFixture,
	ItemFixture,
	KbdFixture,
	LabelFixture,
	NativeSelectFixture,
	PaginationFixture,
	SeparatorFixture,
	SkeletonFixture,
	SpinnerFixture,
	TableFixture,
	TextareaFixture,
} from './_fixtures/tier1-app.tsrx';

function slot(container: Element, name: string): HTMLElement {
	const el = container.querySelector(`[data-slot="${name}"]`);
	expect(el, `missing [data-slot="${name}"]`).not.toBeNull();
	return el as HTMLElement;
}

describe('@octanejs/shadcn — Tier 1 contract', () => {
	it('Alert: role, variant classes, and part slots', () => {
		const { container, unmount } = mount(AlertFixture);
		const alert = slot(container, 'alert');
		expect(alert.getAttribute('role')).toBe('alert');
		expect(alert.className).toContain('group/alert');
		expect(alert.className).toContain('text-destructive');
		expect(slot(container, 'alert-title').textContent).toBe('Heads up');
		expect(slot(container, 'alert-description').className).toContain('text-muted-foreground');
		expect(slot(container, 'alert-action').textContent).toBe('Retry');
		unmount();
	});

	it('Button: variant/size data attrs, class contract, forwarded host props', () => {
		const { container, unmount } = mount(ButtonFixture);
		const button = slot(container, 'button');
		expect(button.tagName).toBe('BUTTON');
		expect(button.className).toContain('bg-destructive/10');
		expect(button.className).toContain('h-7');
		expect(button.className).toContain('group/button');
		expect(button.className).toContain('text-destructive');
		expect(button.className).toContain('rounded-lg');
		expect(button.className).toContain('extra');
		expect((button as HTMLButtonElement).type).toBe('submit');
		unmount();
	});

	it('Button asChild: the anchor becomes the host and keeps the button contract', () => {
		const { container, unmount } = mount(ButtonAsChildFixture);
		const host = slot(container, 'button');
		expect(host.tagName).toBe('A');
		expect(host.getAttribute('href')).toBe('#docs');
		expect(host.className).toContain('border-border');
		expect(host.className).toContain('bg-background');
		expect(host.className).toContain('h-9');
		expect(host.textContent).toBe('Docs');
		unmount();
	});

	it('Breadcrumb: nav labeling, link/page semantics, default and custom separators', () => {
		const { container, unmount } = mount(BreadcrumbFixture);
		const nav = slot(container, 'breadcrumb');
		expect(nav.tagName).toBe('NAV');
		expect(nav.getAttribute('aria-label')).toBe('breadcrumb');
		expect(slot(container, 'breadcrumb-list').tagName).toBe('OL');
		const link = slot(container, 'breadcrumb-link');
		expect(link.tagName).toBe('A');
		expect(link.getAttribute('href')).toBe('/');
		const page = slot(container, 'breadcrumb-page');
		expect(page.getAttribute('aria-current')).toBe('page');
		expect(page.getAttribute('aria-disabled')).toBe('true');
		const separators = container.querySelectorAll('[data-slot="breadcrumb-separator"]');
		expect(separators.length).toBe(2);
		expect(separators[0].querySelector('svg')).not.toBeNull();
		expect(separators[0].querySelector('svg')!.getAttribute('class')).toContain('cn-rtl-flip');
		expect(separators[1].querySelector('[data-testid="custom-sep"]')!.textContent).toBe('/');
		expect(separators[1].querySelector('svg')).toBeNull();
		const ellipsis = slot(container, 'breadcrumb-ellipsis');
		expect(ellipsis.querySelector('svg')).not.toBeNull();
		expect(ellipsis.querySelector('.sr-only')!.textContent).toBe('More');
		unmount();
	});

	it('Card: size attr and all part slots', () => {
		const { container, unmount } = mount(CardFixture);
		expect(slot(container, 'card').getAttribute('data-size')).toBe('sm');
		const partMarkers: Record<string, string> = {
			'card-header': '@container/card-header',
			'card-title': 'cn-font-heading',
			'card-description': 'text-muted-foreground',
			'card-action': 'justify-self-end',
			'card-content': 'px-(--card-spacing)',
			'card-footer': 'border-t',
		};
		for (const [part, marker] of Object.entries(partMarkers)) {
			expect(slot(container, part).className).toContain(marker);
		}
		unmount();
	});

	it('Empty: media variant attr and upstream empty-icon slot name', () => {
		const { container, unmount } = mount(EmptyFixture);
		expect(slot(container, 'empty').className).toContain('flex');
		const media = slot(container, 'empty-icon');
		expect(media.getAttribute('data-variant')).toBe('icon');
		expect(media.className).toContain('bg-muted');
		expect(slot(container, 'empty-title').textContent).toBe('No results');
		unmount();
	});

	it('Input: type, placeholder, merged classes', () => {
		const { container, unmount } = mount(InputFixture);
		const input = slot(container, 'input') as HTMLInputElement;
		expect(input.type).toBe('email');
		expect(input.placeholder).toBe('mail');
		expect(input.className).toContain('border-input');
		expect(input.className).toContain('w-3');
		unmount();
	});

	it('Item: group role, variant/size classes, separator orientation', () => {
		const { container, unmount } = mount(ItemFixture);
		expect(slot(container, 'item-group').getAttribute('role')).toBe('list');
		const items = container.querySelectorAll('[data-slot="item"]');
		expect(items.length).toBe(2);
		expect(items[0].getAttribute('data-variant')).toBe('outline');
		expect(items[0].getAttribute('data-size')).toBe('sm');
		expect(items[0].className).toContain('border');
		expect(items[1].getAttribute('data-variant')).toBe('default');
		const sep = slot(container, 'item-separator');
		expect(sep.className).toContain('my-2');
		// Decorative horizontal separator: hidden from ATs (the radix contract).
		expect(sep.getAttribute('role')).toBe('none');
		unmount();
	});

	it('Kbd: kbd hosts for both item and group', () => {
		const { container, unmount } = mount(KbdFixture);
		expect(slot(container, 'kbd-group').tagName).toBe('KBD');
		const keys = container.querySelectorAll('[data-slot="kbd"]');
		expect(keys.length).toBe(2);
		expect(keys[0].tagName).toBe('KBD');
		unmount();
	});

	it('Label: renders the radix label with htmlFor', () => {
		const { container, unmount } = mount(LabelFixture);
		const label = slot(container, 'label');
		expect(label.tagName).toBe('LABEL');
		expect(label.getAttribute('for')).toBe('name');
		expect(label.className).toContain('font-medium');
		unmount();
	});

	it('NativeSelect: className lands on the wrapper; select and icon keep fixed classes', () => {
		const { container, unmount } = mount(NativeSelectFixture);
		const wrapper = slot(container, 'native-select-wrapper');
		expect(wrapper.className).toContain('pick');
		expect(wrapper.getAttribute('data-size')).toBe('sm');
		const select = slot(container, 'native-select') as HTMLSelectElement;
		// The consumer className lands on the wrapper, never on the <select>,
		// which keeps its fixed classes.
		expect(select.className).not.toContain('pick');
		expect(select.className).toContain('appearance-none');
		expect(select.className).toContain('data-[size=sm]:h-7');
		expect(select.getAttribute('aria-label')).toBe('Fruit');
		expect(slot(container, 'native-select-option').tagName).toBe('OPTION');
		const icon = slot(container, 'native-select-icon');
		expect(icon.tagName.toLowerCase()).toBe('svg');
		unmount();
	});

	it('Pagination: nav semantics, active link keeps the button contract with pagination-link slot', () => {
		const { container, unmount } = mount(PaginationFixture);
		const nav = slot(container, 'pagination');
		expect(nav.getAttribute('aria-label')).toBe('pagination');
		const links = container.querySelectorAll('[data-slot="pagination-link"]');
		expect(links.length).toBe(3);
		const active = container.querySelector('[aria-current="page"]') as HTMLElement;
		expect(active).not.toBeNull();
		expect(active.tagName).toBe('A');
		expect(active.getAttribute('data-active')).toBe('true');
		expect(active.className).toContain('group/button');
		expect(active.className).toContain('border-border');
		expect(active.className).toContain('size-8');
		const prev = container.querySelector('[aria-label="Go to previous page"]') as HTMLElement;
		expect(prev.className).toContain('hover:bg-muted');
		expect(prev.className).toContain('pl-1.5!');
		expect(prev.querySelector('svg')).not.toBeNull();
		expect(prev.textContent).toContain('Previous');
		const ellipsis = slot(container, 'pagination-ellipsis');
		expect(ellipsis.querySelector('.sr-only')!.textContent).toBe('More pages');
		unmount();
	});

	it('Separator: horizontal default and explicit vertical', () => {
		const { container, unmount } = mount(SeparatorFixture);
		const seps = container.querySelectorAll('[data-slot="separator"]');
		expect(seps.length).toBe(2);
		expect(seps[0].className).toContain('bg-border');
		unmount();
	});

	it('Skeleton, Spinner, Textarea: hosts, roles, merged classes', () => {
		const s = mount(SkeletonFixture);
		expect(slot(s.container, 'skeleton').className).toContain('animate-pulse');
		s.unmount();
		const sp = mount(SpinnerFixture);
		const spinner = slot(sp.container, 'spinner');
		expect(spinner.tagName.toLowerCase()).toBe('svg');
		expect(spinner.getAttribute('role')).toBe('status');
		expect(spinner.getAttribute('aria-label')).toBe('Loading');
		expect(spinner.getAttribute('class')).toContain('size-8');
		expect(spinner.getAttribute('class')).not.toContain('size-4');
		sp.unmount();
		const t = mount(TextareaFixture);
		const textarea = slot(t.container, 'textarea') as HTMLTextAreaElement;
		expect(textarea.placeholder).toBe('notes');
		expect(textarea.className).toContain('border-input');
		t.unmount();
	});

	it('Table: renders inside the table-container wrapper with all part slots', () => {
		const { container, unmount } = mount(TableFixture);
		const wrapper = slot(container, 'table-container');
		const table = slot(container, 'table');
		expect(table.parentElement).toBe(wrapper);
		expect(table.className).toContain('mine');
		for (const part of [
			'table-caption',
			'table-header',
			'table-row',
			'table-head',
			'table-body',
			'table-cell',
		]) {
			slot(container, part);
		}
		unmount();
	});
});
