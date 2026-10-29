import { useMemo } from 'octane';

import type { UniqueIdentifier } from '../../../types';

let key = 0;

export function useKey(id: UniqueIdentifier | undefined) {
	return useMemo(() => {
		if (id == null) {
			return;
		}

		key++;
		return key;
	}, [id]);
}
