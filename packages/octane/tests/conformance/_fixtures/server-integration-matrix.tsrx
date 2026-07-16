import { createContext, lazy, memo, useContext, useState } from 'octane';

export function BasicArray() {
	return [
		<div key="first" id="basic-first">text1</div>,
		<span key="second" id="basic-second">text2</span>,
	];
}

export const ArrowArrayRoot = () => [
	<div key="arrow" id="arrow-root">arrow root</div>,
];

export function PrimitiveRoot(props) {
	if (props.mode === 'empty') return null;
	if (props.mode === 'element') return <span id="primitive-root-element">element</span>;
	return props.text;
}

export function BasicBigInt() {
	return BigInt(42);
}

export function AdjacentText(props) @{
	<div id="adjacent-text">
		{props.first as string}
		{props.second as string}
	</div>
}

export function AttributeValues() @{
	<section
		id="attribute-values"
		hidden={true}
		data-foobar={false}
		style={{ marginTop: 2, '--tone': 'blue' }}
	>
		<label htmlFor="attribute-target">label</label>
		<input id="attribute-target" size={2} />
	</section>
}

export function NestedFragment() @{
	<>
		<div id="fragment-first">text1</div>
		<>
			<span id="fragment-second">text2</span>
			<>
				{null}
				<p id="fragment-third" />
				{false}
			</>
		</>
	</>
}

export function ControlledInputMarkup() @{
	<input id="matrix-input" value="foo" defaultValue="bar" readOnly={true} />
}

export function ControlledCheckboxMarkup() @{
	<input
		id="matrix-checkbox"
		type="checkbox"
		checked={true}
		defaultChecked={false}
		readOnly={true}
	/>
}

export function ControlledTextareaMarkup() @{
	<textarea id="matrix-textarea" value="foo" defaultValue="bar" readOnly={true} />
}

function MatrixOption(props) @{
	<option value={props.value}>
		{props.value as string}
	</option>
}

export function ControlledSelectMarkup() {
	return <select id="matrix-select" value="bar" defaultValue="baz" readOnly={true}>
		<MatrixOption value="foo" />
		<MatrixOption value="bar" />
		<MatrixOption value="baz" />
	</select>;
}

export function InitialState() @{
	const [count] = useState(() => 2);
	<span id="initial-state">
		{'Count: ' + count}
	</span>
}

const Colour = createContext('none');

function ColourReader() @{
	const colour = useContext(Colour);
	<strong id="context-value">
		{colour as string}
	</strong>
}

export function NestedContext() @{
	<Colour.Provider value="purple">
		<Colour.Provider value="red">
			<ColourReader />
		</Colour.Provider>
	</Colour.Provider>
}

export function HostRef(props) @{
	<div id="matrix-ref" ref={props.refCallback}>ref target</div>
}

function MemoBody(props) @{
	<span id="memo-value">
		{'Count: ' + props.count}
	</span>
}

export const MemoComponent = memo(MemoBody);

function MemoArrayBody() {
	return [<div key="memo-array" id="memo-array-root">memo array root</div>];
}

export const MemoArrayRoot = memo(MemoArrayBody);

export const LazyArrayRoot = lazy(
	() => ({
		then(resolve) {
			resolve({ default: MemoArrayBody });
		},
	}),
);

export function ObjectElement() @{
	<object id="matrix-object" type="video/mp4" data="/example.webm" width={600} height={400}>
		<div>preview</div>
	</object>
}
