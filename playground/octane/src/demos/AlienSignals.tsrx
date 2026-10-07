import { useState } from 'octane';
import {
	createComputed,
	createSignal,
	useSignal,
	useSignalEffect,
	useSignalSelector,
	useSignalValue,
} from '@octanejs/alien-signals';

const countSignal = createSignal(1);
const doubledSignal = createComputed(function doubleCount() {
	return countSignal() * 2;
});

function countParity(value: number): string {
	return value % 2 === 0 ? 'even' : 'odd';
}

function effectRegionMount() {
	// No signal reads: cleanup must run only when the region unmounts, not on
	// every parent re-render or count update.
	console.info('[alien-signals] effect region mounted');
	return function cleanup() {
		console.info('[alien-signals] effect cleanup');
	};
}

function EffectRegion() @{
	const count = useSignalValue(countSignal);
	useSignalEffect(effectRegionMount);

	<p id="alien-signals-effect">{'Effect region is observing ' + count}</p>
}

export function AlienSignalsDemo() @{
	const [count, setCount] = useSignal(countSignal);
	const doubled = useSignalValue(doubledSignal);
	// Re-renders only when the selected slice changes, not on every write.
	const parity = useSignalSelector(countSignal, countParity);
	const [showEffect, setShowEffect] = useState(true);

	<div>
		<h2 class="demo-title">{'Alien Signals on Octane'}</h2>
		<p class="demo-blurb">
			{
				'Writable and computed Alien Signals drive Octane through concurrency-safe external-store subscriptions.'
			}
		</p>

		<div class="panel">
			<div class="row">
				<button
					id="alien-signals-decrement"
					class="btn"
					onClick={function decrement() {
						setCount(count - 1);
					}}
				>
					−
				</button>
				<strong id="alien-signals-count">{'Count: ' + count}</strong>
				<strong id="alien-signals-doubled">{'Doubled: ' + doubled}</strong>
				<strong id="alien-signals-parity">{'Parity: ' + parity}</strong>
				<button
					id="alien-signals-increment"
					class="btn"
					onClick={function increment() {
						setCount(function next(value) {
							return value + 1;
						});
					}}
				>
					+
				</button>
			</div>
			<button
				id="alien-signals-toggle-effect"
				class="btn"
				onClick={function toggleEffect() {
					setShowEffect(function next(value) {
						return !value;
					});
				}}
			>
				{showEffect ? 'Unmount effect region' : 'Mount effect region'}
			</button>
			@if (showEffect) {
				<EffectRegion />
			}
		</div>
	</div>
}
