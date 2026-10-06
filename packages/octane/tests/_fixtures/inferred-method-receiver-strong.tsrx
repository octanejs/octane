'use strong';

import { useEffect } from 'octane';

export function EffectFromOwnMethodStrong(props) @{
	const source = props.source;
	useEffect(() => source.subscribe());
	<span>effect</span>
}

// Strong caches the declaration itself, with the same inferred dependencies.
export function MemoFromOwnMethodStrong(props) @{
	const source = props.source;
	const value = source.read();
	<span>{value as string}</span>
}
