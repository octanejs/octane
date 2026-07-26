import { describe, expect, it, afterEach } from 'vitest';
import { mount, flushEffects } from '../../octane/tests/_helpers';
import { flushSync } from '../../octane/src/index.js';
import {
	CheckboxFixture,
	RadioGroupFixture,
	RangeSliderFixture,
	SelectFixture,
	SliderFixture,
	SwitchFixture,
	TabsFixture,
	ToggleFixture,
	ToggleGroupFixture,
	VerticalToggleGroupFixture,
	ToggleGroupMultipleFixture,
	UnvaluedSliderFixture,
} from './_fixtures/inputs-app.tsrx';

async function settle(): Promise<void> {
	for (let i = 0; i < 3; i++) {
		flushEffects();
		flushSync(() => {});
		await new Promise((res) => setTimeout(res, 5));
	}
}

const inC =
	(container: HTMLElement) =>
	(sel: string): HTMLElement | null =>
		container.querySelector(sel);

// Select's content portals into document.body (the documented exception to
// container-scoped queries — same as the radix select tests).
const inBody = (sel: string): HTMLElement | null => document.querySelector(sel);

function click(el: Element): void {
	flushSync(() => {
		el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
	});
}

// Select's trigger opens on pointerdown for a real mouse pointer only.
function pressTrigger(trigger: Element): void {
	flushSync(() => {
		trigger.dispatchEvent(
			new PointerEvent('pointerdown', {
				bubbles: true,
				cancelable: true,
				button: 0,
				pointerType: 'mouse',
			}),
		);
	});
}

function keydown(target: Element, key: string): void {
	flushSync(() => {
		target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
	});
}

describe('@octanejs/shadcn — Checkbox', () => {
	afterEach(async () => {
		await settle();
	});

	it('renders the checkbox contract and toggles with the lucide check indicator', async () => {
		const r = mount(CheckboxFixture);
		const $ = inC(r.container);
		await settle();
		const checkbox = $('[data-testid="checkbox"]')!;
		expect(checkbox.getAttribute('data-slot')).toBe('checkbox');
		expect(checkbox.getAttribute('role')).toBe('checkbox');
		expect(checkbox.getAttribute('aria-checked')).toBe('false');
		expect(checkbox.getAttribute('data-state')).toBe('unchecked');
		expect(checkbox.className).toContain('border-input');
		expect(checkbox.className).toContain('extra');
		expect($('[data-slot="checkbox-indicator"]')).toBe(null);

		click(checkbox);
		await settle();
		expect(checkbox.getAttribute('aria-checked')).toBe('true');
		expect(checkbox.getAttribute('data-state')).toBe('checked');
		// onCheckedChange is a component callback observed by the app.
		expect($('[data-testid="checked"]')!.textContent).toBe('true');
		const indicator = $('[data-slot="checkbox-indicator"]')!;
		expect(indicator.className).toContain('place-content-center');
		expect(indicator.querySelector('svg')).not.toBe(null);

		click(checkbox);
		await settle();
		expect(checkbox.getAttribute('data-state')).toBe('unchecked');
		expect($('[data-testid="checked"]')!.textContent).toBe('false');
		expect($('[data-slot="checkbox-indicator"]')).toBe(null);
		r.unmount();
	});
});

describe('@octanejs/shadcn — RadioGroup', () => {
	afterEach(async () => {
		await settle();
	});

	it('renders the group/item contract; selection moves between items', async () => {
		const r = mount(RadioGroupFixture);
		const $ = inC(r.container);
		await settle();
		const group = $('[data-testid="group"]')!;
		expect(group.getAttribute('data-slot')).toBe('radio-group');
		expect(group.getAttribute('role')).toBe('radiogroup');
		expect(group.className).toContain('grid gap-3');
		const a = $('[data-testid="item-a"]')!;
		const b = $('[data-testid="item-b"]')!;
		expect(a.getAttribute('data-slot')).toBe('radio-group-item');
		expect(a.getAttribute('role')).toBe('radio');
		expect(a.className).toContain('rounded-full');
		expect($('[data-slot="radio-group-indicator"]')).toBe(null);

		click(a);
		await settle();
		expect(a.getAttribute('aria-checked')).toBe('true');
		expect(a.getAttribute('data-state')).toBe('checked');
		expect($('[data-testid="value"]')!.textContent).toBe('a');
		const indicator = $('[data-slot="radio-group-indicator"]')!;
		expect(indicator.className).toContain('items-center justify-center');
		expect(indicator.querySelector('svg')).not.toBe(null);

		click(b);
		await settle();
		expect(b.getAttribute('aria-checked')).toBe('true');
		expect(a.getAttribute('aria-checked')).toBe('false');
		expect($('[data-testid="value"]')!.textContent).toBe('b');
		r.unmount();
	});
});

