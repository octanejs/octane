import { useLayoutEffect, useState } from 'octane';
import type { HTMLAttributes } from 'react';
import { getSlot, subSlot } from '../internal';
import { isRtl } from '../utils/isRtl';

export function useIsRtl(
	element: HTMLElement | null,
	dir: HTMLAttributes<HTMLElement>['dir'],
	...rest: unknown[]
) {
	const slot = getSlot(rest);
	const [value, setValue] = useState(dir === 'rtl', subSlot(slot, 'value'));

	useLayoutEffect(
		() => {
			if (element) {
				if (!dir) {
					setValue(isRtl(element));
				}
			}
		},
		[dir, element],
		subSlot(slot, 'effect'),
	);

	return value;
}
