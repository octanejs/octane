import { createContext, memo, useContext, useState } from 'octane';
import { buildHydrationRows } from './auto-memo-output-helper';

const HydrationTheme = createContext('t0');

function HydrationRowImpl(props) @{
	const theme = useContext(HydrationTheme);
	const [own, setOwn] = useState(0);

	<li class="hydration-output-row" data-id={props.id as string}>
		<span class="hydration-output-value">
			{theme + ':' + props.label + ':' + own}
		</span>
		<button
			class={'hydration-output-own-' + props.id}
			onClick={() => setOwn((value) => value + 1)}
		>{'increment'}</button>
	</li>
}

const HydrationRow = memo(HydrationRowImpl);

export function AutoMemoOutputHydrationApp(props) @{
	const rows = buildHydrationRows(props.items, HydrationRow);

	<section id="hydration-auto-memo-output">
		<strong id="hydration-output-tick">
			{'tick ' + props.tick}
		</strong>
		<HydrationTheme.Provider value={props.theme}>
			<ul id="hydration-output-rows">{rows}</ul>
		</HydrationTheme.Provider>
	</section>
}