describe('@octanejs/shadcn — Switch', () => {
	afterEach(async () => {
		await settle();
	});

	it('renders role=switch with data-size and toggles root + thumb state', async () => {
		const r = mount(SwitchFixture);
		const $ = inC(r.container);
		await settle();
		const sw = $('[data-testid="switch"]')!;
		expect(sw.getAttribute('data-slot')).toBe('switch');
		expect(sw.getAttribute('role')).toBe('switch');
		expect(sw.getAttribute('data-size')).toBe('sm');
		expect(sw.className).toContain('group/switch');
		const thumb = $('[data-slot="switch-thumb"]')!;
		expect(thumb.className).toContain('pointer-events-none');
		expect(thumb.getAttribute('data-state')).toBe('unchecked');

		click(sw);
		await settle();
		expect(sw.getAttribute('aria-checked')).toBe('true');
		expect(sw.getAttribute('data-state')).toBe('checked');
		expect(thumb.getAttribute('data-state')).toBe('checked');
		expect($('[data-testid="checked"]')!.textContent).toBe('true');
		r.unmount();
	});
});

describe('@octanejs/shadcn — Slider', () => {
	afterEach(async () => {
		await settle();
	});

	it('renders slider/track/range/thumb parts with slider aria', async () => {
		const r = mount(SliderFixture);
		const $ = inC(r.container);
		await settle();
		const root = $('[data-testid="slider"]')!;
		expect(root.getAttribute('data-slot')).toBe('slider');
		expect(root.className).toContain('touch-none');
		expect($('[data-slot="slider-track"]')!.className).toContain('overflow-hidden');
		expect($('[data-slot="slider-range"]')!.className).toContain('bg-primary');
		const thumbs = r.container.querySelectorAll('[data-slot="slider-thumb"]');
		expect(thumbs.length).toBe(1);
		const slider = r.container.querySelector('[role="slider"]')!;
		expect(slider.getAttribute('aria-valuemin')).toBe('0');
		expect(slider.getAttribute('aria-valuemax')).toBe('100');
		expect(slider.getAttribute('aria-valuenow')).toBe('30');
		r.unmount();
	});

	it('renders one thumb per value; without values it falls back to [min, max]', async () => {
		const range = mount(RangeSliderFixture);
		await settle();
		expect(range.container.querySelectorAll('[data-slot="slider-thumb"]').length).toBe(2);
		const sliders = range.container.querySelectorAll('[role="slider"]');
		expect(sliders[0]!.getAttribute('aria-valuenow')).toBe('20');
		expect(sliders[1]!.getAttribute('aria-valuenow')).toBe('80');
		range.unmount();

		const unvalued = mount(UnvaluedSliderFixture);
		await settle();
		// Upstream seeds `_values` with [min, max] when neither value nor
		// defaultValue is an array — two thumbs render. The primitive's own state
		// still defaults to [min], so only the first thumb carries a value (the
		// same as upstream React radix + shadcn).
		const thumbs = unvalued.container.querySelectorAll('[data-slot="slider-thumb"]');
		expect(thumbs.length).toBe(2);
		const unvaluedSliders = unvalued.container.querySelectorAll('[role="slider"]');
		expect(unvaluedSliders[0]!.getAttribute('aria-valuenow')).toBe('5');
		unvalued.unmount();
	});

	it('forwards step/min/max to the primitive: arrow keys step the value', async () => {
		const r = mount(SliderFixture);
		const $ = inC(r.container);
		await settle();
		const thumb = r.container.querySelector('[role="slider"]')!;
		keydown(thumb, 'ArrowRight');
		await settle();
		expect(thumb.getAttribute('aria-valuenow')).toBe('40');
		expect($('[data-testid="value"]')!.textContent).toBe('40');
		r.unmount();
	});
});

