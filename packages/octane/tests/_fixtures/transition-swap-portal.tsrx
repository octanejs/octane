import { use, useState, useTransition, createPortal } from 'octane';

// B renders a PORTAL (mounts to a foreign target immediately) BEFORE it suspends —
// the sharp edge for off-screen rendering: if the off-screen render suspends, the
// portal must not be left orphaned in the target.
function A() @{
	<span id="content">{'A'}</span>
}

function Suspender(props) @{
	const v = use(props.promise);
	<span id="sus">
		{'sus-' + v as string}
	</span>
}

function BPortal(props) @{
	<span id="content">
		{createPortal(
			() => @{
				<span id="ported">{'ported'}</span>
			},
			props.target,
		)}
		<Suspender promise={props.promise} />
	</span>
}

export function SwapPortal(props) @{
	const [showB, setShowB] = useState(false);
	const [, start] = useTransition();
	<div>
		<button id="go" onClick={() => start(() => setShowB(true))}>{'go'}</button>
		@try {
			<div class="slot">
				{showB ? <BPortal promise={props.promise} target={props.target} /> : <A />}
			</div>
		} @pending {
			<span id="fallback">{'fallback'}</span>
		}
	</div>
}
