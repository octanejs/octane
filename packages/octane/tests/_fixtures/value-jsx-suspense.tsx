import { Suspense, ErrorBoundary } from 'octane';
import { Row } from './value-jsx-row.tsrx';

// Keyed .map of <Suspense>-wrapped component descriptors — the Hacker News
// StoriesPage pattern (each row suspends independently). React-style .tsx lowers
// the element children to a createElement DESCRIPTOR in value position.
export function MapSuspense() {
	const items = ['a', 'b', 'c'];
	return (
		<div class="list">
			{items.map((label) => (
				<Suspense key={label} fallback={<span class="fb">…</span>}>
					<Row label={label} />
				</Suspense>
			))}
		</div>
	);
}

export function DirectSuspense() {
	return (
		<Suspense fallback={<span class="fb">…</span>}>
			<Row label="x" />
		</Suspense>
	);
}

export function BoundaryChildren() {
	return (
		<ErrorBoundary fallback={<span class="err">boom</span>}>
			<Row label="y" />
		</ErrorBoundary>
	);
}