describe('@octanejs/shadcn — Select', () => {
	afterEach(async () => {
		await settle();
	});

	it('closed: combobox trigger with size attr, chevron icon, and placeholder value', async () => {
		const r = mount(SelectFixture);
		const $ = inC(r.container);
		await settle();
		const trigger = $('[data-testid="trigger"]')!;
		expect(trigger.getAttribute('data-slot')).toBe('select-trigger');
		expect(trigger.getAttribute('data-size')).toBe('sm');
		expect(trigger.getAttribute('role')).toBe('combobox');
		expect(trigger.getAttribute('aria-expanded')).toBe('false');
		expect(trigger.className).toContain('flex');
		// The consumer's SelectValue child renders before the chevron icon.
		const valueNode = $('[data-testid="trigger-value"]')!;
		expect(valueNode.getAttribute('data-slot')).toBe('select-value');
		expect(valueNode.textContent).toBe('Pick a fruit');
		const chevron = trigger.querySelector('svg')!;
		expect(chevron).not.toBe(null);
		expect(chevron.getAttribute('class')).toContain('pointer-events-none');
		// Content renders nowhere while closed.
		expect(inBody('[data-testid="content"]')).toBe(null);
		r.unmount();
	});

	it('opens into a body portal with content/viewport/group/label/item/separator parts and the selected-item check icon', async () => {
		const r = mount(SelectFixture, { defaultValue: 'banana' });
		const $ = inC(r.container);
		await settle();
		expect($('[data-testid="trigger-value"]')!.textContent).toBe('Banana');

		pressTrigger($('[data-testid="trigger"]')!);
		await settle();
		const content = inBody('[data-testid="content"]')!;
		expect(content).not.toBe(null);
		expect(content.getAttribute('data-slot')).toBe('select-content');
		expect(content.getAttribute('role')).toBe('listbox');
		expect(content.className).toContain('relative');
		// position="popper" adds the side-translate classes.
		expect(content.className).toContain('data-[side=bottom]:translate-y-1');
		const viewport = content.querySelector('[data-position="popper"]')!;
		expect(viewport.className).toContain('data-[position=popper]:w-full');
		expect(inBody('[data-testid="group"]')!.getAttribute('data-slot')).toBe('select-group');
		const label = inBody('[data-testid="label"]')!;
		expect(label.getAttribute('data-slot')).toBe('select-label');
		expect(label.textContent).toBe('Fruits');
		const separator = inBody('[data-testid="separator"]')!;
		expect(separator.getAttribute('data-slot')).toBe('select-separator');
		expect(separator.className).toContain('h-px');

		const banana = inBody('[data-testid="item-banana"]')!;
		expect(banana.getAttribute('data-slot')).toBe('select-item');
		expect(banana.getAttribute('role')).toBe('option');
		expect(banana.getAttribute('data-state')).toBe('checked');
		expect(banana.className).toContain('relative');
		// Upstream gives the indicator span no data-slot: it is simply the item's
		// first span, rendered ahead of the ItemText span. The selected item
		// shows the lucide check inside it.
		expect(banana.querySelector('span')!.querySelector('svg')).not.toBe(null);
		const apple = inBody('[data-testid="item-apple"]')!;
		expect(apple.getAttribute('data-state')).toBe('unchecked');
		// The bare indicator span always renders (upstream renders it outside
		// ItemIndicator), but carries no check while unselected.
		const appleIndicator = apple.querySelector('span')!;
		expect(appleIndicator).not.toBe(null);
		expect(appleIndicator.querySelector('svg')).toBe(null);
		r.unmount();
	});

	it('clicking an item selects it, closes the content, and fires onValueChange', async () => {
		const r = mount(SelectFixture);
		const $ = inC(r.container);
		await settle();
		const trigger = $('[data-testid="trigger"]')!;
		pressTrigger(trigger);
		await settle();
		expect(inBody('[data-testid="content"]')).not.toBe(null);

		click(inBody('[data-testid="item-cherry"]')!);
		await settle();
		expect(inBody('[data-testid="content"]')).toBe(null);
		expect($('[data-testid="value"]')!.textContent).toBe('cherry');
		expect($('[data-testid="trigger-value"]')!.textContent).toBe('Cherry');
		expect(trigger.hasAttribute('data-placeholder')).toBe(false);
		r.unmount();
	});
});

