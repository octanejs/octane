import { useState } from 'octane';
import {
	AutoMemoOutputContext,
	bumpAutoMemoOpaqueOutputVersion,
} from './auto-memo-output-child.tsrx';
import {
	buildAutoMemoNestedOutput,
	buildAutoMemoOpaqueOutput,
	buildAutoMemoOutput,
	buildAutoMemoProxyOutput,
	buildAutoMemoSafetyTransitionOutput,
} from './auto-memo-output-helper';

export function AutoMemoOutputApp() @{
	const [items, setItems] = useState([
		{ id: 1, label: 'a' },
		{ id: 2, label: 'b' },
	]);
	const [tick, setTick] = useState(0);
	const [theme, setTheme] = useState('t0');
	const rows = buildAutoMemoOutput(items);
	const opaqueRows = buildAutoMemoOpaqueOutput(items);
	const nestedRows = buildAutoMemoNestedOutput(items);
	const proxyRows = buildAutoMemoProxyOutput(items);

	<section id="auto-memo-output">
		<button
			id="output-tick"
			onClick={() => {
				bumpAutoMemoOpaqueOutputVersion();
				setTick((value) => value + 1);
			}}
		>
			{'tick ' + tick}
		</button>
		<button
			id="output-item"
			onClick={() => setItems(
				(current) => current.map(
					(item) => (item.id === 1 ? { ...item, label: item.label + '!' } : item),
				),
			)}
		>{'item'}</button>
		<button
			id="output-context"
			onClick={() => setTheme((value) => value + '!')}
		>{'context'}</button>
		<button id="output-clear" onClick={() => setItems([])}>{'clear'}</button>
		<AutoMemoOutputContext.Provider value={theme}>
			<ul id="auto-memo-output-rows">{rows}</ul>
			<ul id="auto-memo-opaque-output-rows">{opaqueRows}</ul>
			<ul id="auto-memo-nested-output-rows">{nestedRows}</ul>
			<ul id="auto-memo-proxy-output-rows">{proxyRows}</ul>
		</AutoMemoOutputContext.Provider>
	</section>
}

export function AutoMemoOutputSafetyApp() @{
	const [unsafe, setUnsafe] = useState(false);
	const output = buildAutoMemoSafetyTransitionOutput(unsafe);

	<section id="auto-memo-output-safety">
		<button
			id="output-safety-toggle"
			onClick={() => setUnsafe((value) => !value)}
		>{'toggle output'}</button>
		<div id="output-safety-value">{output}</div>
	</section>
}
