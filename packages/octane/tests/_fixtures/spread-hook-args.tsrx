import { useReducer, useRef, useState } from 'octane';

const noStateArgs = [] as const;
const oneStateArg = [5] as const;
const reducer = (state: number, action: number) => state + action;
const reducerArgs = [reducer, 1] as const;
const lazyReducerArgs = [reducer, 2, (value: number) => value * 2] as const;
const noRefArgs = [] as const;

// A spread has runtime-variable arity, so production code retains the Symbol
// ABI for these individual sites. That lets the hook distinguish an omitted
// user argument from the compiler-owned trailing slot without guessing from a
// numeric value.
export function SpreadHookArgs() @{
	const [empty, setEmpty] = useState<number | undefined>(...noStateArgs);
	const [one, setOne] = useState(...oneStateArg);
	const [reduced, dispatch] = useReducer(...reducerArgs);
	const [lazy, dispatchLazy] = useReducer(...lazyReducerArgs);
	<div>
		<button class="empty" onClick={() => setEmpty(3)}>
			{empty === undefined ? 'u' : String(empty)}
		</button>
		<button class="one" onClick={() => setOne(6)}>{String(one)}</button>
		<button class="reduced" onClick={() => dispatch(2)}>{String(reduced)}</button>
		<button class="lazy" onClick={() => dispatchLazy(3)}>{String(lazy)}</button>
	</div>
}

export function SpreadRef() @{
	const ref = useRef(...noRefArgs);
	<p>
		{ref.current === undefined ? 'u' : String(ref.current)}
	</p>
}
