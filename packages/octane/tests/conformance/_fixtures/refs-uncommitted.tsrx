import { Activity, Fragment, useState } from 'octane';

// Fixtures for conformance/refs-uncommitted.test.ts.

type Track = (label: string, target: unknown) => () => void;

// Advances its parent's step while rendering. Octane renders that cross-component
// update in the same drain, so the parent renders again before the commit
// attaches any of its refs.
function StepTo(props: { step: number; target: number; setStep: (step: number) => void }) {
	if (props.step < props.target) props.setStep(props.step + 1);
	return null;
}

// Every pass gives the host a fresh inline ref labelled `${step}/${target}`. The
// host renders while `show` is set and `step` is below `hideAt`.
export function RequeuedRefHost(props: {
	show: boolean;
	target: number;
	hideAt: number;
	fragment: boolean;
	track: Track;
}) @{
	const [step, setStep] = useState(0);
	const label = `${step}/${props.target}`;
	<>
		@if (props.show && step < props.hideAt) {
			@if (props.fragment) {
				<Fragment ref={(instance) => props.track(label, instance)}>
					<i />
				</Fragment>
			} @else {
				<div ref={(el) => props.track(label, el)} />
			}
		}
		<StepTo step={step} target={props.target} setStep={setStep} />
	</>
}

// Hides its host at step 1 and reveals it with ref `b` at step 2, so the reveal
// reconnects a host whose committed ref `a` is still attached.
export function RequeuedActivityReveal(props: {
	a: (target: unknown) => () => void;
	b: (target: unknown) => () => void;
	target: number;
	fragment: boolean;
}) @{
	const [step, setStep] = useState(0);
	const ref = step === 2 ? props.b : props.a;
	<>
		<Activity mode={step === 1 ? 'hidden' : 'visible'}>
			@if (props.fragment) {
				<Fragment ref={ref}>
					<i />
				</Fragment>
			} @else {
				<div ref={ref} />
			}
		</Activity>
		<StepTo step={step} target={props.target} setStep={setStep} />
	</>
}

// Cycles through stable refs, one per step.
export function RequeuedRefCycle(props: {
	refs: Array<(el: Element | null) => () => void>;
	target: number;
}) @{
	const [step, setStep] = useState(0);
	<>
		<div ref={props.refs[step % props.refs.length]} />
		<StepTo step={step} target={props.target} setStep={setStep} />
	</>
}
