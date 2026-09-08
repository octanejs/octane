// OCTANE DIVERGENCE[user-event]: Upstream's user-event helper depends on React's
// synthetic act integration; this adapter dispatches the same native pointer
// and keyboard sequence through Octane's testing-library act boundary.
import { act } from '@octanejs/testing-library';

type PointerStep = {
	keys?: '[MouseLeft>]' | '[/MouseLeft]' | '[MouseRight>]' | '[/MouseRight]';
	coords?: { clientX: number; clientY: number };
};

let clientX = 0;
let clientY = 0;
let buttons = 0;

export async function pointer(steps: PointerStep[]): Promise<void> {
	for (const step of steps) {
		const previousX = clientX;
		const previousY = clientY;
		clientX = step.coords?.clientX ?? clientX;
		clientY = step.coords?.clientY ?? clientY;
		let type = 'pointermove';
		let button = -1;
		if (step.keys === '[MouseLeft>]') {
			type = 'pointerdown';
			button = 0;
			buttons |= 1;
		} else if (step.keys === '[/MouseLeft]') {
			type = 'pointerup';
			button = 0;
			buttons &= ~1;
		} else if (step.keys === '[MouseRight>]') {
			type = 'pointerdown';
			button = 2;
			buttons |= 2;
		} else if (step.keys === '[/MouseRight]') {
			type = 'pointerup';
			button = 2;
			buttons &= ~2;
		}
		const event = new PointerEvent(type, {
			bubbles: true,
			button,
			buttons,
			clientX,
			clientY,
			pointerId: 1,
			pointerType: 'mouse',
		});
		Object.defineProperties(event, {
			movementX: { configurable: true, value: clientX - previousX },
			movementY: { configurable: true, value: clientY - previousY },
		});
		act(() => document.dispatchEvent(event));
		if (step.keys === '[/MouseRight]') {
			if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
			act(() =>
				document.dispatchEvent(
					new MouseEvent('contextmenu', { bubbles: true, button: 2, clientX, clientY }),
				),
			);
		}
		await Promise.resolve();
	}
}

export async function type(element: HTMLElement, text: string): Promise<void> {
	for (const match of text.matchAll(/\{([^}]+)\}/g)) {
		act(() =>
			element.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: match[1] })),
		);
		await Promise.resolve();
	}
}

export default { pointer, type };
