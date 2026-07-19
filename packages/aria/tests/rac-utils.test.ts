import { describe, expect, it } from 'vitest';
import { act, mount, nextPaint } from '../../octane/tests/_helpers';
import { composeRenderProps, removeDataAttributes } from '../src/components/utils';
import {
	ContextPropsMerge,
	ContextPropsOptOut,
	KeyboardPlain,
	MissingRequiredSlot,
	MultiProvider,
	RenderPropsFunctions,
	SlotRouting,
	TextRenderOverride,
	TextSlots,
	UnknownSlot,
} from './_fixtures/rac-utils.tsx';

// @octanejs/aria Phase 4b — the RAC plumbing layer (Provider / slotted contexts /
// useContextProps / useRenderProps / Text / Keyboard).

describe('@octanejs/aria/components — Provider', () => {
	it('supplies multiple contexts at once', () => {
		const r = mount(MultiProvider);
		expect(r.container.querySelector('[data-testid="ab"]')!.textContent).toBe('alpha:beta');
		r.unmount();
	});
});

describe('@octanejs/aria/components — slotted contexts', () => {
	it('routes context values by the slot prop, with DEFAULT_SLOT as the no-slot fallback', () => {
		const r = mount(SlotRouting);
		const get = (id: string) => r.container.querySelector(`[data-testid="${id}"]`)!;
		expect(get('no-slot').getAttribute('data-kind')).toBe('default');
		expect(get('no-slot').textContent).toBe('default-text');
		expect(get('label').getAttribute('data-kind')).toBe('label');
		expect(get('label').textContent).toBe('label-text');
		expect(get('description').textContent).toBe('description-text');
		// slot={null} opts out of context entirely.
		expect(get('opt-out').getAttribute('data-kind')).toBe('none');
		expect(get('opt-out').textContent).toBe('none');
		r.unmount();
	});

	it('an unknown slot name throws with the valid slot names', () => {
		expect(() => mount(UnknownSlot)).toThrow(
			'Invalid slot "nope". Valid slot names are "label" and "description".',
		);
	});

	it('a missing slot prop throws when the context has no DEFAULT_SLOT entry', () => {
		expect(() => mount(MissingRequiredSlot)).toThrow(
			'A slot prop is required. Valid slot names are "label" and "description".',
		);
	});
});

describe('@octanejs/aria/components — useContextProps', () => {
	it('merges context props with local props and merges both refs', async () => {
		const r = mount(ContextPropsMerge);
		await nextPaint();
		const el = r.container.querySelector('output')!;
		// Non-conflicting context props pass through.
		expect(el.getAttribute('data-from-ctx')).toBe('yes');
		// Local scalar props win over context props.
		expect(el.getAttribute('title')).toBe('local-title');
		// classNames compose (context first, local second).
		expect(el.className).toBe('ctx-cls local-cls');
		// Style objects merge with the local style winning per-property.
		expect(el.style.color).toBe('rgb(255, 0, 0)');
		expect(el.style.fontStyle).toBe('italic');
		expect(el.style.fontWeight).toBe('bold');
		// Both the context ref and the local ref received the element.
		const wrap = r.container.querySelector('[data-testid="wrap"]')!;
		expect(wrap.getAttribute('data-ctx')).toBe('output');
		expect(wrap.getAttribute('data-local')).toBe('output');
		r.unmount();
	});

	it('slot={null} makes local props completely override context props', () => {
		const r = mount(ContextPropsOptOut);
		const el = r.container.querySelector('output')!;
		expect(el.getAttribute('title')).toBe('local-title');
		expect(el.hasAttribute('data-from-ctx')).toBe(false);
		r.unmount();
	});
});

describe('@octanejs/aria/components — useRenderProps', () => {
	it('className/style/children functions receive values plus the defaults', () => {
		const r = mount(RenderPropsFunctions);
		const el = r.container.querySelector('[data-testid="fn"]') as HTMLElement;
		expect(el.className).toBe('react-aria-Box selected');
		expect(el.style.color).toBe('rgb(255, 0, 0)');
		expect(el.style.fontStyle).toBe('italic');
		expect(el.textContent).toBe('on:default-children');
		r.unmount();
	});

	it('static className replaces the default; static style merges over defaultStyle', () => {
		const r = mount(RenderPropsFunctions);
		const el = r.container.querySelector('[data-testid="static"]') as HTMLElement;
		expect(el.className).toBe('custom');
		expect(el.style.color).toBe('rgb(0, 128, 0)');
		expect(el.style.fontStyle).toBe('italic');
		expect(el.textContent).toBe('static-children');
		r.unmount();
	});

	it('falls back to defaultClassName/defaultStyle/defaultChildren and stamps data-rac', () => {
		const r = mount(RenderPropsFunctions);
		const el = r.container.querySelector('[data-testid="defaults"]') as HTMLElement;
		expect(el.className).toBe('react-aria-Box');
		expect(el.style.fontStyle).toBe('italic');
		expect(el.textContent).toBe('default-children');
		expect(el.getAttribute('data-rac')).toBe('');
		r.unmount();
	});
});

describe('@octanejs/aria/components — composeRenderProps', () => {
	it('wraps a static value', () => {
		const composed = composeRenderProps('base', (prev, rp: any) => prev + '-' + rp.state);
		expect(composed({ state: 'x' })).toBe('base-x');
	});

	it('chains through a function value', () => {
		const inner = (rp: any) => 'fn:' + rp.n;
		const composed = composeRenderProps(inner as any, (prev: any, rp: any) => prev + '!' + rp.n);
		expect(composed({ n: 7 })).toBe('fn:7!7');
	});
});

describe('@octanejs/aria/components — removeDataAttributes', () => {
	it('drops data-* props and keeps the rest', () => {
		const filtered = removeDataAttributes({
			id: 'a',
			'data-focused': true,
			'data-rac': '',
			title: 't',
		} as any) as any;
		expect(filtered).toEqual({ id: 'a', title: 't' });
	});
});

describe('@octanejs/aria/components — Text and Keyboard', () => {
	it('Text renders slot-routed props from TextContext', () => {
		const r = mount(TextSlots);
		const label = r.container.querySelector('[data-testid="t-label"]')!;
		expect(label.tagName).toBe('SPAN');
		expect(label.id).toBe('label-id');
		// The context className overrides the react-aria-Text default (upstream spread order).
		expect(label.className).toBe('label-cls');
		expect(label.textContent).toBe('Name');

		const desc = r.container.querySelector('[data-testid="t-desc"]')!;
		expect(desc.tagName).toBe('P');
		expect(desc.id).toBe('description-id');
		expect(desc.className).toBe('react-aria-Text');
		expect(desc.textContent).toBe('More info');
		r.unmount();
	});

	it('Keyboard renders a <kbd dir="ltr">', () => {
		const r = mount(KeyboardPlain);
		const el = r.container.querySelector('[data-testid="kbd"]')!;
		expect(el.tagName).toBe('KBD');
		expect(el.getAttribute('dir')).toBe('ltr');
		expect(el.textContent).toBe('⌘K');
		r.unmount();
	});

	it('a custom render override receives the merged DOM props and ref', async () => {
		const r = mount(TextRenderOverride);
		await nextPaint();
		const el = r.container.querySelector('[data-testid="t-render"]')!;
		expect(el.tagName).toBe('SPAN');
		expect(el.className).toBe('react-aria-Text');
		expect(el.getAttribute('data-rendered')).toBe('custom');
		// tsrx preserves authored JSX text verbatim (indentation included) — trim it.
		expect(el.textContent!.trim()).toBe('rendered');
		r.unmount();
	});
});
