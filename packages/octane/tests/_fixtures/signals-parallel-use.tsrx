import { use } from 'octane';
import { derived$, query$, type SignalHandle } from 'octane/signals';

export interface ParallelReadProps {
	load: (key: string) => Promise<string>;
}

export function ParallelQueries(props: ParallelReadProps) @{
	const first$ = query$(() => 'first', props.load);
	const second$ = query$(() => 'second', props.load);
	const unused$ = query$(() => 'unused', props.load);
	const first = first$.get();
	const second = second$.get();
	<p class="parallel-values">{first + ':' + second}</p>
}

export function ParallelDerived(props: ParallelReadProps) @{
	const first$ = derived$(async () => props.load('first'));
	const second$ = derived$(async () => props.load('second'));
	const unused$ = derived$(async () => props.load('unused'));
	const first = first$.get();
	const second = second$.get();
	<p class="parallel-values">{first + ':' + second}</p>
}

export const parallelModule = {
	load: (_key: string): Promise<string> => {
		throw new Error('No module loader installed');
	},
};
const moduleFirst$ = query$(() => 'first', (key) => parallelModule.load(key));
const moduleSecond$ = derived$(async () => parallelModule.load('second'));

export function ParallelModule(_props: ParallelReadProps) @{
	const first = moduleFirst$.get();
	const second = moduleSecond$.get();
	<p class="parallel-values">{first + ':' + second}</p>
}

export function ParallelAuthSelectors(props: ParallelReadProps) @{
	const auth$ = query$(() => 'auth', props.load);
	const conversation$ = query$(() => auth$.get() + ':conversation', props.load);
	const history$ = query$(() => auth$.get() + ':history', props.load);
	const conversation = conversation$.get();
	const history = history$.get();
	<p class="parallel-values">{conversation + ':' + history}</p>
}

export function ParallelAuthLocal(props: ParallelReadProps) @{
	const auth$ = derived$(() => 'user', { sync: true });
	const conversation$ = query$(() => auth + ':conversation', props.load);
	const selectHistory = () => auth + ':history';
	const history$ = query$(selectHistory, props.load);
	const auth = auth$.get();
	const conversation = conversation$.get();
	const history = history$.get();
	<p class="parallel-values">{conversation + ':' + history}</p>
}

export function ParallelConditional(props: ParallelReadProps & { show: boolean }) @{
	const first$ = query$(() => 'first', props.load);
	const second$ = query$(() => 'second', props.load);
	<section>
		@if (props.show) {
			const first = first$.get();
			const second = second$.get();
			<p class="parallel-values">{first + ':' + second}</p>
		} @else {
			<p class="hidden">{'hidden'}</p>
		}
	</section>
}

export function ParallelErrors(props: ParallelReadProps) @{
	<section>
		@try {
			<ParallelQueries load={props.load} />
		} @pending {
			<p class="pending">{'loading'}</p>
		} @catch (error) {
			<p class="error">{(error as Error).message}</p>
		}
	</section>
}

export function ParallelNested(props: ParallelReadProps) @{
	<section>
		<ParallelQueries load={props.load} />
	</section>
}

export function ParallelControlled(props: ParallelReadProps & { show?: boolean }) @{
	<section>
		@if (props.show !== false) {
			const first$ = query$(() => 'first', props.load);
			const second$ = query$(() => 'second', props.load);
			const first = first$.get();
			const second = second$.get();
			<p class="parallel-values">{first + ':' + second}</p>
		}
	</section>
}

export function ParallelKeyed(props: ParallelReadProps & { keys?: readonly string[] }) @{
	<section>
		@for (const key of props.keys ?? ['row']; key key) {
			const first$ = query$(() => 'first', props.load);
			const second$ = query$(() => 'second', props.load);
			const first = first$.get();
			const second = second$.get();
			<p class="parallel-values">{first + ':' + second}</p>
		}
	</section>
}

export function ParallelLifetimeBoundary(props: ParallelReadProps & {
	keyed: boolean;
	show: boolean;
	keys: readonly string[];
}) @{
	<section>
		@try {
			@if (props.keyed) {
				<ParallelKeyed load={props.load} keys={props.keys} />
			} @else {
				<ParallelControlled load={props.load} show={props.show} />
			}
		} @pending {
			<p class="pending">{'loading'}</p>
		} @catch (error) {
			<p class="error">{(error as Error).message}</p>
		}
	</section>
}

export function ParallelNativeLifetime(props: ParallelReadProps & {
	keyed: boolean;
	rows$: SignalHandle<readonly string[]>;
}) @{
	<section>
		@try {
			@if (props.keyed) {
				@for (const key of props.rows$.get(); key key) {
					const first$ = query$(() => 'first', props.load);
					const second$ = query$(() => 'second', props.load);
					const first = first$.get();
					const second = second$.get();
					<p class="parallel-values">{first + ':' + second}</p>
				}
			} @else {
				@if (props.rows$.get().length !== 0) {
					const first$ = query$(() => 'first', props.load);
					const second$ = query$(() => 'second', props.load);
					const first = first$.get();
					const second = second$.get();
					<p class="parallel-values">{first + ':' + second}</p>
				}
			}
		} @pending {
			<p class="pending">{'loading'}</p>
		} @catch (error) {
			<p class="error">{(error as Error).message}</p>
		}
	</section>
}

export interface NativeCreationProps {
	make$: () => Promise<string>;
	label?: string;
}

export function NativeCreationValue(props: NativeCreationProps) @{
	const value = use(props.make$());
	<p class="creation-value">{value as string}</p>
}

export function NativeCreationBoundary(props: NativeCreationProps) @{
	<section>
		<span class="label">{props.label ?? ''}</span>
		@try {
			<NativeCreationValue make$={props.make$} />
		} @pending {
			<p class="pending">{'loading'}</p>
		}
	</section>
}

export function NativeWarmParent(props: NativeCreationProps & { gate: () => Promise<string> }) @{
	const parent = use(props.gate());
	<section>
		<p class="parent-value">{parent as string}</p>
		<NativeCreationValue make$={props.make$} />
	</section>
}

export function NativeWarmBoundary(props: NativeCreationProps & { gate: () => Promise<string> }) @{
	<>
		@try {
			<NativeWarmParent make$={props.make$} gate={props.gate} />
		} @pending {
			<p class="pending">{'loading'}</p>
		}
	</>
}
