import { ErrorBoundary, Suspense, use, useId, useLayoutEffect, useState } from 'octane';

export interface AdoptionGate {
	pending: boolean;
	promise: Promise<void>;
	error?: Error;
}
export interface AdoptionProps {
	gate: AdoptionGate;
	secondGate?: AdoptionGate;
	label: string;
	data: Promise<string>;
	siblingData: Promise<string>;
	gateInChild?: boolean;
	onLifecycle: (event: string) => void;
	onRef: (node: HTMLInputElement | null) => void;
	onSiblingClick: () => void;
}

function waitForGate(gate: AdoptionGate) {
	if (gate.pending) throw gate.promise;
	if (gate.error) throw gate.error;
}

function GatedText({ gate, secondGate, label }: Pick<
	AdoptionProps,
	'gate' | 'secondGate' | 'label'
>) {
	waitForGate(gate);
	if (secondGate) waitForGate(secondGate);
	return <span data-adopted-label="">{label}</span>;
}

function AdoptionContent(props: AdoptionProps) {
	if (!props.gateInChild) waitForGate(props.gate);
	const id = useId();
	const data = use(props.data);
	const [count, setCount] = useState(0);
	useLayoutEffect(() => {
		props.onLifecycle('mount:' + props.label);
		return () => props.onLifecycle('cleanup:' + props.label);
	}, []);
	return <section>
		<label htmlFor={id}>{'Draft'}</label>
		<input id={id} defaultValue="server draft" ref={props.onRef} />
		<output>{data}</output>
		<button onClick={() => setCount(count + 1)}>{count as number}</button>
		<GatedText gate={props.gate} secondGate={props.secondGate} label={props.label} />
	</section>;
}

function AdoptionSibling(props: Pick<AdoptionProps, 'siblingData' | 'onSiblingClick'>) {
	const id = useId();
	const data = use(props.siblingData);
	return <aside>
		<label htmlFor={id}>{'Sibling'}</label>
		<button id={id} onClick={props.onSiblingClick}>{data}</button>
	</aside>;
}

export function InitialAdoptionScreen(props: AdoptionProps) {
	return <main>
		<ErrorBoundary fallback={(error) => <p role="alert">{(error as Error).message}</p>}>
			<Suspense fallback={<p>Loading</p>}>
				<AdoptionContent {...props} />
			</Suspense>
		</ErrorBoundary>
		<AdoptionSibling siblingData={props.siblingData} onSiblingClick={props.onSiblingClick} />
	</main>;
}

export interface NestedAdoptionProps {
	gate: AdoptionGate;
	load: () => Promise<string>;
	onLifecycle: (event: string) => void;
}
function NestedSeededContent(props: NestedAdoptionProps) {
	const id = useId();
	const value = use(props.load());
	useLayoutEffect(() => {
		props.onLifecycle(value);
	}, []);
	return <output id={id}>{value}</output>;
}
function LaterSuspendingContent(props: NestedAdoptionProps) {
	return <article>
		<Suspense fallback="Inner loading">
			<NestedSeededContent {...props} />
		</Suspense>
		<GatedText gate={props.gate} label="Ready" />
	</article>;
}
export function NestedInitialAdoption(props: NestedAdoptionProps) {
	return <Suspense fallback="Outer loading">
		<LaterSuspendingContent {...props} />
	</Suspense>;
}
