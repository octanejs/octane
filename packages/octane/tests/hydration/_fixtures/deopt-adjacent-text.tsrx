import { createElement, type OctaneNode } from 'octane';

// A pure-host `createElement` at a value position is a de-opt host: the client
// reconciles its children as raw DOM, one text node per primitive child.

export function Greeting(props: { value: OctaneNode }) @{
	<section>{createElement('div', { id: 'el' }, 'hello ', props.value)}</section>
}

export function Parts(props: { parts: OctaneNode[] }) @{
	<section>{createElement('div', { id: 'el' }, ...props.parts)}</section>
}

// A compiled label separates a dynamic text from its neighbour the same way.
export function CompiledOptions(props: { selected: string; n: string }) @{
	<select defaultValue={props.selected}>
		<option>{'Item 1'}</option>
		<option>
			{'Item '}
			{props.n as string}
		</option>
	</select>
}

export function Label(props: { text: string }) @{
	<i>{props.text}</i>
}

export interface Gate {
	pending: boolean;
	promise: Promise<void>;
}

function Gated(props: { gate: Gate }) @{
	if (props.gate.pending) throw props.gate.promise;
	<output>{'ready'}</output>
}

// The de-opt host hydrates before its sibling suspends the boundary.
export function SuspendedGreeting(props: { value: OctaneNode; gate: Gate }) @{
	<section>
		@try {
			<>
				{createElement('div', { id: 'el' }, 'hello ', props.value)}
				<Gated gate={props.gate} />
			</>
		} @pending {
			<p>{'loading'}</p>
		}
	</section>
}
