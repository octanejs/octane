// Port of Base UI v1.6.0's own Collapsible suite:
//   .base-ui/packages/react/src/collapsible/root/CollapsibleRoot.test.tsx
//   .base-ui/packages/react/src/collapsible/trigger/CollapsibleTrigger.test.tsx
//
// This is the parity proof for the port: the assertions are upstream's, unchanged, so a
// behavioral drift in @octanejs/base-ui fails the same test it would fail in Base UI. Each `it`
// cites its upstream line. What IS adapted is only the harness — upstream drives
// `@mui/internal-test-utils` (`createRenderer`, `screen`, `user`); here it is the repo's `mount`
// helper and native events, since octane's events are native and delegated.
//
// `describeConformance` is not ported: it is upstream's shared render/ref/className/render-prop
// matrix, and the equivalent surface is already covered for this package by the
// `useRenderElement` tests. The per-component assertions below are the component-specific half.
import { describe, expect, it, vi } from 'vitest';
import { createElement, useState } from 'octane';
import { Collapsible } from '@octanejs/base-ui/collapsible';
import { REASONS } from '@octanejs/base-ui/utils/createChangeEventDetails';
import { flushSync } from '../../../octane/src/index.js';
import { flushEffects, mount } from '../../../octane/tests/_helpers';

const PANEL_CONTENT = 'This is panel content';

// The panel's open/close crosses a transition status (`starting` → `idle`, `ending` → unmounted)
// that is advanced from layout effects and animation frames, so a state change is not observable
// in the DOM until those have drained.
async function settle(): Promise<void> {
	for (let i = 0; i < 4; i += 1) {
		flushEffects();
		flushSync(() => {});
		await new Promise((resolve) => setTimeout(resolve, 0));
	}
}

function getByRoleButton(container: HTMLElement, name?: string): HTMLElement {
	const buttons = Array.from(container.querySelectorAll('button'));
	const match = name ? buttons.find((b) => b.textContent === name) : buttons[0];
	if (!match) {
		throw new Error(`no button${name ? ` named "${name}"` : ''}`);
	}
	return match;
}

// Testing Library's `getByText` resolves to the element that DIRECTLY owns the text. Matching on
// `textContent` alone would also match every ancestor, and here the outermost match is
// `Collapsible.Root` — which carries `data-open`/`data-closed` of its own, so an attribute
// assertion against it would pass while telling us nothing about the panel. Take the deepest
// match: the one no matching descendant sits below.
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

