import { atom, createStore, Provider, useAtom } from '@octanejs/jotai';

// Differential fixture: the SAME atom read/written through three scopes — the
// default store (no Provider), an outer Provider, and a nested (shadowing)
// Provider. A bump in one scope must leave the others untouched, byte-identically
// with real jotai on React.
const sharedAtom = atom(0);
const outerStore = createStore();
const innerStore = createStore();

function Cell(props: { id: string }) @{
	const [v, setV] = useAtom(sharedAtom);
	<div>
		<span id={props.id}>{props.id + '=' + v}</span>
		<button id={props.id + '-inc'} onClick={() => setV((c) => c + 1)}>+</button>
	</div>
}

export function Providers() @{
	<div>
		<Cell id="global" />
		<Provider store={outerStore}>
			<Cell id="outer" />
			<Provider store={innerStore}>
				<Cell id="inner" />
			</Provider>
		</Provider>
	</div>
}
