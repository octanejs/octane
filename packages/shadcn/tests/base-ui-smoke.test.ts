import { describe, expect, it } from 'vitest';
import { mount } from '../../octane/tests/_helpers';
import * as F from './_fixtures/base-ui-smoke.tsrx';

// Every Base UI family gets its own mount, STANDALONE — no Field.Root, no provider wrapper.
// A component that throws during render takes down everything rendered after it, so a single
// combined page reports one failure and hides the rest; this reports them independently.
//
// The oracle is deliberately weak: render without throwing, and put SOMETHING in the DOM. Deep
// behavior belongs in the per-family tests and in @octanejs/base-ui's own upstream suites. What
// this protects is that no family is dead on arrival.
//
// WHY IT EXISTS: `Label` shipped routed through Base UI's `Field.Label`, which calls
// `useFieldRootContext(false)` and throws "FieldRootContext is missing" outside a `<Field.Root>`.
// Since shadcn's Label is a standalone component, every documented use of it crashed at runtime.
// Typecheck, the registry gate, the cross-base structural gate and a full `vite build` ALL
// passed — the failure only appeared when a human opened the page. Rendering each family bare is
// the cheap oracle that catches this whole class of defect.
const CASES: Array<[string, () => unknown]> = [
	['Accordion', F.AccordionCase],
	['Alert', F.AlertCase],
	['AspectRatio', F.AspectRatioCase],
	['Button', F.ButtonCase],
	['Card', F.CardCase],
	['Empty', F.EmptyCase],
	['Input', F.InputCase],
	['Kbd', F.KbdCase],
	['Label', F.LabelCase],
	['NativeSelect', F.NativeSelectCase],
	['Separator', F.SeparatorCase],
	['Separator (vertical)', F.SeparatorVerticalCase],
	['Skeleton', F.SkeletonCase],
	['Spinner', F.SpinnerCase],
	['Textarea', F.TextareaCase],
];

describe('@octanejs/shadcn — Base UI base renders standalone', () => {
	for (const [name, Case] of CASES) {
		it(`${name} mounts outside any provider`, () => {
			const m = mount(Case as never);
			try {
				expect(m.container.firstElementChild).not.toBe(null);
			} finally {
				m.unmount();
			}
		});
	}
});