describe('<Collapsible.Root />', () => {
	describe('ARIA attributes', () => {
		// Per CollapsibleRoot.test.tsx:19
		it('sets ARIA attributes', async () => {
			const m = mount(() =>
				createElement(Collapsible.Root, {
					defaultOpen: true,
					children: [
						createElement(Collapsible.Trigger, { key: 'trigger' }),
						createElement(Collapsible.Panel, { key: 'panel', 'data-testid': 'panel' }),
					],
				}),
			);
			await settle();

			const trigger = getByRoleButton(m.container);
			const panel = m.container.querySelector('[data-testid="panel"]')!;

			expect(trigger.hasAttribute('aria-expanded')).toBe(true);
			expect(trigger.hasAttribute('aria-controls')).toBe(true);
			expect(trigger.getAttribute('aria-controls')).toBe(panel.getAttribute('id'));

			m.unmount();
		});

		// Per CollapsibleRoot.test.tsx:35
		it('references manual panel id in trigger aria-controls', async () => {
			const m = mount(() =>
				createElement(Collapsible.Root, {
					defaultOpen: true,
					children: [
						createElement(Collapsible.Trigger, { key: 'trigger' }),
						createElement(Collapsible.Panel, {
							key: 'panel',
							id: 'custom-panel-id',
							'data-testid': 'panel',
						}),
					],
				}),
			);
			await settle();

			const trigger = getByRoleButton(m.container);
			const panel = m.container.querySelector('[data-testid="panel"]')!;

			expect(trigger.getAttribute('aria-controls')).toBe('custom-panel-id');
			expect(panel.getAttribute('id')).toBe('custom-panel-id');

			m.unmount();
		});
	});

	describe('collapsible status', () => {
		// Per CollapsibleRoot.test.tsx:52
		it('disabled status', async () => {
			const m = mount(() =>
				createElement(Collapsible.Root, {
					disabled: true,
					children: [
						createElement(Collapsible.Trigger, { key: 'trigger' }),
						createElement(Collapsible.Panel, { key: 'panel', 'data-testid': 'panel' }),
					],
				}),
			);
			await settle();

			expect(getByRoleButton(m.container).hasAttribute('data-disabled')).toBe(true);

			m.unmount();
		});

		// Per CollapsibleRoot.test.tsx:65
		it('does not toggle or call onOpenChange when clicked while disabled', async () => {
			const handleOpenChange = vi.fn();
			const m = mount(() =>
				createElement(Collapsible.Root, {
					disabled: true,
					onOpenChange: handleOpenChange,
					children: [
						createElement(Collapsible.Trigger, { key: 'trigger' }, 'Trigger'),
						createElement(Collapsible.Panel, { key: 'panel' }, PANEL_CONTENT),
					],
				}),
			);
			await settle();

			const trigger = getByRoleButton(m.container, 'Trigger');
			await clickAndSettle(trigger);

			expect(handleOpenChange).not.toHaveBeenCalled();
			expect(trigger.getAttribute('aria-expanded')).toBe('false');
			expect(queryByText(m.container, PANEL_CONTENT)).toBe(null);

			m.unmount();
		});
	});

	describe('BaseUIChangeEventDetails', () => {
		// Per CollapsibleRoot.test.tsx:86
		it('calls onOpenChange with eventDetails', async () => {
			const handleOpenChange = vi.fn();
			const m = mount(() =>
				createElement(Collapsible.Root, {
					onOpenChange: handleOpenChange,
					children: [
						createElement(Collapsible.Trigger, { key: 'trigger' }, 'Toggle'),
						createElement(Collapsible.Panel, { key: 'panel' }, PANEL_CONTENT),
					],
				}),
			);
			await settle();

			await clickAndSettle(getByRoleButton(m.container, 'Toggle'));

			expect(handleOpenChange.mock.calls.length).toBe(1);
			const [openArg, details] = handleOpenChange.mock.calls[0] as [boolean, any];
			expect(openArg).toBe(true);
			expect(details).not.toBe(undefined);
			expect(details.reason).toBe(REASONS.triggerPress);
			expect(details.event).toBeInstanceOf(MouseEvent);
			expect(details.isCanceled).toBe(false);
			expect(typeof details.cancel).toBe('function');
			expect(typeof details.allowPropagation).toBe('function');

			m.unmount();
		});

		// Per CollapsibleRoot.test.tsx:110
		it('eventDetails.cancel() prevents opening while uncontrolled', async () => {
			const handleOpenChange = vi.fn((_nextOpen: boolean, eventDetails: any) => {
				eventDetails.cancel();
			});
			const m = mount(() =>
				createElement(Collapsible.Root, {
					onOpenChange: handleOpenChange,
					children: [
						createElement(Collapsible.Trigger, { key: 'trigger' }, 'Toggle'),
						createElement(Collapsible.Panel, { key: 'panel' }, PANEL_CONTENT),
					],
				}),
			);
			await settle();

			const trigger = getByRoleButton(m.container, 'Toggle');
			await clickAndSettle(trigger);

			expect(handleOpenChange).toHaveBeenCalledOnce();
			expect(trigger.getAttribute('aria-expanded')).toBe('false');
			expect(queryByText(m.container, PANEL_CONTENT)).toBe(null);

			m.unmount();
		});

		// Per CollapsibleRoot.test.tsx:132
		it('eventDetails.cancel() prevents closing while uncontrolled', async () => {
			const handleOpenChange = vi.fn((_nextOpen: boolean, eventDetails: any) => {
				eventDetails.cancel();
			});
			const m = mount(() =>
				createElement(Collapsible.Root, {
					defaultOpen: true,
					onOpenChange: handleOpenChange,
					children: [
						createElement(Collapsible.Trigger, { key: 'trigger' }, 'Toggle'),
						createElement(Collapsible.Panel, { key: 'panel' }, PANEL_CONTENT),
					],
				}),
			);
			await settle();

			const trigger = getByRoleButton(m.container, 'Toggle');
			await clickAndSettle(trigger);

			expect(handleOpenChange).toHaveBeenCalledOnce();
			expect(trigger.getAttribute('aria-expanded')).toBe('true');
			expect(queryByText(m.container, PANEL_CONTENT)).not.toBe(null);

			m.unmount();
		});
	});

	describe('open state', () => {
		// Per CollapsibleRoot.test.tsx:156
		it('controlled trigger presses request open and close state changes', async () => {
			function App() {
				const [open, setOpen] = useState(false);
				return createElement(Collapsible.Root, {
					open,
					onOpenChange: setOpen,
					children: [
						createElement(Collapsible.Trigger, { key: 'trigger' }, 'trigger'),
						createElement(Collapsible.Panel, { key: 'panel' }, PANEL_CONTENT),
					],
				});
			}

			const m = mount(App);
			await settle();

			const trigger = getByRoleButton(m.container, 'trigger');

			expect(trigger.getAttribute('aria-expanded')).toBe('false');
			expect(queryByText(m.container, PANEL_CONTENT)).toBe(null);

			await clickAndSettle(trigger);

			expect(trigger.getAttribute('aria-expanded')).toBe('true');
			expect(queryByText(m.container, PANEL_CONTENT)).not.toBe(null);

			await clickAndSettle(trigger);

			expect(trigger.getAttribute('aria-expanded')).toBe('false');
			expect(queryByText(m.container, PANEL_CONTENT)).toBe(null);

			m.unmount();
		});

		// Per CollapsibleRoot.test.tsx:204 — `open` is controlled with NO `onOpenChange`, so only
		// the external button can move it. This is the test that pins `aria-controls` appearing
		// and disappearing with the panel's mount, rather than being permanently present.
		it('controlled mode', async () => {
			function App() {
				const [open, setOpen] = useState(false);
				return createElement('div', {
					children: [
						createElement(Collapsible.Root, {
							key: 'root',
							open,
							children: [
								createElement(Collapsible.Trigger, { key: 'trigger' }, 'trigger'),
								createElement(Collapsible.Panel, { key: 'panel' }, PANEL_CONTENT),
							],
						}),
						createElement(
							'button',
							{ key: 'ext', type: 'button', onClick: () => setOpen(!open) },
							'toggle',
						),
					],
				});
			}

			const m = mount(App);
			await settle();

			const externalTrigger = getByRoleButton(m.container, 'toggle');
			const trigger = getByRoleButton(m.container, 'trigger');

			expect(trigger.hasAttribute('aria-controls')).toBe(false);
			expect(trigger.getAttribute('aria-expanded')).toBe('false');
			expect(queryByText(m.container, PANEL_CONTENT)).toBe(null);

			await clickAndSettle(externalTrigger);

			expect(trigger.getAttribute('aria-expanded')).toBe('true');
			expect(trigger.hasAttribute('aria-controls')).toBe(true);
			expect(queryByText(m.container, PANEL_CONTENT)).not.toBe(null);
			expect(queryByText(m.container, PANEL_CONTENT)!.hasAttribute('data-open')).toBe(true);
			expect(trigger.hasAttribute('data-panel-open')).toBe(true);

			await clickAndSettle(externalTrigger);

			expect(trigger.hasAttribute('aria-controls')).toBe(false);
			expect(trigger.getAttribute('aria-expanded')).toBe('false');
			expect(queryByText(m.container, PANEL_CONTENT)).toBe(null);

			m.unmount();
		});

		// Per CollapsibleRoot.test.tsx:185
		it('does not change controlled open state without an external update', async () => {
			const handleOpenChange = vi.fn();
			const m = mount(() =>
				createElement(Collapsible.Root, {
					open: false,
					onOpenChange: handleOpenChange,
					children: [
						createElement(Collapsible.Trigger, { key: 'trigger' }, 'trigger'),
						createElement(Collapsible.Panel, { key: 'panel' }, PANEL_CONTENT),
					],
				}),
			);
			await settle();

			const trigger = getByRoleButton(m.container, 'trigger');
			await clickAndSettle(trigger);

			expect(handleOpenChange).toHaveBeenCalledOnce();
			expect(trigger.getAttribute('aria-expanded')).toBe('false');
			expect(queryByText(m.container, PANEL_CONTENT)).toBe(null);

			m.unmount();
		});

		// Per CollapsibleRoot.test.tsx:245. Upstream gates its `open state` block behind
		// `describe.skipIf(isJSDOM)` because its measurement paths need real layout. The
		// `animationType === 'none'` path this exercises does not, so it runs here — the
		// open/close cycle and its data attributes are exactly the contract to protect.
		it('uncontrolled mode', async () => {
			const m = mount(() =>
				createElement(Collapsible.Root, {
					defaultOpen: false,
					children: [
						createElement(Collapsible.Trigger, { key: 'trigger' }),
						createElement(Collapsible.Panel, { key: 'panel' }, PANEL_CONTENT),
					],
				}),
			);
			await settle();

			const trigger = getByRoleButton(m.container);

			expect(trigger.hasAttribute('aria-controls')).toBe(false);
			expect(trigger.getAttribute('aria-expanded')).toBe('false');
			expect(queryByText(m.container, PANEL_CONTENT)).toBe(null);

			await clickAndSettle(trigger);

			expect(trigger.getAttribute('aria-expanded')).toBe('true');
			expect(trigger.hasAttribute('aria-controls')).toBe(true);
			expect(queryByText(m.container, PANEL_CONTENT)).not.toBe(null);
			expect(queryByText(m.container, PANEL_CONTENT)!.hasAttribute('data-open')).toBe(true);
			expect(trigger.hasAttribute('data-panel-open')).toBe(true);

			await clickAndSettle(trigger);

			expect(trigger.getAttribute('aria-expanded')).toBe('false');
			expect(trigger.hasAttribute('aria-controls')).toBe(false);
			expect(trigger.hasAttribute('data-panel-open')).toBe(false);
			expect(queryByText(m.container, PANEL_CONTENT)).toBe(null);

			m.unmount();
		});
	});

	describe('state callbacks', () => {
		// Per CollapsibleRoot.test.tsx:278
		it('passes state to className and style callbacks', async () => {
			const m = mount(() =>
				createElement(Collapsible.Root, {
					'data-testid': 'root',
					className: (state: any) => (state.open ? 'root-open' : 'root-closed'),
					style: (state: any) => ({ opacity: state.open ? 1 : 0.5 }),
					children: [
						createElement(
							Collapsible.Trigger,
							{
								key: 'trigger',
								className: (state: any) => (state.open ? 'trigger-open' : 'trigger-closed'),
								style: (state: any) => ({ opacity: state.open ? 1 : 0.5 }),
							},
							'Trigger',
						),
						createElement(
							Collapsible.Panel,
							{
								key: 'panel',
								keepMounted: true,
								'data-testid': 'panel',
								className: (state: any) => (state.open ? 'panel-open' : 'panel-closed'),
								style: (state: any) => ({ opacity: state.open ? 1 : 0.5 }),
							},
							PANEL_CONTENT,
						),
					],
				}),
			);
			await settle();

			const root = m.container.querySelector('[data-testid="root"]') as HTMLElement;
			const trigger = getByRoleButton(m.container, 'Trigger');
			const panel = m.container.querySelector('[data-testid="panel"]') as HTMLElement;

			expect(root.classList.contains('root-closed')).toBe(true);
			expect(root.style.opacity).toBe('0.5');
			expect(trigger.classList.contains('trigger-closed')).toBe(true);
			expect(trigger.style.opacity).toBe('0.5');
			expect(panel.classList.contains('panel-closed')).toBe(true);
			expect(panel.style.opacity).toBe('0.5');

			await clickAndSettle(trigger);

			expect(root.classList.contains('root-open')).toBe(true);
			expect(root.style.opacity).toBe('1');
			expect(trigger.classList.contains('trigger-open')).toBe(true);
			expect(trigger.style.opacity).toBe('1');
			expect(panel.classList.contains('panel-open')).toBe(true);
			expect(panel.style.opacity).toBe('1');

			m.unmount();
		});
	});
});

