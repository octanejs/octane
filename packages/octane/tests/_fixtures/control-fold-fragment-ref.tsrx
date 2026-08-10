import { Fragment, type FragmentInstance, useState } from 'octane';

type FragmentObject = { current: FragmentInstance | null };

function StatefulFragmentDraft(props: { id: string; prefix: string }) {
	const [edits, setEdits] = useState(0);
	return <button id={props.id} onClick={() => setEdits((count) => count + 1)}>{props.prefix +
		edits as string}</button>;
}

// The returned outer fragment must route this compiler sentinel through
// template extraction on the client and preserve its range during hydration.
export function ReturnedFragmentRefMailbox(props: { groupRef: FragmentObject; title: string }) {
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
export function DirectReturnedFragmentRefMailbox(props: {
	groupRef: FragmentObject;
	title: string;
	observe: (phase: string, value: FragmentObject | string) => FragmentObject | string;
}) {
	return <Fragment ref={props.observe('ref', props.groupRef) as FragmentObject}>
		<h2 id="direct-fragment-title">{props.observe('child', props.title) as string}</h2>
		<StatefulFragmentDraft id="direct-fragment-draft" prefix="Direct grouped edits: " />
		<span id="direct-fragment-tail">Direct grouped draft ready</span>
	</Fragment>;
}

export function EmptyFragmentRef(props: { groupRef: FragmentObject }) {
	return <section>
		<span>before</span>
		<Fragment ref={props.groupRef} />
		<span>after</span>
	</section>;
}

export function TextFragmentRef(props: { groupRef: FragmentObject; label: string }) {
	return <section>
		<Fragment ref={props.groupRef}>{props.label as string}</Fragment>
	</section>;
}

export function NestedFragmentRefs(props: { groupRef: FragmentObject; innerRef: FragmentObject }) {
	return <section>
		<Fragment ref={props.groupRef}>
			<span id="nested-outer">outer</span>
			<Fragment ref={props.innerRef}>
				<span id="nested-inner">inner</span>
			</Fragment>
		</Fragment>
	</section>;
}
