import { useEffect, useRef } from 'octane';
import { errorMessages } from '@xyflow/system';

import { useStoreApi } from '../../hooks/useStore';

// Kept module-local so browser consumers do not need `@types/node`.
declare const process: { env: { NODE_ENV?: string } };

export function useStylesLoadedWarning() {
	const store = useStoreApi();
	const checked = useRef(false);

	useEffect(() => {
		if (process.env.NODE_ENV === 'development') {
			if (!checked.current) {
				const pane = document.querySelector('.react-flow__pane');

				if (pane && !(window.getComputedStyle(pane).zIndex === '1')) {
					store.getState().onError?.('013', errorMessages['error013']('react'));
				}

				checked.current = true;
			}
		}
	}, []);
}
