// Port of Base UI v1.6.0's own Accordion suite:
//   .base-ui/packages/react/src/accordion/root/AccordionRoot.test.tsx
//   .base-ui/packages/react/src/accordion/trigger/AccordionTrigger.test.tsx
//   .base-ui/packages/react/src/accordion/panel/AccordionPanel.test.tsx
//
// Same contract as `collapsible.test.ts`: upstream's assertions, unchanged, each `it` citing
// its upstream line, with only the harness adapted (the repo's `mount` + native events instead
// of `@mui/internal-test-utils`).
//
// Upstream gates its open-state, keyboard-interaction, `prop: multiple` and `prop: onValueChange`
// blocks behind `describe.skipIf(isJSDOM)` because they need real layout or real key handling.
// Those are browser contracts and are not faked here.
import { describe, expect, it, vi } from 'vitest';
import { createElement, useState } from 'octane';
import { Accordion } from '@octanejs/base-ui/accordion';
import { flushSync } from '../../../octane/src/index.js';
import { flushEffects, mount } from '../../../octane/tests/_helpers';

const PANEL_CONTENT_1 = 'Panel contents 1';
const PANEL_CONTENT_2 = 'Panel contents 2';

async function settle(): Promise<void> {
	for (let i = 0; i < 4; i += 1) {
		flushEffects();
		flushSync(() => {});
		await new Promise((resolve) => setTimeout(resolve, 0));
	}
}

function buttons(container: HTMLElement): HTMLElement[] {
	return Array.from(container.querySelectorAll('button'));
}

function buttonNamed(container: HTMLElement, name: string): HTMLElement {
	const match = buttons(container).find((b) => b.textContent === name);
	if (!match) {
		throw new Error(`no button named "${name}"`);
	}
	return match;
}

// Deepest element owning the text — an ancestor also matches on `textContent`, and here the
// ancestors (Item, Root) carry their own `data-open`/`data-disabled`, so a shallower match
// would make attribute assertions pass without saying anything about the panel.
function queryByText(container: HTMLElement, text: string): HTMLElement | null {
	const matches = Array.from(container.querySelectorAll('*')).filter(
		(el) => el.textContent === text,
	);
	return (matches.findLast((el) => !matches.some((o) => o !== el && el.contains(o))) ??
		null) as HTMLElement | null;
}

async function clickAndSettle(el: HTMLElement): Promise<void> {
	flushSync(() => {
		el.click();
	});
	await settle();
}

/** `<Accordion.Item><Header><Trigger/></Header><Panel/></Accordion.Item>` */
function item(value: any, triggerLabel: string, panelContent: string, extra: any = {}): any {
	const { triggerProps, panelProps, ...itemProps } = extra;
	return createElement(Accordion.Item, {
		key: String(value),
		value,
		...itemProps,
		children: [
			createElement(Accordion.Header, {
				key: 'header',
				children: createElement(Accordion.Trigger, { ...triggerProps }, triggerLabel),
			}),
			createElement(Accordion.Panel, { key: 'panel', ...panelProps }, panelContent),
		],
	});
}

