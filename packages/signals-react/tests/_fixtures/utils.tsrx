import { createElement } from 'octane';
import type { Signal } from '@preact/signals-core';
import { useSignalEffect } from '../../src/index.ts';
import { useSignals } from '../../src/runtime/index.ts';
import { For, Show, useLiveSignal, useSignalRef } from '../../src/utils/index.ts';

function Paragraph(props: { children?: unknown }) {
	return createElement('p', {}, props.children);
}

export function ShowToggle(props: { toggle: Signal<boolean> }) {
	return createElement(Show, {
		when: props.toggle,
		fallback: createElement(Paragraph, {}, 'Hiding'),
		children: createElement(Paragraph, {}, 'Showing'),
	});
}

export function ShowBlockChildren(props: { toggle: Signal<boolean> }) @{
	<Show when={props.toggle}>
		<p>Showing block</p>
	</Show>
}

export function ForList(props: { items: Signal<string[]> }) {
	return createElement(For, {
		each: props.items,
		fallback: createElement(Paragraph, {}, 'empty'),
		children: function renderItem(value: unknown) {
			return createElement('li', {}, String(value));
		},
	});
}

export function ForBlockChildren(props: { items: Signal<string[]> }) @{
	<For each={props.items}>
		<li>Block item</li>
	</For>
}

export function LiveCount(props: { count: number; logs: string[] }) {
	useSignals();
	const count = useLiveSignal(props.count);
	useSignalEffect(function log() {
		props.logs.push('Count is ' + String(count.value));
	});
	return createElement('p', null, String(count.value));
}

export function SignalRefProbe(props: { value: string }) {
	const ref = useSignalRef(props.value);
	return createElement('p', null, String(ref.current));
}
