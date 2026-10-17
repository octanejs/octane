type Props = { log: (entry: string) => void; label: string };

function Leaf({ log, label }: Props) @{
	<span
		ref={(el) => {
			if (el) log(label);
		}}
	>
		{label}
	</span>
}

function FirstBranch({ log, label }: Props) @{
	<section
		ref={(el) => {
			if (el) log('first parent');
		}}
	>
		<Leaf log={log} label={'first ' + label} />
		<Leaf log={log} label={'second ' + label} />
	</section>
}

function SecondBranch({ log, label }: Props) @{
	<aside
		ref={(el) => {
			if (el) log('second parent');
		}}
	>
		<Leaf log={log} label={'deep ' + label} />
	</aside>
}

export function RefPostorderBatch({ log, label }: Props) @{
	<main>
		<FirstBranch log={log} label={label} />
		<SecondBranch log={log} label={label} />
	</main>
}

// A fresh host with a ref, then a committed host whose ref changes identity,
// as a form library's `register(name)` returns a new ref every render.
export interface SiblingProps {
	show: boolean;
	first: (el: Element | null) => void;
	bind: Record<string, unknown>;
}

function MaybeInput(props: { show: boolean; first: (el: Element | null) => void }) @{
	<p>
		@if (props.show) {
			<input ref={props.first} />
		}
	</p>
}

function RegisteredInput(props: { bind: Record<string, unknown> }) @{
	<input type="checkbox" {...props.bind} />
}

export function CompiledSiblings(props: SiblingProps) @{
	<form>
		<MaybeInput show={props.show} first={props.first} />
		<RegisteredInput bind={props.bind} />
	</form>
}
