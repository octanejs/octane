import { useState, useReducer, useLayoutEffect, createContext, use } from 'octane';

let _setC1: any = null;
let _setC2: any = null;
export function getSetC1() {
	return _setC1;
}
export function getSetC2() {
	return _setC2;
}

function BailChild(props) @{
	props.log('Child: ' + props.text);
	<span id="child">{props.text as string}</span>
}

// Per ReactHooks-test.internal.js "bails out in the render phase if all of the
// state is the same": setting both counters to their current values must not
// re-render the child, re-fire the every-render layout effect, or touch the DOM.
export function BailParent(props) @{
	const [c1, setC1] = useState(0);
	const [c2, setC2] = useState(0);
	_setC1 = setC1;
	_setC2 = setC2;
	props.log('Parent: ' + c1 + ', ' + c2);
	useLayoutEffect(() => {
		props.log('Effect');
	}, null);
	<div id="parent">
		<BailChild text={c1 + ', ' + c2} log={props.log} />
	</div>
}

// Per ReactHooks-test.internal.js "a change in context defeats the bailout":
// a same-value set alone would bail, but a provider change in the same batch
// must still re-render the consumer with the new context value.
const Theme = createContext('light');

let _setTheme: any = null;
let _setVal: any = null;
export function getSetTheme() {
	return _setTheme;
}
export function getSetVal() {
	return _setVal;
}

function ThemedValue(props) @{
	const theme = use(Theme);
	const [val, setVal] = useState(0);
	_setVal = setVal;
	props.log('render:' + theme + ':' + val);
	<span id="themed">{theme + ':' + val}</span>
}

export function ContextDefeatsBailout(props) @{
	const [theme, setTheme] = useState('light');
	_setTheme = setTheme;
	<Theme.Provider value={theme}>
		<ThemedValue log={props.log} />
	</Theme.Provider>
}

// Per ReactHooksWithNoopRenderer-test.js: a dispatch that is a no-op on its
// own is still applied in order when batched with a real update.
let _dispatch: any = null;
let _renderCount = 0;
export function getDispatch() {
	return _dispatch;
}
export function getRenderCount() {
	return _renderCount;
}
export function resetRenderCount() {
	_renderCount = 0;
}
export function ReducerBatchedNoop() @{
	const [n, dispatch] = useReducer((s: number, a: number) => (a < 0 ? s : a), 0);
	_dispatch = dispatch;
	_renderCount++;
	<span id="out">{n as number}</span>
}
