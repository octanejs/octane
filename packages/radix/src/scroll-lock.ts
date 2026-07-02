// Body scroll lock for modal overlays — the octane replacement for the `react-remove-scroll`
// component Radix's Dialog wraps its overlay in (that library is React-coupled: a component
// + use-sidecar machinery). This util reproduces the observable core — `overflow: hidden`
// on <body> with scrollbar-width padding compensation, ref-counted across overlapping
// locks — as a hook the overlay calls.
//
// DIVERGENCE (documented): react-remove-scroll additionally intercepts wheel/touchmove
// events to allow scrolling inside `shards` while the body is locked, and supports
// pinch-zoom allowances. Those event-level behaviors are not replicated yet; scrollable
// dialog CONTENT still works because the content element itself scrolls (overflow on the
// content), which is the common Radix usage.
import { useEffect } from 'octane';

import { S, splitSlot, subSlot } from './internal';

let lockCount = 0;
let originalOverflow = '';
let originalPaddingRight = '';

function lockBody(): void {
	if (lockCount === 0) {
		const body = document.body;
		originalOverflow = body.style.overflow;
		originalPaddingRight = body.style.paddingRight;
		const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
		if (scrollbarWidth > 0) {
			const computedPadding = parseInt(getComputedStyle(body).paddingRight, 10) || 0;
			body.style.paddingRight = `${computedPadding + scrollbarWidth}px`;
		}
		body.style.overflow = 'hidden';
	}
	lockCount++;
}

function unlockBody(): void {
	lockCount = Math.max(0, lockCount - 1);
	if (lockCount === 0) {
		document.body.style.overflow = originalOverflow;
		document.body.style.paddingRight = originalPaddingRight;
	}
}

/** Lock body scroll while `enabled` (ref-counted across simultaneous consumers). */
export function useScrollLock(...args: any[]): void {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useScrollLock');
	const enabled = (user[0] as boolean | undefined) ?? true;
	useEffect(
		() => {
			if (!enabled) return;
			lockBody();
			return unlockBody;
		},
		[enabled],
		subSlot(slot, 'e'),
	);
}
