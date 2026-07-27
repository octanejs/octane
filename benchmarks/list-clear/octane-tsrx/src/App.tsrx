import { useState } from 'octane';
import { OWNED_LARGE, SHARED_LARGE, SHARED_SMALL, registerGroup } from './ops.js';

// Two keyed-list shapes whose ONLY difference is the parent:
//
//   SharedList — interleaved JSX on both sides inside the same <ul>, so a bulk
//                clear may only take the span between the list's own markers.
//   OwnedList  — sole child of its <ul>, so the whole parent can be emptied.
//
// Several independent lists of each so one timed clear does enough work to
// measure (see ops.js). The lead/tail rows are what make the shared list's
// clear a span operation; they must survive every clear, which is also the
// harness's correctness gate.

interface Item {
	id: number;
	label: string;
}

function SharedList(props: { kind: string }) @{
	const [items, setItems] = useState([] as Item[]);
	registerGroup(props.kind, setItems);

	<ul class="shared">
		<li class="lead">lead</li>
		@for (const item of items; key item.id) {
			<li class="row">
				<span class="a">{item.label}</span>
				<span class="b">{item.label}</span>
			</li>
		}
		<li class="tail">tail</li>
	</ul>
}

function OwnedList(props: { kind: string }) @{
	const [items, setItems] = useState([] as Item[]);
	registerGroup(props.kind, setItems);

	<ul class="owned">
		@for (const item of items; key item.id) {
			<li class="row">
				<span class="a">{item.label}</span>
				<span class="b">{item.label}</span>
			</li>
		}
	</ul>
}

const indices = (n: number) => Array.from({ length: n }, (_, i) => i);
const SMALL_IDS = indices(SHARED_SMALL.groups);
const LARGE_IDS = indices(SHARED_LARGE.groups);
const OWNED_IDS = indices(OWNED_LARGE.groups);

export default function App() @{
	<div>
		<div id="shared-small">
			@for (const i of SMALL_IDS; key i) {
				<SharedList kind="sharedSmall" />
			}
		</div>
		<div id="shared-large">
			@for (const i of LARGE_IDS; key i) {
				<SharedList kind="sharedLarge" />
			}
		</div>
		<div id="owned">
			@for (const i of OWNED_IDS; key i) {
				<OwnedList kind="owned" />
			}
		</div>
	</div>
}
