import { describe, expect, it } from 'vitest';
import { createElement, flushSync } from 'octane';
import { flushEffects, mount } from '../../octane/tests/_helpers';
import * as F from './_fixtures/base-ui-smoke.tsrx';
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from '@octanejs/shadcn/base-ui/Tooltip';

// Portalled families (alert-dialog and friends) mount their popup from an EFFECT and render it
// into document.body, not into the mount container. Asserting on `m.container` without flushing
// therefore reports a perfectly good component as broken — which is exactly what happened when
// alert-dialog was added. Both halves matter: flush, then look in the right place.
async function settle(): Promise<void> {
	for (let i = 0; i < 4; i += 1) {
		flushEffects();
		flushSync(() => {});
		await new Promise((resolve) => setTimeout(resolve, 0));
	}
}

// Every Base UI family gets its own mount, STANDALONE — no Field.Root, no provider wrapper.
// A component that throws during render takes down everything rendered after it, so a single
// combined page reports one failure and hides the rest; this reports them independently.
//
// TWO ORACLES, because the first one alone proved too weak.
//
//   1. It renders without throwing and puts SOMETHING in the DOM.
//   2. Where a family accepts children, the CHILD TEXT actually reaches the DOM.
//
// The second exists because a review flagged these wrappers as possibly dropping children —
// `{children}` destructured in the signature rather than the Radix base's `children: _children`
// + `{props.children}` form, whose comment calls the syntactic form load-bearing. That turned
// out to be a false alarm (both the .tsrx-JSX and createElement child paths forward correctly),
// but the first oracle would have passed either way: `firstElementChild !== null` is true for a
// wrapper that renders its own markup and silently discards everything inside it. A component
// that swallows its children is fully broken and was, until now, invisible here.
//
// Deep behavior still belongs in the per-family tests and in @octanejs/base-ui's own upstream
// suites. What this file protects is that no family is dead on arrival.
//
// WHY IT EXISTS AT ALL: `Label` shipped routed through Base UI's `Field.Label`, which calls
// `useFieldRootContext(false)` and throws "FieldRootContext is missing" outside a `<Field.Root>`.
// Since shadcn's Label is a standalone component, every documented use of it crashed at runtime.
// Typecheck, the registry gate, the cross-base structural gate and a full `vite build` ALL
// passed — the failure only appeared when a human opened the page.
//
// `expectText` is the marker each fixture renders as a child. `null` means the family renders no
// text of its own (Separator, Skeleton, Spinner) or only through attributes (Input, Textarea),
// so there is nothing to assert beyond oracle 1.
// `portalled` marks families whose content leaves the container. Their child-text assertion
// settles first and searches document.body.
const CASES: Array<[string, () => unknown, string | null, boolean?]> = [
	['Accordion', F.AccordionCase, 'Trigger'],
	['Alert', F.AlertCase, 'Description'],
	['AlertDialog', F.AlertDialogCase, 'Are you sure?', true],
	['AspectRatio', F.AspectRatioCase, 'Media'],
	['Button', F.ButtonCase, 'Press'],
	['Card', F.CardCase, 'Footer'],
	['Checkbox', F.CheckboxCase, null],
	['Dialog', F.DialogCase, 'Dialog title', true],
	['Popover', F.PopoverCase, 'Popover title', true],
	['Tooltip', F.TooltipCase, 'Tooltip body', true],
	['RadioGroup', F.RadioGroupCase, null],
	['Switch', F.SwitchCase, null],
	['Empty', F.EmptyCase, 'Nothing here'],
	['Input', F.InputCase, null],
	['Kbd', F.KbdCase, 'Ctrl'],
	['Label', F.LabelCase, 'Email'],
	['NativeSelect', F.NativeSelectCase, 'A'],
	['Separator', F.SeparatorCase, null],
	['Separator (vertical)', F.SeparatorVerticalCase, null],
	['Skeleton', F.SkeletonCase, null],
	['Spinner', F.SpinnerCase, null],
	['Textarea', F.TextareaCase, null],
];

