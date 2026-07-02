// Ported from @radix-ui/react-id. Radix ids are `radix-` + the framework's useId (so they
// read as Radix-owned in the DOM and never collide with app ids); a caller-supplied
// `deterministicId` wins. React's mount-guard dance (useState + layout-effect fallback for
// pre-18 React) collapses away — octane's `useId` is always available and SSR-stable.
import { useId as octaneUseId } from 'octane';

import { S, splitSlot } from './internal';

export function useId(...args: any[]): string {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useId');
	const deterministicId = user[0] as string | undefined;
	const id = octaneUseId(slot);
	return deterministicId || `radix-${id}`;
}
