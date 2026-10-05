import { createElement, ErrorBoundary, HYDRATION_RANGE_BOUNDARY, use, useState } from 'octane';
import type { ComponentBody, OctaneNode } from 'octane';

// A template (`@{}`) component clones its root element before its holes run, so
// one that throws from a hole has already adopted that clone against whatever
// the server rendered in its place. When the server's render threw the same
// way, that is the boundary's @catch arm.

function read(value: unknown): string {
	if (value !== undefined) throw value;
	return 'ok';
}

function Leaf(props: { value: unknown }) @{
	<i>{read(props.value) as string}</i>
}

function SuspendingLeaf(props: { promise: Promise<string> }) @{
	<i>{use(props.promise) as string}</i>
}

function Inner(props: { value: unknown }) @{
	<b>{read(props.value) as string}</b>
}

// Its class binding writes after the render, unlike its child's clone.
function Hosted(props: { value: unknown; server?: boolean }) @{
	<p class={props.server ? 'server' : 'client'}>
		<Inner value={props.value} />
	</p>
}

// Template-less components claim a component range instead of cloning.
function Settle(props: { value: unknown }) {
	if (props.value !== undefined) throw props.value;
	return 'settled';
}

export interface PageProps {
	value?: unknown;
	onAfter: () => void;
	/** The server renders the first arm, so its `<b>` stands where the client renders another. */
	server?: boolean;
	/** Renders the template-less arm. */
	unframed?: boolean;
	promise?: Promise<string>;
	fallback?: string;
	/** The value of the outer Leaf, after the inner boundary. */
	outer?: unknown;
	/** Updates the page from a later sibling's render. */
	update?: boolean;
	/** Makes the Flaky body throw on its first render, the one that hydrates. */
	once?: { thrown: boolean };
}

function throwOnce(once: { thrown: boolean } | undefined): string {
	if (once !== undefined && !once.thrown) {
		once.thrown = true;
		throw new Error('hydration only');
	}
	return 'ok';
}

function OnceLeaf(props: { once?: { thrown: boolean } }) @{
	<i>{throwOnce(props.once) as string}</i>
}

// Its body throws while hydrating, and not when it renders again.
export function Flaky(props: PageProps) @{
	<div>
		<h1>{'before'}</h1>
		@try {
			<OnceLeaf once={props.once} />
		} @catch (error: unknown) {
			<p class="caught">{String(error) as string}</p>
		}
		<button onClick={props.onAfter}>{'after'}</button>
	</div>
}

export function Clone(props: PageProps) @{
	<div>
		<h1>{'before'}</h1>
		@try {
			<Leaf value={props.value} />
		} @catch (error: unknown) {
			<p class="caught">{String(error) as string}</p>
		}
		<button onClick={props.onAfter}>{'after'}</button>
	</div>
}

export function Adopted(props: PageProps) @{
	<div>
		<h1>{'before'}</h1>
		@try {
			<Hosted value={props.value} server={props.server} />
		} @catch (error: unknown) {
			<p class="caught">{String(error) as string}</p>
		}
		<button onClick={props.onAfter}>{'after'}</button>
	</div>
}

export function Plain(props: PageProps) @{
	<div>
		<h1>{'before'}</h1>
		@try {
			<Settle value={props.value} />
		} @catch (error: unknown) {
			<p class="caught">{String(error) as string}</p>
		}
		<button onClick={props.onAfter}>{'after'}</button>
	</div>
}

export function Branch(props: PageProps) @{
	<div>
		<h1>{'before'}</h1>
		@try {
			@if (props.server) {
				<b class="server">{'server'}</b>
			} @else if (props.promise) {
				<SuspendingLeaf promise={props.promise} />
			} @else if (props.unframed) {
				<Settle value={props.value} />
			} @else {
				<Leaf value={props.value} />
			}
		} @catch (error: unknown) {
			<p class="caught">{String(error) as string}</p>
		}
		<button onClick={props.onAfter}>{'after'}</button>
	</div>
}

// A boundary with @pending hydrates the server's resolved arm on its own.
export function PendingBranch(props: PageProps) @{
	<div>
		<h1>{'before'}</h1>
		@try {
			@if (props.server) {
				<b class="server">{'server'}</b>
			} @else if (props.promise) {
				<SuspendingLeaf promise={props.promise} />
			} @else {
				<Leaf value={props.value} />
			}
		} @pending {
			<span class="pending">{'pending'}</span>
		} @catch (error: unknown) {
			<p class="caught">{String(error) as string}</p>
		}
		<button onClick={props.onAfter}>{'after'}</button>
	</div>
}

