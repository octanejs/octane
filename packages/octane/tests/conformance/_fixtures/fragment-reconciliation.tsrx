import { Fragment, createElement, lazy, useState } from 'octane';

function Stateful(props) @{
	const [instance] = useState(() => props.allocate());
	<span class="stateful" data-instance={instance as string}>Hello</span>
}

function Passthrough(props) {
	return props.children;
}

function LazyFragmentBody(props) {
	return (
		<>
			<Stateful key="a" allocate={props.allocate} />
			<div key="b">World</div>
		</>
	);
}

const LazyFragment = lazy(async () => ({ default: LazyFragmentBody }));

export function RenderSingleFragment() {
	return (
		<>
			<span>foo</span>
		</>
	);
}

export function RenderEmptyFragment() {
	return <></>;
}

export function RenderMultipleFragmentChildren() {
	return (
		<>
			{'hello '}
			<span>world</span>
		</>
	);
}

export function RenderIterableFragmentChildren() {
	return new Set([
		createElement('span', { key: 'a', class: 'iterable-a' }, 'hi'),
		createElement('span', { key: 'b', class: 'iterable-b' }, 'bye'),
	]);
}

export function OneLevelNesting(props) {
	return props.condition ? (
		<Stateful key="a" allocate={props.allocate} />
	) : (
		<>
			<Stateful key="a" allocate={props.allocate} />
			<div key="b">World</div>
		</>
	);
}

export function TopLevelFragments(props) {
	return props.condition ? (
		<>
			<Stateful allocate={props.allocate} />
		</>
	) : (
		<>
			<Stateful allocate={props.allocate} />
		</>
	);
}

export function NestedAtSameLevel(props) {
	return props.condition ? (
		<>
			<>
				<>
					<Stateful key="a" allocate={props.allocate} />
				</>
			</>
		</>
	) : (
		<>
			<>
				<>
					<div />
					<Stateful key="a" allocate={props.allocate} />
				</>
			</>
		</>
	);
}

export function NonTopLevelNesting(props) {
	return props.condition ? (
		<>
			<>
				<Stateful key="a" allocate={props.allocate} />
			</>
		</>
	) : (
		<>
			<Stateful key="a" allocate={props.allocate} />
		</>
	);
}

export function TwoLevelsWithoutSiblings(props) {
	return props.condition ? (
		<Stateful key="a" allocate={props.allocate} />
	) : (
		<>
			<>
				<Stateful key="a" allocate={props.allocate} />
			</>
		</>
	);
}

export function TwoLevelsWithSiblings(props) {
	return props.condition ? (
		<Stateful key="a" allocate={props.allocate} />
	) : (
		<>
			<>
				<Stateful key="a" allocate={props.allocate} />
			</>
			<div class="sibling" />
		</>
	);
}

export function ArrayInFragmentToFragment(props) {
	return props.condition ? (
		<>
			<Stateful key="a" allocate={props.allocate} />
		</>
	) : (
		<>{[<Stateful key="a" allocate={props.allocate} />]}</>
	);
}

export function TopLevelFragmentToArray(props) {
	return props.condition
		? [<Stateful key="a" allocate={props.allocate} />]
		: <><Stateful key="a" allocate={props.allocate} /></>;
}

export function ArrayInFragmentToDoubleFragment(props) {
	return props.condition ? (
		<>{[<Stateful key="a" allocate={props.allocate} />]}</>
	) : (
		<>
			<>
				<Stateful key="a" allocate={props.allocate} />
			</>
		</>
	);
}

export function ArrayInFragmentToDoubleArray(props) {
	return props.condition
		? <>{[<Stateful key="a" allocate={props.allocate} />]}</>
		: [[<Stateful key="a" allocate={props.allocate} />]];
}

export function DoubleFragmentToDoubleArray(props) {
	return props.condition ? (
		<>
			<>
				<Stateful key="a" allocate={props.allocate} />
			</>
		</>
	) : (
		[[<Stateful key="a" allocate={props.allocate} />]]
	);
}

export function DifferentFragmentKeys(props) {
	return props.condition ? (
		<Fragment key="a">
			<Stateful allocate={props.allocate} />
		</Fragment>
	) : (
		<Fragment key="b">
			<Stateful allocate={props.allocate} />
			<span>World</span>
		</Fragment>
	);
}

