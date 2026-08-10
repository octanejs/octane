import { describe, it, expect } from 'vitest';
import { act, mount } from '../../octane/tests/_helpers';
import {
	PressButton,
	DisabledPressButton,
	LongPressButton,
	MoveBox,
	ResponderCase,
} from './_fixtures/press.tsx';

// @octanejs/aria interactions — the press family (usePress / useLongPress / useMove /
// PressResponder) driven through octane's NATIVE delegated events in jsdom.
//
// jsdom 29 implements PointerEvent, so usePress/useMove run their real pointer-event
// branch (not the upstream test-only mouse fallback). Pointer inits carry non-default
// width/height/pressure/detail so they read as REAL pointers, not assistive-technology
// "virtual" ones.

function pointerEvent(type: string, init: PointerEventInit = {}): PointerEvent {
	return new PointerEvent(type, {
		bubbles: true,
		cancelable: true,
		button: 0,
		pointerId: 1,
		pointerType: 'mouse',
		width: 20,
		height: 20,
		pressure: 0.5,
		detail: 1,
		...init,
	});
}

function keyboardEvent(type: string, key: string): KeyboardEvent {
	return new KeyboardEvent(type, { key, bubbles: true, cancelable: true });
}

// A full mouse-style press: pointerdown on the target, then pointerup + the browser's
// ensuing click (usePress intentionally waits for click to complete the press).
async function pressCycle(btn: HTMLElement, clientX = 5, clientY = 5) {
	await act(() => {
		btn.dispatchEvent(pointerEvent('pointerdown', { clientX, clientY }));
	});
	await act(() => {
		btn.dispatchEvent(pointerEvent('pointerup', { clientX, clientY }));
		btn.dispatchEvent(
			new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1, clientX, clientY }),
		);
	});
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('@octanejs/aria — usePress', () => {
	it('fires the press event sequence for a pointer interaction', async () => {
		const r = mount(PressButton);
		const btn = r.container.querySelector('button')!;

		await pressCycle(btn);

		expect(btn.textContent).toBe(
			[
				'pressstart:mouse',
				'change:true',
				'pressup:mouse',
				'pressend:mouse',
				'change:false',
				'press:mouse',
				'click',
			].join(','),
		);
		r.unmount();
	});

	it('reflects isPressed in the data attribute while pressed', async () => {
		const r = mount(PressButton);
		const btn = r.container.querySelector('button')!;

		expect(btn.hasAttribute('data-pressed')).toBe(false);
		await act(() => {
			btn.dispatchEvent(pointerEvent('pointerdown', { clientX: 5, clientY: 5 }));
		});
		expect(btn.getAttribute('data-pressed')).toBe('true');

		await act(() => {
			btn.dispatchEvent(pointerEvent('pointerup', { clientX: 5, clientY: 5 }));
			btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
		});
		expect(btn.hasAttribute('data-pressed')).toBe(false);
		r.unmount();
	});

	it('fires onPress exactly once per click', async () => {
		const r = mount(PressButton);
		const btn = r.container.querySelector('button')!;

		await pressCycle(btn);
		expect(btn.textContent!.split(',').filter((e) => e === 'press:mouse')).toHaveLength(1);

		await pressCycle(btn);
		expect(btn.textContent!.split(',').filter((e) => e === 'press:mouse')).toHaveLength(2);
		r.unmount();
	});

	it('treats element.click() as a virtual (screen reader) press', async () => {
		const r = mount(PressButton);
		const btn = r.container.querySelector('button')!;

		await act(() => {
			btn.click();
		});

		expect(btn.textContent).toBe(
			[
				'pressstart:virtual',
				'change:true',
				'pressup:virtual',
				'pressend:virtual',
				'change:false',
				'press:virtual',
				'click',
			].join(','),
		);
		r.unmount();
	});

	it('presses via keyboard Enter on a button', async () => {
		const r = mount(PressButton);
		const btn = r.container.querySelector('button')!;

		await act(() => {
			btn.dispatchEvent(keyboardEvent('keydown', 'Enter'));
		});
		expect(btn.getAttribute('data-pressed')).toBe('true');

		await act(() => {
			btn.dispatchEvent(keyboardEvent('keyup', 'Enter'));
		});

		expect(btn.textContent).toBe(
			[
				'pressstart:keyboard',
				'change:true',
				'pressup:keyboard',
				'pressend:keyboard',
				'change:false',
				'press:keyboard',
				'click',
			].join(','),
		);
		r.unmount();
	});

	it('presses via keyboard Space, and Space keyup triggers click semantics', async () => {
		const r = mount(PressButton);
		const btn = r.container.querySelector('button')!;

		await act(() => {
			btn.dispatchEvent(keyboardEvent('keydown', ' '));
			btn.dispatchEvent(keyboardEvent('keyup', ' '));
		});

		const events = btn.textContent!.split(',');
		expect(events).toContain('pressstart:keyboard');
		expect(events).toContain('press:keyboard');
		// The Space keyup dispatches a synthetic click for onClick compatibility.
		expect(events).toContain('click');
		// One press per keyboard activation.
		expect(events.filter((e) => e === 'press:keyboard')).toHaveLength(1);
		r.unmount();
	});

	it('isDisabled suppresses every press event across pointer, keyboard, and virtual clicks', async () => {
		const r = mount(DisabledPressButton);
		const btn = r.container.querySelector('button')!;

		await pressCycle(btn);
		await act(() => {
			btn.dispatchEvent(keyboardEvent('keydown', 'Enter'));
			btn.dispatchEvent(keyboardEvent('keyup', 'Enter'));
		});
		await act(() => {
			btn.click();
		});

		expect(btn.textContent).toBe('');
		expect(btn.hasAttribute('data-pressed')).toBe(false);
		r.unmount();
	});
});

