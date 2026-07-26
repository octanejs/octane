import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { flushSync } from '../../octane/src/index.js';
import { mount } from '../../octane/tests/_helpers';
import {
	AccordionFixture,
	AccordionMultipleFixture,
	AspectRatioFixture,
	AvatarFixture,
	AvatarGroupFixture,
	CollapsibleFixture,
	ProgressFixture,
	ScrollAreaFixture,
	ScrollAreaHorizontalFixture,
} from './_fixtures/structure-app.tsrx';

function slot(container: Element, name: string): HTMLElement {
	const el = container.querySelector(`[data-slot="${name}"]`);
	expect(el, `missing [data-slot="${name}"]`).not.toBeNull();
	return el as HTMLElement;
}

const openContent = (el: Element | null): boolean => !!el && !el.hasAttribute('hidden');

// jsdom has no ResizeObserver; the ScrollArea scrollbars measure overflow
// through it. The structure contract under test never needs a real
// measurement — a no-op stub keeps the mounted scrollbars from crashing.
class NoopResizeObserver {
	observe(): void {}
	unobserve(): void {}
	disconnect(): void {}
}
beforeAll(() => {
	vi.stubGlobal('ResizeObserver', NoopResizeObserver);
});
afterAll(() => {
	vi.unstubAllGlobals();
});

describe('@octanejs/shadcn — Accordion', () => {
	it('renders the data-slot/class contract with the Header>Trigger composition and both trigger icons', () => {
		const { container, unmount } = mount(AccordionFixture);
		const root = slot(container, 'accordion');
		expect(root.className).toContain('flex w-full flex-col');
		expect(root.className).toContain('extra-accordion');

		const items = container.querySelectorAll('[data-slot="accordion-item"]');
		expect(items.length).toBe(2);
		expect(items[1].className).toContain('not-last:border-b');
		expect(items[1].className).toContain('extra-item');

		// Trigger sits inside the radix Header (an h3 with class "flex").
		const trigger = container.querySelector('[data-testid="t-a"]') as HTMLElement;
		expect(trigger.getAttribute('data-slot')).toBe('accordion-trigger');
		expect(trigger.className).toContain('group/accordion-trigger');
		expect(trigger.closest('h3')).not.toBeNull();
		expect(trigger.closest('h3')!.getAttribute('class')).toBe('flex');
		const triggerB = container.querySelector('[data-testid="t-b"]') as HTMLElement;
		expect(triggerB.className).toContain('extra-trigger');

		// Both chevron icons render with the trigger-icon slot; the consumer
		// children precede them.
		const icons = trigger.querySelectorAll('svg[data-slot="accordion-trigger-icon"]');
		expect(icons.length).toBe(2);
		expect(icons[0].getAttribute('class')).toContain(
			'group-aria-expanded/accordion-trigger:hidden',
		);
		expect(icons[1].getAttribute('class')).toContain(
			'group-aria-expanded/accordion-trigger:inline',
		);
		expect(trigger.textContent).toContain('Section A');

		// Content: fixed class on the primitive host; the consumer className
		// lands on the inner wrapper with the consumer children.
		const content = container.querySelector('[data-testid="c-a"]') as HTMLElement;
		expect(content.getAttribute('data-slot')).toBe('accordion-content');
		expect(content.className).toContain('overflow-hidden');
		const inner = content.querySelector('div') as HTMLElement;
		expect(inner.className).toContain('h-(--radix-accordion-content-height)');
		expect(inner.className).toContain('extra-content');
		expect(inner.textContent!.trim()).toBe('Panel A');
		unmount();
	});

	it('type="single" collapsible: clicks toggle aria-expanded/data-state and only one panel opens', () => {
		const r = mount(AccordionFixture);
		const ta = () => r.find('[data-testid="t-a"]');
		const tb = () => r.find('[data-testid="t-b"]');
		const ca = () => r.container.querySelector('[data-testid="c-a"]');
		const cb = () => r.container.querySelector('[data-testid="c-b"]');

		// defaultValue="a": a open, b closed.
		expect(ta().getAttribute('aria-expanded')).toBe('true');
		expect(ta().getAttribute('data-state')).toBe('open');
		expect(openContent(ca())).toBe(true);
		expect(openContent(cb())).toBe(false);

		// Open b → a closes (single).
		r.click('[data-testid="t-b"]');
		expect(ta().getAttribute('aria-expanded')).toBe('false');
		expect(tb().getAttribute('aria-expanded')).toBe('true');
		expect(openContent(ca())).toBe(false);
		expect(openContent(cb())).toBe(true);

		// Close b (collapsible) → nothing open.
		r.click('[data-testid="t-b"]');
		expect(tb().getAttribute('aria-expanded')).toBe('false');
		expect(openContent(cb())).toBe(false);
		r.unmount();
	});

	it('content is a region labelled by its trigger', () => {
		const r = mount(AccordionFixture);
		const content = r.container.querySelector('[data-testid="c-a"]')!;
		expect(content.getAttribute('role')).toBe('region');
		expect(content.getAttribute('aria-labelledby')).toBe(
			r.find('[data-testid="t-a"]').getAttribute('id'),
		);
		r.unmount();
	});

	it('type="multiple": items open independently', () => {
		const r = mount(AccordionMultipleFixture);
		const ca = () => r.container.querySelector('[data-testid="c-a"]');
		const cb = () => r.container.querySelector('[data-testid="c-b"]');
		expect(openContent(ca())).toBe(true);
		expect(openContent(cb())).toBe(false);
		r.click('[data-testid="t-b"]');
		expect(openContent(ca())).toBe(true);
		expect(openContent(cb())).toBe(true);
		r.click('[data-testid="t-a"]');
		expect(openContent(ca())).toBe(false);
		expect(openContent(cb())).toBe(true);
		r.unmount();
	});

	it('ArrowDown moves focus to the next trigger', () => {
		const r = mount(AccordionFixture);
		const ta = r.find('[data-testid="t-a"]') as HTMLElement;
		const tb = r.find('[data-testid="t-b"]') as HTMLElement;
		ta.focus();
		expect(document.activeElement).toBe(ta);
		flushSync(() => {
			ta.dispatchEvent(
				new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }),
			);
		});
		expect(document.activeElement).toBe(tb);
		r.unmount();
	});
});

