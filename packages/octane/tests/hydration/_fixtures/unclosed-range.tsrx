import { Hydrate, use } from 'octane';
import type { OctaneNode } from 'octane';
import { unbound } from 'octane/behavior';
import type { HydrateWhen } from 'octane/hydration';

// A component between static siblings renders in a server range. The tests
// remove that range's closing marker, as an HTML minifier or proxy that strips
// comments can, before hydrating.

interface ButtonProps {
	label: string;
	onPress?: () => void;
	children?: OctaneNode;
}

interface ParentProps {
	label: string;
	onPress?: () => void;
}

export function PlainButton(props: ButtonProps) @{
	<button data-state={props.label} onClick={props.onPress}>{props.children}</button>
}

export function BindingButton(props: ButtonProps) @{
	'use dom bindings';
	<button data-state={props.label} onClick={props.onPress}>{unbound(props.children)}</button>
}

export function PlainParent(props: ParentProps) @{
	<section>
		<b>{'x'}</b>
		<PlainButton label={props.label} onPress={props.onPress}>
			<span>{'Hello'}</span>
		</PlainButton>
		<i>{'y'}</i>
	</section>
}

export function BindingParent(props: ParentProps) @{
	<section>
		<b>{'x'}</b>
		<BindingButton label={props.label} onPress={props.onPress}>
			<span>{'Hello'}</span>
		</BindingButton>
		<i>{'y'}</i>
	</section>
}

// An entry binding view with several roots renders in a root range of its own.
export function BindingView(props: ParentProps) @{
	'use dom bindings';
	<>
		<b data-state={props.label}>{'x'}</b>
		<button onClick={props.onPress}>{'y'}</button>
	</>
}

// The damaged range sits inside a try body whose catch arm must not render.
export function CaughtParent(props: ParentProps) @{
	<section>
		<b>{'x'}</b>
		@try {
			<PlainButton label={props.label} onPress={props.onPress}>
				<span>{'Hello'}</span>
			</PlainButton>
		} @catch (error) {
			<p>{'caught'}</p>
		}
		<i>{'y'}</i>
	</section>
}

export const gate: { promise?: Promise<void> } = {};

function read(value: unknown): string {
	if (value !== undefined) throw value;
	return 'ok';
}

function GateLeaf() @{
	<em>{read(gate.promise) as string}</em>
}

// The damaged range sits in an element inside a Suspense arm, whose hydration
// can suspend before it and finish after the root commits.
export function SuspendedParent(props: ParentProps) @{
	<section>
		@try {
			<div>
				<GateLeaf />
				<PlainButton label={props.label} onPress={props.onPress}>
					<span>{'Hello'}</span>
				</PlainButton>
			</div>
		} @pending {
			<p>{'pending'}</p>
		}
		<i>{'y'}</i>
	</section>
}

export interface StreamedProps extends ParentProps {
	gate: { pending: boolean; promise: Promise<void> };
	load: () => Promise<string>;
}

function waitFor(gate: StreamedProps['gate']): string {
	if (gate.pending) throw gate.promise;
	return 'y';
}

function Later(props: { gate: StreamedProps['gate'] }) @{
	<i>{waitFor(props.gate)}</i>
}

// The damaged range sits in a streamed Suspense arm beside the arm's server
// data. Later suspends the attempt that encloses the arm after the arm has
// recovered: an outer Suspense arm's attempt, or the root's.
function StreamedArm(props: StreamedProps) @{
	const value = use(props.load());
	<div>
		<output>{value}</output>
		<PlainButton label={props.label} onPress={props.onPress}>
			<span>{'Hello'}</span>
		</PlainButton>
	</div>
}

export function StreamedInSuspense(props: StreamedProps) @{
	<section>
		@try {
			<article>
				@try {
					<StreamedArm {...props} />
				} @pending {
					<p>{'loading'}</p>
				}
				<Later gate={props.gate} />
			</article>
		} @pending {
			<p>{'outer loading'}</p>
		}
	</section>
}

export function StreamedInRoot(props: StreamedProps) @{
	<section>
		@try {
			<StreamedArm {...props} />
		} @pending {
			<p>{'loading'}</p>
		}
		<Later gate={props.gate} />
	</section>
}

// The damaged range sits inside a Hydrate boundary, beside content outside it.
export function Island(props: ParentProps & { when: HydrateWhen }) @{
	<main>
		<Hydrate when={props.when}>
			<PlainParent label={props.label} onPress={props.onPress} />
		</Hydrate>
		<p>{'after'}</p>
	</main>
}
