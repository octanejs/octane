import { use, useState, useTransition } from 'octane';

// Transition replacement, suspension, and repeated-swap fixtures. Each leaf
// accepts a logging callback so the same components can model render side
// effects while the tests assert the visible transition contract.

function A(props) @{
	props.log('A');
	<span class="content">{'A'}</span>
}

function B(props) @{
	props.log('B');
	<span class="content">{'B'}</span>
}

// A version of B that suspends on mount while old content remains visible.
function SusB(props) @{
	props.log('SusB');
	const v = use(props.promise);
	<span class="content">{'B-' + v as string}</span>
}

export function IfSwap(props) @{
	const [showB, setShowB] = useState(false);
	const [isPending, start] = useTransition();
	const Incoming = props.suspend ? SusB : B;
	<div>
		<button id="go" onClick={() => start(() => setShowB(true))}>{'go'}</button>
		<span id="pending">
			{isPending ? 'pending' : 'idle'}
		</span>
		@try {
			<div class="slot">
				{showB ? <Incoming log={props.log} promise={props.promise} /> : <A log={props.log} />}
			</div>
		} @pending {
			<span id="fallback">{'fallback'}</span>
		}
	</div>
}

// A dynamic component whose tag identity changes.
export function CompSwap(props) @{
	const [showB, setShowB] = useState(false);
	const [isPending, start] = useTransition();
	const Comp =
		showB ? (props.suspend ? SusB : B) : A;
	<div>
		<button id="go" onClick={() => start(() => setShowB(true))}>{'go'}</button>
		<span id="pending">
			{isPending ? 'pending' : 'idle'}
		</span>
		@try {
			<div class="slot">
				<Comp log={props.log} promise={props.promise} />
			</div>
		} @pending {
			<span id="fallback">{'fallback'}</span>
		}
	</div>
}

// Double-swap driver A→B→A under transitions.
export function IfDoubleSwap(props) @{
	const [showB, setShowB] = useState(false);
	const [, start] = useTransition();
	<div>
		<button id="toB" onClick={() => start(() => setShowB(true))}>{'toB'}</button>
		<button id="toA" onClick={() => start(() => setShowB(false))}>{'toA'}</button>
		@try {
			<div class="slot">
				{showB ? <B log={props.log} /> : <A log={props.log} />}
			</div>
		} @pending {
			<span id="fallback">{'fallback'}</span>
		}
	</div>
}

// Double-swap through a dynamic component.
export function CompDoubleSwap(props) @{
	const [showB, setShowB] = useState(false);
	const [, start] = useTransition();
	const Comp = showB ? B : A;
	<div>
		<button id="toB" onClick={() => start(() => setShowB(true))}>{'toB'}</button>
		<button id="toA" onClick={() => start(() => setShowB(false))}>{'toA'}</button>
		@try {
			<div class="slot">
				<Comp log={props.log} />
			</div>
		} @pending {
			<span id="fallback">{'fallback'}</span>
		}
	</div>
}
