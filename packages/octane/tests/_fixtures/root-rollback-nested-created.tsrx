import { createPortal, use, useState, useTransition } from 'octane';

interface Loaded {
	promise: PromiseLike<string>;
	target: Element;
}

interface Shown extends Loaded {
	show: boolean;
	label: string;
}

function Reader(props: { promise: PromiseLike<string> }) @{
	const value = use(props.promise);
	<output class="read">{value as string}</output>
}

// The portal's content suspends while the portal itself is still mounting.
function Modal(props: Loaded) @{
	<section class="modal-owner">
		{createPortal(
			<div class="modal">
				<span class="modal-title">{'title'}</span>
				<Reader promise={props.promise} />
			</div>,
			props.target,
		)}
	</section>
}

export function FreshPortalSuspends(props: Shown) @{
	<main>
		<span id="label">{props.label as string}</span>
		@if (props.show) {
			<Modal promise={props.promise} target={props.target} />
		}
	</main>
}

function Tip(props: { label: string; target: Element }) @{
	<span class="tip-anchor">
		{createPortal(<b class={'tip tip-' + props.label}>{props.label as string}</b>, props.target)}
	</span>
}

function First(props: { advance: () => void; target: Element }) @{
	props.advance();
	<Tip label="first" target={props.target} />
}

function Second(props: Loaded) @{
	const [label] = useState('second');
	<div class="second">
		<Tip label={label} target={props.target} />
		<Reader promise={props.promise} />
	</div>
}

// A new Stepper renders twice in one root render: First moves it to its
// second arm, which suspends.
function Stepper(props: Loaded) @{
	const [step, setStep] = useState(0);
	@if (step === 0) {
		<First advance={() => setStep(1)} target={props.target} />
	} @else {
		<Second promise={props.promise} target={props.target} />
	}
}

export function FreshParentSwap(props: Shown) @{
	<main>
		<span id="label">{props.label as string}</span>
		@if (props.show) {
			<Stepper promise={props.promise} target={props.target} />
		}
	</main>
}

// A transition into a committed boundary keeps the boundary's current content
// while the new content suspends.
export function HeldBoundaryPortal(props: Loaded) @{
	const [show, setShow] = useState(false);
	const [, start] = useTransition();
	<div>
		<button id="open" onClick={() => start(() => setShow(true))}>
			{'open'}
		</button>
		@try {
			<div class="body">
				<span id="stable">{'stable'}</span>
				@if (show) {
					<Modal promise={props.promise} target={props.target} />
				}
			</div>
		} @pending {
			<span id="fallback">{'fallback'}</span>
		}
	</div>
}
