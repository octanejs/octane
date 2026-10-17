import { startTransition, use, useState, ViewTransition } from 'octane';

function Wait(props: { wait: Promise<unknown> }) @{
	use(props.wait);
	<b>{'resolved'}</b>
}

function Probe(props: { probe: () => void }) @{
	props.probe();
	<u>{'probe'}</u>
}

export function Item(props: { label: string }) @{
	<em>{props.label as string}</em>
}

function RootHole(props: { value: unknown }) @{
	<>{props.value}</>
}

function ReturnedValue(props: { value: unknown }) {
	return props.value;
}

// One value in every renderable hole position: between siblings, as a host's
// only child, in keyed rows, as a body's whole output and as a returned value.
// The probe renders after them all; the gate suspends the whole root.
export function TextHoles(props: {
	value: unknown;
	probe: () => void;
	gate?: Promise<unknown> | null;
}) @{
	<section>
		<p id="sibling">
			{'before '}
			{props.value}
			{' after'}
		</p>
		<p id="only">{props.value}</p>
		<ul id="rows">
			@for (const row of ['one', 'two']; key row) {
				<li>{props.value}</li>
			}
		</ul>
		<ul id="pairs">
			@for (const row of ['one', 'two']; key row) {
				<>
					<li class={row}>{props.value}</li>
					<li class={row + '-sibling'}>
						{row}
						{props.value}
					</li>
				</>
			}
		</ul>
		<div id="root-hole">
			<RootHole value={props.value} />
		</div>
		<div id="returned">
			<ReturnedValue value={props.value} />
		</div>
		<Probe probe={props.probe} />
		@if (props.gate) {
			<Wait wait={props.gate} />
		}
	</section>
}

// The same holes inside a ViewTransition, whose commit waits for the native update.
export function TransitionHoles(props: { value: unknown }) @{
	<ViewTransition>
		<TextHoles value={props.value} probe={() => {}} />
	</ViewTransition>
}

// One drain renders the rows twice: the parent's urgent update moves their
// holes, and the owner's transition after it moves them back to the committed
// value. A class binding before the hole hands it the row's staged cells; a
// bare row's hole finds its bag staged with no cells in hand.
interface RevertControls {
	moved: unknown;
	committed: unknown;
	move(): void;
	setLocal(local: number): void;
}

function RevertingRowsOwner(props: { step: number; controls: RevertControls }) @{
	const [local, setLocal] = useState(0);
	props.controls.setLocal = setLocal;
	const value = props.step === 1 && local === 0 ? props.controls.moved : props.controls.committed;
	<div id="reverting">
		<ul>
			@for (const row of ['one', 'two']; key row) {
				<li class={row}>{value}</li>
			}
		</ul>
		<ol>
			@for (const row of ['one', 'two']; key row) {
				<li>{value}</li>
			}
		</ol>
	</div>
}

export function RevertingRows(props: { controls: RevertControls }) @{
	const [step, setStep] = useState(0);
	props.controls.move = () => {
		setStep(1);
		startTransition(() => props.controls.setLocal(1));
	};
	<RevertingRowsOwner step={step} controls={props.controls} />
}
