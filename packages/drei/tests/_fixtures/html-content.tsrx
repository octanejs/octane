import { createContext, useContext, useLayoutEffect, useState } from 'octane';

export const HtmlTheme = createContext('default');

export function HtmlContent(props) @{
	const theme = useContext(HtmlTheme);
	const [count, setCount] = useState(0);
	useLayoutEffect(() => {
		props.onMount?.();
		return () => props.onCleanup?.();
	}, [props.onMount, props.onCleanup]);
	<button class="html-content" onClick={() => setCount((value) => value + 1)}>
		{`${theme}:${props.label}:${count}`}
	</button>
}
