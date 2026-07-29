import {
	ErrorBoundary,
	useErrorBoundary,
	withErrorBoundary,
} from '@octanejs/react-error-boundary/server';

function ThrowOnServer() @{
	throw new Error('server failure');
	<span>unreachable</span>
}

export function ServerApp() @{
	<ErrorBoundary fallback={<span>must not render</span>}>
		<ThrowOnServer />
	</ErrorBoundary>
}

function ServerHookProbe(props: { id: string }) @{
	const boundary = useErrorBoundary();
	<span id={props.id}>
		{boundary.error === null ? 'idle' : 'caught'}
	</span>
}

export function DirectServerHookApp() @{
	<ErrorBoundary fallback={<span>unused</span>}>
		<ServerHookProbe id="direct-server-hook" />
	</ErrorBoundary>
}

export const WrappedServerHookApp = withErrorBoundary(function WrappedServerHook() {
	return <ServerHookProbe id="hoc-server-hook" />;
}, { fallback: <span>unused</span> });

export const WrappedThrowingServerApp = withErrorBoundary(ThrowOnServer, {
	fallback: <span>must not render</span>,
});
