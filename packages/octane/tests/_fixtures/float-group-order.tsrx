import { use } from 'octane';

// Precedence GROUP order is first-encounter in tree discovery order — the same
// order SSR serializes and React produces — not the order component bodies
// happen to finish executing. These fixtures nest resource declarations so a
// leaves-first registration order would invert the groups.

function ChildSheet() @{
	<>
		<link rel="stylesheet" href="/child-vendor.css" precedence="vendor" />
		<span class="child">{'child'}</span>
	</>
}

// Parent declares its group before rendering the child that declares another.
export function ParentChild() @{
	<>
		<link rel="stylesheet" href="/parent-app.css" precedence="app" />
		<div class="parent">
			<ChildSheet />
		</div>
	</>
}

function SiblingSheet() @{
	<>
		<link rel="stylesheet" href="/sibling.css" precedence="two" />
		<span class="sibling">{'sibling'}</span>
	</>
}

// The suspended arm's sheet is discovered at reveal, AFTER the sibling that
// rendered with the shell — its group comes last even though the @try block
// sits first in source order.
export function LateArmAfterSibling(props) @{
	<div class="late-host">
		<link rel="stylesheet" href="/root-one.css" precedence="one" />
		@try {
			const label = use(props.promise);
			<>
				<link rel="stylesheet" href="/arm-three.css" precedence="three" />
				<span class="arm">{label as string}</span>
			</>
		} @pending {
			<span class="arm-pending">{'arm…'}</span>
		}
		<SiblingSheet />
	</div>
}

// Two levels of suspension: each arm's group registers when that arm renders,
// parent arm before child arm — discovery order across resolution waves.
export function NestedTryOrder(props) @{
	<div class="nested-host">
		<link rel="stylesheet" href="/outer-one.css" precedence="one" />
		@try {
			const mid = use(props.mid);
			<>
				<link rel="stylesheet" href="/mid-two.css" precedence="two" />
				<span class="mid">{mid as string}</span>
				@try {
					const deep = use(props.deep);
					<>
						<link rel="stylesheet" href="/deep-three.css" precedence="three" />
						<span class="deep">{deep as string}</span>
					</>
				} @pending {
					<span class="deep-pending">{'deep…'}</span>
				}
			</>
		} @pending {
			<span class="mid-pending">{'mid…'}</span>
		}
	</div>
}

// The href is computed from a SETUP LOCAL, so the resource registration cannot
// run before the body's own statements.
export function LocalHref(props) @{
	const slug = '/' + props.name + '-dep.css';
	<>
		<link rel="stylesheet" href={slug} precedence="app" />
		<div class="local">{'L'}</div>
	</>
}

// A setup-local-dependent sheet FOLLOWED by a static one: registration order is
// group order, so the static sheet must not jump ahead of the dynamic one on
// either side.
export function MixedLocalStatic(props) @{
	const dyn = '/' + props.name + '-first.css';
	<>
		<link rel="stylesheet" href={dyn} precedence="alpha" />
		<link rel="stylesheet" href="/second-static.css" precedence="beta" />
		<div class="mixed">{'M'}</div>
	</>
}

function Exploding(props) @{
	const boom = () => {
		throw new Error('mount failure');
	};
	<span class="never">
		{props.arm ? boom() as string : 'x'}
	</span>
}

// Resources are page-global and never removed: an arm that registers its sheet
// and then fails while rendering a child keeps the sheet, exactly like the
// server (registration precedes child evaluation there too).
export function FailingArm(props) @{
	<div class="failing-host">
		@try {
			<>
				<link rel="stylesheet" href="/doomed.css" precedence="app" />
				<Exploding arm={props.arm} />
			</>
		} @catch (e) {
			<span class="caught">{'caught'}</span>
		}
	</div>
}
