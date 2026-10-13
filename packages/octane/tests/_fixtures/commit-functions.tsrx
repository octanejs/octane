import { memo, startTransition, use, useState } from 'octane';

function Wait(props: { wait: Promise<unknown> }) @{
	use(props.wait);
	<b>{'resolved'}</b>
}

// A text, attribute, class and handler binding over one value, beside a gate
// that suspends the whole root (no boundary) while `wait` is pending.
export function Held(props: {
	label: string;
	wait: Promise<unknown> | null;
	onPick: (label: string) => void;
}) @{
	<section>
		<button
			id="held"
			title={props.label}
			class={props.label}
			onClick={() => props.onPick(props.label)}
		>
			{props.label as string}
		</button>
		@if (props.wait) {
			<Wait wait={props.wait} />
		}
	</section>
}

const MemoLabel = memo(function MemoLabel(props: { label: string }) @{
	<p id="memo" title={props.label}>
		{props.label as string}
	</p>
});

export function MemoHeld(props: { label: string; wait: Promise<unknown> | null }) @{
	<section>
		<MemoLabel label={props.label} />
		@if (props.wait) {
			<Wait wait={props.wait} />
		}
	</section>
}

// `Fails` throws while its commit coerces the title; `Sibling` commits beside it.
export function CommitError(props: { title: unknown; sibling: string }) @{
	<section>
		@try {
			<p id="fails" title={props.title}>
				{'body'}
			</p>
		} @catch (error) {
			<p id="caught">{(error as Error).message as string}</p>
		}
		<i id="sibling" title={props.sibling}>
			{props.sibling as string}
		</i>
	</section>
}

// One drain: the parent's urgent update renders the owner's row first; then a
// two-setter transition re-renders the row inside the boundary, whose other
// child suspends, so only the boundary's window drops (no cue re-render).
interface NestedControls {
	setStep(step: number): void;
	setLocal(local: number): void;
	setSusp(susp: number): void;
}

function Owner(props: { step: number; controls: NestedControls }) @{
	const [local, setLocal] = useState(0);
	props.controls.setLocal = setLocal;
	<p id="row" title={'title:' + props.step + ':' + local}>
		{(props.step + ':' + local) as string}
	</p>
}

function Susp(props: { controls: NestedControls; wait: Promise<unknown> }) @{
	const [susp, setSusp] = useState(0);
	props.controls.setSusp = setSusp;
	if (susp === 1) use(props.wait);
	<i id="susp">{String(susp) as string}</i>
}

export function Nested(props: { controls: NestedControls; wait: Promise<unknown> }) @{
	const [step, setStep] = useState(0);
	props.controls.setStep = setStep;
	<section>
		@try {
			<>
				<Owner step={step} controls={props.controls} />
				<Susp controls={props.controls} wait={props.wait} />
			</>
		} @pending {
			<p id="fallback">{'loading'}</p>
		}
	</section>
}
