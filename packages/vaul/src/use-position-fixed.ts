import { useCallback, useEffect, useRef, useState } from 'octane';
import { isSafari } from './browser';
import { subSlot } from './internal';

let previousBodyPosition: Record<string, string> | null = null;

/**
 * This hook is necessary to prevent buggy behavior on iOS devices (need to test on Android).
 * I won't get into too much detail about what bugs it solves, but so far I've found that setting the body to `position: fixed` is the most reliable way to prevent those bugs.
 * Issues that this hook solves:
 * https://github.com/emilkowalski/vaul/issues/435
 * https://github.com/emilkowalski/vaul/issues/433
 * And more that I discovered, but were just not reported.
 */

export function usePositionFixed(
	{
		isOpen,
		modal,
		nested,
		hasBeenOpened,
		preventScrollRestoration,
		noBodyStyles,
	}: {
		isOpen: boolean;
		modal: boolean;
		nested: boolean;
		hasBeenOpened: boolean;
		preventScrollRestoration: boolean;
		noBodyStyles: boolean;
	},
	slot?: symbol,
) {
	const [activeUrl, setActiveUrl] = useState(
		() => (typeof window !== 'undefined' ? window.location.href : ''),
		subSlot(slot, 'url'),
	);
	const scrollPos = useRef(0, subSlot(slot, 'scroll'));

	const setPositionFixed = useCallback(
		() => {
			// All browsers on iOS will return true here.
			if (!isSafari()) return;

			// If previousBodyPosition is already set, don't set it again.
			if (previousBodyPosition === null && isOpen && !noBodyStyles) {
				previousBodyPosition = {
					position: document.body.style.position,
					top: document.body.style.top,
					left: document.body.style.left,
					height: document.body.style.height,
					right: 'unset',
				};

				// Update the dom inside an animation frame
				const { scrollX, innerHeight } = window;

				document.body.style.setProperty('position', 'fixed', 'important');
				Object.assign(document.body.style, {
					top: `${-scrollPos.current}px`,
					left: `${-scrollX}px`,
					right: '0px',
					height: 'auto',
				});

				window.setTimeout(
					() =>
						window.requestAnimationFrame(() => {
							// Attempt to check if the bottom bar appeared due to the position change
							const bottomBarHeight = innerHeight - window.innerHeight;
							if (bottomBarHeight && scrollPos.current >= innerHeight) {
								// Move the content further up so that the bottom bar doesn't hide it
								document.body.style.top = `${-(scrollPos.current + bottomBarHeight)}px`;
							}
						}),
					300,
				);
			}
		},
		[isOpen, noBodyStyles],
		subSlot(slot, 'fix'),
	);

	const restorePositionSetting = useCallback(
		() => {
			// All browsers on iOS will return true here.
			if (!isSafari()) return;

			if (previousBodyPosition !== null && !noBodyStyles) {
				// Convert the position from "px" to Int
				const y = -parseInt(document.body.style.top, 10);
				const x = -parseInt(document.body.style.left, 10);

				// Restore styles
				Object.assign(document.body.style, previousBodyPosition);

				window.requestAnimationFrame(() => {
					if (preventScrollRestoration && activeUrl !== window.location.href) {
						setActiveUrl(window.location.href);
						return;
					}

					window.scrollTo(x, y);
				});

				previousBodyPosition = null;
			}
		},
		[activeUrl, noBodyStyles, preventScrollRestoration],
		subSlot(slot, 'restore'),
	);

	useEffect(
		() => {
			if (!isSafari()) return;

			function onScroll() {
				scrollPos.current = window.scrollY;
			}

			onScroll();

			window.addEventListener('scroll', onScroll);

			return () => {
				window.removeEventListener('scroll', onScroll);
			};
		},
		[],
		subSlot(slot, 'scroll-effect'),
	);

	useEffect(
		() => {
			if (!modal) return;

			return () => {
				if (typeof document === 'undefined') return;

				// Another drawer is opened, safe to ignore the execution
				const hasDrawerOpened = !!document.querySelector('[data-vaul-drawer]');
				if (hasDrawerOpened) return;

				restorePositionSetting();
			};
		},
		[modal, restorePositionSetting],
		subSlot(slot, 'cleanup-effect'),
	);

	useEffect(
		() => {
			if (nested || !hasBeenOpened) return;
			// This is needed to force Safari toolbar to show **before** the drawer starts animating to prevent a gnarly shift from happening
			if (isOpen) {
				// avoid for standalone mode (PWA)
				const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
				!isStandalone && setPositionFixed();

				if (!modal) {
					window.setTimeout(() => {
						restorePositionSetting();
					}, 500);
				}
			} else {
				restorePositionSetting();
			}
		},
		[isOpen, hasBeenOpened, activeUrl, modal, nested, setPositionFixed, restorePositionSetting],
		subSlot(slot, 'position-effect'),
	);

	return { restorePositionSetting };
}
