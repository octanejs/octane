import { useMemo } from 'octane';

type Props = { label: string; tick: number };

function Label(props: { text: string }) @{
	<span id="cache-label">{props.text}</span>
}

function AlternateLabel(props: { text: string }) @{
	<span id="cache-label">{'other:' + props.text}</span>
}

export function Combined(props: Props) @{
	const memo = useMemo(() => ({ text: props.label }), [props.label]);
	<div id="cache-host" data-tick={props.tick}>
		<input defaultValue="draft" />
		<Label text={memo.text} />
	</div>
}

export function Alternate(props: Props) @{
	const memo = useMemo(() => ({ text: props.label }), [props.label]);
	<div id="cache-host" data-tick={props.tick}>
		<input defaultValue="draft" />
		<AlternateLabel text={memo.text} />
	</div>
}

export function Flat(props: Props) @{
	<div id="cache-host">
		<input defaultValue="draft" />
		<span id="cache-label">{props.label}</span>
		<output>{String(props.tick)}</output>
	</div>
}

export function HookOnly(props: Props) @{
	const memo = useMemo(() => ({ text: props.label }), [props.label]);
	<div id="cache-host">
		<input defaultValue="draft" />
		<span id="cache-label">{memo.text}</span>
		<output>{String(props.tick)}</output>
	</div>
}

export function AutoOnly(props: Props) @{
	<div id="cache-host" data-tick={props.tick}>
		<input defaultValue="draft" />
		<Label text={props.label} />
	</div>
}

export function ProviderFirst() @{
	const memo = useMemo(() => ({ text: 'first' }), []);
	<div id="cache-host">
		<input defaultValue="draft" />
		<Label text={memo.text} />
	</div>
}

export function ProviderSecond() @{
	const memo = useMemo(() => ({ text: 'second' }), []);
	<div id="cache-host">
		<input defaultValue="draft" />
		<Label text={memo.text} />
	</div>
}
