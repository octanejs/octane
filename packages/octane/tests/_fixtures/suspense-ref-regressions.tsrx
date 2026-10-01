import { Fragment, use, useLayoutEffect, useRef, useState, type FragmentInstance } from 'octane';

type ElementRef = (element: Element | null) => void;
type RootRefProps = {
	innerRef: (instance: Element | FragmentInstance | null) => void;
	read: () => string;
};

function RootResource(props: { read: () => string }) @{
	const value = props.read();
	<span class="root-resource">{value}</span>
}

export function RootHostRef(props: RootRefProps) @{
	<section ref={props.innerRef}>
		<RootResource read={props.read} />
	</section>
}

export function RootFragmentRef(props: RootRefProps) @{
	<Fragment ref={props.innerRef}>
		<RootResource read={props.read} />
	</Fragment>
}

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

function NestedRevealHost(props: { name: string; trace: (entry: string) => void }) @{
	const host = useRef<HTMLElement | null>(null);
	useLayoutEffect(() => {
		props.trace(`${props.name}:${host.current?.className ?? 'null'}`);
	});
	<b class={props.name} ref={host}>{props.name as string}</b>
}

function NestedRevealLate(props: { promise: Promise<string>; trace: (entry: string) => void }) @{
	const name = use(props.promise);
	<NestedRevealHost name={name} trace={props.trace} />
}

function NestedRevealGate(props: { promise: Promise<string> }) @{
	const value = use(props.promise);
	<span class="nested-gate">{value as string}</span>
}

// The nested boundary first suspends inside its ancestor's paced retry. A state
// update with unchanged @try inputs supersedes that retry, so the nested primary
// stays hidden although the hide staged with the retry never commits.
export function NestedSupersededReveal(props: {
	show: boolean;
	outer: Promise<string>;
	inner: Promise<string>;
	trace: (entry: string) => void;
}) @{
	const [renders, setRenders] = useState(0);
	const rerender = () => setRenders(renders + 1);
	<div class="nested-reveal">
		<button class="nested-rerender" onClick={rerender}>{String(renders)}</button>
		@if (props.show) {
			@try {
				<>
					<NestedRevealGate promise={props.outer} />
					@try {
						<>
							<NestedRevealHost name="nested-early" trace={props.trace} />
							<NestedRevealLate promise={props.inner} trace={props.trace} />
						</>
					} @pending {
						<span class="nested-inner-fallback">{'inner'}</span>
					}
				</>
			} @pending {
				<span class="nested-outer-fallback">{'outer'}</span>
			}
		}
	</div>
}
