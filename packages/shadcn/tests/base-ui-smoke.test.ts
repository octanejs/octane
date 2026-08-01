import { describe, expect, it } from 'vitest';
import { mount } from '../../octane/tests/_helpers';
import * as F from './_fixtures/base-ui-smoke.tsrx';

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
const CASES: Array<[string, () => unknown, string | null]> = [
	['Accordion', F.AccordionCase, 'Trigger'],
	['Alert', F.AlertCase, 'Description'],
	['AspectRatio', F.AspectRatioCase, 'Media'],
	['Button', F.ButtonCase, 'Press'],
	['Card', F.CardCase, 'Footer'],
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
	for (const [name, Case, expectText] of CASES) {
		it(`${name} mounts outside any provider`, () => {
			const m = mount(Case as never);
			try {
				expect(m.container.firstElementChild).not.toBe(null);
			} finally {
				m.unmount();
			}
		});

		if (expectText !== null) {
			it(`${name} forwards its children to the DOM`, () => {
				const m = mount(Case as never);
				try {
					expect(m.container.textContent).toContain(expectText);
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