describe('@octanejs/shadcn — Collapsible', () => {
	it('forwards the data-slot contract and toggles content on trigger click', () => {
		const r = mount(CollapsibleFixture);
		const root = r.find('[data-testid="root"]');
		expect(root.getAttribute('data-slot')).toBe('collapsible');
		const trigger = r.find('[data-testid="trigger"]');
		expect(trigger.getAttribute('data-slot')).toBe('collapsible-trigger');
		const content = () => r.container.querySelector('[data-testid="content"]')!;
		expect(content().getAttribute('data-slot')).toBe('collapsible-content');

		// Closed initially: content mounted but hidden and empty.
		expect(trigger.getAttribute('aria-expanded')).toBe('false');
		expect(trigger.getAttribute('data-state')).toBe('closed');
		expect(openContent(content())).toBe(false);
		expect(content().textContent).toBe('');

		r.click('[data-testid="trigger"]');
		expect(trigger.getAttribute('aria-expanded')).toBe('true');
		expect(trigger.getAttribute('data-state')).toBe('open');
		expect(openContent(content())).toBe(true);
		expect(content().textContent).toBe('Hidden notes');

		r.click('[data-testid="trigger"]');
		expect(trigger.getAttribute('aria-expanded')).toBe('false');
		expect(openContent(content())).toBe(false);
		r.unmount();
	});
});

describe('@octanejs/shadcn — Avatar', () => {
	it('renders root size attr and the fallback path (jsdom never loads images)', () => {
		const { container, unmount } = mount(AvatarFixture);
		const avatar = slot(container, 'avatar');
		expect(avatar.tagName).toBe('SPAN');
		expect(avatar.getAttribute('data-size')).toBe('sm');
		expect(avatar.className).toContain('group/avatar');
		expect(avatar.className).toContain('extra-avatar');

		// The image never reaches "loaded" in jsdom → the primitive renders
		// the fallback and no img element.
		expect(container.querySelector('[data-slot="avatar-image"]')).toBeNull();
		expect(container.querySelector('img')).toBeNull();
		const fallback = slot(container, 'avatar-fallback');
		expect(fallback.className).toContain('bg-muted');
		expect(fallback.textContent).toBe('AL');

		const badge = slot(container, 'avatar-badge');
		expect(badge.className).toContain('ring-background');
		unmount();
	});

	it('AvatarGroup wraps avatars and the group count', () => {
		const { container, unmount } = mount(AvatarGroupFixture);
		const group = slot(container, 'avatar-group');
		expect(group.className).toContain('-space-x-2');
		expect(group.className).toContain('extra-group');
		expect(group.querySelectorAll('[data-slot="avatar"]').length).toBe(2);
		const count = slot(container, 'avatar-group-count');
		expect(count.className).toContain('ring-background');
		expect(count.textContent).toBe('+3');
		unmount();
	});
});

