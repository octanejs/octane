import { describe, expect, it } from 'vitest';
import { createElement, flushSync } from 'octane';
import { flushEffects, mount } from '../../octane/tests/_helpers';
import * as F from './_fixtures/base-ui-smoke.tsrx';
import * as TableParity from './_fixtures/base-ui-table-parity.tsrx';
import { badgeVariants as radixBadgeVariants } from '@octanejs/shadcn/Badge';
import { sidebarMenuButtonVariants } from '@octanejs/shadcn/base-ui/Sidebar';
import { badgeVariants as baseUiBadgeVariants } from '@octanejs/shadcn/base-ui/Badge';
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
	['Collapsible', F.CollapsibleCase, 'Collapsible body'],
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
	['Sheet', F.SheetCase, 'Sheet title', true],
	['Skeleton', F.SkeletonCase, null],
	['Spinner', F.SpinnerCase, null],
	['Textarea', F.TextareaCase, null],
	['Avatar', F.AvatarCase, 'AB'],
	['AvatarGroup', F.AvatarGroupCase, '+2'],
	['Progress', F.ProgressCase, null],
	['Progress (indeterminate)', F.ProgressNoValueCase, null],
	['Slider', F.SliderCase, null],
	['Slider (range)', F.SliderRangeCase, null],
	['Toggle', F.TogglePressedCase, 'Bold'],
	['ToggleGroup', F.ToggleGroupCase, 'B'],
	['Table', F.TableCase, 'INV-001'],
	['Pagination', F.PaginationCase, 'Next'],
	['Field', F.FieldCase, 'We never share it.'],
	['Badge', F.BadgeCase, 'Secondary'],
	['Breadcrumb', F.BreadcrumbCase, 'Current'],
	['Item', F.ItemCase, 'Item description text.'],
	['DropdownMenu', F.DropdownMenuCase, 'Profile', true],
	['Tabs', F.TabsCase, 'Account panel'],
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

// Collapsible renames one part on the way through: shadcn's `CollapsibleContent` is Base UI's
// `Collapsible.Panel`. Wiring it to the wrong part is the realistic mistake, and the child-text
// oracle above cannot see it — an open Trigger renders its children too, so the text appears
// either way. These assert the two properties that actually separate the parts.
describe('@octanejs/shadcn — Base UI collapsible maps Content to Panel, not Trigger', () => {
	it('links the trigger to the content via aria-controls', () => {
		const m = mount(F.CollapsibleCase as never);
		try {
			const trigger = m.container.querySelector('[data-slot="collapsible-trigger"]')!;
			const content = m.container.querySelector('[data-slot="collapsible-content"]')!;

			// Only the panel is the trigger's controlled region; a second trigger would have no id
			// for aria-controls to point at.
			expect(trigger.getAttribute('aria-controls')).toBe(content.getAttribute('id'));
			expect(trigger.getAttribute('aria-controls')).toBeTruthy();
		} finally {
			m.unmount();
		}
	});

	it('renders the trigger as a button and the content as a non-button region', () => {
		const m = mount(F.CollapsibleCase as never);
		try {
			const trigger = m.container.querySelector('[data-slot="collapsible-trigger"]')!;
			const content = m.container.querySelector('[data-slot="collapsible-content"]')!;

			expect(trigger.tagName).toBe('BUTTON');
			expect(content.tagName).not.toBe('BUTTON');
		} finally {
			m.unmount();
		}
	});
});

// Sheet's side variants are the one place in this base where the attribute the utilities key off
// is set by the COMPONENT rather than emitted by the primitive. That makes it low-risk, but it
// also means nothing else would notice if the attribute stopped being written — so assert it,
// including that the default is `right` and an explicit side overrides it.
describe('@octanejs/shadcn — Base UI sheet writes the side attribute its utilities target', () => {
	it('defaults to side="right"', async () => {
		const m = mount(F.SheetCase as never);
		try {
			await settle();
			const content = document.body.querySelector('[data-slot="sheet-content"]')!;
			expect(content.getAttribute('data-side')).toBe('right');
			expect(content.className).toContain('data-[side=right]:');
		} finally {
			m.unmount();
		}
	});

	it('honours an explicit side', async () => {
		const m = mount(F.SheetLeftCase as never);
		try {
			await settle();
			const content = document.body.querySelector('[data-slot="sheet-content"]')!;
			expect(content.getAttribute('data-side')).toBe('left');
		} finally {
			m.unmount();
		}
	});

	it('composes its close affordance as a Button via render', async () => {
		const m = mount(F.SheetCase as never);
		try {
			await settle();
			const close = document.body.querySelector('[data-slot="sheet-close"]') as HTMLElement;
			expect(close).not.toBe(null);
			// Close alone would never emit the Button cva output.
			expect(close.className).toContain('inline-flex');
		} finally {
			m.unmount();
		}
	});

	// `data-slot` and `data-side` are set BY THIS COMPONENT, so they land on whatever part it
	// renders — asserting them cannot tell Popup from Backdrop, and swapping the two passed every
	// test above. These assert what the PRIMITIVE contributes: the popup is the labelled,
	// focusable dialog; the backdrop is inert and aria-hidden.
	it('renders SheetContent as the Popup, not the Backdrop', async () => {
		const m = mount(F.SheetCase as never);
		try {
			await settle();
			const content = document.body.querySelector('[data-slot="sheet-content"]')!;
			const overlay = document.body.querySelector('[data-slot="sheet-overlay"]')!;

			// Only the popup is labelled by its title and described by its description.
			const title = document.body.querySelector('[data-slot="sheet-title"]')!;
			expect(content.getAttribute('aria-labelledby')).toBe(title.getAttribute('id'));
			expect(content.hasAttribute('aria-describedby')).toBe(true);
			// ...and it is focusable, where the backdrop is explicitly hidden from a11y.
			expect(content.hasAttribute('tabindex')).toBe(true);
			expect(content.hasAttribute('aria-hidden')).toBe(false);

			// NOT `aria-hidden` for the backdrop: Base UI inerts everything outside the active
			// popup, so a second popup rendered in the overlay's place inherits aria-hidden too and
			// the assertion would pass on a mispaired part. The labelling wiring is what only a
			// Popup ever receives.
			expect(overlay.hasAttribute('aria-labelledby')).toBe(false);
			expect(overlay.hasAttribute('tabindex')).toBe(false);
		} finally {
			m.unmount();
		}
	});
});