describe('@octanejs/aria — useLongPress', () => {
	it('fires onLongPress after the threshold while held', async () => {
		const r = mount(LongPressButton);
		const btn = r.container.querySelector('button')!;

		await act(() => {
			btn.dispatchEvent(pointerEvent('pointerdown', { clientX: 5, clientY: 5 }));
		});
		// Threshold is 50ms; wait it out on real timers.
		await act(async () => {
			await sleep(120);
		});

		expect(btn.textContent).toBe(
			['longpressstart:mouse', 'longpressend:mouse', 'longpress:mouse'].join(','),
		);
		r.unmount();
	});

	it('releasing before the threshold cancels the long press', async () => {
		const r = mount(LongPressButton);
		const btn = r.container.querySelector('button')!;

		await act(() => {
			btn.dispatchEvent(pointerEvent('pointerdown', { clientX: 5, clientY: 5 }));
			btn.dispatchEvent(pointerEvent('pointerup', { clientX: 5, clientY: 5 }));
			btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
		});
		await act(async () => {
			await sleep(120);
		});

		const events = btn.textContent!.split(',');
		expect(events).toContain('longpressstart:mouse');
		expect(events).toContain('longpressend:mouse');
		expect(events.some((e) => e.startsWith('longpress:'))).toBe(false);
		r.unmount();
	});

	it('exposes the accessibility description while enabled', async () => {
		const r = mount(LongPressButton);
		const btn = r.container.querySelector('button')!;

		const describedBy = btn.getAttribute('aria-describedby');
		expect(describedBy).toBeTruthy();
		const description = document.getElementById(describedBy!);
		expect(description?.textContent).toBe('Long press to activate');
		r.unmount();
	});
});

describe('@octanejs/aria — useMove', () => {
	it('reports pointer move deltas between movestart and moveend', async () => {
		const r = mount(MoveBox);
		const box = r.container.querySelector('[data-testid="box"]') as HTMLElement;

		await act(() => {
			box.dispatchEvent(pointerEvent('pointerdown', { clientX: 10, clientY: 10 }));
		});
		await act(() => {
			window.dispatchEvent(pointerEvent('pointermove', { clientX: 15, clientY: 20 }));
		});
		await act(() => {
			window.dispatchEvent(pointerEvent('pointerup', { clientX: 15, clientY: 20 }));
		});

		expect(box.textContent).toBe(['start:mouse', 'move:mouse:5,10', 'end:mouse'].join(';'));
		r.unmount();
	});

	it('moves with the arrow keys', async () => {
		const r = mount(MoveBox);
		const box = r.container.querySelector('[data-testid="box"]') as HTMLElement;

		await act(() => {
			box.dispatchEvent(keyboardEvent('keydown', 'ArrowRight'));
		});
		await act(() => {
			box.dispatchEvent(keyboardEvent('keydown', 'ArrowDown'));
		});

		expect(box.textContent).toBe(
			[
				'start:keyboard',
				'move:keyboard:1,0',
				'end:keyboard',
				'start:keyboard',
				'move:keyboard:0,1',
				'end:keyboard',
			].join(';'),
		);
		r.unmount();
	});
});

describe('@octanejs/aria — PressResponder', () => {
	it('merges responder press handlers into the registered child', async () => {
		const r = mount(ResponderCase);
		const btn = r.container.querySelector('[data-testid="btn"]') as HTMLElement;
		const log = r.container.querySelector('[data-testid="log"]')!;

		await act(() => {
			btn.click();
		});

		// Context handlers merge ahead of the child's own (mergeProps chain order).
		expect(log.textContent).toBe('responder-press,child-press');
		r.unmount();
	});
});
