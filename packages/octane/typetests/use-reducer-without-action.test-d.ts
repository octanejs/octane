import { __useReducerWithGetter, useReducer } from 'octane';
import {
	__useReducerWithGetter as __useServerReducerWithGetter,
	useReducer as useServerReducer,
} from 'octane/server';

// A reducer that reads only state dispatches with no argument, so the dispatch
// also fits a `() => void` callback such as a store subscription.
const subscribe = (listener: () => void) => listener;
const increment = (count: number) => count + 1;

const [count, forceUpdate, getCount] = useReducer(increment, 0);
const [serverCount, serverForceUpdate, getServerCount] = useServerReducer(increment, 0);
const [, compiledForceUpdate] = __useReducerWithGetter(increment, 0, undefined, Symbol('hook'));
const [, compiledServerForceUpdate] = __useServerReducerWithGetter(
	increment,
	0,
	undefined,
	Symbol('hook'),
);
forceUpdate();
serverForceUpdate();
compiledForceUpdate();
compiledServerForceUpdate();
subscribe(forceUpdate);
subscribe(serverForceUpdate);
const counts: number[] = [count, getCount(), serverCount, getServerCount()];

// A reducer with an action keeps requiring it.
const add = (total: number, amount: number) => total + amount;
const [, addAmount] = useReducer(add, 0);
const [, addServerAmount] = useServerReducer(add, 0);
addAmount(2);
addServerAmount(2);
// @ts-expect-error The client dispatch still requires the reducer's action.
addAmount();
// @ts-expect-error The server dispatch still requires the reducer's action.
addServerAmount();
// @ts-expect-error The action keeps its inferred type.
addAmount('2');
