import { createContext, createPortal, ErrorBoundary, Suspense } from 'octane';

// Components whose OUTPUT is a range rather than a single cloned element need
// the compiler-emitted block handle. If the scan that decides to emit it ever
// under-reports, these throw ReferenceError on first render.

export function IfRoot(props) @{
	@if (props.on) {
		<b class="out">{'on'}</b>
	} @else {
		<i class="out">{'off'}</i>
	}
}

export function ForRoot(props) @{
	@for (const item of props.items; key item.id) {
		<li class="out">{item.label}</li>
	} @empty {
		<li class="out">{'empty'}</li>
	}
}

export function SwitchRoot(props) @{
	@switch (props.kind) {
		@case 'a': {
			<b class="out">{'A'}</b>
		}
		@default: {
			<i class="out">{'D'}</i>
		}
	}
}

export function TryRoot(props) @{
	@try {
		<b class="out">{props.value as string}</b>
	} @catch (error) {
		<i class="out">{'caught'}</i>
	}
}

export function FragmentRoot() @{
	<>
		<b class="out">{'one'}</b>
		<i class="out">{'two'}</i>
	</>
}

export function DynamicTagRoot(props) @{
	<props.tag class="out">{'dyn'}</props.tag>
}

function Leaf(props) @{
	<b class="out">{props.text as string}</b>
}

export function ComponentRoot(props) @{
	<Leaf text={props.text} />
}

export function SuspenseRoot(props) @{
	<Suspense fallback={<i class="out">{'pending'}</i>}>
		<b class="out">{props.value as string}</b>
	</Suspense>
}

const Theme = createContext('light');

export function ProviderRoot(props) @{
	<Theme.Provider value={props.value}>
		<b class="out">{props.value as string}</b>
	</Theme.Provider>
}

// Nesting the range constructs inside each other exercises the walk over a
// deep, repeated body rather than a flat one.
export function DeeplyNested(props) @{
	@if (props.on) {
		@for (const item of props.items; key item.id) {
			@try {
				<>
					<b class="out">{item.label}</b>
					@if (item.extra) {
						<i class="out">{item.extra as string}</i>
					}
				</>
			} @catch (error) {
				<i class="out">{'caught'}</i>
			};
		}
	}
}

function Thrower(props) @{
	if (props.explode) throw new Error('boom');
	<b class="out">{'ok'}</b>
}

// The same reference scan decides whether an <ErrorBoundary> import is still
// live once the element has been lowered away. It must not count the import
// declaration itself as a use, or the lowering never completes cleanly.
export function BoundaryRoot(props) @{
	<ErrorBoundary fallback={<i class="out">{'caught'}</i>}>
		<Thrower explode={props.explode} />
	</ErrorBoundary>
}

// Controls: these do NOT need the block handle. They are here so the same
// suite proves the surrounding compile path still works either way.
export function PlainElement(props) @{
	<div class="out">{props.text as string}</div>
}

export function NestedIf(props) @{
	<div>
		@if (props.on) {
			<b class="out">{'nested'}</b>
		}
	</div>
}

export function PortalHost(props) @{
	<div>{createPortal(<b class="out">{'portal'}</b>, props.target)}</div>
}
