import { describe, expect, it, vi } from 'vitest';
import { createElement, flushSync } from 'octane';
import { flushEffects, mount } from '../../octane/tests/_helpers';
import { Checkbox } from '../src/checkbox';
import { Dialog } from '../src/dialog';
import { Popover } from '../src/popover';
import { Progress } from '../src/progress';
import { Radio } from '../src/radio';
import { RadioGroup } from '../src/radio-group';
import { Slider } from '../src/slider';
import { Switch } from '../src/switch';

// Several primitives compose a fixed set of siblings — a rendered root, a visually-hidden input, a
// focus guard, a portal — by handing octane an ARRAY child. Octane reconciles an array as a keyed
// list, so an entry without a key warns in development and can rematch the wrong node on reorder.
//
// These arrays are positional and fixed-arity, so a literal key per slot is correct. Values that
// cannot be keyed in place (a consumer's `children`, an already-built descriptor) go through a
// keyed Fragment, which is the pattern menu, popover and toast already used.
//
// The oracle is the published diagnostic rather than DOM shape: the warning is exactly what a
// consumer sees in their console, and it was firing for every overlay and form control in the
// playground.
function keyWarningsWhileRendering(node: () => unknown): string[] {
	const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
	const error = vi.spyOn(console, 'error').mockImplementation(() => {});
	const m = mount(node as never);
	try {
		return [...warn.mock.calls, ...error.mock.calls]
			.map((args) => String(args[0]))
			.filter((message) => message.includes('unique "key"'));
	} finally {
		warn.mockRestore();
		error.mockRestore();
		m.unmount();
	}
}

// Same, but lets effects settle first. Some slots — a modal backdrop, a portal subtree — only
// mount after an effect, so reading warnings synchronously misses them entirely.
async function keyWarningsAfterSettling(node: () => unknown): Promise<string[]> {
	const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
	const error = vi.spyOn(console, 'error').mockImplementation(() => {});
	const m = mount(node as never);
	try {
		for (let i = 0; i < 5; i += 1) {
			flushEffects();
			flushSync(() => {});
			await new Promise((resolve) => setTimeout(resolve, 0));
		}
		return [...warn.mock.calls, ...error.mock.calls]
			.map((args) => String(args[0]))
			.filter((message) => message.includes('unique "key"'));
	} finally {
		warn.mockRestore();
		error.mockRestore();
		m.unmount();
	}
}

const CASES: Array<[string, () => unknown]> = [
	['Checkbox.Root', () => createElement(Checkbox.Root, null)],
	['Switch.Root', () => createElement(Switch.Root, null)],
	[
		'Radio.Root inside RadioGroup',
		() =>
			createElement(RadioGroup, { defaultValue: 'a' }, createElement(Radio.Root, { value: 'a' })),
	],
	[
		'Progress.Root',
		() =>
			createElement(
				Progress.Root,
				{ value: 40 },
				createElement(Progress.Track, null, createElement(Progress.Indicator, null)),
			),
	],
	[
		'Slider thumb',
		() =>
			createElement(
				Slider.Root,
				{ defaultValue: [30] },
				createElement(
					Slider.Control,
					null,
					createElement(Slider.Track, { key: 'track' }, createElement(Slider.Indicator, null)),
					createElement(Slider.Thumb, { key: 'thumb' }),
				),
			),
	],
	[
		'Dialog through the floating portal',
		() =>
			createElement(
				Dialog.Root,
				{ defaultOpen: true },
				createElement(Dialog.Portal, null, createElement(Dialog.Popup, { key: 'popup' }, 'body')),
			),
	],
];

describe('@octanejs/base-ui — primitives key the array children they compose', () => {
	for (const [name, node] of CASES) {
		it(`${name} renders without a missing-key warning`, () => {
			expect(keyWarningsWhileRendering(node)).toEqual([]);
		});
	}

	it('a MODAL popover keys its backdrop too', async () => {
		// The backdrop only renders on the modal path, so a non-modal popover never exercised this
		// array and the first pass at this fix missed it. Asserted separately for that reason.
		const warnings = await keyWarningsAfterSettling(() =>
			createElement(
				Popover.Root,
				{ defaultOpen: true, modal: true },
				createElement(
					Popover.Portal,
					null,
					createElement(
						Popover.Positioner,
						{ key: 'positioner' },
						createElement(Popover.Popup, { key: 'popup' }, 'body'),
					),
				),
			),
		);
		expect(warnings).toEqual([]);
	});

	it('still renders the hidden input a form control needs', () => {
		// Guards the assertions above from passing because a slot silently stopped rendering.
		const m = mount(() => createElement(Checkbox.Root, { name: 'agree' }));
		try {
			expect(m.container.querySelector('input[type="checkbox"]')).not.toBe(null);
			expect(m.container.querySelector('[role="checkbox"]')).not.toBe(null);
		} finally {
			m.unmount();
		}
	});

	it('still portals dialog content out of the container', async () => {
		const m = mount(() =>
			createElement(
				Dialog.Root,
				{ defaultOpen: true },
				createElement(
					Dialog.Portal,
					null,
					createElement(Dialog.Popup, { key: 'popup' }, 'portaled'),
				),
			),
		);
		try {
			// The portal node is created in an effect, so the tree has to settle before the content
			// exists anywhere. Without this the assertion would pass vacuously against an empty body.
			for (let i = 0; i < 4; i += 1) {
				flushEffects();
				flushSync(() => {});
				await new Promise((resolve) => setTimeout(resolve, 0));
			}
			expect(document.body.textContent).toContain('portaled');
			expect(m.container.textContent).not.toContain('portaled');
		} finally {
			m.unmount();
		}
	});
});