// BASE UI ANIMATES WITH CSS TRANSITIONS, NOT KEYFRAMES. Its transitionStatusMapping publishes
// `data-starting-style` and `data-ending-style`; it does NOT publish anything the radix base's
// `data-open:animate-in` / `data-closed:animate-out` keyframe utilities can match.
//
// This was found visually, not by a test: a derived sheet carrying radix's keyframes JUMPED on
// close, because the popup unmounts on its own schedule while an animate-out that never matches
// does nothing. Nothing in the suite could see it — the parts, slots and side attribute were all
// correct. Asserting the dialect is the only cheap oracle for it.
describe('@octanejs/shadcn — Base UI overlays use the transition dialect, not radix keyframes', () => {
	it('sheet drives motion from data-starting-style / data-ending-style', async () => {
		const m = mount(F.SheetCase as never);
		try {
			await settle();
			const content = document.body.querySelector('[data-slot="sheet-content"]')!;
			const overlay = document.body.querySelector('[data-slot="sheet-overlay"]')!;

			for (const el of [content, overlay]) {
				expect(el.className).toContain('data-ending-style:');
				expect(el.className).toContain('data-starting-style:');
				// The radix keyframe dialect must not survive: it matches nothing Base UI emits.
				expect(el.className).not.toContain('animate-in');
				expect(el.className).not.toContain('animate-out');
			}

			// And the element must actually be transitioning, not keyframing.
			expect(content.className).toContain('transition');
			expect(overlay.className).toContain('transition-opacity');
		} finally {
			m.unmount();
		}
	});
});

// The five families ported without a transcribed upstream source. Each was adapted from the radix
// base against the primitive's REAL rendered output, and each assertion below pins one of those
// adaptations — so a version that had simply copied radix across fails here rather than shipping
// silently broken styling, which is exactly how the sheet's motion dialect got through.
describe('@octanejs/shadcn — Base UI toggles use the pressed dialect, not radix state', () => {
	it('Toggle emits data-pressed rather than data-state=on', () => {
		const m = mount(F.TogglePressedCase as never);
		try {
			const toggle = m.container.querySelector('[data-slot="toggle"]');
			expect(toggle).not.toBe(null);
			// The class strings key off `data-pressed:`; radix's `data-[state=on]` never matches
			// here, so a pressed toggle would render with no pressed styling at all.
			expect(toggle!.hasAttribute('data-pressed')).toBe(true);
			expect(toggle!.getAttribute('data-state')).toBe(null);
			expect(toggle!.className).toContain('data-pressed:bg-accent');
			expect(toggle!.className).not.toContain('data-[state=on]');
		} finally {
			m.unmount();
		}
	});

	it('Toggle renders a real button, so the disabled: variants can match', () => {
		// Unlike checkbox/switch/radio — whose Base UI Roots are spans, forcing `data-disabled:` —
		// Toggle is a button, which is why `disabled:` is kept in toggleVariants.
		const m = mount(F.TogglePressedCase as never);
		try {
			expect(m.container.querySelector('[data-slot="toggle"]')!.tagName).toBe('BUTTON');
		} finally {
			m.unmount();
		}
	});

	it('ToggleGroup items are Toggles, and the selected one carries data-pressed', () => {
		const m = mount(F.ToggleGroupCase as never);
		try {
			const items = [...m.container.querySelectorAll('[data-slot="toggle-group-item"]')];
			expect(items).toHaveLength(2);
			// Base UI has no ToggleGroup.Item part; selection state still has to reach the item.
			expect(items.map((el) => el.hasAttribute('data-pressed'))).toEqual([false, true]);
		} finally {
			m.unmount();
		}
	});

	it('ToggleGroup shares toggleVariants with Toggle, so the bases cannot drift', () => {
		const m = mount(F.ToggleGroupCase as never);
		try {
			const item = m.container.querySelector('[data-slot="toggle-group-item"]')!;
			expect(item.className).toContain('data-pressed:bg-accent');
			expect(item.className).not.toContain('data-[state=on]');
		} finally {
			m.unmount();
		}
	});
});

describe('@octanejs/shadcn — Base UI progress fills by width, not a radix transform', () => {
	it('renders the Track part radix does not have', () => {
		const m = mount(F.ProgressCase as never);
		try {
			// Root > Track > Indicator. An Indicator hung directly off Root would sit outside the
			// element the primitive sizes against.
			const track = m.container.querySelector('[data-slot="progress-track"]');
			expect(track).not.toBe(null);
			expect(track!.querySelector('[data-slot="progress-indicator"]')).not.toBe(null);
		} finally {
			m.unmount();
		}
	});

	it('lets the primitive size the indicator, and adds no transform of its own', () => {
		const m = mount(F.ProgressCase as never);
		try {
			const indicator = m.container.querySelector<HTMLElement>('[data-slot="progress-indicator"]')!;
			expect(indicator.style.width).toBe('40%');
			// radix's base ships `transform: translateX(-(100 - value)%)` because radix leaves the
			// fill to the consumer. Applied on top of Base UI's own width it would offset a
			// correctly-sized bar again — worst at the midpoint, invisible at 0% and 100%.
			expect(indicator.style.transform).toBe('');
		} finally {
			m.unmount();
		}
	});

	it('forwards the value to the Root that owns the aria contract', () => {
		const m = mount(F.ProgressCase as never);
		try {
			const root = m.container.querySelector('[data-slot="progress"]')!;
			expect(root.getAttribute('aria-valuenow')).toBe('40');
		} finally {
			m.unmount();
		}
	});

	it('treats an omitted value as indeterminate rather than forwarding undefined', () => {
		const m = mount(F.ProgressNoValueCase as never);
		try {
			const root = m.container.querySelector('[data-slot="progress"]')!;
			expect(root).not.toBe(null);
			expect(root.getAttribute('aria-valuenow')).toBe(null);
		} finally {
			m.unmount();
		}
	});
});

