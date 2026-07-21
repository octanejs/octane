import { createElement, useContext, useLayoutEffect, useState } from 'octane';

export function LazyText(props) @{
	<span class="lazy-value">{String(props.text) as string}</span>
}

export function LazyAdd(props) {
	return String(props.inner + props.outer);
}

export function LazyMemoProbe(props) @{
	props.onRender(props.value);
	<span class="lazy-memo-probe">{String(props.value) as string}</span>
}

export const LazyDefaultText = (props) => <span class="lazy-default">{String(props.text)}</span>;
LazyDefaultText.defaultProps = { text: 'default' };

export function LazyStatefulItem(props) @{
	const [count, setCount] = useState(0);
	useLayoutEffect(() => {
		props.log?.('mount:' + props.label);
		return () => props.log?.('unmount:' + props.label);
	}, []);
	<button
		class="lazy-item"
		data-id={props.id as string}
		onClick={() => setCount((value) => value + 1)}
	>{props.label + ':' + count as string}</button>
}

export function LazyRefTarget(props) @{
	<div class="lazy-ref" ref={props.ref}>{props.label as string}</div>
}

export function LazyHost(props) @{
	const Component = props.comp;
	<>
		@try {
			<Component {...props.childProps} />
		} @pending {
			<div class="lazy-fallback">{'Loading...'}</div>
		} @catch (error) {
			<div class="lazy-error">{'Error: ' + error.message as string}</div>
		}
	</>
}

export function LazyPairHost(props) @{
	const First = props.first;
	const Second = props.second;
	<>
		@try {
			<div class="lazy-pair">
				<First text="A" />
				<Second text="B" />
			</div>
		} @pending {
			<div class="lazy-fallback">{'Loading...'}</div>
		} @catch (error) {
			<div class="lazy-error">{'Error: ' + error.message as string}</div>
		}
	</>
}

export function LazyListHost(props) @{
	const children = props.items.map(
		(item) => createElement(item.comp, {
			key: item.key,
			id: item.key,
			label: item.label,
			log: props.log,
		}),
	);
	<>
		@try {
			<div class="lazy-list">{children}</div>
		} @pending {
			<div class="lazy-fallback">{'Loading...'}</div>
		} @catch (error) {
			<div class="lazy-error">{'Error: ' + error.message as string}</div>
		}
	</>
}

function LazyContextConsumer(props) @{
	const value = useContext(props.context);
	<span class="lazy-context">{String(value) as string}</span>
}

export function LazyProviderHost(props) @{
	const Provider = props.provider;
	<>
		@try {
			<Provider value={props.value}>
				<LazyContextConsumer context={props.context} />
			</Provider>
		} @pending {
			<div class="lazy-fallback">{'Loading...'}</div>
		} @catch (error) {
			<div class="lazy-error">{'Error: ' + error.message as string}</div>
		}
	</>
}
