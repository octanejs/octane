import { useRef } from 'octane';
import { IDENTITY_FUNCTION } from '../../constants';
import { getImperativeGroupMethods } from '../../global/utils/getImperativeGroupMethods';
import { subSlot } from '../../internal';
import { useIsomorphicLayoutEffect } from '../../hooks/useIsomorphicLayoutEffect';
import type { GroupImperativeHandle, GroupProps } from './types';

export function useGroupImperativeHandle(
	groupId: string,
	groupRef: GroupProps['groupRef'],
	slot?: symbol,
) {
	const imperativeGroupRef = useRef<GroupImperativeHandle>(
		{
			getLayout: () => ({}),
			setLayout: IDENTITY_FUNCTION,
		},
		subSlot(slot, 'ref'),
	);

	useIsomorphicLayoutEffect(
		() => {
			Object.assign(imperativeGroupRef.current, getImperativeGroupMethods({ groupId }));
			assignRef(groupRef, imperativeGroupRef.current);
			return () => assignRef(groupRef, null);
		},
		[groupId, groupRef],
		subSlot(slot, 'effect'),
	);
}

function assignRef(ref: GroupProps['groupRef'], value: GroupImperativeHandle | null): void {
	if (isRefArray(ref)) {
		for (const nested of ref) assignRef(nested, value);
	} else if (typeof ref === 'function') {
		(ref as (next: GroupImperativeHandle | null) => void)(value);
	} else if (ref) {
		(ref as { current: GroupImperativeHandle | null }).current = value;
	}
}

function isRefArray(
	ref: GroupProps['groupRef'],
): ref is readonly NonNullable<GroupProps['groupRef']>[] {
	return Array.isArray(ref);
}
