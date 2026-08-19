import type { OctaneNode } from 'octane';

export function StringConversion(props: { value: unknown }) @{
	<p id="converted">{String(props.value)}</p>
}

function TextMarker() @{
	<b id="tracked-string-marker">marker</b>
}

export function TrackedString(props: { value: unknown }) @{
	const label = String(props.value);
	<div id="tracked-string">
		<TextMarker />
		{label}
		<i>after</i>
	</div>
}

export function NestedString(props: { value: unknown; child: OctaneNode }) @{
	const label = String(props.value);
	const Inner = ({ label }: { label: OctaneNode }) => @{
		<section id="nested-string-value">{label}</section>
	};
	<main>
		<Inner label={props.child} />
		<span id="outer-string-value">{label}</span>
	</main>
}

export function ParameterString(props: {
	String: (value: string) => OctaneNode;
	value: string;
}) @{
	const { String, value } = props;
	<div id="parameter-string">{String(value)}</div>
}

export function LocalString(props: {
	render: (value: string) => OctaneNode;
	value: string;
}) @{
	const String = props.render;
	<div id="local-string">{String(props.value)}</div>
}

export function LoopString(props: {
	renderers: Array<(value: string) => OctaneNode>;
	value: string;
}) @{
	<div id="loop-string">
		@for (const String of props.renderers; key String) {
			<section>{String(props.value)}</section>
		}
	</div>
}
