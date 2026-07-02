// Ported from @radix-ui/react-focus-guards. Injects a pair of focusable, visually-hidden
// guard spans at the edges of `document.body` so that tabbing out of a focus-trapped
// layer always has somewhere to land (Safari/VoiceOver edge cases). Ref-counted across
// consumers; the spans carry `data-radix-focus-guard`.
import { useEffect } from 'octane';

import { S, splitSlot, subSlot } from './internal';

let count = 0;
let guards: { start: HTMLElement; end: HTMLElement } | null = null;

export function useFocusGuards(...args: any[]): void {
	const [, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useFocusGuards');
	useEffect(
		() => {
			if (!guards) {
				guards = { start: createFocusGuard(), end: createFocusGuard() };
			}
			const { start, end } = guards;
			if (document.body.firstElementChild !== start) {
				document.body.insertAdjacentElement('afterbegin', start);
			}
			if (document.body.lastElementChild !== end) {
				document.body.insertAdjacentElement('beforeend', end);
			}
			count++;
			return () => {
				if (count === 1) {
					guards?.start.remove();
					guards?.end.remove();
					guards = null;
				}
				count = Math.max(0, count - 1);
			};
		},
		[],
		subSlot(slot, 'e'),
	);
}

export function FocusGuards(props: any): any {
	useFocusGuards(S('FocusGuards'));
	return props.children;
}

function createFocusGuard(): HTMLElement {
	const element = document.createElement('span');
	element.setAttribute('data-radix-focus-guard', '');
	element.tabIndex = 0;
	element.style.outline = 'none';
	element.style.opacity = '0';
	element.style.position = 'fixed';
	element.style.pointerEvents = 'none';
	return element;
}
