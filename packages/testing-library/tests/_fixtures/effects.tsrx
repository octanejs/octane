import { useState, useEffect } from 'octane';

// Mount/cleanup logging (render.js:149, cleanup.js:30).
export function EffectLogger(props) @{
	useEffect(() => {
		props.log('mount');
		return () => props.log('cleanup');
	}, []);
	<div data-testid="effectful">effectful</div>
}

// A label that only reaches its final text through a passive effect →
// setState cascade — proves render() commits effects AND the re-renders they
// schedule before returning (renderHook.js:10 relies on the same).
export function DeferredLabel() @{
	const [label, setLabel] = useState('initial');
	useEffect(() => {
		setLabel('committed');
	}, []);
	<div data-testid="label">
		{label as string}
	</div>
}