describe('@octanejs/shadcn — Base UI slider is transcribed onto a different part tree', () => {
	// `Control` carries no `data-slot` — upstream's source does not give it one, and this base
	// follows it — so it is addressed as Root's only element child.
	const controlOf = (root: Element) => root.firstElementChild!;

	it('nests Root > Control > Track > Indicator, with the thumb beside the track', () => {
		const m = mount(F.SliderCase as never);
		try {
			const root = m.container.querySelector('[data-slot="slider"]')!;
			const control = controlOf(root);
			const track = control.querySelector('[data-slot="slider-track"]');
			expect(track).not.toBe(null);
			expect(track!.querySelector('[data-slot="slider-range"]')).not.toBe(null);
			expect(control.querySelector('[data-slot="slider-thumb"]')).not.toBe(null);
		} finally {
			m.unmount();
		}
	});

	it('keeps the thumb out of the overflow-hidden track, so it is not clipped to a sliver', () => {
		// The reported bug. Nested inside the track, a round `size-3` thumb is clipped by
		// `overflow-hidden` down to the track's own `h-1`, leaving a ~4px rectangle that reads as a
		// missing thumb. jsdom does no layout, so the oracle is the containment relationship that
		// causes the clip rather than a measured box.
		const m = mount(F.SliderCase as never);
		try {
			const track = m.container.querySelector('[data-slot="slider-track"]')!;
			const thumb = m.container.querySelector('[data-slot="slider-thumb"]')!;
			expect(track.className).toContain('overflow-hidden');
			expect(thumb.className).toContain('rounded-full');
			expect(track.contains(thumb)).toBe(false);
		} finally {
			m.unmount();
		}
	});

	it('puts the pointer layout on Control, since Root is only a role=group wrapper', () => {
		const m = mount(F.SliderCase as never);
		try {
			const root = m.container.querySelector('[data-slot="slider"]')!;
			expect(controlOf(root).className).toContain('touch-none');
			expect(controlOf(root).className).toContain('items-center');
			// Styling the wrapper instead would decorate an element that is not the pointer target.
			expect(root.className).not.toContain('touch-none');
		} finally {
			m.unmount();
		}
	});

	it('writes orientation variants in the dialect the primitive actually emits', () => {
		// THE one departure from the transcribed source, and the only part of this file that can go
		// silently wrong. Upstream spells these `data-horizontal:` / `data-vertical:`; no
		// @octanejs/base-ui primitive emits those attributes — this one emits
		// `data-orientation="horizontal"`. Copied verbatim, the track would match no height rule and
		// render as an invisible rail.
		const m = mount(F.SliderCase as never);
		try {
			const root = m.container.querySelector('[data-slot="slider"]')!;
			const track = m.container.querySelector('[data-slot="slider-track"]')!;
			for (const el of [root, controlOf(root), track]) {
				expect(el.className).not.toMatch(/\bdata-(horizontal|vertical):/);
			}
			expect(track.className).toContain('data-[orientation=horizontal]:h-1');
			for (const slot of ['slider', 'slider-track', 'slider-range', 'slider-thumb']) {
				expect(
					m.container.querySelector(`[data-slot="${slot}"]`)!.getAttribute('data-orientation'),
					slot,
				).toBe('horizontal');
			}
		} finally {
			m.unmount();
		}
	});

	it('does not carry the radix range positioning the Base UI indicator supplies itself', () => {
		const m = mount(F.SliderCase as never);
		try {
			const range = m.container.querySelector<HTMLElement>('[data-slot="slider-range"]')!;
			// The primitive owns the fill geometry via inline style; an `absolute` class copied from
			// the radix base would fight the `position: relative` it writes.
			expect(range.className).not.toContain('absolute');
			expect(range.style.position).toBe('relative');
		} finally {
			m.unmount();
		}
	});

	it('renders one thumb per value', () => {
		const m = mount(F.SliderRangeCase as never);
		try {
			expect(m.container.querySelectorAll('[data-slot="slider-thumb"]')).toHaveLength(2);
		} finally {
			m.unmount();
		}
	});

	it('renders ONE thumb for a scalar value, not the range fallback', () => {
		// Base UI accepts a scalar for a single-value slider. Testing only `Array.isArray` — which
		// is what the transcribed source does — drops a scalar through to the `[min, max]` range
		// default, rendering two thumbs against a one-value slider with nothing behind the second.
		for (const Case of [F.SliderScalarCase, F.SliderScalarZeroCase]) {
			const m = mount(Case as never);
			try {
				expect(m.container.querySelectorAll('[data-slot="slider-thumb"]')).toHaveLength(1);
			} finally {
				m.unmount();
			}
		}
	});

	// NOT ASSERTED HERE, deliberately: where the thumbs and the fill actually sit. `thumbAlignment`
	// is forwarded as `"edge"` (upstream's value), which switches the primitive to an inset mode
	// that derives both from `getBoundingClientRect()` in a layout effect. Every rect is 0 in jsdom,
	// so the primitive keeps them `visibility: hidden` and there is no geometry to observe. That is
	// browser-only behavior and belongs in a real-browser suite; until one exists for this package
	// it is covered by the playground demo.
});

describe('@octanejs/shadcn — Base UI avatar maps one-to-one and owns its own size attribute', () => {
	it('writes the data-size its own variants read', () => {
		// Nothing here depends on a primitive-emitted attribute: `data-[size=…]` reads what this
		// component sets, which is why avatar carried no dialect risk.
		const m = mount(F.AvatarGroupCase as never);
		try {
			const avatar = m.container.querySelector('[data-slot="avatar"]')!;
			expect(avatar.getAttribute('data-size')).toBe('lg');
			expect(m.container.querySelector('[data-slot="avatar-fallback"]')!.textContent).toBe('CD');
		} finally {
			m.unmount();
		}
	});
});

describe('@octanejs/shadcn — Base UI table is base-independent', () => {
	it('renders DOM identical to the radix base', () => {
		// Neither Radix nor Base UI publishes a table primitive, so upstream ships the same plain
		// host elements in both and this base carries the radix file unchanged. Asserting that as
		// behavior — rather than trusting a comment — is what catches the two drifting apart when
		// one base's class strings are updated and the other is forgotten.
		const a = mount(TableParity.BaseUiTable as never);
		const b = mount(TableParity.RadixTable as never);
		try {
			expect(a.container.innerHTML).toBe(b.container.innerHTML);
		} finally {
			a.unmount();
			b.unmount();
		}
	});

	it('emits a real table element tree, not divs with table roles', () => {
		// Guards the parity assertion above from passing vacuously if both bases broke the same way.
		const m = mount(F.TableCase as never);
		try {
			expect(m.container.querySelector('[data-slot="table"]')!.tagName).toBe('TABLE');
			expect(m.container.querySelector('[data-slot="table-head"]')!.tagName).toBe('TH');
			expect(m.container.querySelector('[data-slot="table-cell"]')!.tagName).toBe('TD');
			expect(m.container.querySelector('[data-slot="table-caption"]')!.tagName).toBe('CAPTION');
			// The container wrapper is what makes a wide table scroll instead of the page.
			const container = m.container.querySelector('[data-slot="table-container"]')!;
			expect(container.className).toContain('overflow-x-auto');
			expect(container.querySelector('[data-slot="table"]')).not.toBe(null);
		} finally {
			m.unmount();
		}
	});

	it('leaves row selection to the consumer, since no primitive emits it here', () => {
		// `data-[state=selected]` is written by a data-table library, not by anything underneath —
		// so unlike checkbox or toggle it is not a Radix-ism that needed translating.
		const m = mount(F.TableCase as never);
		try {
			const selected = m.container.querySelector('[data-slot="table-row"][data-state="selected"]');
			expect(selected).not.toBe(null);
			expect(selected!.className).toContain('data-[state=selected]:bg-muted');
		} finally {
			m.unmount();
		}
	});
});