describe('@octanejs/shadcn — Tabs', () => {
	afterEach(async () => {
		await settle();
	});

	it('renders the tabs contract and switches panels on trigger mousedown', async () => {
		const r = mount(TabsFixture);
		const $ = inC(r.container);
		await settle();
		const tabs = $('[data-testid="tabs"]')!;
		expect(tabs.getAttribute('data-slot')).toBe('tabs');
		expect(tabs.getAttribute('data-orientation')).toBe('horizontal');
		expect(tabs.className).toContain('group/tabs');
		const list = $('[data-testid="list"]')!;
		expect(list.getAttribute('data-slot')).toBe('tabs-list');
		expect(list.getAttribute('data-variant')).toBe('line');
		expect(list.getAttribute('role')).toBe('tablist');
		expect(list.className).toContain('bg-transparent');
		const one = $('[data-testid="t-one"]')!;
		const two = $('[data-testid="t-two"]')!;
		expect(one.getAttribute('data-slot')).toBe('tabs-trigger');
		expect(one.getAttribute('role')).toBe('tab');
		expect(one.getAttribute('data-state')).toBe('active');
		expect(one.className).toContain('whitespace-nowrap');
		const panelOne = $('[data-testid="c-one"]')!;
		expect(panelOne.getAttribute('data-slot')).toBe('tabs-content');
		expect(panelOne.getAttribute('role')).toBe('tabpanel');
		expect(panelOne.className).toContain('flex-1');
		expect(panelOne.hasAttribute('hidden')).toBe(false);
		expect($('[data-testid="c-two"]')!.hasAttribute('hidden')).toBe(true);

		// The radix trigger activates on left-button mousedown.
		flushSync(() => {
			two.dispatchEvent(
				new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }),
			);
		});
		await settle();
		expect(two.getAttribute('data-state')).toBe('active');
		expect(two.getAttribute('aria-selected')).toBe('true');
		expect(one.getAttribute('data-state')).toBe('inactive');
		expect($('[data-testid="c-two"]')!.hasAttribute('hidden')).toBe(false);
		expect($('[data-testid="c-one"]')!.hasAttribute('hidden')).toBe(true);
		r.unmount();
	});
});

describe('@octanejs/shadcn — Toggle', () => {
	afterEach(async () => {
		await settle();
	});

	it('renders variant/size classes and toggles pressed state on click', async () => {
		const r = mount(ToggleFixture);
		const $ = inC(r.container);
		await settle();
		const toggle = $('[data-testid="toggle"]')!;
		expect(toggle.getAttribute('data-slot')).toBe('toggle');
		expect(toggle.getAttribute('aria-pressed')).toBe('false');
		expect(toggle.getAttribute('data-state')).toBe('off');
		expect(toggle.className).toContain('data-[state=on]:bg-accent');
		expect(toggle.className).toContain('border-input');
		expect(toggle.className).toContain('min-w-8');

		click(toggle);
		await settle();
		expect(toggle.getAttribute('aria-pressed')).toBe('true');
		expect(toggle.getAttribute('data-state')).toBe('on');
		expect($('[data-testid="pressed"]')!.textContent).toBe('true');
		r.unmount();
	});
});

