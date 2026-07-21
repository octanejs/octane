import { Fragment, useState } from 'octane';

function StatefulFragmentDraft(props) {
	const [edits, setEdits] = useState(0);
	return <button id={props.id} onClick={() => setEdits((count) => count + 1)}>{props.prefix +
		edits as string}</button>;
}

// Kept in a client-only fixture because Octane intentionally rejects Fragment
// refs during server compilation. The returned outer fragment must still route
// this compiler sentinel through template extraction on the client.
export function ReturnedFragmentRefMailbox(props) {
	return <>
		<h2 id="fragment-ref-title">{props.title as string}</h2>
		<Fragment ref={props.groupRef}>
			<StatefulFragmentDraft id="fragment-draft" prefix="Grouped edits: " />
			<span id="fragment-ref-tail">Grouped draft ready</span>
		</Fragment>
	</>;
}

// Direct Fragment refs also require template markers. Multiple roots ensure the
// compiled return renderer cannot claim a markerless single-root shape.
export function DirectReturnedFragmentRefMailbox(props) {
	return <Fragment ref={props.observe('ref', props.groupRef)}>
		<h2 id="direct-fragment-title">{props.observe('child', props.title) as string}</h2>
		<StatefulFragmentDraft id="direct-fragment-draft" prefix="Direct grouped edits: " />
		<span id="direct-fragment-tail">Direct grouped draft ready</span>
	</Fragment>;
}