describe('@octanejs/shadcn — Base UI pagination composes its link through Button', () => {
	const links = (root: Element) => [...root.querySelectorAll('[data-slot="pagination-link"]')];

	it('renders an anchor carrying the Button styling', () => {
		const m = mount(F.PaginationCase as never);
		try {
			for (const link of links(m.container)) {
				expect(link.tagName).toBe('A');
				expect(link.className).toContain('inline-flex');
			}
		} finally {
			m.unmount();
		}
	});

	it('takes the nativeButton={false} trade rather than emitting type="button"', () => {
		// THE TWO BASES DIVERGE HERE, and upstream chose it. Base UI has no Slot, so its source
		// composes `<Button nativeButton={false} render={<a/>}>`; that is what keeps keyboard
		// activation working on a non-button element, at the cost of `role="button"` and a
		// tabindex the radix base's plain anchor does not carry. `type="button"` on an anchor —
		// what `render` alone would produce — is the thing being avoided.
		const m = mount(F.PaginationCase as never);
		try {
			for (const link of links(m.container)) {
				expect(link.getAttribute('type')).toBe(null);
				expect(link.getAttribute('role')).toBe('button');
				expect(link.getAttribute('tabindex')).toBe('0');
			}
		} finally {
			m.unmount();
		}
	});

	it('forwards href and children through the render element', () => {
		// Octane routes children through its own channel rather than the props spread React uses,
		// so this is the adaptation most likely to silently drop content.
		const m = mount(F.PaginationCase as never);
		try {
			expect(links(m.container).map((l) => l.getAttribute('href'))).toEqual([
				'#prev',
				'#1',
				'#2',
				'#next',
			]);
			expect(links(m.container).map((l) => l.textContent)).toEqual(['Previous', '1', '2', 'Next']);
		} finally {
			m.unmount();
		}
	});

	it('marks the current page on the active link only', () => {
		const m = mount(F.PaginationCase as never);
		try {
			const current = links(m.container).filter((l) => l.getAttribute('aria-current') === 'page');
			expect(current).toHaveLength(1);
			expect(current[0].getAttribute('data-active')).toBe('true');
			expect(current[0].textContent).toBe('2');
		} finally {
			m.unmount();
		}
	});

	it('gives the nav and the ellipsis their accessible roles', () => {
		const m = mount(F.PaginationCase as never);
		try {
			const nav = m.container.querySelector('[data-slot="pagination"]')!;
			expect(nav.getAttribute('aria-label')).toBe('pagination');
			const ellipsis = m.container.querySelector('[data-slot="pagination-ellipsis"]')!;
			expect(ellipsis.getAttribute('aria-hidden')).toBe('true');
			expect(ellipsis.textContent).toContain('More pages');
		} finally {
			m.unmount();
		}
	});
});

describe('@octanejs/shadcn — Base UI field does not route through the Field primitive', () => {
	it('keeps FieldLabel usable with no Field.Root ancestor', () => {
		// The crash this base already hit once. Base UI's `Field.Label` calls
		// useFieldRootContext(false) and throws "FieldRootContext is missing" outside a
		// `<Field.Root>`; upstream's field.tsx uses this base's plain `<label>` instead, so every
		// standalone use stays a plain render rather than a runtime error.
		const m = mount(F.FieldCase as never);
		try {
			const label = m.container.querySelector('[data-slot="field-label"]')!;
			expect(label.tagName).toBe('LABEL');
			expect(label.textContent).toBe('Email');
		} finally {
			m.unmount();
		}
	});

	it('reads consumer-written validity, not a primitive state attribute', () => {
		// Why `data-[invalid=true]:` is correct here and NOT the bare-attribute dialect. Nothing
		// underneath emits validity state — the consumer sets `data-invalid="true"` — so the
		// variant matches as written. Routed through `Field.Root` the primitive would emit bare
		// `data-invalid=""` and every one of these variants would silently match nothing.
		const m = mount(F.FieldCase as never);
		try {
			const invalid = m.container.querySelector('[data-slot="field"][data-invalid="true"]')!;
			expect(invalid).not.toBe(null);
			expect(invalid.className).toContain('data-[invalid=true]:text-destructive');
			expect(invalid.getAttribute('role')).toBe('group');
			expect(invalid.getAttribute('data-orientation')).toBe('horizontal');
		} finally {
			m.unmount();
		}
	});

	it('renders the separator rule alongside its optional content', () => {
		const m = mount(F.FieldCase as never);
		try {
			const sep = m.container.querySelector('[data-slot="field-separator"]')!;
			expect(sep.getAttribute('data-content')).toBe('true');
			expect(sep.querySelector('[data-slot="field-separator-content"]')!.textContent).toBe('or');
			// The rule itself is this base's Separator, which speaks aria-orientation.
			expect(sep.querySelector('[data-slot="separator"]')).not.toBe(null);
		} finally {
			m.unmount();
		}
	});
});

describe('@octanejs/shadcn — Base UI field errors dedupe and collapse', () => {
	it('renders a list when several distinct messages survive dedupe', () => {
		const m = mount(F.FieldErrorsCase as never);
		try {
			const alert = m.container.querySelector('[role="alert"][data-slot="field-error"]')!;
			const items = [...alert.querySelectorAll('li')].map((li) => li.textContent);
			// Three errors in, two distinct out.
			expect(items).toEqual(['Required', 'Too short']);
		} finally {
			m.unmount();
		}
	});

	it('collapses to bare text when dedupe leaves exactly one message', () => {
		const m = mount(F.FieldErrorSingleCase as never);
		try {
			const alert = m.container.querySelector('[role="alert"][data-slot="field-error"]')!;
			expect(alert.querySelector('ul')).toBe(null);
			expect(alert.textContent).toBe('Required');
		} finally {
			m.unmount();
		}
	});

	it('renders nothing at all when there are no errors', () => {
		// Returns null rather than an empty alert region, which a screen reader would announce.
		const m = mount(F.FieldErrorEmptyCase as never);
		try {
			expect(m.container.querySelector('[data-slot="probe"]')!.children).toHaveLength(0);
			expect(m.container.querySelector('[data-slot="field-error"]')).toBe(null);
		} finally {
			m.unmount();
		}
	});
});

