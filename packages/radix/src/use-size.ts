// Ported from @radix-ui/react-use-size (source:
// .radix-primitives/packages/react/use-size/src/use-size.tsx). Tracks an element's
// border-box size via ResizeObserver (guarded for environments without it, e.g. jsdom —
// there the initial offset measurement is still reported).
import { useLayoutEffect, useState } from 'octane';

import { S, splitSlot, subSlot } from './internal';

export function useSize(...args: any[]): { width: number; height: number } | undefined {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useSize');
	const element = user[0] as HTMLElement | null;
	const [size, setSize] = useState<{ width: number; height: number } | undefined>(
		undefined,
		subSlot(slot, 'size'),
	);

	useLayoutEffect(
		() => {
			if (element) {
				// Provide size as early as possible.
				setSize({ width: element.offsetWidth, height: element.offsetHeight });
				if (typeof ResizeObserver === 'undefined') return;
				const resizeObserver = new ResizeObserver((entries) => {
					if (!Array.isArray(entries) || !entries.length) return;
					const entry = entries[0]!;
					let width: number;
					let height: number;
					if ('borderBoxSize' in entry) {
						const borderSizeEntry = (entry as any)['borderBoxSize'];
						// Iron out differences between browsers.
						const borderSize = Array.isArray(borderSizeEntry)
							? borderSizeEntry[0]
							: borderSizeEntry;
						width = borderSize['inlineSize'];
						height = borderSize['blockSize'];
					} else {
						// For browsers that don't support `borderBoxSize` we calculate it
						// ourselves to get the correct border box.
						width = element.offsetWidth;
						height = element.offsetHeight;
					}
					setSize({ width, height });
				});
				resizeObserver.observe(element, { box: 'border-box' });
				return () => resizeObserver.unobserve(element);
			} else {
				// Only reset to `undefined` when the element becomes `null`, not if it
				// changes to another element.
				setSize(undefined);
			}
		},
		[element],
		subSlot(slot, 'e'),
	);
	return size;
}
