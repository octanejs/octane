import { useState } from 'octane';

export function BlockEvent({ log, value }) @{
	<button
		onClick={(event) => {
			event.preventDefault();
			log(value, event, event.currentTarget);
		}}
	>go</button>
}

export function DeferredReads(props) @{
	<button
		onClick={() => {
			props.log(props.box.current);
			props.receiver.record(props.label);
		}}
	>read</button>
}

export function MutableCapture({ log }) @{
	let value = 0;
	<button
		onClick={() => {
			value++;
			log(value);
		}}
	>mutable</button>
}

export function ReassignedParameter({ log, value, expose }) @{
	expose((next) => {
		value = next;
	});
	<button
		onClick={() => {
			log(value);
			log('end');
		}}
	>reassigned</button>
}

export function Count() @{
	const [count, setCount] = useState(0);
	<button
		onClick={(event) => {
			event.preventDefault();
			setCount(count + 1);
		}}
	>{count as string}</button>
}

export function Rows({ rows, log }) @{
	<ul>
		@for (const row of rows; key row.id) {
			<li>
				<button
					onClick={(event) => {
						event.preventDefault();
						log(row.label);
					}}
				>{row.label}</button>
			</li>
		}
	</ul>
}

export function Snapshot(props) @{
	<div
		onClick={(event) => {
			props.log(props.label, event.currentTarget.localName);
			props.after?.();
		}}
	>
		<button onClick={props.change}>change</button>
	</div>
}

export function Failing(props) @{
	<div onClick={props.parent}>
		<button
			onClick={() => {
				props.log(props.label);
				throw props.error;
			}}
		>fail</button>
	</div>
}

export function FunctionScoped({ log, value, enabled }) @{
	<button
		onClick={() => {
			if (enabled) {
				var value = 'inner';
			}
			log(value);
			log('end');
		}}
	>scope</button>
}

export function LexicalArguments(props) @{
	<button
		onClick={() => {
			props.log(arguments[0].value);
			props.log('end');
		}}
	>arguments</button>
}

class Local { label = 'outer'; }
export function LocalClass(props) @{
	class Local { label = 'inner'; }
	<button
		onClick={() => {
			props.log(new Local().label);
			props.log('end');
		}}
	>class</button>
}