describe('@octanejs/shadcn — Base UI badge is a plain span with the shared variants', () => {
	it('writes the variant it was given, which its own utilities read', () => {
		const m = mount(F.BadgeCase as never);
		try {
			const badges = [...m.container.querySelectorAll('[data-slot="badge"]')];
			expect(badges.map((b) => b.tagName)).toEqual(['SPAN', 'SPAN', 'SPAN', 'SPAN']);
			expect(badges.map((b) => b.getAttribute('data-variant'))).toEqual([
				'default',
				'secondary',
				'destructive',
				'outline',
			]);
		} finally {
			m.unmount();
		}
	});

	it('applies the variant class, not just the attribute', () => {
		// `data-variant` is written for consumers to target; the visual difference comes from cva.
		const m = mount(F.BadgeCase as never);
		try {
			const [def, secondary] = m.container.querySelectorAll('[data-slot="badge"]');
			expect(def.className).toContain('bg-primary');
			expect(secondary.className).toContain('bg-secondary');
			expect(def.className).not.toContain('bg-secondary');
		} finally {
			m.unmount();
		}
	});
});

describe('@octanejs/shadcn — badge variants stay shared across bases', () => {
	it('produces the same classes as the radix base for every variant', () => {
		// badge has no primitive in any base, so the cva strings are supposed to be identical.
		// Asserting it keeps the two from drifting when one base's flavor is updated alone.
		for (const variant of [
			'default',
			'secondary',
			'destructive',
			'outline',
			'ghost',
			'link',
		] as const) {
			expect(baseUiBadgeVariants({ variant }), variant).toBe(radixBadgeVariants({ variant }));
		}
	});
});

describe('@octanejs/shadcn — Base UI breadcrumb is host elements throughout', () => {
	it('emits the accessible landmark and list structure', () => {
		const m = mount(F.BreadcrumbCase as never);
		try {
			const nav = m.container.querySelector('[data-slot="breadcrumb"]')!;
			expect(nav.tagName).toBe('NAV');
			expect(nav.getAttribute('aria-label')).toBe('breadcrumb');
			expect(m.container.querySelector('[data-slot="breadcrumb-list"]')!.tagName).toBe('OL');
			expect(m.container.querySelectorAll('[data-slot="breadcrumb-item"]')).toHaveLength(3);
		} finally {
			m.unmount();
		}
	});

	it('marks the current page and hides the decorative parts', () => {
		const m = mount(F.BreadcrumbCase as never);
		try {
			const page = m.container.querySelector('[data-slot="breadcrumb-page"]')!;
			expect(page.getAttribute('aria-current')).toBe('page');
			expect(page.getAttribute('aria-disabled')).toBe('true');
			for (const slot of ['breadcrumb-separator', 'breadcrumb-ellipsis']) {
				for (const el of m.container.querySelectorAll(`[data-slot="${slot}"]`)) {
					expect(el.getAttribute('aria-hidden'), slot).toBe('true');
					expect(el.getAttribute('role'), slot).toBe('presentation');
				}
			}
			// The ellipsis still names itself for assistive tech behind the aria-hidden icon.
			expect(m.container.querySelector('[data-slot="breadcrumb-ellipsis"]')!.textContent).toContain(
				'More',
			);
		} finally {
			m.unmount();
		}
	});

	it('lets a separator override the default chevron', () => {
		const m = mount(F.BreadcrumbCase as never);
		try {
			const seps = [...m.container.querySelectorAll('[data-slot="breadcrumb-separator"]')];
			expect(seps).toHaveLength(2);
			// First takes the default icon, second the supplied text.
			expect(seps[0].querySelector('svg')).not.toBe(null);
			expect(seps[1].textContent).toBe('/');
		} finally {
			m.unmount();
		}
	});

	it('renders the link as a real anchor that keeps its href', () => {
		const m = mount(F.BreadcrumbCase as never);
		try {
			const link = m.container.querySelector('[data-slot="breadcrumb-link"]')!;
			expect(link.tagName).toBe('A');
			expect(link.getAttribute('href')).toBe('/');
		} finally {
			m.unmount();
		}
	});
});

describe('@octanejs/shadcn — Base UI item writes the attributes its own variants read', () => {
	it('sets data-variant and data-size itself, with no primitive involved', () => {
		// These look like the variants that caught toggle and slider, but they read what this
		// component writes rather than state emitted by a primitive — so they carry across from the
		// radix source unchanged, and that is the thing worth pinning.
		const m = mount(F.ItemCase as never);
		try {
			const items = [...m.container.querySelectorAll('[data-slot="item"]')];
			expect(items.map((i) => i.getAttribute('data-variant'))).toEqual(['default', 'outline']);
			expect(items.map((i) => i.getAttribute('data-size'))).toEqual(['default', 'sm']);
			expect(items[1].className).toContain('border-border');
		} finally {
			m.unmount();
		}
	});

	it('groups items as a list and nests content under the item', () => {
		const m = mount(F.ItemCase as never);
		try {
			const group = m.container.querySelector('[data-slot="item-group"]')!;
			expect(group.getAttribute('role')).toBe('list');
			const item = group.querySelector('[data-slot="item"]')!;
			expect(item.querySelector('[data-slot="item-title"]')!.textContent).toBe('Item title');
			expect(item.querySelector('[data-slot="item-media"]')!.getAttribute('data-variant')).toBe(
				'icon',
			);
		} finally {
			m.unmount();
		}
	});

	it('routes ItemSeparator through this base Separator, aria-orientation and all', () => {
		// The one part with a primitive under it. Base UI emits aria-orientation where radix emits
		// data-orientation, so this is the only place in the family a dialect could go wrong.
		const m = mount(F.ItemCase as never);
		try {
			const sep = m.container.querySelector('[data-slot="item-separator"]')!;
			expect(sep).not.toBe(null);
			expect(sep.getAttribute('aria-orientation')).toBe('horizontal');
			expect(sep.className).toContain('my-2');
		} finally {
			m.unmount();
		}
	});
});

