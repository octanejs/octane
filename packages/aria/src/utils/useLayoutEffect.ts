// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/utils/useLayoutEffect.ts).
// Layout effects never run on the server; the document guard keeps server bundles
// (where `octane` resolves to the server runtime) from scheduling one at all.
import { useLayoutEffect as octaneUseLayoutEffect } from 'octane';

export const useLayoutEffect: typeof octaneUseLayoutEffect =
	typeof document !== 'undefined' ? octaneUseLayoutEffect : ((() => {}) as any);
