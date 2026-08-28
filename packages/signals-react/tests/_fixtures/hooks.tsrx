import { createElement } from 'octane';
import { useComputed, useSignal, useSignalEffect } from '../../src/index.ts';
import { useSignals, type EffectStore } from '../../src/runtime/index.ts';
import type { Signal } from '@preact/signals-core';

export function ExternalSignalText(props: {
	count: Signal<number>;
	onStore?: (store: EffectStore) => void;
}) {
	const store = useSignals();
	props.onStore?.(store);
	return createElement('p', null, String(props.count.value));
}

export function UseSignalCounter() {
	useSignals();
	const count = useSignal(0);
	function inc() {
		count.value = count.value + 1;
	}
	return createElement('button', { onClick: inc }, String(count.value));
}

export function UseComputedDouble(props: { count: Signal<number> }) {
	const doubled = useComputed(function double() {
		return props.count.value * 2;
	});
	useSignals();
	return createElement('p', null, String(doubled.value));
}

export function UseSignalEffectLogger(props: {
	count: Signal<number>;
	logs: string[];
}) {
	useSignalEffect(function log() {
		props.logs.push('Count is ' + String(props.count.value));
	});
	useSignals();
	return createElement('p', null, String(props.count.value));
}