describe('@octanejs/shadcn — Base UI base renders standalone', () => {
	for (const [name, Case, expectText, portalled] of CASES) {
		it(`${name} mounts outside any provider`, () => {
			const m = mount(Case as never);
			try {
				expect(m.container.firstElementChild).not.toBe(null);
			} finally {
				m.unmount();
			}
		});

		if (expectText !== null) {
			it(`${name} forwards its children to the DOM`, async () => {
				const m = mount(Case as never);
				try {
					if (portalled) {
						await settle();
						expect(document.body.textContent).toContain(expectText);
					} else {
						expect(m.container.textContent).toContain(expectText);
					}
				} finally {
					m.unmount();
				}
			});
		}
	}
});

// The accordion trigger and panel are the wrappers the review actually named, and they are the
// two that interleave consumer children with markup the wrapper owns (the chevron icons, the
// inner sizing div). Assert both independently rather than relying on the combined fixture.
describe('@octanejs/shadcn — Base UI accordion interleaves children with its own markup', () => {
	it('keeps trigger label and panel content alongside the wrapper markup', () => {
		const m = mount(F.AccordionCase as never);
		try {
			const trigger = m.container.querySelector('[data-slot="accordion-trigger"]')!;
			const panel = m.container.querySelector('[data-slot="accordion-content"]')!;

			expect(trigger.textContent).toContain('Trigger');
			// The wrapper's own chevrons must survive too — dropping them would still leave
			// the label present, so this is not implied by the assertion above.
			expect(trigger.querySelectorAll('[data-slot="accordion-trigger-icon"]').length).toBe(2);
			expect(panel.textContent).toContain('Content');
		} finally {
			m.unmount();
		}
	});
});

// AlertDialog actions use Base UI's render-as-ELEMENT contract (`render={<Button/>}`), which lets
// Close keep its dismiss behavior while looking like a Button. Rendering a plain Button preserves
// the label and styles but silently drops dismissal, so exercise both parts of the contract.
describe('@octanejs/shadcn — Base UI alert-dialog actions compose Close with Button', () => {
	it('renders Cancel as a button carrying the Button variant classes', async () => {
		const m = mount(F.AlertDialogCase as never);
		try {
			await settle();
			const cancel = document.body.querySelector(
				'[data-slot="alert-dialog-cancel"]',
			) as HTMLElement | null;
			expect(cancel).not.toBe(null);

			// The Close part itself renders a <button>, so the tag alone proves nothing. What
			// proves the Button composed is its cva output: the outline variant's border token,
			// which Close would never emit on its own.
			expect(cancel!.className).toContain('border-border');
			expect(cancel!.className).toContain('inline-flex');
			expect(cancel!.textContent).toContain('Cancel');
		} finally {
			m.unmount();
		}
	});

	it('renders Action as a Button and dismisses the dialog', async () => {
		const m = mount(F.AlertDialogCase as never);
		try {
			await settle();
			const action = document.body.querySelector(
				'[data-slot="alert-dialog-action"]',
			) as HTMLElement | null;
			expect(action).not.toBe(null);
			expect(action!.className).toContain('inline-flex');
			expect(action!.textContent).toContain('Continue');

			flushSync(() => action!.click());
			await settle();
			expect(document.body.querySelector('[data-slot="alert-dialog-content"]')).toBe(null);
		} finally {
			m.unmount();
		}
	});
});