// Upstream's Panel suite is 20 tests, but 17 sit behind `describe.skipIf(isJSDOM)` or
// `'onbeforematch' in window` because they assert scroll-height measurement, real CSS
// transition/keyframe sequencing, `React.Activity`, or find-in-page. Those are browser
// contracts and belong in a browser suite, not a jsdom mock of them. The three below are the
// ones whose contract is observable without layout.
describe('<Collapsible.Panel />', () => {
	// Per CollapsiblePanel.test.tsx:55
	it('prop: keepMounted — does not unmount the panel when true', async () => {
		function App() {
			const [open, setOpen] = useState(false);
			return createElement(Collapsible.Root, {
				open,
				onOpenChange: setOpen,
				children: [
					createElement(Collapsible.Trigger, { key: 'trigger' }),
					createElement(Collapsible.Panel, { key: 'panel', keepMounted: true }, PANEL_CONTENT),
				],
			});
		}

		const m = mount(App);
		await settle();

		const trigger = getByRoleButton(m.container);
		const panel = () => queryByText(m.container, PANEL_CONTENT);

		expect(trigger.getAttribute('aria-expanded')).toBe('false');
		expect(panel()).not.toBe(null);
		expect(panel()!.hidden).toBe(true);
		expect(panel()!.hasAttribute('data-closed')).toBe(true);

		await clickAndSettle(trigger);

		expect(trigger.getAttribute('aria-expanded')).toBe('true');
		expect(trigger.getAttribute('aria-controls')).toBe(panel()!.getAttribute('id'));
		expect(panel()!.hidden).toBe(false);
		expect(panel()!.hasAttribute('data-open')).toBe(true);
		expect(trigger.hasAttribute('data-panel-open')).toBe(true);

		await clickAndSettle(trigger);

		expect(trigger.getAttribute('aria-expanded')).toBe('false');
		expect(trigger.getAttribute('aria-controls')).toBe(null);
		expect(panel()!.hidden).toBe(true);
		expect(panel()!.hasAttribute('data-closed')).toBe(true);

		m.unmount();
	});

	// Per CollapsiblePanel.test.tsx:370 and :401. Upstream asserts these on `renderToString`
	// output, because the bug they protect is a keyframe replaying during the server-rendered
	// first paint. The suppression itself comes from `shouldPreventMountAnimationRef`, which is
	// seeded from `open` at hook init, so the client's FIRST render evaluates the identical
	// expression — that is what is asserted here. What this does not cover is octane's SSR
	// serializer emitting the style; the package's hydration suite owns that surface.
	it('suppresses the initial keyframe animation when rendered open', async () => {
		const m = mount(() =>
			createElement(Collapsible.Root, {
				defaultOpen: true,
				children: [
					createElement(Collapsible.Trigger, { key: 'trigger' }, 'Trigger'),
					createElement(
						Collapsible.Panel,
						{ key: 'panel', className: 'animation-test-panel', 'data-testid': 'panel' },
						PANEL_CONTENT,
					),
				],
			}),
		);

		const panel = m.container.querySelector('[data-testid="panel"]') as HTMLElement;
		expect(panel.style.animationName).toBe('none');

		m.unmount();
	});

	// Per CollapsiblePanel.test.tsx:401 — the same suppression, but the author's animation came
	// in through the inline `style` prop. `animationName` must lose to the override while every
	// other inline animation property the author set survives.
	it('suppresses the initial keyframe animation from inline styles when rendered open', async () => {
		const m = mount(() =>
			createElement(Collapsible.Root, {
				defaultOpen: true,
				children: [
					createElement(Collapsible.Trigger, { key: 'trigger' }, 'Trigger'),
					createElement(
						Collapsible.Panel,
						{
							key: 'panel',
							'data-testid': 'panel',
							style: {
								animationDuration: '100ms',
								animationName: 'panel-slide-down',
								animationTimingFunction: 'linear',
							},
						},
						PANEL_CONTENT,
					),
				],
			}),
		);

		const panel = m.container.querySelector('[data-testid="panel"]') as HTMLElement;
		expect(panel.style.animationName).toBe('none');
		expect(panel.style.animationDuration).toBe('100ms');

		m.unmount();
	});
});

describe('<Collapsible.Trigger />', () => {
	// Per CollapsibleTrigger.test.tsx:20
	it('forwards the id prop', async () => {
		const m = mount(() =>
			createElement(Collapsible.Root, {
				children: createElement(Collapsible.Trigger, { id: 'custom-trigger-id' }, 'Trigger'),
			}),
		);
		await settle();

		expect(getByRoleButton(m.container, 'Trigger').getAttribute('id')).toBe('custom-trigger-id');

		m.unmount();
	});
});