describe('@octanejs/shadcn — Base UI span-rooted controls carry their own display', () => {
	// A REGRESSION CLASS, not a one-off. Base UI renders checkbox, switch and radio roots as
	// `<span role="…">` where Radix uses `<button>`. A `<button>` is `display: inline-block`, so
	// Radix's class strings never needed a display utility and `size-4` simply worked; a bare
	// `<span>` is `display: inline`, which IGNORES width and height. Copying a Radix string onto one
	// collapses the control to a thin vertical bar showing only its border — which is exactly how
	// the radio group shipped, and nothing in jsdom or a smoke test noticed.
	//
	// jsdom does no layout and loads no Tailwind, so the oracle is the class string: a span-rooted
	// control that expects a box must also declare a display.
	const DISPLAY = /(?:^|\s)(?:inline-flex|inline-block|inline-grid|flex|grid|block|table)(?:\s|$)/;

	for (const [name, Case, slot] of [
		['Checkbox', F.CheckboxCase, 'checkbox'],
		['Switch', F.SwitchCase, 'switch'],
		['RadioGroupItem', F.RadioGroupCase, 'radio-group-item'],
	] as Array<[string, unknown, string]>) {
		it(`${name} declares a display alongside its size`, () => {
			const m = mount(Case as never);
			try {
				const el = m.container.querySelector(`[data-slot="${slot}"]`)!;
				expect(el, slot).not.toBe(null);
				expect(el.tagName, `${name} is expected to be span-rooted`).toBe('SPAN');
				const cls = el.getAttribute('class') ?? '';
				expect(
					DISPLAY.test(cls),
					`${name} gives a <span> a box but declares no display, so width/height are ignored`,
				).toBe(true);
			} finally {
				m.unmount();
			}
		});
	}

	it('anchors the radio dot to the root box, not a zero-sized indicator', () => {
		const m = mount(F.RadioGroupCase as never);
		try {
			const indicator = m.container.querySelector('[data-slot="radio-group-indicator"]')!;
			// `relative` here would make the absolutely-positioned dot resolve against a flex item
			// with no size of its own, putting it off-centre.
			expect(indicator.className).not.toMatch(/(?:^|\s)relative(?:\s|$)/);
			expect(indicator.className).toContain('size-full');
		} finally {
			m.unmount();
		}
	});
});

describe('@octanejs/shadcn — Base UI dropdown-menu maps onto the Menu primitive', () => {
	const open = async () => {
		const m = mount(F.DropdownMenuCase as never);
		await settle();
		return m;
	};

	it('renders the label standalone, without a Group ancestor', async () => {
		// `Menu.GroupLabel` calls useMenuGroupRootContext and THROWS "MenuGroupContext is missing"
		// outside a `Menu.Group`, while shadcn's label is routinely used on its own. Routing it
		// through the primitive would make the ordinary case a runtime crash — the same trap
		// `Field.Label` already shipped once.
		const m = await open();
		try {
			const label = document.querySelector('[data-slot="dropdown-menu-label"]')!;
			expect(label).not.toBe(null);
			expect(label.tagName).toBe('DIV');
			expect(label.textContent).toBe('My account');
		} finally {
			m.unmount();
		}
	});

	it('positions through Positioner and reads the Base UI css vars', async () => {
		// Radix publishes per-component variable names; Base UI's Positioner publishes generic
		// ones. A utility pointing at a variable nothing sets silently does nothing, which is
		// invisible to any structural assertion.
		const m = await open();
		try {
			const content = document.querySelector('[data-slot="dropdown-menu-content"]')!;
			expect(content.getAttribute('role')).toBe('menu');
			for (const v of ['--available-height', '--anchor-width', '--transform-origin']) {
				expect(content.className, v).toContain(v);
			}
			expect(content.className).not.toContain('--radix-');
		} finally {
			m.unmount();
		}
	});

	it('uses the trigger open dialect on the submenu trigger, not the popup one', async () => {
		// Base UI marks an open TRIGGER with `data-popup-open`; `data-open` belongs to the popup.
		// Radix's `data-open:bg-accent` here would never match, so an open submenu's parent row
		// would lose its highlight.
		const m = await open();
		try {
			const subTrigger = document.querySelector('[data-slot="dropdown-menu-sub-trigger"]')!;
			expect(subTrigger.className).toContain('data-popup-open:bg-accent');
			expect(subTrigger.className).not.toMatch(/(?:^|\s)data-open:/);
		} finally {
			m.unmount();
		}
	});

	it('emits the menu roles and the disabled dialect on items', async () => {
		const m = await open();
		try {
			expect(document.querySelectorAll('[role="menuitem"]').length).toBeGreaterThanOrEqual(3);
			expect(document.querySelector('[role="menuitemcheckbox"]')).not.toBe(null);
			expect(document.querySelector('[role="menuitemradio"]')).not.toBe(null);
			const disabled = [...document.querySelectorAll('[role="menuitem"]')].find(
				(el) => el.textContent === 'Unavailable',
			)!;
			expect(disabled.hasAttribute('data-disabled')).toBe(true);
			expect(disabled.className).toContain('data-disabled:opacity-50');
		} finally {
			m.unmount();
		}
	});

	it('keeps radix focus: utilities, which work because Base UI moves real focus', async () => {
		// Recorded because it looks like it should NOT carry over: Base UI publishes
		// `data-highlighted`, but it also moves DOM focus onto the highlighted item, so radix's
		// `focus:bg-accent` matches as written. Verified by driving ArrowDown and reading
		// document.activeElement.
		const m = await open();
		try {
			const item = document.querySelector('[role="menuitem"]')!;
			expect(item.className).toContain('focus:bg-accent');
			const popup = document.querySelector('[role="menu"]') as HTMLElement;
			popup.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
			await settle();
			const highlighted = document.querySelector('[role="menuitem"][data-highlighted]');
			expect(highlighted).not.toBe(null);
			expect(document.activeElement).toBe(highlighted);
		} finally {
			m.unmount();
		}
	});

	it('renders a separator even though Menu has no Separator part', async () => {
		const m = await open();
		try {
			const seps = document.querySelectorAll('[data-slot="dropdown-menu-separator"]');
			expect(seps.length).toBe(2);
			expect(seps[0].getAttribute('role')).toBe('separator');
		} finally {
			m.unmount();
		}
	});
});

