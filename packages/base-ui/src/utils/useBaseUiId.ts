// Ported from .base-ui/packages/react/src/internals/useBaseUiId.ts (v1.6.0), which
// wraps @base-ui/utils/useId with the 'base-ui' prefix. Base UI's util calls
// React.useId() unconditionally, then returns `idOverride ?? `base-ui-${reactId}``.
// octane's useId is always available and SSR-stable, so React's mount-guard/global
// fallback dance collapses away — a caller-supplied id wins; otherwise the generated
// id is `base-ui-<octaneId>`.
//
// SLOT: plain-`.ts` hook; the trailing arg is the caller's slot.
import { useId as octaneUseId } from 'octane';

import { S, splitSlot } from '../internal';

export function useBaseUiId(...args: any[]): string | undefined {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useBaseUiId');
	const idOverride = user[0] as string | undefined;
	const id = octaneUseId(slot);
	return idOverride ?? `base-ui-${id}`;
}
