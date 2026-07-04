// Ported from .base-ui/packages/react/src/utils/useRegisteredLabelId.ts. Generates a
// stable id (via useBaseUiId) and registers it with the owning Root through a layout
// effect (`setLabelId(id)`; cleared on unmount) — the Root reflects it as
// `aria-labelledby`. Shared by Meter.Label / Progress.Label.
//
// SLOT: plain-`.ts` hook; the trailing arg is the caller's slot.
import { useLayoutEffect } from 'octane';

import { S, splitSlot, subSlot } from '../internal';
import { useBaseUiId } from './useBaseUiId';

export function useRegisteredLabelId(...args: any[]): string | undefined {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useRegisteredLabelId');
	const idProp = user[0] as string | undefined;
	const setLabelId = user[1] as (id: string | undefined) => void;

	const id = useBaseUiId(idProp, subSlot(slot, 'id'));

	useLayoutEffect(
		() => {
			setLabelId(id);
			return () => {
				setLabelId(undefined);
			};
		},
		[id, setLabelId],
		subSlot(slot, 'e:label'),
	);

	return id;
}
