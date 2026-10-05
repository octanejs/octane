// A stale node before a component call's server range in an element: the call
// finds that node where its range belongs, rebuilds its content, and the
// server's range for it is left after the rebuilt content.
interface Props {
	label: string;
}

function Child(props: Props) @{
	<button>{props.label as string}</button>
}

// The call is the element's only child, so neither compile anchors it.
export function Only(props: Props) @{
	<section>
		<Child label={props.label} />
	</section>
}

// Static content follows the call, so both compiles anchor it at the server
// node the template's walk finds.
export function BeforeTail(props: Props) @{
	<section>
		<Child label={props.label} />
		<i>{'tail'}</i>
	</section>
}

// The second call claims the range the stale node pushed along, which leaves
// the second call's own range.
export function Pair(props: Props) @{
	<section>
		<Child label={props.label} />
		<Child label={props.label + '2'} />
	</section>
}

// A later call in another element claims its own range after the element's
// last call.
export function Sibling(props: Props) @{
	<div>
		<section>
			<Child label={props.label} />
		</section>
		<p>
			<Child label={props.label + '2'} />
		</p>
	</div>
}

// Hookless, so the development compile renders it as a lite component, which
// owns the element.
function Wrap(props: Props) @{
	<section>
		<Child label={props.label} />
	</section>
}

export function Nested(props: Props) @{
	<div>
		<Wrap label={props.label} />
	</div>
}

// The element belongs to an @if arm, which owns it.
export function Arm(props: Props) @{
	<div>
		@if (props.label) {
			<section>
				<Child label={props.label} />
			</section>
		}
	</div>
}

// The element belongs to a list item, which owns it.
export function Row(props: Props) @{
	<div>
		@for (const label of [props.label]; key 'row') {
			<section>
				<Child label={label} />
			</section>
		}
	</div>
}
