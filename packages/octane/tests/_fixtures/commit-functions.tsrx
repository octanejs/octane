import { createElement, memo, startTransition, use, useLayoutEffect, useState } from 'octane';

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

// A spread carrying attributes, a handler, a ref and the host's children,
// beside the same root-suspending gate.
export function HeldSpread(props: {
	attrs: Record<string, unknown>;
	wait: Promise<unknown> | null;
}) @{
	<section>
		<button id="spread" {...props.attrs} />
		@if (props.wait) {
			<Wait wait={props.wait} />
		}
	</section>
}

// The same props on a descriptor host.
export function HeldDescriptor(props: {
	attrs: Record<string, unknown>;
	wait: Promise<unknown> | null;
}) {
	return createElement(
		'section',
		null,
		createElement('button', { id: 'descriptor', ...props.attrs }),
		props.wait ? createElement(Wait, { wait: props.wait }) : null,
	);
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
			<p id="fails" title={props.title as string}>
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

// The same drain, but the transition's render of the row lands back on the
// committed values while the urgent render's are still pending.
interface RevertControls {
	setStep(step: number): void;
	setLocal(local: number): void;
}

function RevertRow(props: { step: number; controls: RevertControls }) @{
	const [local, setLocal] = useState(0);
	props.controls.setLocal = setLocal;
	const shown = String(props.step - local);
	<p id="revert" title={'title:' + shown} onClick={() => props.controls.setLocal(local)}>
		{shown}
	</p>
}

export function Revert(props: { controls: RevertControls }) @{
	const [step, setStep] = useState(0);
	props.controls.setStep = setStep;
	<section>
		@try {
			<RevertRow step={step} controls={props.controls} />
		} @pending {
			<p id="fallback">{'loading'}</p>
		}
	</section>
}

function CallbackTail(props: { tail: string }) @{
	<span id="tail">{props.tail as string}</span>
}

// A custom element the descriptor renderer writes, before a compiled sibling,
// so its attribute callback runs between their commit entries.
export function CommitCallback(props: { value: string; tail: string; log: string[] }) @{
	useLayoutEffect(() => {
		props.log.push('layout:' + props.value);
	});
	<section>
		{createElement('commit-callback-hook', { 'data-value': props.value })}
		<CallbackTail tail={props.tail} />
	</section>
}

// Two templates whose commit functions are the same code, beside one that
// differs only in its setter.
function TwinTitle(props: { label: string }) @{
	<p id="twin-title" title={props.label}>
		{props.label as string}
	</p>
}

function TwinTitleCopy(props: { label: string }) @{
	<em id="twin-copy" title={props.label}>
		{props.label as string}
	</em>
}

function TwinClass(props: { label: string }) @{
	<i id="twin-class" class={props.label}>
		{props.label as string}
	</i>
}

export function Twins(props: {
	title: string;
	copy: string;
	cls: string;
	wait: Promise<unknown> | null;
}) @{
	<section>
		<TwinTitle label={props.title} />
		<TwinTitleCopy label={props.copy} />
		<TwinClass label={props.cls} />
		@if (props.wait) {
			<Wait wait={props.wait} />
		}
	</section>
}
