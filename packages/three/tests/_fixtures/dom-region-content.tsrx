import { createContext, useContext, useEffect, useLayoutEffect, useState } from 'octane';

export const DOMRegionTheme = createContext('default');

export function DOMCounter(props) @{
	const theme = useContext(DOMRegionTheme);
	const [count, setCount] = useState(0);
	useLayoutEffect(() => {
		props.onLayout?.();
		return () => props.onCleanup?.();
	}, [props.onLayout, props.onCleanup]);
	useEffect(() => props.onEffect?.(), [props.effectToken]);

	<button
		class="dom-region-counter"
		data-label={props.label}
		ref={props.buttonRef}
		onClick={() => setCount((value) => value + 1)}
	>{`${theme}:${props.label}:${count}`}</button>
}
