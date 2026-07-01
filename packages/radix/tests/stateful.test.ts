import { describe, it, expect } from 'vitest';
import { mount } from '../../octane/tests/_helpers';
import {
	CollapsibleApp,
	AccordionSingle,
	AccordionMultiple,
	ScopeIsolation,
} from './_fixtures/stateful.tsx';

// @octanejs/radix — the stateful foundation (useControllableState) via Collapsible and
// Accordion. Matching Radix, content stays MOUNTED but `hidden` when closed; we assert the
// `hidden`/`data-state`/content transitions on trigger clicks. (Presence is validated
// separately in presence.test.ts.)

const openContent = (el: Element | null): boolean => !!el && !el.hasAttribute('hidden');

describe('@octanejs/radix — Collapsible', () => {
	it('toggles content visibility + ARIA/data-state on trigger click', () => {
		const r = mount(CollapsibleApp);
		const trigger = r.find('[data-testid="trigger"]');
		const content = () => r.container.querySelector('[data-testid="content"]')!;

		// Closed initially — content mounted but hidden + empty.
		expect(trigger.getAttribute('aria-expanded')).toBe('false');
		expect(trigger.getAttribute('data-state')).toBe('closed');
		expect(openContent(content())).toBe(false);
		expect(content().getAttribute('data-state')).toBe('closed');
		expect(content().getAttribute('id')).toBe(trigger.getAttribute('aria-controls'));
		expect(content().textContent).toBe('');

		// Open.
		r.click('[data-testid="trigger"]');
		expect(trigger.getAttribute('aria-expanded')).toBe('true');
		expect(trigger.getAttribute('data-state')).toBe('open');
		expect(openContent(content())).toBe(true);
		expect(content().getAttribute('data-state')).toBe('open');
		expect(content().textContent).toBe('panel');

		// Close again.
		r.click('[data-testid="trigger"]');
		expect(trigger.getAttribute('aria-expanded')).toBe('false');
		expect(openContent(content())).toBe(false);
		expect(content().textContent).toBe('');
		r.unmount();
	});
});

describe('@octanejs/radix — Accordion (type="single", collapsible)', () => {
	it('only one item open at a time; collapsible closes it', () => {
		const r = mount(AccordionSingle);
		const ta = () => r.find('[data-testid="t-a"]');
		const tb = () => r.find('[data-testid="t-b"]');
		const ca = () => r.container.querySelector('[data-testid="c-a"]');
		const cb = () => r.container.querySelector('[data-testid="c-b"]');

		// a open, b closed (defaultValue="a").
		expect(ta().getAttribute('aria-expanded')).toBe('true');
		expect(tb().getAttribute('aria-expanded')).toBe('false');
		expect(openContent(ca())).toBe(true);
		expect(openContent(cb())).toBe(false);

		// Open b → a closes (single).
		r.click('[data-testid="t-b"]');
		expect(ta().getAttribute('aria-expanded')).toBe('false');
		expect(tb().getAttribute('aria-expanded')).toBe('true');
		expect(openContent(ca())).toBe(false);
		expect(openContent(cb())).toBe(true);
		expect(cb()!.textContent).toBe('panel-b');

		// Close b (collapsible) → nothing open.
		r.click('[data-testid="t-b"]');
		expect(tb().getAttribute('aria-expanded')).toBe('false');
		expect(openContent(cb())).toBe(false);
		r.unmount();
	});

	it('Header is an h3; content is a region labelled by the trigger', () => {
		const r = mount(AccordionSingle);
		const header = r.container.querySelector('h3')!;
		expect(header).not.toBe(null);
		expect(header.getAttribute('data-state')).toBe('open');
		const content = r.container.querySelector('[data-testid="c-a"]')!;
		expect(content.getAttribute('role')).toBe('region');
		expect(content.getAttribute('aria-labelledby')).toBe(
			r.find('[data-testid="t-a"]').getAttribute('id'),
		);
		r.unmount();
	});
});

describe('@octanejs/radix — Accordion (type="multiple")', () => {
	it('multiple items open independently', () => {
		const r = mount(AccordionMultiple);
		const ca = () => r.container.querySelector('[data-testid="c-a"]');
		const cb = () => r.container.querySelector('[data-testid="c-b"]');

		// a open, b closed.
		expect(openContent(ca())).toBe(true);
		expect(openContent(cb())).toBe(false);

		// Open b → both open.
		r.click('[data-testid="t-b"]');
		expect(openContent(ca())).toBe(true);
		expect(openContent(cb())).toBe(true);

		// Close a → b stays open.
		r.click('[data-testid="t-a"]');
		expect(openContent(ca())).toBe(false);
		expect(openContent(cb())).toBe(true);
		r.unmount();
	});
});

describe('@octanejs/radix — createContextScope isolation', () => {
	it('a user Collapsible between Item and Trigger does not hijack the Accordion', () => {
		const r = mount(ScopeIsolation);
		const accTrigger = () => r.find('[data-testid="acc-trigger"]');
		const userTrigger = () => r.find('[data-testid="user-trigger"]');
		const accContent = () => r.container.querySelector('[data-testid="acc-content"]');
		const userContent = () => r.container.querySelector('[data-testid="user-content"]');

		// The Accordion item is open (defaultValue="a") even though the NEAREST unscoped
		// Collapsible provider is closed — Accordion.Trigger reads its SCOPED context.
		expect(accTrigger().getAttribute('aria-expanded')).toBe('true');
		expect(openContent(accContent())).toBe(true);
		// The user's Collapsible is closed + independent.
		expect(userTrigger().getAttribute('aria-expanded')).toBe('false');
		expect(openContent(userContent())).toBe(false);

		// Toggling the user's Collapsible touches ONLY its own content.
		r.click('[data-testid="user-trigger"]');
		expect(openContent(userContent())).toBe(true);
		expect(openContent(accContent())).toBe(true); // accordion untouched
		expect(accTrigger().getAttribute('aria-expanded')).toBe('true');

		// Toggling the Accordion trigger touches ONLY the accordion content.
		r.click('[data-testid="acc-trigger"]');
		expect(openContent(accContent())).toBe(false);
		expect(openContent(userContent())).toBe(true); // user's stays open
		expect(userTrigger().getAttribute('aria-expanded')).toBe('true');
		r.unmount();
	});
});
