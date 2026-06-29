import { use, useState, useTransition } from 'octane';

function A() @{
	<span id="content">{'A'}</span>
}
function Sus(props) @{
	const v = use(props.promise);
	<span id="content">
		{'B-' + v as string}
	</span>
}

// nested Suspense: B has its OWN @try that catches its suspend → the OUTER swap
// completes (commits B showing its inner @pending); it does NOT hold A.
function BInner(props) @{
	@try {
		<Sus promise={props.promise} />
	} @pending {
		<span id="content">{'inner-pending'}</span>
	}
}
export function NestedSwap(props) @{
	const [showB, setShowB] = useState(false);
	const [, start] = useTransition();
	<div>
		<button id="go" onClick={() => start(() => setShowB(true))}>{'go'}</button>
		@try {
			<div class="slot">
				{showB ? <BInner promise={props.promise} /> : <A />}
			</div>
		} @pending {
			<span id="fallback">{'outer-fallback'}</span>
		}
	</div>
}