describe('@octanejs/shadcn — Base UI overlays route positioning to the Positioner', () => {
	// Radix has one `Content` element that takes every positioning prop; Base UI splits positioning
	// into its own layer. A prop swept onto `Popup` by a rest spread is INERT — the overlay silently
	// stays on its default side — and it also lands on the DOM as an invalid attribute. Nothing about
	// the rendered structure looks wrong, which is why this needs asserting directly.
	it('dropdown-menu honours side and does not leak the prop to the DOM', async () => {
		const m = mount(F.DropdownMenuSideCase as never);
		await settle();
		try {
			const popup = document.querySelector('[data-slot="dropdown-menu-content"]')!;
			expect(popup.getAttribute('data-side')).toBe('top');
			expect(popup.hasAttribute('side')).toBe(false);
			expect(popup.hasAttribute('alignoffset')).toBe(false);
		} finally {
			m.unmount();
		}
	});

	it('popover honours side too', async () => {
		const m = mount(F.PopoverSideCase as never);
		await settle();
		try {
			const popup = document.querySelector('[data-slot="popover-content"]')!;
			expect(popup.getAttribute('data-side')).toBe('right');
			expect(popup.hasAttribute('side')).toBe(false);
		} finally {
			m.unmount();
		}
	});
});

describe('@octanejs/shadcn — Base UI context-menu reuses the menu dialects', () => {
	// Opened with a real contextmenu event, since there is no trigger to click.
	const open = async () => {
		const m = mount(F.ContextMenuCase as never);
		await settle();
		m.container
			.querySelector('[data-slot="context-menu-trigger"]')!
			.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
		await settle();
		return m;
	};

	it('opens on contextmenu and reads the Base UI css vars', async () => {
		const m = await open();
		try {
			const content = document.querySelector('[data-slot="context-menu-content"]')!;
			expect(content).not.toBe(null);
			expect(content.getAttribute('role')).toBe('menu');
			for (const v of ['--available-height', '--transform-origin']) {
				expect(content.className, v).toContain(v);
			}
			expect(content.className).not.toContain('--radix-');
		} finally {
			m.unmount();
		}
	});

	it('uses the real Separator part, which Menu does not have', async () => {
		// The one place this family differs from dropdown-menu: ContextMenu ships a Separator, so it
		// is the primitive here rather than a plain div, and it carries the a11y roles for free.
		const m = await open();
		try {
			const sep = document.querySelector('[data-slot="context-menu-separator"]')!;
			expect(sep).not.toBe(null);
			expect(sep.getAttribute('role')).toBe('separator');
			expect(sep.getAttribute('aria-orientation')).toBe('horizontal');
		} finally {
			m.unmount();
		}
	});

	it('renders the label standalone, without a Group ancestor', async () => {
		const m = await open();
		try {
			const label = document.querySelector('[data-slot="context-menu-label"]')!;
			expect(label.tagName).toBe('DIV');
			expect(label.textContent).toBe('Actions');
		} finally {
			m.unmount();
		}
	});

	it('uses the trigger open dialect on the submenu trigger', async () => {
		const m = await open();
		try {
			const sub = document.querySelector('[data-slot="context-menu-sub-trigger"]')!;
			expect(sub.className).toContain('data-popup-open:bg-accent');
			expect(sub.className).not.toMatch(/(?:^|\s)data-open:/);
		} finally {
			m.unmount();
		}
	});
});

describe('@octanejs/shadcn — Base UI menubar composes the bar with Menu', () => {
	const open = async () => {
		const m = mount(F.MenubarCase as never);
		await settle();
		return m;
	};

	it('renders the bar as a menubar with menuitem triggers', async () => {
		const m = await open();
		try {
			const bar = m.container.querySelector('[data-slot="menubar"]')!;
			expect(bar.getAttribute('role')).toBe('menubar');
			const triggers = [...m.container.querySelectorAll('[data-slot="menubar-trigger"]')];
			expect(triggers).toHaveLength(2);
			// Base UI gives bar triggers the menubar item role, not plain buttons in a row.
			expect(triggers[0].getAttribute('role')).toBe('menuitem');
		} finally {
			m.unmount();
		}
	});

	it('keeps aria-expanded on the BAR trigger, which is what its class targets', async () => {
		// The one place this family departs from dropdown-menu. Radix styles the bar trigger with
		// `aria-expanded:bg-muted` rather than a data attribute, and Base UI publishes
		// `aria-expanded="true"` — so unlike the SUBMENU trigger, this one needed no rewrite.
		const m = await open();
		try {
			const trigger = m.container.querySelector('[data-slot="menubar-trigger"]')!;
			expect(trigger.getAttribute('aria-expanded')).toBe('true');
			expect(trigger.className).toContain('aria-expanded:bg-muted');
		} finally {
			m.unmount();
		}
	});

	it('rewrites only the submenu trigger to the popup-open dialect', async () => {
		const m = await open();
		try {
			const sub = document.querySelector('[data-slot="menubar-sub-trigger"]')!;
			expect(sub.className).toContain('data-popup-open:bg-accent');
			expect(sub.className).not.toMatch(/(?:^|\s)data-open:/);
		} finally {
			m.unmount();
		}
	});

	it('reads the Base UI transform-origin var, not the radix one', async () => {
		const m = await open();
		try {
			const content = document.querySelector('[data-slot="menubar-content"]')!;
			expect(content.getAttribute('role')).toBe('menu');
			expect(content.className).toContain('origin-(--transform-origin)');
			expect(content.className).not.toContain('--radix-');
		} finally {
			m.unmount();
		}
	});
});

describe('@octanejs/shadcn — Base UI hover-card rewrites the state dialect', () => {
	it('drives motion off data-open/data-closed, since data-state does not exist', async () => {
		// THE ONE THAT WOULD HAVE FAILED SILENTLY AND COMPLETELY. This family's radix source uses the
		// older `data-[state=open]:` / `data-[state=closed]:` spelling rather than the `data-open:`
		// the other menu families use. Base UI publishes NO `data-state` attribute at all, so those
		// utilities would match nothing and the card would pop in and out unanimated.
		const m = mount(F.HoverCardCase as never);
		await settle();
		try {
			const content = document.querySelector('[data-slot="hover-card-content"]')!;
			expect(content).not.toBe(null);
			expect(content.hasAttribute('data-open')).toBe(true);
			// Nothing in the tree publishes data-state, which is what makes the rewrite necessary.
			expect(document.querySelector('[data-state]')).toBe(null);
			expect(content.className).toContain('data-open:animate-in');
			expect(content.className).toContain('data-closed:animate-out');
			expect(content.className).not.toContain('data-[state=');
		} finally {
			m.unmount();
		}
	});

	it('reads the Base UI transform-origin var', async () => {
		const m = mount(F.HoverCardCase as never);
		await settle();
		try {
			const content = document.querySelector('[data-slot="hover-card-content"]')!;
			expect(content.className).toContain('origin-(--transform-origin)');
			expect(content.className).not.toContain('--radix-');
		} finally {
			m.unmount();
		}
	});

	it('routes side to the Positioner rather than the Popup', async () => {
		const m = mount(F.HoverCardSideCase as never);
		await settle();
		try {
			const content = document.querySelector('[data-slot="hover-card-content"]')!;
			expect(content.getAttribute('data-side')).toBe('top');
			expect(content.hasAttribute('side')).toBe(false);
		} finally {
			m.unmount();
		}
	});
});

