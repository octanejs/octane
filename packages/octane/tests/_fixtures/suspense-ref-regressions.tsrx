import { use } from 'octane';

type ElementRef = (element: Element | null) => void;

function RenderProbe(props: { value: string }) @{
	<i class="render-probe" data-value={props.value}>{'probe'}</i>
}

function InitialRefChild(props: { innerRef: ElementRef }) @{
	<li class="initial-ref-item" ref={props.innerRef}>{'ref item'}</li>
}

function InitialSuspendingChild(props: { promise: Promise<string> }) @{
	const value = use(props.promise);
	<li class="initial-resolved">{value as string}</li>
}

export function SuspendedInitialHostRef(props: {
	innerRef: ElementRef;
	promise: Promise<string>;
}) @{
	<ul>
		@try {
			<>
				<InitialRefChild innerRef={props.innerRef} />
				<InitialSuspendingChild promise={props.promise} />
			</>
		} @pending {
			<li class="initial-fallback">{'loading'}</li>
		}
	</ul>
}

export function SuspendedHostRefUpdate(props: {
	innerRef: ElementRef;
	promise: Promise<string>;
}) @{
	@try {
		<>
			<li class="updated-ref-item" ref={props.innerRef}>{'ref item'}</li>
			<InitialSuspendingChild promise={props.promise} />
		</>
	} @pending {
		<li class="updated-ref-fallback">{'loading'}</li>
	}
}

// A parent can replace a pending promise with an already-ready one. The hidden
// primary reveals during that parent update, but its preserved refs still belong
// to the commit phase after every later sibling has rendered.
export function SupersededRefOrder(props: {
	cbRef: ElementRef;
	promise: Promise<string>;
	sentinel: string;
}) @{
	<>
		@try {
			const value = use(props.promise);
			<span class="superseded-value" ref={props.cbRef}>{value as string}</span>
		} @pending {
			<span class="superseded-fallback">{'loading'}</span>
		}
		<RenderProbe value={props.sentinel} />
	</>
}
