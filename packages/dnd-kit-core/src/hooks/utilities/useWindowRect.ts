import { useMemo } from 'octane';

import { getWindowClientRect } from '../../utilities/rect';

export function useWindowRect(element: typeof window | null) {
	return useMemo(() => (element ? getWindowClientRect(element) : null), [element]);
}
