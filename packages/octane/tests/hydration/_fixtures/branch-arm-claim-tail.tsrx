import { Hydrate, useState, type ComponentBody } from 'octane';
import type { HydrationStrategy } from 'octane/hydration';

// The server renders the first arm of each branch, whose content ends with a
// node the client's arm does not render. Every component is framed, so each
// one the client's arm renders claims a server range.

function A() @{
	<b>{'a'}</b>
}

function S() @{
	<s>{'s'}</s>
}

function U() @{
	<i>{'u'}</i>
}

function Em() @{
	<em>{'e'}</em>
}

function Hooked() @{
	const [text] = useState('h');
	<em>{text as string}</em>
}

export function Y(props: { server?: boolean }) @{
	<div>
		@if (props.server) {
			<>
				<S />
				<A />
				<u>{'tail'}</u>
			</>
		} @else {
			<>
				<S />
				<A />
			</>
		}
	</div>
}

export function SoleComponent(props: { server?: boolean }) @{
	<div>
		@if (props.server) {
			<>
				<S />
				<u>{'tail'}</u>
			</>
		} @else {
			<S />
		}
	</div>
}

// A component with hooks claims its range through its own block.
export function HookedArm(props: { server?: boolean }) @{
	<div>
		@if (props.server) {
			<>
				<S />
				<Hooked />
				<u>{'tail'}</u>
			</>
		} @else {
			<>
				<S />
				<Hooked />
			</>
		}
	</div>
}

export function Switched(props: { k: string }) @{
	<div>
		@switch (props.k) {
			@case 'server': {
				<>
					<S />
					<A />
					<u>{'tail'}</u>
				</>
			}
			@default: {
				<>
					<S />
					<A />
				</>
			}
		}
	</div>
}

// The arm's last claim is a nested branch.
export function NestedBranch(props: { server?: boolean; inner: boolean }) @{
	<div>
		@if (props.server) {
			<>
				<S />
				@if (props.inner) {
					<A />
				}
				<u>{'tail'}</u>
			</>
		} @else {
			<>
				<S />
				@if (props.inner) {
					<A />
				}
			</>
		}
	</div>
}

// The client's arm is a branch the server rendered no range for. Its template
// adopts the server arm's hosts in place, after which the server's arm ends
// with a host the client does not render.
export function MarkerlessArm(props: { server?: boolean; inner?: boolean }) @{
	<div>
		@if (props.server) {
			<>
				<s>{'s'}</s>
				<b>{'a'}</b>
				<u>{'tail'}</u>
			</>
		} @else {
			@if (props.inner) {
				<>
					<s>{'s'}</s>
					<b>{'a'}</b>
				</>
			}
		}
	</div>
}

export function MarkerlessSwitch(props: { server?: boolean; inner?: boolean }) @{
	<div>
		@if (props.server) {
			<>
				<s>{'s'}</s>
				<b>{'a'}</b>
				<u>{'tail'}</u>
			</>
		} @else {
			@switch (props.inner) {
				@case true: {
					<>
						<s>{'s'}</s>
						<b>{'a'}</b>
					</>
				}
			}
		}
	</div>
}

// Neither branch has a server range, and the outer one's content is the inner.
export function MarkerlessNested(props: { server?: boolean; inner?: boolean }) @{
	<div>
		@if (props.server) {
			<>
				<s>{'s'}</s>
				<b>{'a'}</b>
				<u>{'tail'}</u>
			</>
		} @else {
			@if (props.inner) {
				@if (props.inner) {
					<>
						<s>{'s'}</s>
						<b>{'a'}</b>
					</>
				}
			}
		}
	</div>
}

// The server's arm renders exactly the client's hosts.
export function MarkerlessSameArm(props: { server?: boolean; inner?: boolean }) @{
	<div>
		@if (props.server) {
			<>
				<s>{'s'}</s>
				<b>{'a'}</b>
			</>
		} @else {
			@if (props.inner) {
				<>
					<s>{'s'}</s>
					<b>{'a'}</b>
				</>
			}
		}
	</div>
}

// The server's arm ends before the client's branch renders its second host.
export function MarkerlessShortArm(props: { server?: boolean; inner?: boolean }) @{
	<div>
		@if (props.server) {
			<s>{'s'}</s>
		} @else {
			@if (props.inner) {
				<>
					<s>{'s'}</s>
					<b>{'a'}</b>
				</>
			}
		}
	</div>
}

// Both arms render the same content: the arm's template adopts the host that
// follows its last component.
export function SameContent(props: { server?: boolean }) @{
	<div>
		@if (props.server) {
			<>
				<S />
				<A />
				<u>{'tail'}</u>
			</>
		} @else {
			<>
				<S />
				<A />
				<u>{'tail'}</u>
			</>
		}
	</div>
}

// The client's last component adopts the server host after the first one's
// range as its root.
export function AdoptedAfterClaim(props: { server?: boolean }) @{
	<div>
		@if (props.server) {
			<>
				<S />
				<i>{'u'}</i>
			</>
		} @else {
			<>
				<S />
				<U />
			</>
		}
	</div>
}

// The client's first component cannot adopt the server's first host, so
// recovery rebuilds its root before the arm's last claim.
export function RebuiltBeforeClaim(props: { server?: boolean }) @{
	<div>
		@if (props.server) {
			<>
				<i>{'x'}</i>
				<S />
				<u>{'tail'}</u>
			</>
		} @else {
			<>
				<Em />
				<S />
			</>
		}
	</div>
}

// A pending child after the branch holds the first attempt, which then replays.
export function TailThenChild(props: { server?: boolean; Child: ComponentBody }) @{
	const Child = props.Child;
	<div>
		@if (props.server) {
			<>
				<S />
				<A />
				<u>{'tail'}</u>
			</>
		} @else {
			<>
				<S />
				<A />
			</>
		}
		<Child />
	</div>
}

// Inside a boundary, the suspended attempt leaves what it built for the next one.
export function TryTailThenChild(props: { server?: boolean; Child: ComponentBody }) @{
	const Child = props.Child;
	<div>
		@try {
			<section>
				@if (props.server) {
					<>
						<S />
						<A />
						<u>{'tail'}</u>
					</>
				} @else {
					<>
						<S />
						<A />
					</>
				}
				<Child />
			</section>
		} @pending {
			<p>{'loading' as string}</p>
		}
	</div>
}

export function Tail() @{
	<p>{'child' as string}</p>
}

export function DormantTail(props: { server?: boolean; when: HydrationStrategy }) @{
	<div>
		<Hydrate when={props.when} split={false}>
			<section>
				@if (props.server) {
					<>
						<S />
						<A />
						<u>{'tail'}</u>
					</>
				} @else {
					<>
						<S />
						<A />
					</>
				}
			</section>
		</Hydrate>
	</div>
}

// The arm's last component is pending, so the arm's first attempt suspends.
export function PendingInArm(props: { server?: boolean; Child: ComponentBody }) @{
	const Child = props.Child;
	<div>
		@if (props.server) {
			<>
				<S />
				<Child />
				<u>{'tail'}</u>
			</>
		} @else {
			<>
				<S />
				<Child />
			</>
		}
	</div>
}

export function TryPendingInArm(props: { server?: boolean; Child: ComponentBody }) @{
	const Child = props.Child;
	<div>
		@try {
			<section>
				@if (props.server) {
					<>
						<S />
						<Child />
						<u>{'tail'}</u>
					</>
				} @else {
					<>
						<S />
						<Child />
					</>
				}
			</section>
		} @pending {
			<p>{'loading' as string}</p>
		}
	</div>
}
