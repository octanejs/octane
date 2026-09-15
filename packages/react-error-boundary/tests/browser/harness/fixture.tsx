/** @jsxImportSource octane */
import type { Ref } from 'octane';
import {
	ErrorBoundary,
	useErrorBoundary,
	type ErrorBoundaryProps,
} from '@octanejs/react-error-boundary';
export type FixtureProps = {
	epoch?: number;
	resetKey?: number;
	boundaryRef?: Ref<ErrorBoundary>;
	onReset?: ErrorBoundaryProps['onReset'];
	onError?: ErrorBoundaryProps['onError'];
};
function Actions() {
	const api = useErrorBoundary();
	return (
		<div id="healthy">
			<button id="throw-null" onClick={() => api.showBoundary(null)}>
				Throw null
			</button>
			<button
				id="throw-async"
				onClick={() => Promise.resolve().then(() => api.showBoundary('async failure'))}
			>
				Throw asynchronously
			</button>
		</div>
	);
}
export function BoundaryFixture(props: FixtureProps = {}) {
	return (
		<section>
			<input id="survivor" aria-label="Unrelated input" defaultValue="retained" />
			<ErrorBoundary
				ref={props.boundaryRef}
				resetKeys={[props.resetKey ?? 0]}
				onReset={props.onReset}
				onError={props.onError}
				fallbackRender={({ error }) => <span id="fallback">{String(error)}</span>}
			>
				<Actions />
			</ErrorBoundary>
			<span id="epoch">{String(props.epoch ?? 0)}</span>
		</section>
	);
}
