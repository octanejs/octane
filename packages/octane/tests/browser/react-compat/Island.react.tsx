/** @jsxImportSource react */
import * as React from 'react';
import { createPortal } from 'react-dom';
import type { IslandProps } from './shared.js';

export function Island({ resource, target, ref, onSubscription, onSignal }: IslandProps) {
	const [count, setCount] = React.useState(0);
	const value = React.use(resource);
	React.useEffect(() => {
		onSubscription(true);
		window.addEventListener('react-compat-ping', onSignal);
		return () => {
			window.removeEventListener('react-compat-ping', onSignal);
			onSubscription(false);
		};
	}, [onSubscription, onSignal]);
	return (
		<>
			<button data-react-counter="" ref={ref} onClick={() => setCount(count + 1)}>
				{value + ':' + count}
			</button>
			{createPortal(<span data-react-portal="">{value + ':portal:' + count}</span>, target)}
		</>
	);
}
