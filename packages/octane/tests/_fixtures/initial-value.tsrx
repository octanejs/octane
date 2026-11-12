'use strong';

import { useInitialValue } from 'octane';

export function InitialValue({ factory }: { factory: () => { label: string } | undefined }) @{
	const initial = useInitialValue(factory);
	<p>{initial?.label ?? 'empty'}</p>
}
