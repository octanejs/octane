// Ported from .base-ui/packages/react/src/direction-context/DirectionContext.tsx. Reading
// direction ('ltr' | 'rtl'); `useDirection()` reads the nearest provider, defaulting to
// 'ltr'. (Base UI's `DirectionProvider` is a Phase-later public part; only the context +
// hook are needed by the composite system now.)
import { createContext, useContext } from 'octane';

import type { TextDirection } from './composite/keys';

export type { TextDirection };

export const DirectionContext = createContext<TextDirection | undefined>(undefined);

export function useDirection(): TextDirection {
	return useContext(DirectionContext) ?? 'ltr';
}
