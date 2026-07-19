// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/utils/useViewportSize.ts).
// octane adaptations: hooks come from 'octane'; the public hook gets the binding's slot
// threading (splitSlot/subSlot); the explicit `[]` dep array on the listener effect is
// preserved verbatim.
import { useEffect, useState } from 'octane';

import { getActiveElement, getEventTarget } from './shadowdom/DOMFunctions';
import { isIOS } from './platform';
import { S, splitSlot, subSlot } from '../internal';
import { useIsSSR } from '../ssr/SSRProvider';
import { willOpenKeyboard } from './keyboard';

interface ViewportSize {
	width: number;
	height: number;
}

let visualViewport = typeof document !== 'undefined' && window.visualViewport;

export function useViewportSize(): ViewportSize;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useViewportSize(slot: symbol | undefined): ViewportSize;
export function useViewportSize(...args: any[]): ViewportSize {
	const [, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useViewportSize');

	let isSSR = useIsSSR(subSlot(slot, 'ssr'));
	let [size, setSize] = useState(
		() => (isSSR ? { width: 0, height: 0 } : getViewportSize()),
		subSlot(slot, 'size'),
	);

	useEffect(
		() => {
			let updateSize = (newSize: ViewportSize) => {
				setSize((size: ViewportSize) => {
					if (newSize.width === size.width && newSize.height === size.height) {
						return size;
					}
					return newSize;
				});
			};

			// Use visualViewport api to track available height even on iOS virtual keyboard opening
			let onResize = () => {
				// Ignore updates when zoomed.
				if (visualViewport && visualViewport.scale > 1) {
					return;
				}

				updateSize(getViewportSize());
			};

			// When closing the keyboard, iOS does not fire the visual viewport resize event until the animation is complete.
			// We can anticipate this and resize early by handling the blur event and using the layout size.
			let frame: number;
			let onBlur = (e: FocusEvent) => {
				if (visualViewport && visualViewport.scale > 1) {
					return;
				}

				if (willOpenKeyboard(getEventTarget(e) as Element)) {
					// Wait one frame to see if a new element gets focused.
					frame = requestAnimationFrame(() => {
						let activeElement = getActiveElement();
						if (!activeElement || !willOpenKeyboard(activeElement)) {
							updateSize({
								width: document.documentElement.clientWidth,
								height: document.documentElement.clientHeight,
							});
						}
					});
				}
			};

			updateSize(getViewportSize());

			if (isIOS()) {
				window.addEventListener('blur', onBlur, true);
			}

			if (!visualViewport) {
				window.addEventListener('resize', onResize);
			} else {
				visualViewport.addEventListener('resize', onResize);
			}

			return () => {
				cancelAnimationFrame(frame);
				if (isIOS()) {
					window.removeEventListener('blur', onBlur, true);
				}
				if (!visualViewport) {
					window.removeEventListener('resize', onResize);
				} else {
					visualViewport.removeEventListener('resize', onResize);
				}
			};
		},
		[],
		subSlot(slot, 'listen'),
	);

	return size;
}

/**
 * Get the viewport size without the scrollbar.
 */
function getViewportSize(): ViewportSize {
	return {
		// Multiply by the visualViewport scale to get the "natural" size, unaffected by pinch zooming.
		width: visualViewport
			? // The visual viewport width may include the scrollbar gutter. We should use the minimum width between
				// the visual viewport and the document element to ensure that the scrollbar width is always excluded.
				// See: https://github.com/w3c/csswg-drafts/issues/8099
				Math.min(visualViewport.width * visualViewport.scale, document.documentElement.clientWidth)
			: document.documentElement.clientWidth,
		height: visualViewport
			? visualViewport.height * visualViewport.scale
			: document.documentElement.clientHeight,
	};
}
