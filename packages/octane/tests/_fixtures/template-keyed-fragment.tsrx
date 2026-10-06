import { Fragment, useState } from 'octane';

// A `<Fragment key>` written in a template is a reconciliation boundary, as it
// is in returned JSX and in React: a new key remounts its children. Each draft
// counts its own clicks so a remount is visible as a reset count and a new node.

function Draft(props: { id: string }) @{
	const [edits, setEdits] = useState(0);
	const label = props.id + ': ' + edits;
	<button id={props.id} onClick={() => setEdits((count) => count + 1)}>
		{label as string}
	</button>
}

function Failing(props: { fail: boolean }) @{
	if (props.fail) throw new Error('failed to load');
	<Draft id="loaded" />
}

export function HostChild(props: { selected: string }) @{
	<section>
		<b>before</b>
		<Fragment key={props.selected}>
			<Draft id="host-child" />
			<i>{props.selected as string}</i>
		</Fragment>
		<b>after</b>
	</section>
}

export function BodyRoot(props: { selected: string }) @{
	<Fragment key={props.selected}>
		<Draft id="body-root" />
		<i>{props.selected as string}</i>
	</Fragment>
}

export function DirectiveArms(props: { selected: string; open: boolean }) @{
	<section>
		@if (props.open) {
			<Fragment key={props.selected}>
				<Draft id="if-arm" />
			</Fragment>
		}
		@try {
			<Fragment key={props.selected}>
				<Draft id="try-arm" />
			</Fragment>
		} @catch (error) {
			<p>failed</p>
		}
	</section>
}

// The shape from #1787: changing the selection must clear a caught error,
// without a single-item keyed `@for` as a stand-in for the keyed Fragment.
export function ResetCaughtTry(props: { selected: string }) @{
	<section>
		<Fragment key={props.selected}>
			@try {
				<Failing fail={props.selected === 'broken'} />
			} @catch (error) {
				<p id="caught">{(error as Error).message}</p>
			}
		</Fragment>
	</section>
}

export function ReturnedWithDirective(props: { selected: string; open: boolean }) {
	return (
		<section>
			<Fragment key={props.selected}>
				@if (props.open) {
					<Draft id="returned-directive" />
				}
			</Fragment>
		</section>
	);
}

export function KeyedFragmentRef(props: { selected: string; fragmentRef: any }) @{
	<section>
		<Fragment key={props.selected} ref={props.fragmentRef}>
			<Draft id="fragment-ref" />
		</Fragment>
	</section>
}

export function KeyedSvg(props: { selected: string }) @{
	<svg>
		<Fragment key={props.selected}>
			<circle r={props.selected.length} />
		</Fragment>
	</svg>
}

// Without a key the Fragment stays transparent: its children keep their state.
export function Unkeyed(props: { selected: string }) @{
	<section>
		<Fragment>
			<Draft id="unkeyed" />
			<i>{props.selected as string}</i>
		</Fragment>
	</section>
}
