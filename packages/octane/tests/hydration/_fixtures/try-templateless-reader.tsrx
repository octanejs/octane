// A @try body whose only child is a template-less component that reads a
// promise with use(). The server rejected the promise, so it rendered the
// @catch arm (plus a rejection seed) where the client's componentSlot claim
// expects the reader's own range. Hydration must read the seed, adopt the
// server catch arm, and keep the hosts around the boundary.
import { ErrorBoundary, use } from 'octane';

function Reader(props: { promise: Promise<unknown> }) {
	use(props.promise);
}

function TemplateReader(props: { promise: Promise<unknown> }) @{
	use(props.promise);
	<i />
}

function Value(props: { promise: Promise<string> }) @{
	const value = use(props.promise);
	<span class="value">{value as string}</span>
}

export function Rejected(props: { promise: Promise<unknown> }) @{
	<div>
		<h1>{'before'}</h1>
		@try {
			<Reader promise={props.promise} />
		} @catch (error: unknown) {
			<p class="caught">{String(error) as string}</p>
		}
		<button>{'after'}</button>
	</div>
}

// The control: a template reader lowers to componentSlotLite and already adopts.
export function TemplateRejected(props: { promise: Promise<unknown> }) @{
	<div>
		<h1>{'before'}</h1>
		@try {
			<TemplateReader promise={props.promise} />
		} @catch (error: unknown) {
			<p class="caught">{String(error) as string}</p>
		}
		<button>{'after'}</button>
	</div>
}

// The reader is followed by a host in the same try body, and a later boundary
// reads its own seed: positional seeds after the caught boundary stay aligned.
export function RejectedThenResolved(props: {
	rejected: Promise<unknown>;
	resolved: Promise<string>;
}) @{
	<div>
		@try {
			<>
				<Reader promise={props.rejected} />
				<b>{'body'}</b>
			</>
		} @catch (error: unknown) {
			<p class="caught">{String(error) as string}</p>
		}
		@try {
			<Value promise={props.resolved} />
		} @pending {
			<em>{'loading'}</em>
		}
	</div>
}

// The template-less reader resolved on the server: its range is adopted as usual.
export function Resolved(props: { promise: Promise<unknown> }) @{
	<div>
		@try {
			<>
				<Reader promise={props.promise} />
				<b>{'body'}</b>
			</>
		} @catch (error: unknown) {
			<p class="caught">{String(error) as string}</p>
		}
		<button>{'after'}</button>
	</div>
}

// The same boundary with a @pending arm hydrates through Suspense.
export function RejectedPending(props: { promise: Promise<unknown> }) @{
	<div>
		<h1>{'before'}</h1>
		@try {
			<Reader promise={props.promise} />
		} @pending {
			<em>{'loading'}</em>
		} @catch (error: unknown) {
			<p class="caught">{String(error) as string}</p>
		}
		<button>{'after'}</button>
	</div>
}

// The reader is rendered by another template-less component.
function Outer(props: { promise: Promise<unknown> }) {
	return <Reader promise={props.promise} />;
}

export function NestedRejected(props: { promise: Promise<unknown> }) @{
	<div>
		<h1>{'before'}</h1>
		@try {
			<Outer promise={props.promise} />
		} @catch (error: unknown) {
			<p class="caught">{String(error) as string}</p>
		}
		<button>{'after'}</button>
	</div>
}

function rethrow(error: unknown): string {
	throw new Error('inner:' + String(error));
}

function Inner(props: { promise: Promise<unknown> }) @{
	<section>
		@try {
			<Reader promise={props.promise} />
		} @catch (error: unknown) {
			const message = rethrow(error);
			<i>{message}</i>
		}
	</section>
}

function OuterInner(props: { promise: Promise<unknown> }) {
	return <Inner promise={props.promise} />;
}

// An inner boundary catches the rejection and rethrows past the outer component.
export function Rethrown(props: { promise: Promise<unknown> }) @{
	<div>
		<h1>{'before'}</h1>
		@try {
			<OuterInner promise={props.promise} />
		} @catch (error: unknown) {
			<p class="caught">{String(error) as string}</p>
		}
		<button>{'after'}</button>
	</div>
}

function BoundaryInner(props: { promise: Promise<unknown> }) @{
	<section>
		<ErrorBoundary fallback={(error: unknown) => <i>{rethrow(error)}</i>}>
			<Reader promise={props.promise} />
		</ErrorBoundary>
	</section>
}

function OuterBoundary(props: { promise: Promise<unknown> }) {
	return <BoundaryInner promise={props.promise} />;
}

export function RethrownBoundary(props: { promise: Promise<unknown> }) @{
	<div>
		<h1>{'before'}</h1>
		@try {
			<OuterBoundary promise={props.promise} />
		} @catch (error: unknown) {
			<p class="caught">{String(error) as string}</p>
		}
		<button>{'after'}</button>
	</div>
}

function Label(props: { text: string }) {
	return props.text;
}

// The server takes the other arm, so its <p> stands where the client's
// template-less component expects its range.
export function Branch(props: { server: boolean }) @{
	<div>
		<h1>{'before'}</h1>
		@if (props.server) {
			<p class="server">{'server'}</p>
		} @else {
			<Label text="client" />
		}
		<button>{'after'}</button>
	</div>
}
