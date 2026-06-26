// SSR Phase 6 — @try whose SUCCESS-arm body is a COMPONENT (the router `Match`
// shape: `@try { <SomeComponent/> } @pending { … }`). The server resolves use()
// and renders the success arm wrapped in a `<!--[-->…<!--]-->` range; inside it the
// component's output is wrapped in its OWN block range. The client adopts the @try
// range, then the inner component slot adopts the component's range — no rebuild.
import { use } from 'octane';

// A leaf component (no control flow) rendered inside the @try body.
function Leaf(props) @{
	<div class="leaf">
		{props.msg as string}
	</div>
}

// A component containing a @for, rendered inside the @try body.
function ListLeaf(props) @{
	<ul class="list-leaf">
		@for (const item of props.items; key item.id) {
			<li class="row">
				{item.name as string}
			</li>
		}
	</ul>
}

// Shape (a): @try whose body is a @for directly (the PASSING control). Hydrates fine.
export function TryFor(props) @{
	<div id="try-for">
		@try {
			const items = use(props.promise);
			@for (const item of items; key item.id) {
				<li class="item">
					{item.name as string}
				</li>
			}
		} @pending {
			<span class="loading">{'loading'}</span>
		}
	</div>
}

// Shape (b): @try whose body is a COMPONENT. THROWS pre-fix.
export function TryComponent(props) @{
	<div id="try-comp">
		@try {
			const msg = use(props.promise);
			<Leaf msg={msg} />
		} @pending {
			<span class="loading">{'loading'}</span>
		}
	</div>
}

// Shape (c): @try whose body is a COMPONENT that itself contains a @for. THROWS pre-fix.
export function TryComponentFor(props) @{
	<div id="try-comp-for">
		@try {
			const items = use(props.promise);
			<ListLeaf items={items} />
		} @pending {
			<span class="loading">{'loading'}</span>
		}
	</div>
}

// The exact router `Match` shape: a @try whose body is a component, with a @pending
// fallback that is also a component (an `Outlet`-like fallback).
function Fallback() @{
	<div class="fallback">
		{'fallback' as string}
	</div>
}

function Matched(props) @{
	<section class="matched">
		{props.label as string}
	</section>
}

export function MatchShape(props) @{
	<div id="match">
		@try {
			const label = use(props.promise);
			<Matched label={label} />
		} @pending {
			<Fallback />
		}
	</div>
}