describe('@octanejs/shadcn — Base UI sidebar composes this base own families', () => {
	it('mounts the provider tree and exposes its parts', async () => {
		const m = mount(F.SidebarCase as never);
		await settle();
		try {
			expect(m.container.querySelector('[data-slot="sidebar-wrapper"]')).not.toBe(null);
			expect(m.container.querySelector('[data-slot="sidebar-menu-button"]')).not.toBe(null);
			expect(m.container.querySelector('[data-slot="sidebar-group-label"]')!.textContent).toBe(
				'Navigation',
			);
		} finally {
			m.unmount();
		}
	});

	it('marks the active menu button, which its classes target', async () => {
		const m = mount(F.SidebarCase as never);
		await settle();
		try {
			const active = m.container.querySelector(
				'[data-slot="sidebar-menu-button"][data-active="true"]',
			)!;
			expect(active).not.toBe(null);
			expect(active.tagName).toBe('BUTTON');
			expect(active.className).toContain('data-active:bg-sidebar-accent');
		} finally {
			m.unmount();
		}
	});

	it('composes the tooltip through render, so no button nests inside another', async () => {
		// The composition that made this family portable at all. Radix wraps the menu button in
		// `<TooltipTrigger asChild>`, where Slot MERGES the trigger onto its child; Base UI has no
		// Slot and its Tooltip.Trigger takes a `render` element, which merges the same way.
		//
		// Passing the button as CHILDREN instead is the trap: the trigger then renders its own
		// `<button>` and the menu button lands INSIDE it. Two buttons still exist and both still
		// carry their text, so a count or text assertion passes — but nested interactive elements
		// are invalid HTML and break click and focus behaviour. The nesting is the oracle.
		const m = mount(F.SidebarCase as never);
		await settle();
		try {
			const buttons = [...m.container.querySelectorAll('[data-slot="sidebar-menu-button"]')];
			expect(buttons).toHaveLength(2);
			expect(buttons.map((b) => b.textContent)).toEqual(['Dashboard', 'Settings']);
			for (const button of buttons) {
				expect(button.tagName).toBe('BUTTON');
				expect(button.closest('button:not([data-slot="sidebar-menu-button"])')).toBe(null);
			}
		} finally {
			m.unmount();
		}
	});
});

describe('@octanejs/shadcn — Base UI tabs adapts the orientation dialect to the pin', () => {
	it('switches panels on click, with aria wiring intact', async () => {
		const m = mount(F.TabsCase as never);
		await settle();
		try {
			const triggers = [...m.container.querySelectorAll<HTMLElement>('[data-slot="tabs-trigger"]')];
			expect(triggers.map((t) => t.getAttribute('aria-selected'))).toEqual(['true', 'false']);
			triggers[1].click();
			await settle();
			expect(triggers.map((t) => t.getAttribute('aria-selected'))).toEqual(['false', 'true']);
			expect(m.container.textContent).toContain('Password panel');
		} finally {
			m.unmount();
		}
	});

	it('targets data-[orientation=…], not the bare attributes upstream uses', async () => {
		// The version skew this file exists to bridge. The pinned primitive emits
		// `data-orientation="horizontal"`; upstream's source targets a bare `data-horizontal`, which
		// would match nothing here — the root would never become a column and every
		// `group-data-*/tabs` selector on the trigger would be dead.
		const m = mount(F.TabsCase as never);
		await settle();
		try {
			const root = m.container.querySelector('[data-slot="tabs"]')!;
			expect(root.getAttribute('data-orientation')).toBe('horizontal');
			expect(root.hasAttribute('data-horizontal')).toBe(false);
			expect(root.className).toContain('data-[orientation=horizontal]:flex-col');
			for (const el of m.container.querySelectorAll('[data-slot="tabs-trigger"]')) {
				expect(el.className).not.toMatch(/group-data-(horizontal|vertical)\//);
			}
		} finally {
			m.unmount();
		}
	});

	it('keeps data-active, which the pin emits exactly as the classes expect', async () => {
		const m = mount(F.TabsCase as never);
		await settle();
		try {
			const active = m.container.querySelector('[data-slot="tabs-trigger"][data-active]')!;
			expect(active).not.toBe(null);
			expect(active.textContent).toBe('Account');
			expect(active.className).toContain('data-active:bg-background');
		} finally {
			m.unmount();
		}
	});

	it('carries orientation through to the list and its variants', async () => {
		const m = mount(F.TabsVerticalCase as never);
		await settle();
		try {
			const root = m.container.querySelector('[data-slot="tabs"]')!;
			expect(root.getAttribute('data-orientation')).toBe('vertical');
			const list = m.container.querySelector('[data-slot="tabs-list"]')!;
			expect(list.getAttribute('role')).toBe('tablist');
			expect(list.getAttribute('aria-orientation')).toBe('vertical');
			expect(list.getAttribute('data-variant')).toBe('line');
		} finally {
			m.unmount();
		}
	});
});

describe('@octanejs/shadcn — the Base UI sidebar escape hatch is reachable', () => {
	it('exports the variants the header sends consumers to', () => {
		// This base drops `asChild` on SidebarMenuButton and documents this helper as the substitute.
		// It was declared non-exported (faithful to the radix source, which does not need it because
		// it HAS asChild), so the documented workaround could not be imported at all.
		expect(typeof sidebarMenuButtonVariants).toBe('function');
		expect(sidebarMenuButtonVariants({ variant: 'default', size: 'default' })).toBeTruthy();
	});

	it('produces the same classes the component applies, so the workaround really substitutes', async () => {
		// A helper that exists but yields different classes would be a worse trap than no helper.
		const m = mount(F.SidebarCase as never);
		await settle();
		try {
			const button = m.container.querySelector('[data-slot="sidebar-menu-button"]')!;
			for (const cls of sidebarMenuButtonVariants({ variant: 'default', size: 'default' }).split(
				' ',
			)) {
				expect(button.className, cls).toContain(cls);
			}
		} finally {
			m.unmount();
		}
	});
});
