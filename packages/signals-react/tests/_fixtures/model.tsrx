import { createElement } from 'octane';
import { createModel, signal } from '@preact/signals-core';
import { useModel } from '../../src/index.ts';
import { useSignals } from '../../src/runtime/index.ts';

const CountModel = createModel(function factory() {
	return {
		count: signal(0),
		increment: function increment(this: { count: { value: number } }) {
			this.count.value++;
		},
	};
});

export function ModelCounter() {
	useSignals();
	const model = useModel(CountModel);
	function onClick() {
		model.increment();
	}
	return createElement('button', { onClick }, String(model.count.value));
}
