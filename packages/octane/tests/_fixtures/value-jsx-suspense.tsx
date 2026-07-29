import { Suspense, ErrorBoundary, useRef, type ComponentBody } from 'octane';
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

type EditorHostRef = { current: HTMLDivElement | null };

function RefOwningEditor(props: { hostRef: EditorHostRef }) {
	const localRef = useRef<HTMLDivElement | null>(null);

	return (
		<div data-editor="rich" ref={[localRef, props.hostRef]}>
			rich editor
		</div>
	);
}

export function SourceEditor() {
	return <div data-editor="source">source editor</div>;
}

export function ConditionalSuspenseEditor(props: {
	source: boolean;
	hostRef: EditorHostRef;
	sourceEditor: ComponentBody;
}) {
	const Source = props.sourceEditor;

	return (
		<div data-editor-boundary="suspense">
			{props.source ? (
				<Suspense fallback={null}>
					<Source />
				</Suspense>
			) : (
				<RefOwningEditor hostRef={props.hostRef} />
			)}
		</div>
	);
}

export function ConditionalSynchronousEditor(props: { source: boolean; hostRef: EditorHostRef }) {
	return (
		<div data-editor-boundary="synchronous">
			{props.source ? <SourceEditor /> : <RefOwningEditor hostRef={props.hostRef} />}
		</div>
	);
}
