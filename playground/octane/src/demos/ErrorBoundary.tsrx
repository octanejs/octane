import { ErrorBoundary, getErrorMessage } from '@octanejs/react-error-boundary';
import { useState } from 'octane';

function UnstablePanel(props: { shouldThrow: boolean }) @{
	if (props.shouldThrow) throw new Error('The demo panel crashed');
	<div class="panel">{'The child tree is healthy.'}</div>
}

export function ErrorBoundaryDemo() @{
	const [shouldThrow, setShouldThrow] = useState(false);

	<div>
		<h2 class="demo-title">{'react-error-boundary on Octane'}</h2>
		<p
			class="demo-blurb"
		>{'Trigger a render failure, inspect the fallback, then reset the native Octane boundary.'}</p>
		<ErrorBoundary
			resetKeys={[shouldThrow]}
			fallbackRender={({ error, resetErrorBoundary }) => <div class="panel">
				<pre class="boom">{getErrorMessage(error) ?? 'Unknown error'}</pre>
				<button
					class="btn"
					onClick={() => {
						setShouldThrow(false);
						resetErrorBoundary();
					}}
				>
					Retry
				</button>
			</div>}
		>
			<UnstablePanel shouldThrow={shouldThrow} />
		</ErrorBoundary>
		<button class="btn" onClick={() => setShouldThrow(true)}>Crash the panel</button>
	</div>
}
