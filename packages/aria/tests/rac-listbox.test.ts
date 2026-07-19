import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { act, mount } from '../../octane/tests/_helpers';
import {
	DynamicListBoxHarness,
	EmptyListBoxHarness,
	RenderPropsListBoxHarness,
	SectionedListBoxHarness,
	StaticListBoxHarness,
} from './_fixtures/rac-listbox.tsx';

// @octanejs/aria Phase 5 — RAC ListBox over the Phase-4 collection engine.
// Structural collection updates land one microtask after commit (the Document's
// MutationObserver), so mounts and item mutations flush with `await act(() => {})`
// before asserting.

// jsdom lacks CSS.escape (pulled in transitively by the interaction utilities).
if (typeof (globalThis as any).CSS === 'undefined') {
	(globalThis as any).CSS = {
		escape(value: string): string {
			return String(value).replace(/[^-\w]/g, (c) => '\\' + c);
		},
	};
}

// jsdom lacks Element#getAnimations; the animation-aware components treat an empty
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

function listbox(r: Mounted): HTMLElement {
	return r.container.querySelector('[role="listbox"]') as HTMLElement;
}

function options(r: Mounted): HTMLElement[] {
	return [...r.container.querySelectorAll('[role="option"]')] as HTMLElement[];
}

describe('@octanejs/aria/components — ListBox', () => {
	it('renders listbox/option roles with default classNames and data attributes', async () => {
		const r = mount(StaticListBoxHarness, { selectionMode: 'single', disabledKeys: ['cherry'] });
		await act(() => {});

		const lb = listbox(r);
		expect(lb).toBeTruthy();
		expect(lb.className).toBe('react-aria-ListBox');
		expect(lb.getAttribute('aria-label')).toBe('Choose an option');
		expect(lb.getAttribute('data-orientation')).toBe('vertical');
		expect(lb.getAttribute('data-layout')).toBe('stack');
		expect(lb.hasAttribute('data-empty')).toBe(false);

		const [apple, banana, cherry] = options(r);
		expect(options(r).length).toBe(3);
		expect(apple.className).toBe('react-aria-ListBoxItem');
		expect(apple.textContent).toBe('Apple');
		// Single selection mode: options expose aria-selected and the selection mode.
		expect(apple.getAttribute('aria-selected')).toBe('false');
		expect(apple.getAttribute('data-selection-mode')).toBe('single');
		expect(apple.hasAttribute('data-selected')).toBe(false);
		// Option ids derive from the shared list id (getItemId contract).
		expect(apple.id).toBe(`${lb.id}-option-apple`);
		expect(banana.textContent).toBe('Banana');
		// Disabled keys surface as aria-disabled + data-disabled.
		expect(cherry.getAttribute('aria-disabled')).toBe('true');
		expect(cherry.getAttribute('data-disabled')).toBe('true');
		expect(apple.hasAttribute('data-disabled')).toBe(false);
		r.unmount();
	});

	it('selectionMode="none" renders options without selection semantics', async () => {
		const r = mount(StaticListBoxHarness, {});
		await act(() => {});

		const [apple] = options(r);
		expect(apple.hasAttribute('aria-selected')).toBe(false);
		expect(apple.hasAttribute('data-selection-mode')).toBe(false);
		r.unmount();
	});

	it('click moves single selection between options (data-selected + aria-selected)', async () => {
		const log: any[] = [];
		const r = mount(StaticListBoxHarness, {
			selectionMode: 'single',
			onSelectionChange: (keys: any) => log.push([...keys]),
		});
		await act(() => {});

		const [apple, banana] = options(r);
		await press(banana);
		await act(() => {});

		expect(log[log.length - 1]).toEqual(['banana']);
		expect(banana.getAttribute('data-selected')).toBe('true');
		expect(banana.getAttribute('aria-selected')).toBe('true');
		expect(apple.hasAttribute('data-selected')).toBe(false);
		expect(apple.getAttribute('aria-selected')).toBe('false');

		await press(apple);
		await act(() => {});
		expect(log[log.length - 1]).toEqual(['apple']);
		expect(apple.getAttribute('data-selected')).toBe('true');
		expect(banana.hasAttribute('data-selected')).toBe(false);
		expect(banana.getAttribute('aria-selected')).toBe('false');
		r.unmount();
	});

	it('click toggles multiple selection across options', async () => {
		const log: any[] = [];
		const r = mount(StaticListBoxHarness, {
			selectionMode: 'multiple',
			onSelectionChange: (keys: any) => log.push([...keys].sort()),
		});
		await act(() => {});

		const lb = listbox(r);
		expect(lb.getAttribute('aria-multiselectable')).toBe('true');

		const [apple, , cherry] = options(r);
		expect(apple.getAttribute('data-selection-mode')).toBe('multiple');

		await press(apple);
		await press(cherry);
		await act(() => {});

		expect(log[log.length - 1]).toEqual(['apple', 'cherry']);
		expect(apple.getAttribute('data-selected')).toBe('true');
		expect(cherry.getAttribute('data-selected')).toBe('true');

		// Toggle behavior: pressing a selected option deselects only that option.
		await press(apple);
		await act(() => {});
		expect(log[log.length - 1]).toEqual(['cherry']);
		expect(apple.hasAttribute('data-selected')).toBe(false);
		expect(cherry.getAttribute('data-selected')).toBe('true');
		r.unmount();
	});

	it('renders dynamic items and preserves DOM identity across a keyed reorder', async () => {
		const r = mount(DynamicListBoxHarness, {});
		await act(() => {});

		const texts = () => options(r).map((o) => o.textContent);
		expect(texts()).toEqual(['Alpha', 'Beta', 'Gamma']);
		const [alpha, beta, gamma] = options(r);

		await press(beta);
		await act(() => {});
		expect(beta.getAttribute('data-selected')).toBe('true');

		await act(() => {
			(r.container.querySelector('[data-action="reorder"]') as HTMLElement).click();
		});
		// Structural collection updates land one microtask after commit.
		await act(() => {});

		expect(texts()).toEqual(['Gamma', 'Alpha', 'Beta']);
		// Same item objects, new order: the option elements keep DOM identity.
		const reordered = options(r);
		expect(reordered[0]).toBe(gamma);
		expect(reordered[1]).toBe(alpha);
		expect(reordered[2]).toBe(beta);
		// Selection follows the item through the move.
		expect(reordered[2].getAttribute('data-selected')).toBe('true');
		r.unmount();
	});

	it('renders sections with presentational headers labelling role=group and div separators', async () => {
		const r = mount(SectionedListBoxHarness, {});
		await act(() => {});

		const sections = [...r.container.querySelectorAll('section')] as HTMLElement[];
		expect(sections.length).toBe(2);
		expect(sections[0].className).toBe('react-aria-ListBoxSection');
		// The section is the role=group element, labelled by its presentational header.
		expect(sections[0].getAttribute('role')).toBe('group');
		const header = sections[0].querySelector('header') as HTMLElement;
		expect(header.className).toBe('react-aria-Header');
		expect(header.textContent).toBe('Fruits');
		expect(sections[0].getAttribute('aria-labelledby')).toBe(header.id);
		expect(sections[1].getAttribute('aria-labelledby')).toBe(
			(sections[1].querySelector('header') as HTMLElement).id,
		);

		// Options live inside their sections.
		expect([...sections[0].querySelectorAll('[role="option"]')].map((o) => o.textContent)).toEqual([
			'Apple',
			'Banana',
		]);
		expect([...sections[1].querySelectorAll('[role="option"]')].map((o) => o.textContent)).toEqual([
			'Carrot',
		]);

		// The ListBox provides SeparatorContext with elementType div.
		const separator = r.container.querySelector('[role="separator"]') as HTMLElement;
		expect(separator).toBeTruthy();
		expect(separator.tagName).toBe('DIV');
		expect(separator.className).toBe('react-aria-Separator');

		// Keyboard navigation crosses the section and separator boundaries.
		const lb = listbox(r);
		await act(() => lb.focus());
		await act(() => keydown(document.activeElement!, 'ArrowDown'));
		await act(() => keydown(document.activeElement!, 'ArrowDown'));
		expect((document.activeElement as HTMLElement).textContent).toBe('Carrot');
		r.unmount();
	});

	it('item className and children render props react to isSelected/isFocused', async () => {
		const r = mount(RenderPropsListBoxHarness, {});
		await act(() => {});

		const [one, two] = options(r);
		expect(one.className).toBe('item');
		expect(one.textContent).toBe('One');
		expect(two.className).toBe('item');

		await press(one);
		await act(() => {});

		expect(one.className.split(' ')).toContain('selected');
		expect(one.textContent).toBe('One is selected');
		expect(two.className).toBe('item');

		// Real DOM focus flows into the className function as isFocused. (jsdom
		// dispatches carry no default focus action, so drive focus directly.)
		await act(() => one.focus());
		expect(one.className.split(' ')).toContain('focused');
		expect(one.className.split(' ')).toContain('selected');

		await press(two);
		await act(() => {});
		expect(one.className.split(' ')).not.toContain('selected');
		expect(one.textContent).toBe('One');
		expect(two.className).toBe('item selected');
		r.unmount();
	});

	it('ArrowDown moves real focus between options with data-focused/data-focus-visible', async () => {
		const r = mount(StaticListBoxHarness, { selectionMode: 'single' });
		await act(() => {});

		const [apple, banana] = options(r);
		const lb = listbox(r);
		// Focusing the listbox forwards focus to the first option.
		await act(() => lb.focus());
		expect(document.activeElement).toBe(apple);
		expect(apple.getAttribute('data-focused')).toBe('true');

		await act(() => keydown(document.activeElement!, 'ArrowDown'));
		expect(document.activeElement).toBe(banana);
		expect(banana.getAttribute('data-focused')).toBe('true');
		expect(apple.hasAttribute('data-focused')).toBe(false);
		// Arrow navigation is keyboard modality: the focused option is focus-visible.
		expect(banana.getAttribute('data-focus-visible')).toBe('true');

		await act(() => keydown(document.activeElement!, 'ArrowUp'));
		expect(document.activeElement).toBe(apple);
		expect(apple.getAttribute('data-focused')).toBe('true');
		expect(banana.hasAttribute('data-focused')).toBe(false);
		r.unmount();
	});

	it('renders the empty state through renderEmptyState with data-empty', async () => {
		const r = mount(EmptyListBoxHarness, {});
		await act(() => {});

		const lb = listbox(r);
		expect(lb.getAttribute('data-empty')).toBe('true');
		// The empty state renders inside a display:contents option wrapper.
		const empty = lb.querySelector('[role="option"]') as HTMLElement;
		expect(empty).toBeTruthy();
		expect(empty.style.display).toBe('contents');
		expect(empty.textContent).toBe('No results found.');
		r.unmount();
	});
});
