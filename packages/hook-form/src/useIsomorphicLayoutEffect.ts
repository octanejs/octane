// Vendored from react-hook-form@7.81.0 src/useIsomorphicLayoutEffect.ts (octane port).
import { useEffect, useLayoutEffect } from 'octane';

import isWeb from './utils/isWeb';

export const useIsomorphicLayoutEffect = isWeb ? useLayoutEffect : useEffect;
