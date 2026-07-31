import { describe, expect, it } from 'vitest';
import { mount } from '../../octane/tests/_helpers';
import * as F from './_fixtures/react-aria-smoke.tsrx';

// Every React Aria family gets its own mount. A component that throws during
// render takes down everything rendered after it, so a single combined page
// reports one failure and hides the rest — this reports them independently.
//
// The oracle is deliberately weak on purpose: render without throwing, and put
// SOMETHING in the DOM. Deep behavior belongs in the per-family tests; what
// this protects is that no family is dead on arrival.
const CASES: Array<[string, () => unknown]> = [
	['Accordion', F.AccordionCase],
	['Alert', F.AlertCase],
	['AlertDialog', F.AlertDialogCase],
	['AspectRatio', F.AspectRatioCase],
	['Avatar', F.AvatarCase],
	['Badge', F.BadgeCase],
	['Breadcrumb', F.BreadcrumbCase],
	['Button', F.ButtonCase],
	['LinkButton', F.LinkButtonCase],
	['Card', F.CardCase],
	['Checkbox', F.CheckboxCase],
	['Collapsible', F.CollapsibleCase],
	['Dialog', F.DialogCase],
	['Empty', F.EmptyCase],
	['Field', F.FieldCase],
	['Input', F.InputCase],
	['Item', F.ItemCase],
	['Kbd', F.KbdCase],
	['Label', F.LabelCase],
	['NativeSelect', F.NativeSelectCase],
	['Pagination', F.PaginationCase],
	['Popover', F.PopoverCase],
	['RadioGroup', F.RadioGroupCase],
	['ScrollArea', F.ScrollAreaCase],
	['Separator', F.SeparatorCase],
	['Sheet', F.SheetCase],
	['Skeleton', F.SkeletonCase],
	['Slider', F.SliderCase],
	['Spinner', F.SpinnerCase],
	['Switch', F.SwitchCase],
	['Table', F.TableCase],
	['Tabs', F.TabsCase],
	['Textarea', F.TextareaCase],
	['Toggle', F.ToggleCase],
];

// Families whose whole point is a collection: rendering the shell while the
// items silently vanish is the failure mode RAC collections actually have in
// octane (block children cannot be walked), and "rendered something" happily
// accepts it. These assert the items exist.
const MUST_CONTAIN: Record<string, { selector: string; what: string }> = {
	Tabs: { selector: '[role="tab"]', what: 'a tab trigger' },
	Table: { selector: '[role="row"]', what: 'a row' },
	RadioGroup: { selector: 'input[type="radio"]', what: 'a radio input' },
	NativeSelect: { selector: 'option', what: 'an option' },
	// RAC renders the CURRENT breadcrumb as a span[role=link], not an anchor, so
	// assert the part rather than the tag.
	Breadcrumb: { selector: '[data-slot="breadcrumb-link"]', what: 'a link item' },
	Pagination: { selector: 'a', what: 'a page link' },
};

describe('@octanejs/shadcn/react-aria — every family mounts', () => {
	for (const [name, Case] of CASES) {
		it(`${name} renders`, () => {
			const r = mount(Case as never);
			expect(r.html(), `${name} rendered nothing`).not.toBe('');
			const must = MUST_CONTAIN[name];
			if (must) {
				expect(
					r.container.querySelector(must.selector),
					`${name} rendered its shell but not ${must.what}`,
				).not.toBeNull();
			}
			r.unmount();
		});
	}
});

// UPSTREAM FIDELITY, not divergence. Upstream shadcn applies `style`, `onLoad`
// and `onError` BEFORE spreading `{...props}`, so a caller value of the same
// name replaces the component's own. React behaves identically, so "fixing" it
// here would make these components disagree with every upstream example and
// with the Radix base's own copied sources. Pinned so the behavior is
// deliberate: if upstream reorders, these fail and we follow.
describe('@octanejs/shadcn/react-aria — upstream prop-precedence quirks', () => {
	it("a caller `style` replaces AspectRatio's --ratio variable", () => {
		const r = mount(F.AspectRatioCallerStyle as never);
		const el = r.container.querySelector('[data-slot="aspect-ratio"]') as HTMLElement;
		// The caller's style wins outright — the ratio variable is gone.
		expect(el.style.opacity).toBe('0.5');
		expect(el.style.getPropertyValue('--ratio')).toBe('');
		// The class still asks for aspect-(--ratio), which now has no value:
		// that is exactly the upstream hazard this test records.
		expect(el.className).toContain('aspect-(--ratio)');
		r.unmount();
	});

	it("a caller `onError` replaces AvatarImage's own state handler", () => {
		let called = 0;
		const r = mount(F.AvatarCallerOnError as never, { onError: () => called++ });
		const img = r.container.querySelector('[data-slot="avatar-image"]') as HTMLImageElement;
		img.dispatchEvent(new Event('error'));
		// The caller's handler ran INSTEAD of the component's, so the image never
		// transitions to data-state="error" and the fallback stays hidden.
		expect(called).toBe(1);
		expect(img.getAttribute('data-state')).not.toBe('error');
		r.unmount();
	});
});
