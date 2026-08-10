import loader from '@monaco-editor/loader';
import { useEffect, useState } from 'octane';

import { isLoaderCancelation } from '../../loader';
import type { Monaco } from '../../types';

export function useMonaco(): Monaco | null {
	const [monaco, setMonaco] = useState<Monaco | null>(loader.__getMonacoInstance());

	useEffect(() => {
		if (monaco) return;

		let active = true;
		const request = loader.init();
		request.then((loadedMonaco) => {
			if (active) setMonaco(loadedMonaco);
		}).catch((error: unknown) => {
			if (active && !isLoaderCancelation(error)) {
				console.error('Monaco initialization: error:', error);
			}
		});

		return () => {
			active = false;
			request.cancel();
		};
	}, [monaco]);

	return monaco;
}

export default useMonaco;
