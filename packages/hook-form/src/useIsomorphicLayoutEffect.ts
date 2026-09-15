// Adapted from react-hook-form@7.88.0 src/useIsomorphicLayoutEffect.ts for Octane.
import { useEffect, useLayoutEffect } from 'octane';

import isWeb from './utils/isWeb';

export const useIsomorphicLayoutEffect = isWeb ? useLayoutEffect : useEffect;
