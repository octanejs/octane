'use strong';

import { useEffect, useRef } from 'octane';

export function Widget({ ready }: { ready?: (rejected: boolean) => void }) @{
	const host = useRef<HTMLDivElement | null>(null);
	useEffect(() => {
		const node = host.current;
		if (node === null) return;
		let rejected = false;
		try {
			node.innerHTML = '';
		} catch (error) {
			if (!(error instanceof TypeError)) throw error;
			rejected = true;
		}
		ready?.(rejected);
	});
	<div id="widget" ref={host} />
}
