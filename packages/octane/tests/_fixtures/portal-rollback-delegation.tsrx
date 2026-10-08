import { createPortal, use, useState } from 'octane';

// Two portals share one target: a committed one with a handler, and one that a
// later root render creates and then rolls back because a sibling suspends with
// no Suspense boundary. The rollback must release only the new portal's share
// of the target's delegated listeners.

type Target = { target: Element };

function Reader(props: { promise: Promise<string> }) @{
	const value = use(props.promise);
	<output class="read">{value as string}</output>
}

function Kept(props: Target & { onHit: () => void }) @{
	<span class="kept-owner">
		{createPortal(
			<button id="kept" onClick={props.onHit}>
				{'kept'}
			</button>,
			props.target,
		)}
	</span>
}

// `createPortal` as a host child: the compiler's direct portal path.
function FreshHostChild(props: Target) @{
	<span class="fresh-owner">{createPortal(<b class="fresh">{'fresh'}</b>, props.target)}</span>
}

// `createPortal` returned as a value: the value-slot portal path.
function FreshValue(props: Target) {
	return createPortal(<b class="fresh">{'fresh'}</b>, props.target);
}

export function PortalRollback(
	props: Target & {
		onHit: () => void;
		show: boolean;
		shape: 'host' | 'value' | 'arm' | 'ternary';
		promise: Promise<string>;
	},
) @{
	<main>
		<Kept target={props.target} onHit={props.onHit} />
		<span class="ternary-owner">
			{props.show && props.shape === 'ternary'
				? createPortal(<b class="fresh">{'fresh'}</b>, props.target)
				: null}
		</span>
		@if (props.show) {
			<>
				@switch (props.shape) {
					@case 'host': {
						<FreshHostChild target={props.target} />
					}
					@case 'value': {
						<FreshValue target={props.target} />
					}
					@case 'arm': {
						<span class="fresh-owner">
							{createPortal(<b class="fresh">{'fresh'}</b>, props.target)}
						</span>
					}
				}
				<Reader promise={props.promise} />
			</>
		}
	</main>
}

// The new portal's own content suspends, so the root rolls back before that
// portal has finished mounting.
export function SuspendedPortalRollback(
	props: Target & { onHit: () => void; show: boolean; promise: Promise<string> },
) @{
	<main>
		<Kept target={props.target} onHit={props.onHit} />
		@if (props.show) {
			<span class="fresh-owner">
				{createPortal(<Reader promise={props.promise} />, props.target)}
			</span>
		}
	</main>
}

function First(props: Target & { value: boolean; advance: () => void }) @{
	props.advance();
	@if (props.value) {
		<FreshValue target={props.target} />
	} @else {
		<FreshHostChild target={props.target} />
	}
}

// A new Stepper renders twice in one root render: First creates a portal and
// moves Stepper to its second arm, which removes that portal again before the
// root suspends.
function Stepper(props: Target & { value: boolean; promise: Promise<string> }) @{
	const [step, setStep] = useState(0);
	@if (step === 0) {
		<First advance={() => setStep(1)} target={props.target} value={props.value} />
	} @else {
		<Reader promise={props.promise} />
	}
}

export function RemovedPortalRollback(
	props: Target & {
		onHit: () => void;
		show: boolean;
		value: boolean;
		promise: Promise<string>;
	},
) @{
	<main>
		<Kept target={props.target} onHit={props.onHit} />
		@if (props.show) {
			<Stepper target={props.target} value={props.value} promise={props.promise} />
		}
	</main>
}