// A static fallback lowers to the compiled catch-only boundary.
export function Boundary(props: PageProps) @{
	<div>
		<h1>{'before'}</h1>
		<ErrorBoundary fallback={(error: unknown) => <p class="caught">{String(error) as string}</p>}>
			@if (props.server) {
				<b class="server">{'server'}</b>
			} @else {
				<Leaf value={props.value} />
			}
		</ErrorBoundary>
		<button onClick={props.onAfter}>{'after'}</button>
	</div>
}

// A fallback prop renders the ErrorBoundary component instead.
export function DynamicBoundary(props: PageProps) @{
	<div>
		<h1>{'before'}</h1>
		<ErrorBoundary fallback={props.fallback}>
			<Leaf value={props.value} />
		</ErrorBoundary>
		<button onClick={props.onAfter}>{'after'}</button>
	</div>
}

export function Nested(props: PageProps) @{
	<div>
		<h1>{'before'}</h1>
		@try {
			<section>
				@try {
					@if (props.server) {
						<b class="server">{'server'}</b>
					} @else {
						<Leaf value={props.value} />
					}
				} @catch (error: unknown) {
					<p class="inner">{String(error) as string}</p>
				}
				<Leaf value={props.outer} />
			</section>
		} @catch (error: unknown) {
			<p class="caught">{String(error) as string}</p>
		}
		<button onClick={props.onAfter}>{'after'}</button>
	</div>
}

// The inner boundary has no @catch, so the outer one catches its error.
export function Uncaught(props: PageProps) @{
	<div>
		<h1>{'before'}</h1>
		@try {
			<section>
				@try {
					@if (props.server) {
						<b class="server">{'server'}</b>
					} @else {
						<Leaf value={props.value} />
					}
				} @pending {
					<span class="pending">{'pending'}</span>
				}
			</section>
		} @catch (error: unknown) {
			<p class="caught">{String(error) as string}</p>
		}
		<button onClick={props.onAfter}>{'after'}</button>
	</div>
}

function Update(props: { set?: (show: boolean) => void }) @{
	// Updates the parent during render; the update applies after the hydration
	// it interrupts.
	if (props.set !== undefined) props.set(true);
	<span>{'update'}</span>
}

// The same, from a child that has state of its own.
function StatefulUpdate(props: { set?: (show: boolean) => void }) @{
	const [label] = useState('update');
	if (props.set !== undefined) props.set(true);
	<span>{label as string}</span>
}

// The update switches a hydrated try body to the Leaf arm.
export function Rerender(props: PageProps) @{
	const [show, setShow] = useState(false);
	<div>
		<h1>{'before'}</h1>
		@try {
			@if (show) {
				<Leaf value={props.value} />
			} @else {
				<b class="server">{'server'}</b>
			}
		} @catch (error: unknown) {
			<p class="caught">{String(error) as string}</p>
		}
		<Update set={props.update ? setShow : undefined} />
		<button onClick={props.onAfter}>{'after'}</button>
	</div>
}

export function RerenderStateful(props: PageProps) @{
	const [show, setShow] = useState(false);
	<div>
		<h1>{'before'}</h1>
		@try {
			@if (show) {
				<Leaf value={props.value} />
			} @else {
				<b class="server">{'server'}</b>
			}
		} @catch (error: unknown) {
			<p class="caught">{String(error) as string}</p>
		}
		<StatefulUpdate set={props.update ? setShow : undefined} />
		<button onClick={props.onAfter}>{'after'}</button>
	</div>
}

export function RerenderBoundary(props: PageProps) @{
	const [show, setShow] = useState(false);
	<div>
		<h1>{'before'}</h1>
		<ErrorBoundary fallback={(error: unknown) => <p class="caught">{String(error) as string}</p>}>
			@if (show) {
				<Leaf value={props.value} />
			} @else {
				<b class="server">{'server'}</b>
			}
		</ErrorBoundary>
		<Update set={props.update ? setShow : undefined} />
		<button onClick={props.onAfter}>{'after'}</button>
	</div>
}

// Passthrough boundaries render above the hydration range owner, whose content
// is all that the server rendered.
function RangeOwner(props: { children?: OctaneNode }) {
	return props.children;
}

RangeOwner[HYDRATION_RANGE_BOUNDARY] = 'owner';

export function ServerSelection() {
	return createElement('b', { class: 'server' }, 'server');
}

type FallbackConfig = { fallback: OctaneNode };

export function PassthroughBoundary(props: { value: unknown }) {
	return createElement(
		ErrorBoundary as ComponentBody<FallbackConfig>,
		{ fallback: createElement('p', { class: 'caught' }, 'caught') },
		createElement(RangeOwner, {}, createElement(Leaf, { value: props.value })),
	);
}

PassthroughBoundary[HYDRATION_RANGE_BOUNDARY] = 'passthrough';
