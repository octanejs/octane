import { useState } from 'octane';
import { ErrorBoundary, useErrorBoundary, withErrorBoundary } from '@octanejs/react-error-boundary';
import type { UseErrorBoundaryApi } from '@octanejs/react-error-boundary';

function Thrower(props: { error?: Error }) @{
	if (props.error) throw props.error;
	<span id="content">content</span>
}

export function FallbackComponent(props: {
	error: unknown;
	resetErrorBoundary: (...args: unknown[]) => void;
}) @{
	<button id="component-fallback" onClick={() => props.resetErrorBoundary('retry')}>
		{'component:' + (props.error as Error).message}
	</button>
}

export function BoundaryApp(props: {
	error?: Error;
	mode: 'fallback' | 'component' | 'render';
	onError?: (error: unknown, info: { componentStack: string }) => void;
	onReset?: (details: unknown) => void;
	resetKeys?: unknown[];
}) @{
	const common = {
		onError: props.onError,
		onReset: props.onReset,
		resetKeys: props.resetKeys,
	};
	@if (props.mode === 'fallback') {
		<ErrorBoundary {...common} fallback={<span id="fallback">plain</span>}>
			<Thrower error={props.error} />
		</ErrorBoundary>
	} @else if (props.mode === 'component') {
		<ErrorBoundary {...common} FallbackComponent={FallbackComponent}>
			<Thrower error={props.error} />
		</ErrorBoundary>
	} @else {
		<ErrorBoundary
			{...common}
			fallbackRender={({ error, resetErrorBoundary }) =>
				<button id="render-fallback" onClick={() => resetErrorBoundary('render-retry')}>
					{'render:' + (error as Error).message}
				</button>}
		>
			<Thrower error={props.error} />
		</ErrorBoundary>
	}
}

function EventFailure() @{
	const boundary = useErrorBoundary();
	<button
		id="show-boundary"
		onClick={() => {
			try {
				throw new Error('event failure');
			} catch (error) {
				boundary.showBoundary(error as Error);
			}
		}}
	>
		show
	</button>
}

export function HookApp() @{
	<ErrorBoundary
		fallbackRender={({ error, resetErrorBoundary }) =>
			<button
				id="hook-fallback"
				onClick={() => resetErrorBoundary()}
			>{(error as Error).message as string}</button>}
	>
		<EventFailure />
	</ErrorBoundary>
}

function Greeting(props: { name: string; fail?: boolean }) @{
	if (props.fail) throw new Error('wrapped');
	<p id="greeting">{'Hello ' + props.name}</p>
}

export const WrappedGreeting = withErrorBoundary(Greeting, {
	fallback: <p id="wrapped-fallback">wrapped fallback</p>,
});

export function LocalResetApp(
	props: {
		onError?: (error: unknown, info: { componentStack: string }) => void;
		onReset?: (details: unknown) => void;
	} = {},
) @{
	const [fail, setFail] = useState(true);
	<ErrorBoundary
		onError={props.onError}
		onReset={props.onReset}
		fallbackRender={({ resetErrorBoundary }) => <button
			id="local-reset"
			onClick={() => {
				setFail(false);
				resetErrorBoundary();
			}}
		>
			retry
		</button>}
	>
		<Thrower error={fail ? new Error('local') : undefined} />
	</ErrorBoundary>
}

function RetainedApiChild(props: { apiRef: { current: UseErrorBoundaryApi | null } }) @{
	const api = useErrorBoundary();
	props.apiRef.current = api;
	<button id="retained-show" onClick={() => api.showBoundary('retained failure')}>show</button>
}

export function RetainedApiApp(props: {
	apiRef: { current: UseErrorBoundaryApi | null };
	onReset?: (details: unknown) => void;
}) @{
	<ErrorBoundary
		onReset={props.onReset}
		fallbackRender={({ error }) => <span id="retained-fallback">{String(error)}</span>}
	>
		<RetainedApiChild apiRef={props.apiRef} />
	</ErrorBoundary>
}

function ThrowUnknown(props: { value: unknown }) @{
	throw props.value;
	<span>unreachable</span>
}

function BrokenFallback() @{
	throw new Error('fallback failed');
	<span>unreachable</span>
}

export function NestedFailureApp(props: {
	value: unknown;
	innerError: (error: unknown, info: { componentStack: string }) => void;
	outerError: (error: unknown, info: { componentStack: string }) => void;
}) @{
	<ErrorBoundary
		onError={props.outerError}
		fallbackRender={({ error }) => <span id="outer-fallback">{String(error)}</span>}
	>
		<ErrorBoundary onError={props.innerError} FallbackComponent={BrokenFallback}>
			<ThrowUnknown value={props.value} />
		</ErrorBoundary>
	</ErrorBoundary>
}

export function UnknownFailureApp(props: {
	value: unknown;
	onError: (error: unknown, info: { componentStack: string }) => void;
}) @{
	<ErrorBoundary
		onError={props.onError}
		fallbackRender={({ error }) => <span id="unknown-fallback">{String(error)}</span>}
	>
		<ThrowUnknown value={props.value} />
	</ErrorBoundary>
}

function AsyncFailure() @{
	const boundary = useErrorBoundary();
	const [local, setLocal] = useState('idle');
	<div>
		<button
			id="forward-async"
			onClick={() => Promise.resolve().then(() => boundary.showBoundary('async failure'))}
		>
			forward
		</button>
		<button
			id="keep-async-local"
			onClick={() => Promise.reject('local failure').catch(() => setLocal('handled locally'))}
		>
			local
		</button>
		<span id="local-status">{local}</span>
	</div>
}

export function AsyncApp() @{
	<ErrorBoundary fallbackRender={({ error }) => <span id="async-fallback">{String(error)}</span>}>
		<AsyncFailure />
	</ErrorBoundary>
}