export function KeyedToUnkeyedFragment(props) {
	return props.condition ? (
		<Fragment key="a">
			<Stateful allocate={props.allocate} />
		</Fragment>
	) : (
		<>
			<Stateful allocate={props.allocate} />
		</>
	);
}

export function NestedImplicitAndExplicitZeroKeys(props) {
	return props.condition ? (
		<>
			<>
				<Stateful allocate={props.allocate} />
				<Stateful key="0" allocate={props.allocate} />
			</>
		</>
	) : (
		<>
			<>
				<Stateful key="0" allocate={props.allocate} />
			</>
		</>
	);
}

export function ReorderAcrossLevels(props) {
	return props.condition ? (
		<div>
			<Fragment key="c">
				<span>foo</span>
				<div key="b">
					<Stateful key="a" allocate={props.allocate} />
				</div>
			</Fragment>
			<span>boop</span>
		</div>
	) : (
		<div>
			<span>beep</span>
			<Fragment key="c">
				<div key="b">
					<Stateful key="a" allocate={props.allocate} />
				</div>
				<span>bar</span>
			</Fragment>
		</div>
	);
}

export function KeyedFragmentToArray(props) {
	return props.condition ? (
		<div>
			<Fragment key="foo">
				<Stateful allocate={props.allocate} />
			</Fragment>
			<span />
		</div>
	) : (
		<div>
			{[<Stateful allocate={props.allocate} />]}
			<span />
		</div>
	);
}

export function NestedUnkeyedFragmentToPassthrough(props) {
	return props.condition ? (
		<>
			<>
				<Stateful allocate={props.allocate} />
			</>
		</>
	) : (
		<>
			<Passthrough>
				<Stateful allocate={props.allocate} />
			</Passthrough>
		</>
	);
}

export function NestedKeyedFragmentToPassthrough(props) {
	return props.condition ? (
		<>
			<Fragment key="a">
				<Stateful allocate={props.allocate} />
			</Fragment>
		</>
	) : (
		<>
			<Passthrough>
				<Stateful allocate={props.allocate} />
			</Passthrough>
		</>
	);
}

export function NestedKeyedArrayToPassthrough(props) {
	return props.condition ? (
		<>{[<Stateful key="a" allocate={props.allocate} />]}</>
	) : (
		<>
			<Passthrough>
				<Stateful allocate={props.allocate} />
			</Passthrough>
		</>
	);
}

export function SamePositions(props) {
	return props.condition
		? [
				<span key="s" />,
				<>
					<Stateful allocate={props.allocate} />
				</>,
			]
		: [
				<span key="s" />,
				<>
					<Stateful allocate={props.allocate} />
				</>,
			];
}

export function AddLazyFragment(props) {
	return props.condition ? (
		<Stateful key="a" allocate={props.allocate} />
	) : (
		<LazyFragment allocate={props.allocate} />
	);
}

export function AddLazyFragmentBoundary(props) @{
	@try {
		<AddLazyFragment condition={props.condition} allocate={props.allocate} />
	} @pending {
		<p class="lazy-pending">loading</p>
	}
}

export function TopLevelSimpleFragment() {
	return [
		<div key="a">Hello</div>,
		<div key="b">World</div>,
	];
}

export function TopLevelSingleToArray(props) {
	return props.condition ? (
		<Stateful key="a" allocate={props.allocate} />
	) : (
		[
			<Stateful key="a" allocate={props.allocate} />,
			<div key="b">World</div>,
		]
	);
}

export function TopLevelSingleToNestedArray(props) {
	return props.condition ? (
		<Stateful key="a" allocate={props.allocate} />
	) : (
		[
			[
				<Stateful key="a" allocate={props.allocate} />,
				<div key="b">World</div>,
			],
			<div key="c" />,
		]
	);
}

export function TopLevelImplicitNullSlot(props) {
	return props.condition
		? [null, <Stateful key="a" allocate={props.allocate} />]
		: [
				<div key="b">Hello</div>,
				<Stateful key="a" allocate={props.allocate} />,
			];
}

export function TopLevelNestedReorder(props) {
	return props.condition
		? [[
				<div key="b">World</div>,
				<Stateful key="a" allocate={props.allocate} />,
			]]
		: [
				[
					<Stateful key="a" allocate={props.allocate} />,
					<div key="b">World</div>,
				],
				<div key="c" />,
			];
}