describe('<Accordion.Root />', () => {
	describe('ARIA attributes', () => {
		// Per AccordionRoot.test.tsx:20
		it('renders correct ARIA attributes', async () => {
			const m = mount(() =>
				createElement(Accordion.Root, {
					defaultValue: [0],
					children: item(0, 'Trigger 1', PANEL_CONTENT_1),
				}),
			);
			await settle();

			const trigger = buttons(m.container)[0];
			const panel = queryByText(m.container, PANEL_CONTENT_1)!;

			expect(trigger.hasAttribute('aria-controls')).toBe(true);
			expect(panel.getAttribute('id')).toBe(trigger.getAttribute('aria-controls'));
			expect(panel.getAttribute('role')).toBe('region');
			expect(trigger.getAttribute('id')).toBe(panel.getAttribute('aria-labelledby'));

			m.unmount();
		});

		// Per AccordionRoot.test.tsx:41
		it('references manual panel id in trigger aria-controls', async () => {
			const m = mount(() =>
				createElement(Accordion.Root, {
					defaultValue: [0],
					children: item(0, 'Trigger 1', PANEL_CONTENT_1, {
						panelProps: { id: 'custom-panel-id' },
					}),
				}),
			);
			await settle();

			const trigger = buttons(m.container)[0];
			const panel = queryByText(m.container, PANEL_CONTENT_1)!;

			expect(trigger.getAttribute('aria-controls')).toBe('custom-panel-id');
			expect(panel.getAttribute('id')).toBe('custom-panel-id');

			m.unmount();
		});

		// Per AccordionRoot.test.tsx:60
		it('references manual trigger id in panel aria-labelledby', async () => {
			const m = mount(() =>
				createElement(Accordion.Root, {
					defaultValue: [0],
					children: item(0, 'Trigger 1', PANEL_CONTENT_1, {
						triggerProps: { id: 'custom-trigger-id' },
					}),
				}),
			);
			await settle();

			expect(queryByText(m.container, PANEL_CONTENT_1)!.getAttribute('aria-labelledby')).toBe(
				'custom-trigger-id',
			);

			m.unmount();
		});

		// Per AccordionRoot.test.tsx:77 — the trigger id is registered into item context via a
		// layout effect, so the panel's labelling has to track it changing, not just its initial value.
		it('updates panel labeling when a manual trigger id is added or changed', async () => {
			function App() {
				const [triggerId, setTriggerId] = useState<string | undefined>(undefined);
				return createElement('div', {
					children: [
						createElement(
							'button',
							{ key: 'a', type: 'button', onClick: () => setTriggerId('custom-trigger-id-1') },
							'Set id 1',
						),
						createElement(
							'button',
							{ key: 'b', type: 'button', onClick: () => setTriggerId('custom-trigger-id-2') },
							'Set id 2',
						),
						createElement(Accordion.Root, {
							key: 'root',
							defaultValue: [0],
							children: item(0, 'Trigger 1', PANEL_CONTENT_1, { triggerProps: { id: triggerId } }),
						}),
					],
				});
			}

			const m = mount(App);
			await settle();

			const trigger = buttonNamed(m.container, 'Trigger 1');
			const panel = queryByText(m.container, PANEL_CONTENT_1)!;

			expect(trigger.hasAttribute('id')).toBe(true);
			expect(panel.getAttribute('aria-labelledby')).toBe(trigger.getAttribute('id'));

			await clickAndSettle(buttonNamed(m.container, 'Set id 1'));

			expect(trigger.getAttribute('id')).toBe('custom-trigger-id-1');
			expect(panel.getAttribute('aria-labelledby')).toBe('custom-trigger-id-1');

			await clickAndSettle(buttonNamed(m.container, 'Set id 2'));

			expect(trigger.getAttribute('id')).toBe('custom-trigger-id-2');
			expect(panel.getAttribute('aria-labelledby')).toBe('custom-trigger-id-2');

			m.unmount();
		});

		// Per AccordionRoot.test.tsx:124 — removing the manual id must fall back to the generated
		// one, which is the cleanup arm of the same effect.
		it('restores panel labeling when a manual trigger id is removed', async () => {
			function App() {
				const [triggerId, setTriggerId] = useState<string | undefined>('custom-trigger-id');
				return createElement('div', {
					children: [
						createElement(
							'button',
							{ key: 'a', type: 'button', onClick: () => setTriggerId(undefined) },
							'Remove id',
						),
						createElement(Accordion.Root, {
							key: 'root',
							defaultValue: [0],
							children: item(0, 'Trigger 1', PANEL_CONTENT_1, { triggerProps: { id: triggerId } }),
						}),
					],
				});
			}

			const m = mount(App);
			await settle();

			const trigger = buttonNamed(m.container, 'Trigger 1');
			const panel = queryByText(m.container, PANEL_CONTENT_1)!;

			expect(trigger.getAttribute('id')).toBe('custom-trigger-id');
			expect(panel.getAttribute('aria-labelledby')).toBe('custom-trigger-id');

			await clickAndSettle(buttonNamed(m.container, 'Remove id'));

			expect(trigger.getAttribute('id')).not.toBe('custom-trigger-id');
			expect(trigger.hasAttribute('id')).toBe(true);
			expect(panel.getAttribute('aria-labelledby')).toBe(trigger.getAttribute('id'));

			m.unmount();
		});
	});

	describe('uncontrolled', () => {
		// Per AccordionRoot.test.tsx:195
		it('prop: defaultValue — custom item value', async () => {
			const m = mount(() =>
				createElement(Accordion.Root, {
					defaultValue: ['first'],
					children: [
						item('first', 'Trigger 1', PANEL_CONTENT_1),
						item('second', 'Trigger 2', PANEL_CONTENT_2),
					],
				}),
			);
			await settle();

			expect(queryByText(m.container, PANEL_CONTENT_1)).not.toBe(null);
			expect(queryByText(m.container, PANEL_CONTENT_1)!.hasAttribute('data-open')).toBe(true);
			expect(queryByText(m.container, PANEL_CONTENT_2)).toBe(null);

			m.unmount();
		});
	});

	// COVERAGE GAP FILLED. Upstream exercises single-vs-multiple toggling only inside blocks it
	// gates behind `describe.skipIf(isJSDOM)` (`uncontrolled > open state`, `prop: multiple`), so
	// porting only the jsdom-runnable cases left `handleValueChange`'s single-mode branch
	// completely untested — replacing `value[0] === newValue ? [] : [newValue]` with
	// `[newValue]` passed all 15 ported tests. The branch needs no layout to observe, only
	// `aria-expanded` and panel presence, so it is asserted directly here.
	describe('single mode toggling (not covered by the jsdom-runnable upstream cases)', () => {
		it('clicking an open item closes it', async () => {
			const m = mount(() =>
				createElement(Accordion.Root, {
					children: item(0, 'Trigger 1', PANEL_CONTENT_1),
				}),
			);
			await settle();

			const trigger = buttons(m.container)[0];
			expect(trigger.getAttribute('aria-expanded')).toBe('false');

			await clickAndSettle(trigger);
			expect(trigger.getAttribute('aria-expanded')).toBe('true');
			expect(queryByText(m.container, PANEL_CONTENT_1)).not.toBe(null);

			await clickAndSettle(trigger);
			expect(trigger.getAttribute('aria-expanded')).toBe('false');
			expect(queryByText(m.container, PANEL_CONTENT_1)).toBe(null);

			m.unmount();
		});

		it('opening a second item closes the first', async () => {
			const m = mount(() =>
				createElement(Accordion.Root, {
					children: [item(0, 'Trigger 1', PANEL_CONTENT_1), item(1, 'Trigger 2', PANEL_CONTENT_2)],
				}),
			);
			await settle();

			await clickAndSettle(buttonNamed(m.container, 'Trigger 1'));
			expect(queryByText(m.container, PANEL_CONTENT_1)).not.toBe(null);
			expect(queryByText(m.container, PANEL_CONTENT_2)).toBe(null);

			await clickAndSettle(buttonNamed(m.container, 'Trigger 2'));
			expect(queryByText(m.container, PANEL_CONTENT_1)).toBe(null);
			expect(queryByText(m.container, PANEL_CONTENT_2)).not.toBe(null);

			m.unmount();
		});

		it('multiple keeps both items open', async () => {
			const m = mount(() =>
				createElement(Accordion.Root, {
					multiple: true,
					children: [item(0, 'Trigger 1', PANEL_CONTENT_1), item(1, 'Trigger 2', PANEL_CONTENT_2)],
				}),
			);
			await settle();

			await clickAndSettle(buttonNamed(m.container, 'Trigger 1'));
			await clickAndSettle(buttonNamed(m.container, 'Trigger 2'));

			expect(queryByText(m.container, PANEL_CONTENT_1)).not.toBe(null);
			expect(queryByText(m.container, PANEL_CONTENT_2)).not.toBe(null);

			// And closing one leaves the other open — the `filter` arm of the multiple branch.
			await clickAndSettle(buttonNamed(m.container, 'Trigger 1'));
			expect(queryByText(m.container, PANEL_CONTENT_1)).toBe(null);
			expect(queryByText(m.container, PANEL_CONTENT_2)).not.toBe(null);

			m.unmount();
		});
	});

	describe('controlled', () => {
		// Per AccordionRoot.test.tsx:255
		it('prop: value — custom item value', async () => {
			const m = mount(() =>
				createElement(Accordion.Root, {
					value: ['one'],
					children: [
						item('one', 'Trigger 1', PANEL_CONTENT_1),
						item('second', 'Trigger 2', PANEL_CONTENT_2),
					],
				}),
			);
			await settle();

			expect(queryByText(m.container, PANEL_CONTENT_1)).not.toBe(null);
			expect(queryByText(m.container, PANEL_CONTENT_1)!.hasAttribute('data-open')).toBe(true);
			expect(queryByText(m.container, PANEL_CONTENT_2)).toBe(null);

			m.unmount();
		});
	});

	describe('prop: disabled', () => {
		// Per AccordionRoot.test.tsx:283 — `disabled` must reach every part, not just the trigger.
		it('can disable the whole accordion', async () => {
			const m = mount(() =>
				createElement(Accordion.Root, {
					defaultValue: [0],
					disabled: true,
					children: [
						item(0, 'Trigger 1', PANEL_CONTENT_1, { 'data-testid': 'item1' }),
						item(1, 'Trigger 2', PANEL_CONTENT_2, { 'data-testid': 'item2' }),
					],
				}),
			);
			await settle();

			const headings = Array.from(m.container.querySelectorAll('h3'));
			const [trigger1, trigger2] = buttons(m.container);
			const parts = [
				m.container.querySelector('[data-testid="item1"]')!,
				headings[0],
				trigger1,
				queryByText(m.container, PANEL_CONTENT_1)!,
				m.container.querySelector('[data-testid="item2"]')!,
				headings[1],
				trigger2,
			];

			parts.forEach((el) => {
				expect(el.hasAttribute('data-disabled')).toBe(true);
			});

			m.unmount();
		});

		// Per AccordionRoot.test.tsx:312 — and it must NOT leak to a sibling item.
		it('can disable one accordion item', async () => {
			const m = mount(() =>
				createElement(Accordion.Root, {
					defaultValue: [0],
					children: [
						item(0, 'Trigger 1', PANEL_CONTENT_1, { 'data-testid': 'item1', disabled: true }),
						item(1, 'Trigger 2', PANEL_CONTENT_2, { 'data-testid': 'item2' }),
					],
				}),
			);
			await settle();

			const headings = Array.from(m.container.querySelectorAll('h3'));
			const [trigger1, trigger2] = buttons(m.container);

			[
				m.container.querySelector('[data-testid="item1"]')!,
				headings[0],
				trigger1,
				queryByText(m.container, PANEL_CONTENT_1)!,
			].forEach((el) => {
				expect(el.hasAttribute('data-disabled')).toBe(true);
			});

			[m.container.querySelector('[data-testid="item2"]')!, headings[1], trigger2].forEach((el) => {
				expect(el.hasAttribute('data-disabled')).toBe(false);
			});

			m.unmount();
		});
	});

	describe('BaseUIChangeEventDetails', () => {
		// Per AccordionRoot.test.tsx:506 — cancelling at the ITEM must stop the value ever
		// reaching the root, so onValueChange is never called at all.
		it('onOpenChange cancel() prevents opening while uncontrolled', async () => {
			const onValueChange = vi.fn();
			const m = mount(() =>
				createElement(Accordion.Root, {
					onValueChange,
					children: item(0, 'Trigger 1', PANEL_CONTENT_1, {
						onOpenChange: (nextOpen: boolean, eventDetails: any) => {
							if (nextOpen) {
								eventDetails.cancel();
							}
						},
					}),
				}),
			);
			await settle();

			const trigger = buttons(m.container)[0];
			await clickAndSettle(trigger);

			expect(trigger.getAttribute('aria-expanded')).toBe('false');
			expect(queryByText(m.container, PANEL_CONTENT_1)).toBe(null);
			expect(onValueChange.mock.calls.length).toBe(0);

			m.unmount();
		});

		// Per AccordionRoot.test.tsx:536 — cancelling at the ROOT still runs the handler once.
		it('onValueChange cancel() prevents opening while uncontrolled', async () => {
			const onValueChange = vi.fn((_value: any, eventDetails: any) => {
				eventDetails.cancel();
			});
			const m = mount(() =>
				createElement(Accordion.Root, {
					onValueChange,
					children: item(0, 'Trigger 1', PANEL_CONTENT_1),
				}),
			);
			await settle();

			const trigger = buttons(m.container)[0];
			await clickAndSettle(trigger);

			expect(trigger.getAttribute('aria-expanded')).toBe('false');
			expect(queryByText(m.container, PANEL_CONTENT_1)).toBe(null);
			expect(onValueChange.mock.calls.length).toBe(1);

			m.unmount();
		});

		// Per AccordionRoot.test.tsx:561
		it('onOpenChange cancel() prevents onValueChange while controlled', async () => {
			const onValueChange = vi.fn();
			const m = mount(() =>
				createElement(Accordion.Root, {
					value: [],
					onValueChange,
					children: item(0, 'Trigger 1', PANEL_CONTENT_1, {
						onOpenChange: (nextOpen: boolean, eventDetails: any) => {
							if (nextOpen) {
								eventDetails.cancel();
							}
						},
					}),
				}),
			);
			await settle();

			const trigger = buttons(m.container)[0];
			await clickAndSettle(trigger);

			expect(trigger.getAttribute('aria-expanded')).toBe('false');
			expect(queryByText(m.container, PANEL_CONTENT_1)).toBe(null);
			expect(onValueChange.mock.calls.length).toBe(0);

			m.unmount();
		});

		// Per AccordionRoot.test.tsx:629
		it('onValueChange cancel() prevents opening while multiple', async () => {
			const onValueChange = vi.fn((_value: any, eventDetails: any) => {
				eventDetails.cancel();
			});
			const m = mount(() =>
				createElement(Accordion.Root, {
					multiple: true,
					onValueChange,
					children: [item(0, 'Trigger 1', PANEL_CONTENT_1), item(1, 'Trigger 2', PANEL_CONTENT_2)],
				}),
			);
			await settle();

			const trigger = buttonNamed(m.container, 'Trigger 1');
			await clickAndSettle(trigger);

			expect(trigger.getAttribute('aria-expanded')).toBe('false');
			expect(queryByText(m.container, PANEL_CONTENT_1)).toBe(null);
			expect(onValueChange.mock.calls.length).toBe(1);

			m.unmount();
		});
	});
});

