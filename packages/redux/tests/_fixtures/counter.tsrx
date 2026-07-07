import { useState } from 'octane';
import { Provider, useSelector, useDispatch, shallowEqual } from '@octanejs/redux';
import { configureStore, createSlice } from '@reduxjs/toolkit';

// Differential fixture: the SAME counter app runs through @octanejs/redux
// (octane) and real react-redux (React). A fresh RTK store per MOUNT (useState
// initializer) keeps each side and repeated tests independent.

const counterSlice = createSlice({
	name: 'counter',
	initialState: { value: 0, label: 'ticks' },
	reducers: {
		increment(state) {
			state.value += 1;
		},
		decrement(state) {
			state.value -= 1;
		},
	},
});

function makeStore() {
	return configureStore({ reducer: { counter: counterSlice.reducer } });
}

function CounterView() @{
	const value = useSelector((s: any) => s.counter.value);
	const summary = useSelector(
		(s: any) => ({ label: s.counter.label, doubled: s.counter.value * 2 }),
		shallowEqual,
	);
	const dispatch = useDispatch();
	<div class="counter">
		<span id="value">
			{'value=' + value + ' doubled=' + summary.doubled + ' label=' + summary.label}
		</span>
		<button id="inc" onClick={() => dispatch(counterSlice.actions.increment())}>+</button>
		<button id="dec" onClick={() => dispatch(counterSlice.actions.decrement())}>-</button>
	</div>
}

export function CounterApp() @{
	const [store] = useState(() => makeStore());
	<Provider store={store}>
		<CounterView />
	</Provider>
}
