import {
	createElement,
	use,
	useEffect,
	useImperativeHandle,
	useLayoutEffect,
	useLayoutSnapshot as measureLayout,
	useRef,
	useSyncExternalStore,
} from 'octane';
import { signal$ } from 'octane/signals';

// Client work an islands-only shell would never run. Each component renders
// one construct; ssr-shell-witness.test.ts renders them on their own, and
// ssr-shell-witness-islands.tsrx renders them inside independent islands.

export const count$ = signal$(1);
export const label$ = signal$('Count');
export const choose = () => {};
const subscribe = () => () => {};

// A cleared handler is no client work.
export function Handler() @{
	<button type="button" onClick={choose} onFocus={undefined}>
		{'Choose'}
	</button>
}

export function Ref() @{
	const ref = useRef(null);
	<div ref={ref}>{'Measured'}</div>
}

export function Effects() @{
	useEffect(() => {});
	useLayoutEffect(() => {});
	<p>{'Effects'}</p>
}

export function Snapshot() @{
	const value = measureLayout(() => 'client', { initial: 'server' });
	<p>{value}</p>
}

export function Handle(props: { handle?: { current: unknown } }) @{
	useImperativeHandle(props.handle, () => ({}));
	<p>{'Handle'}</p>
}

export function Store() @{
	const value = useSyncExternalStore(
		subscribe,
		() => 'client',
		() => 'server',
	);
	<p>{value}</p>
}

export function Controlled(props: { query: string; agreed: boolean }) @{
	<form>
		<input value={props.query} />
		<input type="checkbox" checked={props.agreed} />
	</form>
}

export function StaticControls(props: { query: string; choice: string }) @{
	<form>
		<input value={props.query} readOnly />
		<input type="hidden" name="token" value={props.query} />
		<input type={'hidden' as const} name="typed" value={props.query} />
		<input value={props.query} readOnly={true as boolean} />
		<textarea value={props.query} disabled />
		<input defaultValue={props.query} />
		<input type="radio" name="choice" value={props.choice} />
	</form>
}

export function SignalText() @{
	<span>{count$}</span>
}

export function SignalAttribute() @{
	<span title={label$}>{'Count'}</span>
}

// A local alias inside the body: a source check of `x$` names misses it.
export function SignalAlias() @{
	const live = count$;
	<output>{live}</output>
}

export function Action() @{
	<form action={choose}>
		<button type="submit">{'Send'}</button>
	</form>
}

export function Spread(props: { extra: Record<string, unknown> }) @{
	<button type="button" {...props.extra}>
		{'Spread'}
	</button>
}

export function SpreadInput(props: { extra: Record<string, unknown> }) @{
	<input name="query" {...props.extra} />
}

// Descriptors built by a plain helper reach the server as props, not syntax.
function menuButton(label: string) {
	return createElement('button', { type: 'button', onClick: choose }, label);
}

export function Descriptor() @{
	<nav>{menuButton('Menu')}</nav>
}

export function DescriptorInput(props: { input: Record<string, unknown> }) @{
	<search>{createElement('input', props.input)}</search>
}

export function Conditional(props: { open: boolean }) @{
	<div>
		@if (props.open) {
			<button type="button" onClick={choose}>
				{'Close'}
			</button>
		}
	</div>
}

export function Repeated(props: { items: string[] }) @{
	<ul>
		@for (const item of props.items; key item) {
			<li>
				<button type="button" onClick={choose}>
					{item}
				</button>
			</li>
		}
	</ul>
}

export function Static() @{
	<main>
		<h1>{'Shell'}</h1>
		<a href="/next">{'Next'}</a>
		<input defaultValue="draft" />
	</main>
}

export function Deferred(props: { data: Promise<string> }) @{
	<main>
		@try {
			<button type="button" onClick={choose}>
				{use(props.data)}
			</button>
		} @pending {
			<p>{'Loading'}</p>
		}
	</main>
}
