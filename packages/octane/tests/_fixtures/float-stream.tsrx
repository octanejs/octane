import { use } from 'octane';

// Float resources discovered AFTER the streaming shell flushed. A stylesheet
// declared inside a suspended @try arm — or whose href is computed from a
// use() resolution — must still reach the streamed document: late resource
// tags ride the boundary wave chunks and the inline stream runtime moves them
// into document.head under the same precedence grouping the client runtime
// uses, so a hydrating client adopts instead of duplicating.

// The child renders only after use() resolves, so nothing about its sheet is
// known during the shell pass — not even the href.
export function GatedSheetContent(props) @{
	<>
		<link rel="stylesheet" href={'/gated-' + props.name + '.css'} precedence="default" />
		<style href="gated-tokens" precedence="default">
			.gated-ready {
				color: teal;
			}
		</style>
		<span class="gated-ready">{props.name as string}</span>
	</>
}

export function GatedSheetBoundary(props) @{
	<div class="gated">
		@try {
			const name = use(props.promise);
			<GatedSheetContent name={name} />
		} @pending {
			<span class="gated-loading">{'loading'}</span>
		}
	</div>
}

// Chained boundaries: the outer arm's sheet sits at the arm body root, so its
// registration is hoisted above the arm's use() and lands in the shell head.
// The inner arm first executes only after the outer promise resolves — its
// sheet is discovered on a later pass and must ride the stream.
export function NestedLateBoundaries(props) @{
	<div class="nested-float">
		@try {
			const first = use(props.outer);
			<>
				<link rel="stylesheet" href="/outer-late.css" precedence="default" />
				<span class="outer-ready">{first as string}</span>
				@try {
					const second = use(props.inner);
					<>
						<link rel="stylesheet" href="/inner-late.css" precedence="low" />
						<span class="inner-ready">{second as string}</span>
					</>
				} @pending {
					<span class="inner-loading">{'inner…'}</span>
				}
			</>
		} @pending {
			<span class="outer-loading">{'outer…'}</span>
		}
	</div>
}

function SharedSheetContent() @{
	<>
		<link rel="stylesheet" href="/shared.css" precedence="default" />
		<span class="shared-ready">{'ready'}</span>
	</>
}

// The same href flushes with the shell (static sibling) and is re-declared by
// the late arm — the stream must not carry a second copy.
export function SharedSheetBoundary(props) @{
	<div class="shared">
		<link rel="stylesheet" href="/shared.css" precedence="default" />
		@try {
			const name = use(props.promise);
			<>
				<SharedSheetContent />
				<span class="shared-value">{name as string}</span>
			</>
		} @pending {
			<span class="shared-loading">{'loading'}</span>
		}
	</div>
}
