import { afterEach, describe, expect, test } from 'vitest';
import { FocusTrapExtension } from '@lexical/a11y';
import { flushEffects, mount } from '../_helpers';
import { FocusTrapFixture } from '../_fixtures/a11y-hooks.tsrx';

function dispatchTab(target: HTMLElement, shiftKey = false): void {
	target.dispatchEvent(
		new KeyboardEvent('keydown', {
			bubbles: true,
			cancelable: true,
			key: 'Tab',
			shiftKey,
		}),
	);
}

type TrapProps = {
	isActive: boolean;
	buttons?: number;
	initialFocus?: 'firstFocusable' | 'container';
	allowOutside?: (target: HTMLElement) => boolean;
	mounted?: boolean;
};

// Ported from @lexical/react/src/__tests__/unit/useLexicalFocusTrapRef.test.tsx (0.51.0).
// Upstream mounts the Trap under LexicalExtensionComposer, which
// @octanejs/lexical does not port; the fixture builds the editor with
// buildEditorFromExtensions and provides it through LexicalComposerContext.
// Upstream's `root.render(<></>)` unmount is the fixture's `mounted: false`,
// which unmounts the composer and the Trap together.
describe('useLexicalFocusTrapRef', () => {
	let r: ReturnType<typeof mount> | null = null;

	afterEach(() => {
		r?.unmount();
		r = null;
	});

	function render(props: TrapProps): void {
		if (r === null) {
			r = mount(FocusTrapFixture as any, { extension: FocusTrapExtension, ...props });
		} else {
			r.update(FocusTrapFixture as any, { extension: FocusTrapExtension, ...props });
		}
		flushEffects();
	}

	function getByTestId(id: string): HTMLElement {
		const el = r!.container.querySelector<HTMLElement>(`[data-testid="${id}"]`);
		if (el === null) {
			throw new Error(`Element with data-testid=${id} not found`);
		}
		return el;
	}

	test('focuses the first focusable element on activate', () => {
		render({ isActive: true });
		expect(document.activeElement).toBe(getByTestId('btn-0'));
	});

	test('wraps Tab from the last focusable back to the first', () => {
		render({ isActive: true });
		const last = getByTestId('btn-2');
		const first = getByTestId('btn-0');
		last.focus();
		expect(document.activeElement).toBe(last);
		dispatchTab(last);
		expect(document.activeElement).toBe(first);
	});

	test('wraps Shift+Tab from the first focusable back to the last', () => {
		render({ isActive: true });
		const first = getByTestId('btn-0');
		const last = getByTestId('btn-2');
		first.focus();
		dispatchTab(first, true);
		expect(document.activeElement).toBe(last);
	});

	test('deactivates the trap when isActive becomes false', () => {
		render({ isActive: true });
		expect(document.activeElement).toBe(getByTestId('btn-0'));

		render({ isActive: false });

		const outside = document.createElement('button');
		outside.textContent = 'Outside';
		document.body.appendChild(outside);
		outside.focus();
		expect(document.activeElement).toBe(outside);
		document.body.removeChild(outside);
	});

	test('deactivates the trap on unmount', () => {
		render({ isActive: true });
		expect(document.activeElement).toBe(getByTestId('btn-0'));

		render({ isActive: true, mounted: false });

		const outside = document.createElement('button');
		outside.textContent = 'Outside';
		document.body.appendChild(outside);
		outside.focus();
		expect(document.activeElement).toBe(outside);
		document.body.removeChild(outside);
	});

	test('no-op when isActive is false', () => {
		const opener = document.createElement('button');
		document.body.appendChild(opener);
		opener.focus();
		render({ isActive: false });
		expect(document.activeElement).toBe(opener);
		document.body.removeChild(opener);
	});

	test('handles an empty container by preventing Tab without throwing', () => {
		render({ buttons: 0, isActive: true });
		const trap = getByTestId('trap');
		trap.focus();
		expect(() => dispatchTab(trap)).not.toThrow();
	});

	test("focuses the container itself when initialFocus is 'container'", () => {
		render({ initialFocus: 'container', isActive: true });
		expect(document.activeElement).toBe(getByTestId('trap'));
	});

	test("Tab from container (initialFocus 'container') lands on first focusable", () => {
		render({ initialFocus: 'container', isActive: true });
		const trap = getByTestId('trap');
		dispatchTab(trap);
		expect(document.activeElement).toBe(getByTestId('btn-0'));
	});

	test("Shift+Tab from container (initialFocus 'container') lands on last focusable", () => {
		render({ initialFocus: 'container', isActive: true });
		const trap = getByTestId('trap');
		dispatchTab(trap, true);
		expect(document.activeElement).toBe(getByTestId('btn-2'));
	});

	test('advances Tab through middle focusables', () => {
		render({ buttons: 4, isActive: true });
		const btn1 = getByTestId('btn-1');
		btn1.focus();
		dispatchTab(btn1);
		expect(document.activeElement).toBe(getByTestId('btn-2'));
	});

	test('advances Shift+Tab through middle focusables', () => {
		render({ buttons: 4, isActive: true });
		const btn2 = getByTestId('btn-2');
		btn2.focus();
		dispatchTab(btn2, true);
		expect(document.activeElement).toBe(getByTestId('btn-1'));
	});

	test('focusin safety net pulls focus back inside when it escapes', () => {
		const outside = document.createElement('button');
		outside.textContent = 'Outside';
		document.body.appendChild(outside);
		render({ isActive: true });
		outside.focus();
		expect(document.activeElement).toBe(getByTestId('btn-0'));
		document.body.removeChild(outside);
	});

	test('allowOutside lets a matching element keep focus (no pull-back)', () => {
		const outside = document.createElement('button');
		outside.setAttribute('data-allow', 'true');
		outside.textContent = 'Outside';
		document.body.appendChild(outside);
		render({
			allowOutside: (target) => target.getAttribute('data-allow') === 'true',
			isActive: true,
		});
		outside.focus();
		// allowOutside returned true for this target, so the trap does not pull
		// focus back into the container.
		expect(document.activeElement).toBe(outside);
		document.body.removeChild(outside);
	});

	// Octane-specific: `allowOutside` is held in a ref and read at event time,
	// so re-rendering with a fresh inline predicate neither tears down and
	// re-creates the trap (which would restore focus to the opener and then
	// re-focus the first focusable) nor keeps using the stale predicate.
	test('reads the latest allowOutside at event time without re-creating the trap', () => {
		const outside = document.createElement('button');
		outside.setAttribute('data-allow', 'true');
		outside.textContent = 'Outside';
		document.body.appendChild(outside);
		try {
			render({ allowOutside: () => false, isActive: true });
			const btn1 = getByTestId('btn-1');
			btn1.focus();
			expect(document.activeElement).toBe(btn1);

			// The stale predicate rejects the outside target: pulled back.
			outside.focus();
			expect(document.activeElement).toBe(getByTestId('btn-0'));

			btn1.focus();
			render({
				allowOutside: (target) => target.getAttribute('data-allow') === 'true',
				isActive: true,
			});
			// Not re-created: a fresh activation would have moved focus to btn-0.
			expect(document.activeElement).toBe(btn1);

			// The new predicate is consulted at event time.
			outside.focus();
			expect(document.activeElement).toBe(outside);
		} finally {
			document.body.removeChild(outside);
		}
	});
});
