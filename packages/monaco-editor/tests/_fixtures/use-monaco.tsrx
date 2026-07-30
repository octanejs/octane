import { useEffect } from 'octane';

import { useMonaco } from '../../src/index';
import type { Monaco } from '../../src/types';

export function UseMonacoProbe(props: { onMonaco(monaco: Monaco | null): void }) @{
	const monaco = useMonaco();
	useEffect(() => {
		props.onMonaco(monaco);
	}, [monaco, props.onMonaco]);

	<div data-ready={monaco !== null ? 'true' : 'false'} />
}