describe('@octanejs/shadcn — ToggleGroup', () => {
	afterEach(async () => {
		await settle();
	});

	it('forwards orientation to the primitive: a vertical group roves focus on up/down, not left/right', async () => {
		const r = mount(VerticalToggleGroupFixture);
		const $ = inC(r.container);
		await settle();
		const group = $('[data-testid="vgroup"]')!;
		expect(group.getAttribute('data-orientation')).toBe('vertical');
		const a = $('[data-testid="vitem-a"]') as HTMLElement;
		const b = $('[data-testid="vitem-b"]') as HTMLElement;
		a.focus();
		await settle();
		// The vertical axis moves focus…
		keydown(a, 'ArrowDown');
		await settle();
		expect(document.activeElement).toBe(b);
		// …and the horizontal axis is ignored (pre-fix, orientation never reached
		// RovingFocusGroup, so ArrowRight also roved).
		keydown(b, 'ArrowRight');
		await settle();
		expect(document.activeElement).toBe(b);
		r.unmount();
	});

	it('threads variant/size/spacing from the group context into items', async () => {
		const r = mount(ToggleGroupFixture);
		const $ = inC(r.container);
		await settle();
		const group = $('[data-testid="group"]')!;
		expect(group.getAttribute('data-slot')).toBe('toggle-group');
		expect(group.getAttribute('data-variant')).toBe('outline');
		expect(group.getAttribute('data-size')).toBe('sm');
		expect(group.getAttribute('data-spacing')).toBe('0');
		expect(group.getAttribute('data-orientation')).toBe('horizontal');
		expect(group.className).toContain('group/toggle-group');
		expect(group.style.getPropertyValue('--gap')).toBe('0');
		const a = $('[data-testid="item-a"]')!;
		expect(a.getAttribute('data-slot')).toBe('toggle-group-item');
		// The item inherits the group's variant/size (its own defaults lose).
		expect(a.getAttribute('data-variant')).toBe('outline');
		expect(a.getAttribute('data-size')).toBe('sm');
		expect(a.getAttribute('data-spacing')).toBe('0');
		expect(a.className).toContain('first:rounded-l-md');
		expect(a.className).toContain('border-input');
		expect(a.className).toContain('min-w-8');
		r.unmount();
	});

	it('type=single: selecting an item deselects the previous one', async () => {
		const r = mount(ToggleGroupFixture);
		const $ = inC(r.container);
		await settle();
		const a = $('[data-testid="item-a"]')!;
		const b = $('[data-testid="item-b"]')!;
		expect(a.getAttribute('data-state')).toBe('off');

		click(a);
		await settle();
		expect(a.getAttribute('data-state')).toBe('on');
		expect(a.getAttribute('aria-checked')).toBe('true');
		expect($('[data-testid="value"]')!.textContent).toBe('a');

		click(b);
		await settle();
		expect(b.getAttribute('data-state')).toBe('on');
		expect(a.getAttribute('data-state')).toBe('off');
		expect($('[data-testid="value"]')!.textContent).toBe('b');
		r.unmount();
	});

	it('type=multiple: items default variant/size and toggle independently', async () => {
		const r = mount(ToggleGroupMultipleFixture);
		const $ = inC(r.container);
		await settle();
		const group = $('[data-testid="group"]')!;
		// No group variant/size → the attributes are absent on the group.
		expect(group.getAttribute('data-variant')).toBe(null);
		const x = $('[data-testid="item-x"]')!;
		const y = $('[data-testid="item-y"]')!;
		expect(x.getAttribute('data-variant')).toBe('default');
		expect(x.getAttribute('data-size')).toBe('default');
		expect(x.className).toContain('bg-transparent');

		click(x);
		await settle();
		click(y);
		await settle();
		expect(x.getAttribute('data-state')).toBe('on');
		expect(y.getAttribute('data-state')).toBe('on');
		expect(x.getAttribute('aria-pressed')).toBe('true');

		click(x);
		await settle();
		expect(x.getAttribute('data-state')).toBe('off');
		expect(y.getAttribute('data-state')).toBe('on');
		r.unmount();
	});
});