// THE FORM CONTROLS ARE THE HIGHEST-RISK FAMILIES IN THIS BASE, for the same reason `separator`
// was: their conditional utilities key off attributes the primitive emits, and Base UI's dialect
// differs from BOTH other bases. Radix publishes `data-state="checked"`; Base UI publishes bare
// `data-checked`/`data-unchecked`. And every Root here renders a `<span role=…>`, never
// `:disabled`, so Tailwind's `disabled:` variant cannot match at all — it must be
// `data-disabled:`.
//
// Copying either wrong form produces a control that silently never changes appearance. No
// class-string comparison and no "does it render" oracle can see that, so these assert that the
// DOM actually carries the attributes the class strings target.
describe('@octanejs/shadcn — Base UI form controls emit the attributes their classes target', () => {
	const attrs = (el: Element) => new Set(el.getAttributeNames());

	it('Checkbox publishes data-checked when checked', () => {
		const m = mount(F.CheckboxCase as never);
		try {
			const root = m.container.querySelector('[data-slot="checkbox"]')!;
			expect(attrs(root).has('data-checked')).toBe(true);
			expect(root.className).toContain('data-checked:bg-primary');
		} finally {
			m.unmount();
		}
	});

	it('Checkbox publishes data-disabled, NOT a :disabled-matchable element', () => {
		const m = mount(F.CheckboxDisabledCase as never);
		try {
			const root = m.container.querySelector('[data-slot="checkbox"]')!;
			expect(attrs(root).has('data-disabled')).toBe(true);
			// The Root is a span, so `disabled:` utilities could never apply. Guard the reason,
			// not just the symptom: if the primitive ever became a real <button>, this flips and
			// the class string should be revisited.
			expect(root.tagName).toBe('SPAN');
			expect(root.className).toContain('data-disabled:opacity-50');
			expect(root.className).not.toContain(' disabled:opacity-50');
		} finally {
			m.unmount();
		}
	});

	it('Switch publishes data-checked and its thumb targets the same dialect', () => {
		const m = mount(F.SwitchCase as never);
		try {
			const root = m.container.querySelector('[data-slot="switch"]')!;
			const thumb = m.container.querySelector('[data-slot="switch-thumb"]')!;
			expect(attrs(root).has('data-checked')).toBe(true);
			expect(attrs(thumb).has('data-checked')).toBe(true);
			expect(root.className).toContain('data-checked:bg-primary');
			expect(thumb.className).toContain('data-checked:translate-x-');
			// The radix dialect must NOT survive the port.
			expect(root.className).not.toContain('data-[state=checked]');
		} finally {
			m.unmount();
		}
	});

	it('Switch publishes data-unchecked when off', () => {
		const m = mount(F.SwitchDisabledCase as never);
		try {
			const root = m.container.querySelector('[data-slot="switch"]')!;
			expect(attrs(root).has('data-unchecked')).toBe(true);
			expect(attrs(root).has('data-disabled')).toBe(true);
			expect(root.className).toContain('data-unchecked:bg-input');
		} finally {
			m.unmount();
		}
	});

	it('RadioGroupItem publishes data-checked for the selected value only', () => {
		const m = mount(F.RadioGroupCase as never);
		try {
			const items = m.container.querySelectorAll('[data-slot="radio-group-item"]');
			expect(items.length).toBe(2);
			expect(attrs(items[0]).has('data-checked')).toBe(true);
			expect(attrs(items[1]).has('data-checked')).toBe(false);
			expect(attrs(items[1]).has('data-disabled')).toBe(true);
		} finally {
			m.unmount();
		}
	});
});

