import { useContext, useLayoutEffect, useState } from 'octane';
import { UniversalTheme } from './universal-boundary.tsrx';
import { Html } from '/packages/octane/tests/_fixtures/universal-renderer-boundaries.object.tsrx';

export function Scene(props) @{
	const theme = useContext(UniversalTheme);
	const [count, setCount] = useState(0);
	useLayoutEffect(() => {
		props.log(`scene-layout:${theme}:${count}`);
		return () => props.log(`scene-cleanup:${theme}:${count}`);
	}, [props.log, theme, count]);
	<scene
		theme={theme}
		count={count}
		ref={props.hostRef}
		onSelect={(event) => setCount((value) => value + event.delta)}
	/>
}

export function ReverseScene(props) @{
	<Html>
		<section class="overlay">
			{props.label as string}
		</section>
	</Html>
}