describe('@octanejs/shadcn — AspectRatio', () => {
	it('applies the padding-bottom ratio trick and forwards props/children', () => {
		const { container, unmount } = mount(AspectRatioFixture);
		const host = slot(container, 'aspect-ratio');
		expect(host.getAttribute('data-testid')).toBe('ratio');
		expect(host.className).toContain('extra-ratio');
		expect(host.style.position).toBe('absolute');
		// The radix primitive wraps the host in the ratio wrapper: 16/9 → 56.25%.
		const wrapper = host.parentElement as HTMLElement;
		expect(wrapper.hasAttribute('data-radix-aspect-ratio-wrapper')).toBe(true);
		expect(wrapper.style.paddingBottom).toBe('56.25%');
		expect(host.querySelector('[data-testid="ratio-child"]')).not.toBeNull();
		unmount();
	});
});

describe('@octanejs/shadcn — Progress', () => {
	it('renders the progressbar role/aria contract with the indicator transform', () => {
		const { container, unmount } = mount(ProgressFixture, { value: 50 });
		const progress = slot(container, 'progress');
		expect(progress.getAttribute('role')).toBe('progressbar');
		expect(progress.getAttribute('aria-valuemin')).toBe('0');
		expect(progress.getAttribute('aria-valuemax')).toBe('100');
		expect(progress.getAttribute('aria-label')).toBe('Loading progress');
		expect(progress.className).toContain('bg-primary/20');
		expect(progress.className).toContain('extra-progress');
		// Upstream destructures `value` off (indicator-transform only): the
		// radix Root sees no value → indeterminate data-state, no aria-valuenow.
		expect(progress.getAttribute('data-state')).toBe('indeterminate');
		expect(progress.getAttribute('aria-valuenow')).toBeNull();
		expect(progress.getAttribute('data-max')).toBe('100');

		const indicator = slot(container, 'progress-indicator');
		expect(indicator.className).toBe('h-full w-full flex-1 bg-primary transition-all');
		expect(indicator.style.transform).toBe('translateX(-50%)');
		unmount();
	});

	it('missing value renders the fully-translated indicator', () => {
		const { container, unmount } = mount(ProgressFixture);
		const indicator = slot(container, 'progress-indicator');
		expect(indicator.style.transform).toBe('translateX(-100%)');
		unmount();
	});
});

describe('@octanejs/shadcn — ScrollArea', () => {
	it('renders root + viewport and places consumer children inside the viewport content wrapper', () => {
		const { container, unmount } = mount(ScrollAreaFixture);
		const root = slot(container, 'scroll-area');
		expect(root.className).toContain('relative');
		expect(root.className).toContain('extra-scroll');
		const viewport = slot(container, 'scroll-area-viewport');
		expect(viewport.className).toContain('size-full');
		expect(viewport.getAttribute('data-radix-scroll-area-viewport')).toBe('');
		expect(viewport.parentElement).toBe(root);
		const content = container.querySelector('[data-testid="scroll-content"]') as HTMLElement;
		expect(content).not.toBeNull();
		expect(viewport.contains(content)).toBe(true);
		// Default type="hover": the scrollbar subtree mounts only on hover.
		expect(container.querySelector('[data-slot="scroll-area-scrollbar"]')).toBeNull();
		unmount();
	});

	it('type="always" mounts the built-in vertical scrollbar; an explicit ScrollBar adds the horizontal axis', () => {
		const { container, unmount } = mount(ScrollAreaHorizontalFixture);
		const bars = container.querySelectorAll('[data-slot="scroll-area-scrollbar"]');
		expect(bars.length).toBe(2);
		const orientations = Array.from(bars).map((b) => b.getAttribute('data-orientation'));
		expect(orientations).toContain('vertical');
		expect(orientations).toContain('horizontal');
		const horizontal = Array.from(bars).find(
			(b) => b.getAttribute('data-orientation') === 'horizontal',
		) as HTMLElement;
		expect(horizontal.className).toContain('touch-none');
		expect(horizontal.className).toContain('extra-bar');
		expect(horizontal.getAttribute('data-state')).toBe('visible');
		unmount();
	});
});