// THE OVERLAY FAMILIES CARRY A POSITIONING TRAP the other bases do not. Radix publishes its
// transform origin as `--radix-popover-content-transform-origin`; Base UI's Positioner publishes
// plain `--transform-origin`. A copied radix class references a variable nothing sets, so the
// popup scales from the wrong corner on open — visible only in motion, and invisible to both a
// class-string comparison and a "does it render" oracle.
//
// These assert the var the class references is the one the DOM actually defines, and that the
// side/align attributes the slide utilities key off are present.
describe('@octanejs/shadcn — Base UI overlays reference the CSS vars their positioner sets', () => {
	const cssVarOnAncestors = (el: Element, name: string): boolean => {
		let node: HTMLElement | null = el as HTMLElement;
		while (node) {
			if ((node.getAttribute('style') ?? '').includes(name)) return true;
			node = node.parentElement;
		}
		return false;
	};

	it('popover content uses --transform-origin, which the positioner defines', async () => {
		const m = mount(F.PopoverCase as never);
		try {
			await settle();
			const popup = document.body.querySelector('[data-slot="popover-content"]')!;
			expect(popup).not.toBe(null);

			// The class references it...
			expect(popup.className).toContain('origin-(--transform-origin)');
			// ...and something in the tree actually sets it. Radix's name must NOT appear.
			expect(cssVarOnAncestors(popup, '--transform-origin')).toBe(true);
			expect(popup.className).not.toContain('--radix-');

			// The slide utilities key off data-side, so it has to be on the popup itself.
			expect(popup.hasAttribute('data-side')).toBe(true);
			expect(popup.hasAttribute('data-open')).toBe(true);
		} finally {
			m.unmount();
		}
	});

	it('tooltip content uses --transform-origin and drops the radix-only delayed-open state', async () => {
		const m = mount(F.TooltipCase as never);
		try {
			await settle();
			const popup = document.body.querySelector('[data-slot="tooltip-content"]')!;
			expect(popup).not.toBe(null);
			expect(popup.className).toContain('origin-(--transform-origin)');
			expect(cssVarOnAncestors(popup, '--transform-origin')).toBe(true);
			expect(popup.className).not.toContain('--radix-');

			// Base UI has no delayed-open state; styling it would be dead weight.
			expect(popup.className).not.toContain('data-[state=delayed-open]');
			expect(popup.hasAttribute('data-side')).toBe(true);
		} finally {
			m.unmount();
		}
	});

	it('dialog composes its close affordance as a Button via render', async () => {
		const m = mount(F.DialogCase as never);
		try {
			await settle();
			const close = document.body.querySelector('[data-slot="dialog-close"]') as HTMLElement;
			expect(close).not.toBe(null);
			// Close alone would never emit the Button cva output.
			expect(close.className).toContain('inline-flex');
			expect(close.textContent).toContain('Close');
		} finally {
			m.unmount();
		}
	});
});

// TooltipContent is the one wrapper in this base that hands an ARRAY to a primitive's children:
// the consumer's node plus the Arrow. Octane reconciles array children as a keyed list, so an
// unkeyed consumer node both warns and can be mismatched against the arrow when its identity
// changes. The other families' key warnings come from the @octanejs/base-ui primitives
// themselves and are outside this package's control — this asserts only the part this base owns.
//
// THE CHILD MUST BE BUILT WITH createElement, not authored as .tsrx JSX. Compiled JSX children
// arrive as a tagged block, and the missing-key check only inspects element DESCRIPTORS — so a
// .tsrx fixture passes whether or not the key is there. The first version of this test made
// exactly that mistake and could not fail.
describe('@octanejs/shadcn — Base UI tooltip keys the children it composes', () => {
	function TooltipWithDescriptorChild() {
		return createElement(TooltipProvider, {
			children: createElement(Tooltip, {
				defaultOpen: true,
				children: [
					createElement(TooltipTrigger, { key: 'trigger' }, 'Hover me'),
					createElement(
						TooltipContent,
						{ key: 'content' },
						createElement('span', { id: 'body' }, 'Tooltip element body'),
					),
				],
			}),
		});
	}

	it('emits no missing-key warning for a descriptor child', async () => {
		const seen: string[] = [];
		const warn = console.warn;
		console.warn = (...args: unknown[]) => {
			seen.push(args.map(String).join(' '));
		};
		const m = mount(TooltipWithDescriptorChild as never);
		try {
			await settle();
		} finally {
			console.warn = warn;
			m.unmount();
		}

		expect(seen.filter((w) => /unique "key" prop/.test(w))).toEqual([]);
	});
});
