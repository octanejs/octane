import {
	Children,
	createContext,
	Suspense,
	use,
	type ElementDescriptor,
	type OctaneNode,
} from 'octane';
import type { SignalHandle } from 'octane/signals';

export function FiveInputs(props: { a: string; b: string; c: string; d: string; e: string }) {
	const values = [props.a, props.b, props.c, props.d, props.e];
	return <p class="five-inputs" title={values.join(',')}>{values.join(',') as string}</p>;
}

export function createDeferredView$(count$: SignalHandle<number>) {
	return <p class="deferred-value" title={String(count$.get())}>{String(count$.get())}</p>;
}

export function DeferredHost(props: { view: OctaneNode; label: string }) @{
	<section>
		<span class="label">{props.label}</span>
		{props.view}
	</section>
}

export const ArrowReader = (props: { count$: SignalHandle<number> }) => {
	const value = props.count$.get();
	return <p class="arrow-value">{String(value)}</p>;
};

function makePrivateView(count$: SignalHandle<number>) {
	return <p class="factory-value" title={String(count$.get())}>{String(count$.get())}</p>;
}

export function makePrivateDescriptor$(count$: SignalHandle<number>) {
	return makePrivateView(count$);
}

export default function makeDefaultView(count$: SignalHandle<number>) {
	return <p class="factory-value" title={String(count$.get())}>{String(count$.get())}</p>;
}

export function DeferredPair(props: { original: OctaneNode; copy: OctaneNode }) @{
	<section>
		<div class="original">{props.original}</div>
		<div class="copy">{props.copy}</div>
	</section>
}

const LabelContext = createContext('outer');

function makeContextualView(count$: SignalHandle<number>) {
	const label$ = {
		get current$() {
			return `${use(LabelContext)}:${count$.get()}`;
		},
	};
	return <p class="contextual-value" title={label$.current$}>{label$.current$ as string}</p>;
}

export function InspectAndProvide(props: { count$: SignalHandle<number> }) {
	const view = makeContextualView(props.count$);
	const inspected = (Children.only(view) as ElementDescriptor<{ title: string }>).props.title;
	return <section data-inspected={inspected}>
		<LabelContext.Provider value="inner">{view}</LabelContext.Provider>
	</section>;
}

export function makePendingView(value$: SignalHandle<string>) {
	return <Suspense fallback={<i class="deferred-pending">{'waiting'}</i>}>
		<p class="deferred-resource" title={value$.get()}>{value$.get() as string}</p>
	</Suspense>;
}

export function StyledDeferredView(props: { count$: SignalHandle<number> }) {
	return <>
		<p class="stored-style">{String(props.count$.get())}</p>
		<style>
			.stored-style {
				color: rgb(19, 23, 29);
			}
		</style>
	</>;
}

export function PlainStaticFragment() {
	return <><p class="plain-static-value">{'plain'}</p></>;
}

export function StaticStyledFragment() {
	return <>
		<p class="stored-static-style">{'static style'}</p>
		<style>
			.stored-static-style {
				color: rgb(31, 37, 41);
			}
		</style>
	</>;
}

export function EmptyGlobalStyledFragment() {
	return <>
		<style>
			:global(.global-style-target) {
				color: rgb(43, 47, 53);
			}
		</style>
	</>;
}

export function GlobalStyleHost(props: { view: OctaneNode }) @{
	<section class="global-style-target">
		{'global target'}
		{props.view}
	</section>
}

export function ReturnedHead(props: { title$: SignalHandle<string> }) {
	return <>
		<title data-deferred-native-head="yes">{props.title$.get() as string}</title>
		<meta name="deferred-native-head" content={props.title$.get()} />
		<p class="deferred-head-value">{props.title$.get() as string}</p>
	</>;
}
