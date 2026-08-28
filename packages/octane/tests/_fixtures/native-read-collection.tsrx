import { createElement, useLayoutEffect, useRef, useState } from 'octane';
import type { Resource, SignalHandle } from 'octane/signals';

export interface CollectionProps {
	count$: SignalHandle<number>;
	body$: SignalHandle<number>;
	value?: number;
}

export function DefaultReader({ count$, body$, value = count$.get() }: CollectionProps) @{
	<p class="collection-default">{value + ':' + body$.get()}</p>
}

export function FunctionReader(props: CollectionProps) {
	const value = props.count$.get();
	const output = <p class="collection-indirect">{String(value)}</p>;
	return output;
}

export const ArrowReader = (props: CollectionProps) => {
	const value = props.count$.get();
	const output = <p class="collection-indirect">{String(value)}</p>;
	return output;
};

export function PlainReader(props: CollectionProps) {
	const value = props.count$.get();
	return createElement('p', { className: 'collection-indirect' }, String(value));
}

export function ChildDefaults(props: CollectionProps) @{
	<section>
		<DefaultReader {...props} />
	</section>
}

export function ConditionalReader(props: CollectionProps & { enabled: boolean }) @{
	<p>
		{props.enabled ? String(props.count$.get()) : 'idle'}
	</p>
}

function SwitchableChild({
	source$,
	enabled,
	label,
	value = enabled ? source$.get() : null,
}: {
	source$: SignalHandle<number>;
	enabled: boolean;
	label: string;
	value?: number | null;
}) @{
	const body =
		enabled ? source$.get() : null;
	<output data-collection-child={label}>
		{enabled ? value + ':' + body : 'idle'}
	</output>
}

export function CollectionPanel(props: {
	parent$: SignalHandle<number>;
	left$: SignalHandle<number>;
	right$: SignalHandle<number>;
	leftEnabled: boolean;
	rightEnabled: boolean;
	tick: number;
}) @{
	const value = props.parent$.get();
	<section data-tick={props.tick}>
		<output data-collection-parent>{String(value)}</output>
		<SwitchableChild source$={props.left$} enabled={props.leftEnabled} label="left" />
		<SwitchableChild source$={props.right$} enabled={props.rightEnabled} label="right" />
	</section>
}

export function PendingDefault({
	value$,
	value = value$.get(),
}: {
	value$: Resource<string>;
	value?: string;
}) @{
	<p class="collection-pending">{value}</p>
}

export function ReplayReader(props: {
	first$: SignalHandle<number>;
	final$: SignalHandle<number>;
}) @{
	const [ready, setReady] = useState(false);
	const value = ((ready ? props.final$ : props.first$)).get();
	if (!ready) setReady(true);
	<p>{String(value)}</p>
}

export function HydrationDefault({ count$, body$, value = count$.get(), log }: CollectionProps & {
	log?: (value: string) => void;
}) @{
	const output = useRef<HTMLOutputElement | null>(null);
	const body = body$.get();
	useLayoutEffect(() => {
		log?.(value + ':' + body + ':' + output.current?.textContent + ':live:' + count$.get());
	}, [value, body]);
	<section>
		<input defaultValue="server input" />
		<output ref={output}>{value + ':' + body}</output>
	</section>
}
