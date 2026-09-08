import { createSubSlot, useCallback, useEffect, useMemo, useState } from 'octane';

import type { OTPInputProps } from './types';

const PWM_BADGE_MARGIN_RIGHT = 18;
const PWM_BADGE_SPACE_WIDTH_PX = 40;
const PWM_BADGE_SPACE_WIDTH = `${PWM_BADGE_SPACE_WIDTH_PX}px` as const;

function availableBadgeSpace(container: HTMLElement): number {
	const containerRight = container.getBoundingClientRect().right;
	let element: HTMLElement | null = container;
	while (element) {
		if (getComputedStyle(element).overflowX !== 'visible') {
			const rect = element.getBoundingClientRect();
			return rect.left + element.clientLeft + element.clientWidth - containerRight;
		}
		element = element.parentElement;
	}
	return document.documentElement.clientWidth - containerRight;
}

export const PASSWORD_MANAGERS_SELECTORS = [
	'[data-lastpass-icon-root]',
	'com-1password-button',
	'[data-dashlanecreated]',
	'[style$="2147483647 !important;"]',
].join(',');

const subSlot = createSubSlot({
	parentPrefix: 'input-otp:usePasswordManagerBadge',
	includeParentDescription: false,
	global: false,
});

export function usePasswordManagerBadge(
	options: {
		containerRef: { current: HTMLDivElement | null };
		inputRef: { current: HTMLInputElement | null };
		pushPasswordManagerStrategy: OTPInputProps['pushPasswordManagerStrategy'];
		isFocused: boolean;
	},
	slot?: symbol,
) {
	const { containerRef, inputRef, pushPasswordManagerStrategy, isFocused } = options;
	const [hasPWMBadge, setHasPWMBadge] = useState(false, subSlot(slot, 'badge'));
	const [hasPWMBadgeSpace, setHasPWMBadgeSpace] = useState(false, subSlot(slot, 'space'));
	const [done, setDone] = useState(false, subSlot(slot, 'done'));

	const willPushPWMBadge = useMemo(
		() => {
			if (pushPasswordManagerStrategy === 'none') return false;
			const strategy = pushPasswordManagerStrategy as string | undefined;
			return (
				(strategy === 'increase-width' || strategy === 'experimental-no-flickering') &&
				hasPWMBadge &&
				hasPWMBadgeSpace
			);
		},
		[hasPWMBadge, hasPWMBadgeSpace, pushPasswordManagerStrategy],
		subSlot(slot, 'will-push'),
	);

	const trackPWMBadge = useCallback(
		() => {
			const container = containerRef.current;
			const input = inputRef.current;
			if (
				!container ||
				!input ||
				done ||
				pushPasswordManagerStrategy === 'none' ||
				typeof document === 'undefined'
			) {
				return;
			}

			const bounds = container.getBoundingClientRect();
			const x = bounds.left + container.offsetWidth - PWM_BADGE_MARGIN_RIGHT;
			const y = bounds.top + container.offsetHeight / 2;
			const knownBadges = document.querySelectorAll(PASSWORD_MANAGERS_SELECTORS);
			if (knownBadges.length === 0 && document.elementFromPoint(x, y) === container) return;

			setHasPWMBadgeSpace(availableBadgeSpace(container) >= PWM_BADGE_SPACE_WIDTH_PX);
			setHasPWMBadge(true);
			setDone(true);
		},
		[containerRef, inputRef, done, pushPasswordManagerStrategy],
		subSlot(slot, 'track'),
	);

	useEffect(
		() => {
			const container = containerRef.current;
			if (!container || pushPasswordManagerStrategy === 'none' || typeof window === 'undefined') {
				return;
			}
			const mountedContainer = container;
			function checkHasSpace() {
				setHasPWMBadgeSpace(availableBadgeSpace(mountedContainer) >= PWM_BADGE_SPACE_WIDTH_PX);
			}
			checkHasSpace();
			const interval = setInterval(checkHasSpace, 1000);
			return () => clearInterval(interval);
		},
		[containerRef, pushPasswordManagerStrategy],
		subSlot(slot, 'space-effect'),
	);

	useEffect(
		() => {
			if (typeof document === 'undefined') return;
			const focused = isFocused || document.activeElement === inputRef.current;
			if (pushPasswordManagerStrategy === 'none' || !focused) return;
			const timers = [
				setTimeout(trackPWMBadge, 0),
				setTimeout(trackPWMBadge, 2000),
				setTimeout(trackPWMBadge, 5000),
				setTimeout(() => setDone(true), 6000),
			];
			return () => timers.forEach(clearTimeout);
		},
		[inputRef, isFocused, pushPasswordManagerStrategy, trackPWMBadge],
		subSlot(slot, 'track-effect'),
	);

	return { hasPWMBadge, willPushPWMBadge, PWM_BADGE_SPACE_WIDTH };
}