describe('<Accordion.Panel />', () => {
	// Per AccordionPanel.test.tsx:74 — the root's keepMounted must reach panels that never
	// rendered open, which is the context-default path rather than the prop path.
	it('passes root keepMounted to closed panels', async () => {
		const m = mount(() =>
			createElement(Accordion.Root, {
				keepMounted: true,
				children: item(0, 'Trigger 1', PANEL_CONTENT_1),
			}),
		);
		await settle();

		const panel = queryByText(m.container, PANEL_CONTENT_1);
		expect(panel).not.toBe(null);
		expect(panel!.hidden).toBe(true);
		expect(panel!.hasAttribute('data-closed')).toBe(true);

		m.unmount();
	});

	// Per AccordionPanel.test.tsx:89 — a panel-level prop overrides the root default.
	it('passes root hiddenUntilFound to closed panels and allows panel overrides', async () => {
		const m = mount(() =>
			createElement(Accordion.Root, {
				hiddenUntilFound: true,
				children: [
					item(0, 'Trigger 1', PANEL_CONTENT_1),
					item(1, 'Trigger 2', PANEL_CONTENT_2, { panelProps: { hiddenUntilFound: false } }),
				],
			}),
		);
		await settle();

		expect(queryByText(m.container, PANEL_CONTENT_1)).not.toBe(null);
		expect(queryByText(m.container, PANEL_CONTENT_2)).toBe(null);

		m.unmount();
	});
});
